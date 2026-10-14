import { createStore } from "zustand/vanilla";
import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { UserError } from "../types.js";
import { happyAgentMenusDerive } from "./happyAgentMenusStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import { deepEqual, happyAgentUserError } from "./happyAgentSupport.js";
import type {
    HappyAgentMenusSnapshot,
    HappyAgentModelSelection,
    HappyAgentThinkingLevel,
} from "./happyAgentTypes.js";

/** The machine's voice settings exactly as the Happy Agent states them. */
export interface HappyAgentVoiceSettings {
    /** What the reader chose. `null` leaves that part to the machine's default. */
    readonly controller: {
        readonly providerId: string | null;
        readonly modelId: string | null;
        readonly effort: string | null;
        readonly fastMode: boolean;
    };
    /** What a call started now would use, and why, when it is not what was chosen. */
    readonly effectiveController: {
        readonly providerId: string | null;
        readonly modelId: string;
        readonly effort: string;
        /** The tier a call asks for, such as `"priority"` with Fast mode on; `null` for the default. */
        readonly serviceTier: string | null;
        readonly notice: string | null;
    };
    /** The prompt that ships with Happy Agent. Never stored; copied from, never saved. */
    readonly defaultSystemPrompt: string;
    readonly systemPromptOverride: string | null;
    readonly effectiveSystemPrompt: string;
}

export interface HappyAgentVoiceSettingsSnapshot {
    /** True until the first answer arrives, so nothing is claimed early. */
    readonly loading: boolean;
    /** Absent before the first answer, and on a Happy Agent that has no voice settings. */
    readonly settings?: HappyAgentVoiceSettings;
    /**
     * The controller picker, offered the way a session's model picker offers
     * models and opened on the controller a call would use.
     */
    readonly menus?: HappyAgentMenusSnapshot;
    /** Whether the controller model has a priority tier for Fast mode to ask for. */
    readonly fastModeAvailable: boolean;
    /**
     * The prompt being written, kept only here until it is saved. Absent while
     * nothing is being edited, when the editor shows the prompt in effect.
     */
    readonly promptDraft?: string;
    /** A change has been asked for and the machine has not answered yet. */
    readonly saving: boolean;
    /** Why the settings could not be read; a reading already shown stays beneath it. */
    readonly error?: UserError;
    /** Why the last change was refused. Cleared by the next attempt. */
    readonly saveError?: UserError;
}

/**
 * Voice settings: which model the voice controller hands requests to, whether
 * it asks for the priority tier, and the prompt voice runs with.
 *
 * They are the Happy Agent's own configuration, read and written whole through
 * `getConfig`/`patchConfig`, and a call reads them when it starts, so a change
 * applies from the next call. Nothing is guessed: a change marks the store as
 * saving, and the configuration the machine answers with is what is shown. The
 * prompt's draft is the one thing held here before the machine has it, and
 * only until Save or Cancel.
 */
