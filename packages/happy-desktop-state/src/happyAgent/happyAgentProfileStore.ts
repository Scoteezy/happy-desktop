import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import {
    happyAgentProfilePhotoError,
    happyAgentProfilePhotoRead,
} from "./happyAgentProfilePhoto.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import type { HappyAgentAvatarImage } from "./happyAgentTypes.js";

/** The one human identity this installation authors work as. */
export interface HappyAgentProfile {
    readonly email: string;
    readonly name: string;
    readonly updatedAt: number;
    readonly photo?: HappyAgentProfilePhoto;
}

/**
 * The stored photo. Its ThumbHash arrives with the profile; the bytes are read
 * separately, so `imageUrl` follows once they are in hand.
 */
export interface HappyAgentProfilePhoto {
    readonly thumbhash: string;
    /** A local address for the photo's bytes, absent while they are still being read. */
    readonly imageUrl?: string;
}

export interface HappyAgentProfileSource {
    /**
     * Reports the stored profile whenever it changes, or `undefined` while this
     * installation has never been given one.
     */
    subscribe(
        listener: (profile: HappyAgentProfile | undefined) => void,
        onError: (error: unknown) => void,
    ): () => void;
}

export interface HappyAgentProfileActions {
    profileSave(input: {
        readonly email: string;
        readonly name: string;
    }): Promise<HappyAgentProfile>;
    /** Replaces the stored photo; the source reports the profile that results. */
    photoUpload(image: HappyAgentAvatarImage): Promise<void>;
    /** Removes the stored photo; the source reports the profile that results. */
    photoRemove(): Promise<void>;
}

export interface HappyAgentProfileSnapshot {
    /** The values in the fields, which are the stored ones until they are edited. */
    readonly email: string;
    readonly name: string;
    /** True while the fields differ from what is stored. */
    readonly dirty: boolean;
    readonly loading: boolean;
    readonly saving: boolean;
    /** The stored profile could not be read. */
    readonly error?: UserError;
    /** The last save was refused or failed. */
    readonly saveError?: string;
    /**
     * Whether a named profile is stored. A photo belongs to one — a team
     * member's first save is what creates them — so a photo can be added only
     * once this is true.
     */
    readonly saved: boolean;
    readonly photo?: HappyAgentProfilePhoto;
    /** True while a chosen photo is being read and sent. */
    readonly photoUploading: boolean;
    /** True while the stored photo is being removed. */
    readonly photoRemoving: boolean;
    /** Why the last photo change was refused or failed. */
    readonly photoError?: string;
}

export interface HappyAgentProfileStore {
    get(): HappyAgentProfileSnapshot;
    subscribe(listener: () => void): () => void;
    displayNameUpdate(value: string): void;
    emailUpdate(value: string): void;
    /** Puts the fields back to what is stored. */
    profileRevert(): void;
    profileSave(): Promise<void>;
    /** Sends a picked file as the new photo, refusing first what the daemon would refuse. */
    photoUpload(file: Blob): Promise<void>;
    photoRemove(): Promise<void>;
    [Symbol.dispose](): void;
}

export interface HappyAgentProfileStoreDeps {
    readonly source: HappyAgentProfileSource;
    readonly actions: HappyAgentProfileActions;
}

const EMPTY: HappyAgentProfileSnapshot = {
    dirty: false,
    email: "",
    loading: true,
    name: "",
    photoRemoving: false,
    photoUploading: false,
    saved: false,
    saving: false,
};

const photoEqual = (
    left: HappyAgentProfilePhoto | undefined,
    right: HappyAgentProfilePhoto | undefined,
): boolean =>
    left === undefined || right === undefined
        ? left === right
        : left.thumbhash === right.thumbhash && left.imageUrl === right.imageUrl;

/**
 * The installation profile, edited in place: the snapshot's `name` and `email`
 * are what the fields show, and they follow the stored profile until the reader
 * changes one. Live for exactly as long as a surface is observing it.
 */
