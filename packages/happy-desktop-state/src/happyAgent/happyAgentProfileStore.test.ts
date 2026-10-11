import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import {
    happyAgentProfileStoreCreate,
    type HappyAgentProfile,
    type HappyAgentProfileActions,
} from "./happyAgentProfileStore.js";
import type { HappyAgentAvatarImage } from "./happyAgentTypes.js";

/* The photo is changed through the store and reported back through the
 * source, like every other stored field: the store tracks only the change in
 * flight and why the last one failed. */

const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0,
    64, 0, 0, 0, 64,
]);

function harness(initial: HappyAgentProfile | undefined) {
    let deliver: (profile: HappyAgentProfile | undefined) => void = () => undefined;
    const uploads: HappyAgentAvatarImage[] = [];
    let removals = 0;
    let settle: { resolve: () => void; reject: (error: unknown) => void } | undefined;
    const pending = () =>
        new Promise<void>((resolve, reject) => {
            settle = { resolve, reject };
        });
    const actions: HappyAgentProfileActions = {
        profileSave: () => Promise.reject(new Error("not used")),
        photoUpload(image) {
            uploads.push(image);
            return pending();
        },
        photoRemove() {
            removals += 1;
            return pending();
        },
    };
    const store = happyAgentProfileStoreCreate({
        source: {
            subscribe(listener) {
                deliver = listener;
                listener(initial);
                return () => undefined;
            },
        },
        actions,
    });
    const unsubscribe = store.subscribe(() => undefined);
    return {
        store,
        deliver: (profile: HappyAgentProfile | undefined) => deliver(profile),
        uploads,
        removals: () => removals,
        settle: () => settle!,
        dispose() {
            unsubscribe();
            store[Symbol.dispose]();
        },
    };
}

const steve: HappyAgentProfile = { email: "steve@example.com", name: "Steve", updatedAt: 1 };

it("offers no photo before a named profile is stored, and sends nothing", async () => {
    const h = harness(undefined);
    expect(h.store.get().saved).toBe(false);

    await h.store.photoUpload(new Blob([PNG]));

    expect(h.uploads).toHaveLength(0);
    expect(h.store.get()).toMatchObject({
        photoUploading: false,
        photoError: "Save your name first, then add a photo.",
    });
    // The first save is what makes the profile; from then on a photo may follow.
    h.deliver(steve);
    expect(h.store.get().saved).toBe(true);
    h.dispose();
});

it("uploads the picked bytes, shows the change in flight, and takes the result from the source", async () => {
    const h = harness(steve);
    const uploading = h.store.photoUpload(new Blob([PNG], { type: "image/jpeg" }));
    expect(h.store.get().photoUploading).toBe(true);
    await vi.waitFor(() => expect(h.uploads).toHaveLength(1));
    expect(h.uploads[0]!.contentType).toBe("image/png");
    // A second pick while one is in flight is not a second upload.
    await h.store.photoUpload(new Blob([PNG]));
    expect(h.uploads).toHaveLength(1);

    h.deliver({ ...steve, updatedAt: 2, photo: { thumbhash: "abc" } });
    h.settle().resolve();
    await uploading;
    expect(h.store.get()).toMatchObject({
        photoUploading: false,
        photo: { thumbhash: "abc" },
    });
    expect(h.store.get().photoError).toBeUndefined();

    // The bytes arriving replace the placeholder without touching the fields.
    const placeholder = h.store.get().photo;
    h.deliver({ ...steve, updatedAt: 2, photo: { thumbhash: "abc" } });
    expect(h.store.get().photo).toBe(placeholder);
    h.deliver({ ...steve, updatedAt: 2, photo: { thumbhash: "abc", imageUrl: "blob:abc" } });
    expect(h.store.get().photo).toEqual({ thumbhash: "abc", imageUrl: "blob:abc" });
    h.dispose();
});

it("refuses an unreadable file before sending it", async () => {
    const h = harness(steve);
    await h.store.photoUpload(new Blob(["not an image"]));
    expect(h.uploads).toHaveLength(0);
    expect(h.store.get()).toMatchObject({
        photoUploading: false,
        photoError: "The profile photo must be a PNG, JPEG, or WebP image.",
    });
    h.dispose();
});

it("explains a refused removal and clears the explanation on the next attempt", async () => {
    const h = harness({ ...steve, photo: { thumbhash: "abc", imageUrl: "blob:abc" } });
    const removing = h.store.photoRemove();
    expect(h.store.get().photoRemoving).toBe(true);
    h.settle().reject(new HappyAgentApiError(409, "The resource has changed.", "conflict", null));
    await removing;
    expect(h.store.get()).toMatchObject({
        photoRemoving: false,
        photoError: "The profile changed somewhere else in the meantime. Try again.",
        photo: { thumbhash: "abc", imageUrl: "blob:abc" },
    });

    const again = h.store.photoRemove();
    expect(h.store.get().photoError).toBeUndefined();
    h.deliver({ ...steve, updatedAt: 3 });
    h.settle().resolve();
    await again;
    expect(h.removals()).toBe(2);
    expect(h.store.get().photo).toBeUndefined();
    h.dispose();
});