export interface HappyAgentVoiceSettingsStore {
    get(): HappyAgentVoiceSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    /** Hands requests to this model from the next call, with its effort when one is named. */
    controllerModelUpdate(selection: HappyAgentModelSelection): void;
    controllerEffortUpdate(effort?: HappyAgentThinkingLevel): void;
    fastModeUpdate(enabled: boolean): void;
    /** Edits the prompt locally. Nothing reaches the machine until `promptSave`. */
    promptDraftUpdate(text: string): void;
    /** Drops the unsaved prompt, leaving the one in effect. */
    promptDraftCancel(): void;
    promptSave(): void;
    /** Removes the runtime override, inheriting the machine's configured prompt or built-in default. */
    promptReset(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentVoiceSettingsStoreDeps {
    readonly client: Pick<HappyAgentClient, "getConfig" | "patchConfig">;
}

type VoicePatch = {
    readonly controller?: {
        readonly providerId?: string | null;
        readonly modelId?: string | null;
        readonly effort?: string | null;
        readonly fastMode?: boolean;
    };
    readonly systemPrompt?: string | null;
};

const EMPTY: HappyAgentVoiceSettingsSnapshot = {
    loading: true,
    fastModeAvailable: false,
    saving: false,
};

/**
 * How often the open settings re-read the machine. Voice settings have no
 * realtime channel of their own, so they are polled while watched and not at
 * all otherwise.
 */
const VOICE_SETTINGS_POLL_INTERVAL_MS = 4_000;

export function happyAgentVoiceSettingsStoreCreate(
    deps: HappyAgentVoiceSettingsStoreDeps,
): HappyAgentVoiceSettingsStore {
    const store = createStore<HappyAgentVoiceSettingsSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** Changes go one after another, so an older answer never lands over a newer one. */
    let writes: Promise<void> = Promise.resolve();
    let pending = 0;

    const timerCancel = (): void => {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
    };

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined || pending > 0) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, VOICE_SETTINGS_POLL_INTERVAL_MS);
    };

    /** Shows the configuration the machine has just confirmed, keeping identity while it is unchanged. */
    const settle = (config: Awaited<ReturnType<HappyAgentClient["getConfig"]>>["config"]): void => {
        const current = store.getState();
        const settings: HappyAgentVoiceSettings | undefined = config.voice;
        const catalog = happyAgentModelCatalogProject(config);
        const effective = settings?.effectiveController;
        const menus =
            effective === undefined
                ? undefined
                : happyAgentMenusDerive(catalog, {
                      providerId: effective.providerId ?? catalog.defaultProviderId,
                      modelId: effective.modelId,
                      effort: effective.effort as HappyAgentThinkingLevel,
                      // The controller only reads; it never asks for access.
                      permissionMode: "read_only",
                      ...(effective.serviceTier === null
                          ? {}
                          : { serviceTier: effective.serviceTier }),
                  });
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                ...(settings === undefined
                    ? { settings: undefined, menus: undefined }
                    : {
                          settings: deepEqual(current.settings, settings)
                              ? current.settings
                              : settings,
                          menus: deepEqual(current.menus, menus) ? current.menus : menus,
                      }),
                fastModeAvailable:
                    menus?.serviceTierOptions.some((option) => option.tier === "priority") ?? false,
            },
            true,
        );
    };

    const load = (): void => {
        if (disposed || listeners.size === 0 || controller !== undefined || pending > 0) return;
        timerCancel();
        const currentController = new AbortController();
        controller = currentController;
        void deps.client.getConfig({ signal: currentController.signal }).then(
            (response) => {
                if (disposed || controller !== currentController) return;
                controller = undefined;
                settle(response.config);
                schedule();
            },
            (error: unknown) => {
                if (
                    disposed ||
                    controller !== currentController ||
                    currentController.signal.aborted
                )
                    return;
                controller = undefined;
                if (store.getState().loading)
                    store.setState({ error: happyAgentUserError(error), loading: false }, false);
                schedule();
            },
        );
    };

    /** Writes one change and shows what the machine answers with. */
    const write = (voice: VoicePatch, saved?: () => void): void => {
        if (disposed) return;
        pending++;
        const { saveError: _cleared, ...rest } = store.getState();
        store.setState({ ...rest, saving: true }, true);
        // A poll landing mid-write would show the settings from before the change.
        timerCancel();
        controller?.abort();
        controller = undefined;
        writes = writes.then(() =>
            deps.client.patchConfig({ voice }).then(
                (response) => {
                    if (disposed) return;
                    pending--;
                    saved?.();
                    settle(response.config);
                    store.setState({ saving: pending > 0 }, false);
                    schedule();
                },
                (error: unknown) => {
                    if (disposed) return;
                    pending--;
                    store.setState(
                        { saving: pending > 0, saveError: happyAgentUserError(error) },
                        false,
                    );
                    schedule();
                },
            ),
        );
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) load();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size !== 0) return;
                timerCancel();
                controller?.abort();
                controller = undefined;
            };
        },
        controllerModelUpdate(selection) {
            write({
                controller: {
                    providerId: selection.providerId ?? null,
                    modelId: selection.modelId,
                    effort: selection.effort ?? null,
                },
            });
        },
        controllerEffortUpdate(effort) {
            write({ controller: { effort: effort ?? null } });
        },
        fastModeUpdate(enabled) {
            write({ controller: { fastMode: enabled } });
        },
        promptDraftUpdate(text) {
            if (disposed) return;
            store.setState({ promptDraft: text }, false);
        },
        promptDraftCancel() {
            if (disposed || store.getState().promptDraft === undefined) return;
            const { promptDraft: _dropped, ...rest } = store.getState();
            store.setState(rest, true);
        },
        promptSave() {
            const draft = store.getState().promptDraft;
            if (draft === undefined) return;
            // Saving the shipped text is the machine's to recognize: it then
            // removes the saved prompt rather than keeping a copy of the default.
            write({ systemPrompt: draft }, () => {
                if (store.getState().promptDraft !== draft) return;
                const { promptDraft: _saved, ...rest } = store.getState();
                store.setState(rest, true);
            });
        },
        promptReset() {
            write({ systemPrompt: null }, () => {
                const { promptDraft: _dropped, ...rest } = store.getState();
                store.setState(rest, true);
            });
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            timerCancel();
            controller?.abort();
            controller = undefined;
            listeners.clear();
        },
    };
}

const INERT_SNAPSHOT: HappyAgentVoiceSettingsSnapshot = {
    loading: false,
    fastModeAvailable: false,
    saving: false,
};

/** A host with no voice settings: nothing to read and nothing to write. */
export const happyAgentVoiceSettingsStoreNoop: HappyAgentVoiceSettingsStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    controllerModelUpdate: () => undefined,
    controllerEffortUpdate: () => undefined,
    fastModeUpdate: () => undefined,
    promptDraftUpdate: () => undefined,
    promptDraftCancel: () => undefined,
    promptSave: () => undefined,
    promptReset: () => undefined,
    [Symbol.dispose]: () => undefined,
};