export function happyAgentProfileStoreCreate(
    deps: HappyAgentProfileStoreDeps,
): HappyAgentProfileStore {
    const store = createStore<HappyAgentProfileSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let stored: HappyAgentProfile | undefined;
    let unsubscribeSource: (() => void) | undefined;
    let disposed = false;

    const dirtyAgainst = (
        profile: HappyAgentProfile | undefined,
        fields: { readonly email: string; readonly name: string },
    ): boolean => fields.name !== (profile?.name ?? "") || fields.email !== (profile?.email ?? "");

    const profileInput = (profile: HappyAgentProfile | undefined): void => {
        if (disposed) return;
        stored = profile;
        const current = store.getState();
        // An edit in progress is the reader's, so an authoritative read replaces
        // the fields only while they still show what was stored.
        const adopt = !current.dirty && !current.saving;
        const fields = adopt
            ? { email: profile?.email ?? "", name: profile?.name ?? "" }
            : { email: current.email, name: current.name };
        const dirty = dirtyAgainst(profile, fields);
        const saved = profile !== undefined && profile.name !== "";
        const photo = photoEqual(current.photo, profile?.photo) ? current.photo : profile?.photo;
        if (
            fields.email === current.email &&
            fields.name === current.name &&
            dirty === current.dirty &&
            saved === current.saved &&
            current.loading === false &&
            current.error === undefined &&
            current.photo === photo
        )
            return;
        store.setState({
            ...current,
            ...fields,
            dirty,
            saved,
            loading: false,
            error: undefined,
            photo,
        });
    };

    const photoChange = async (
        change: "upload" | "removal",
        send: () => Promise<void>,
    ): Promise<void> => {
        const current = store.getState();
        if (current.photoUploading || current.photoRemoving) return;
        if (change === "upload" && !current.saved) {
            store.setState({
                ...current,
                photoError: "Save your name first, then add a photo.",
            });
            return;
        }
        store.setState({
            ...current,
            photoUploading: change === "upload",
            photoRemoving: change === "removal",
            photoError: undefined,
        });
        try {
            // The source reports the profile that results through the
            // subscription, so there is nothing to adopt from the answer here.
            await send();
            if (disposed) return;
            store.setState({ ...store.getState(), photoUploading: false, photoRemoving: false });
        } catch (error) {
            if (disposed) return;
            store.setState({
                ...store.getState(),
                photoUploading: false,
                photoRemoving: false,
                photoError: happyAgentProfilePhotoError(error, change).message,
            });
        }
    };

    const fieldUpdate = (fields: { readonly email?: string; readonly name?: string }): void => {
        const current = store.getState();
        if (current.saving) return;
        const next = {
            email: fields.email ?? current.email,
            name: fields.name ?? current.name,
        };
        if (
            next.email === current.email &&
            next.name === current.name &&
            current.saveError === undefined
        )
            return;
        store.setState({
            ...current,
            ...next,
            dirty: dirtyAgainst(stored, next),
            saveError: undefined,
        });
    };

    const start = (): void => {
        if (disposed || unsubscribeSource) return;
        unsubscribeSource = deps.source.subscribe(profileInput, (error) => {
            if (disposed) return;
            store.setState({
                ...store.getState(),
                loading: false,
                error: happyAgentUserError(error),
            });
        });
    };

    const stop = (): void => {
        unsubscribeSource?.();
        unsubscribeSource = undefined;
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            start();
            return () => {
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        displayNameUpdate(value) {
            fieldUpdate({ name: value });
        },
        emailUpdate(value) {
            fieldUpdate({ email: value });
        },
        profileRevert() {
            const current = store.getState();
            if (current.saving) return;
            store.setState({
                ...current,
                dirty: false,
                email: stored?.email ?? "",
                name: stored?.name ?? "",
                saveError: undefined,
            });
        },
        async profileSave() {
            const current = store.getState();
            if (current.saving) return;
            const email = current.email.trim();
            const name = current.name.trim();
            if (!name) {
                store.setState({ ...current, saveError: "Enter the name to author work as." });
                return;
            }
            if (!email || !email.includes("@")) {
                store.setState({
                    ...current,
                    saveError: "Enter the email used for Git commits.",
                });
                return;
            }
            store.setState({
                ...current,
                email,
                name,
                saving: true,
                saveError: undefined,
            });
            try {
                const profile = await deps.actions.profileSave({ email, name });
                if (disposed) return;
                store.setState({ ...store.getState(), saving: false });
                profileInput(profile);
            } catch (error) {
                if (disposed) return;
                store.setState({
                    ...store.getState(),
                    saving: false,
                    saveError: happyAgentUserError(error).message,
                });
            }
        },
        photoUpload(file) {
            return photoChange("upload", async () =>
                deps.actions.photoUpload(await happyAgentProfilePhotoRead(file)),
            );
        },
        photoRemove() {
            return photoChange("removal", () => deps.actions.photoRemove());
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}

const NO_PROFILE: HappyAgentProfileSnapshot = { ...EMPTY, loading: false };

export const happyAgentProfileStoreNoop: HappyAgentProfileStore = {
    get: () => NO_PROFILE,
    subscribe: () => () => undefined,
    displayNameUpdate: () => undefined,
    emailUpdate: () => undefined,
    profileRevert: () => undefined,
    profileSave: () => Promise.resolve(),
    photoUpload: () => Promise.resolve(),
    photoRemove: () => Promise.resolve(),
    [Symbol.dispose]: () => undefined,
};
