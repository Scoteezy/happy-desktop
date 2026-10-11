import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import type {
    HappyAgentProfilePhotoCodec,
    HappyAgentProfilePhotoCropRegion,
} from "./happyAgentProfilePhoto.js";
import {
    happyAgentProfileStoreCreate,
    type HappyAgentProfile,
    type HappyAgentProfileActions,
} from "./happyAgentProfileStore.js";
import type { HappyAgentAvatarImage } from "./happyAgentTypes.js";

/* The photo is changed through the store and reported back through the
 * source, like every other stored field: the store tracks only the change in
 * flight and why the last one failed. A picked picture is opened for cropping
 * first, and nothing is sent until the crop is confirmed. */

function png(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
}

/** A picture decoder standing in for the engine: it records what it opened, cut, and let go. */
function codecFake() {
    const opened: {
        readonly imageUrl: string;
        readonly crops: { region: HappyAgentProfilePhotoCropRegion; size: number }[];
        closed: boolean;
    }[] = [];
    let refusal: unknown;
    let encoded: (size: number) => Blob = (size) => new Blob([png(size, size).slice()]);
    const codec: HappyAgentProfilePhotoCodec = {
        open() {
            if (refusal !== undefined) return Promise.reject(refusal);
            const entry = {
                imageUrl: `blob:picked-${opened.length + 1}`,
                crops: [] as { region: HappyAgentProfilePhotoCropRegion; size: number }[],
                closed: false,
            };
            opened.push(entry);
            return Promise.resolve({
                imageUrl: entry.imageUrl,
                width: 1200,
                height: 800,
                crop(region, size) {
                    entry.crops.push({ region, size });
                    return Promise.resolve(encoded(size));
                },
                close() {
                    entry.closed = true;
                },
            });
        },
    };
    return {
        codec,
        opened,
        refuse(error: unknown) {
            refusal = error;
        },
        encode(next: (size: number) => Blob) {
            encoded = next;
        },
    };
}

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
    const codec = codecFake();
    const store = happyAgentProfileStoreCreate({
        source: {
            subscribe(listener) {
                deliver = listener;
                listener(initial);
                return () => undefined;
            },
        },
        actions,
        photoCodec: codec.codec,
    });
    const unsubscribe = store.subscribe(() => undefined);
    return {
        store,
        codec,
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
const picked = () => new Blob([png(1200, 800).slice()], { type: "image/png" });
const square: HappyAgentProfilePhotoCropRegion = { x: 300, y: 100, size: 600 };

it("offers no photo before a named profile is stored, and opens nothing", async () => {
    const h = harness(undefined);
    expect(h.store.get().saved).toBe(false);

    await h.store.photoChoose(picked());

    expect(h.codec.opened).toHaveLength(0);
    expect(h.store.get()).toMatchObject({
        photoError: "Save your name first, then add a photo.",
    });
    expect(h.store.get().photoCrop).toBeUndefined();
    // The first save is what makes the profile; from then on a photo may follow.
    h.deliver(steve);
    expect(h.store.get().saved).toBe(true);
    h.dispose();
});

it("opens a picked picture for cropping, and sends only the confirmed square", async () => {
    const h = harness(steve);
    const opening = h.store.photoChoose(picked());
    expect(h.store.get().photoActivity).toBe("opening");
    await opening;
    expect(h.store.get()).toMatchObject({
        photoCrop: { imageUrl: "blob:picked-1", width: 1200, height: 800 },
    });
    expect(h.store.get().photoActivity).toBeUndefined();
    expect(h.uploads).toHaveLength(0);
    // Another pick while one is being cropped is not a second crop.
    await h.store.photoChoose(picked());
    expect(h.codec.opened).toHaveLength(1);

    const uploading = h.store.photoCropConfirm(square);
    expect(h.store.get().photoActivity).toBe("uploading");
    await vi.waitFor(() => expect(h.uploads).toHaveLength(1));
    expect(h.codec.opened[0]!.crops).toEqual([{ region: square, size: 512 }]);
    expect(h.uploads[0]!.contentType).toBe("image/png");
    expect(new Uint8Array(h.uploads[0]!.data)).toEqual(png(512, 512));
    // While it is sent the crop holds: no second send, no cancel, no removal.
    await h.store.photoCropConfirm(square);
    h.store.photoCropCancel();
    await h.store.photoRemove();
    expect(h.uploads).toHaveLength(1);
    expect(h.removals()).toBe(0);
    expect(h.store.get().photoCrop).toBeDefined();
    expect(h.codec.opened[0]!.closed).toBe(false);

    h.deliver({ ...steve, updatedAt: 2, photo: { thumbhash: "abc" } });
    h.settle().resolve();
    await uploading;
    expect(h.store.get()).toMatchObject({ photo: { thumbhash: "abc" } });
    expect(h.store.get().photoActivity).toBeUndefined();
    expect(h.store.get().photoCrop).toBeUndefined();
    expect(h.store.get().photoError).toBeUndefined();
    expect(h.codec.opened[0]!.closed).toBe(true);

    // The bytes arriving replace the placeholder without touching the fields.
    const placeholder = h.store.get().photo;
    h.deliver({ ...steve, updatedAt: 2, photo: { thumbhash: "abc" } });
    expect(h.store.get().photo).toBe(placeholder);
    h.deliver({ ...steve, updatedAt: 2, photo: { thumbhash: "abc", imageUrl: "blob:abc" } });
    expect(h.store.get().photo).toEqual({ thumbhash: "abc", imageUrl: "blob:abc" });
    h.dispose();
});

it("cancelling a crop sends nothing and lets the picture go", async () => {
    const h = harness({ ...steve, photo: { thumbhash: "abc", imageUrl: "blob:abc" } });
    await h.store.photoChoose(picked());
    // The stored photo cannot be removed from under an open crop.
    await h.store.photoRemove();
    expect(h.removals()).toBe(0);

    h.store.photoCropCancel();

    expect(h.store.get().photoCrop).toBeUndefined();
    expect(h.codec.opened[0]!.closed).toBe(true);
    expect(h.uploads).toHaveLength(0);
    expect(h.store.get().photo).toEqual({ thumbhash: "abc", imageUrl: "blob:abc" });
    // A new pick opens afresh.
    await h.store.photoChoose(picked());
    expect(h.store.get().photoCrop?.imageUrl).toBe("blob:picked-2");
    h.dispose();
    expect(h.codec.opened[1]!.closed).toBe(true);
});

it("keeps the crop open with the reason when the photo is refused, and tries again from it", async () => {
    const h = harness(steve);
    await h.store.photoChoose(picked());

    const refused = h.store.photoCropConfirm(square);
    await vi.waitFor(() => expect(h.uploads).toHaveLength(1));
    h.settle().reject(new HappyAgentApiError(500, "internal", "internal", null));
    await refused;
    expect(h.store.get()).toMatchObject({
        photoCrop: { imageUrl: "blob:picked-1" },
        photoError:
            "Happy Agent could not read this image. Try a different PNG, JPEG, or WebP file.",
    });
    expect(h.store.get().photoActivity).toBeUndefined();
    expect(h.codec.opened[0]!.closed).toBe(false);

    const again = h.store.photoCropConfirm({ ...square, x: 0 });
    expect(h.store.get().photoError).toBeUndefined();
    await vi.waitFor(() => expect(h.uploads).toHaveLength(2));
    h.settle().resolve();
    await again;
    expect(h.store.get().photoCrop).toBeUndefined();
    expect(h.codec.opened[0]!.crops.map((crop) => crop.region.x)).toEqual([300, 0]);
    h.dispose();
});

it("refuses an encoded crop the daemon would refuse, without sending it", async () => {
    const h = harness(steve);
    await h.store.photoChoose(picked());
    h.codec.encode(() => new Blob([png(512, 512).slice(), new Uint8Array(8 * 1024 * 1024)]));

    await h.store.photoCropConfirm(square);

    expect(h.uploads).toHaveLength(0);
    expect(h.store.get()).toMatchObject({
        photoCrop: { imageUrl: "blob:picked-1" },
        photoError: "The profile photo must be no larger than 8 MiB.",
    });
    h.dispose();
});

it("refuses a picture it cannot open before any crop is shown", async () => {
    const h = harness(steve);
    await h.store.photoChoose(new Blob(["not an image"]));
    expect(h.store.get().photoError).toBe("The profile photo must be a PNG, JPEG, or WebP image.");
    expect(h.codec.opened).toHaveLength(0);

    await h.store.photoChoose(new Blob([png(10_000, 6_000).slice()]));
    expect(h.store.get().photoError).toBe("Choose a picture no larger than 50 megapixels.");
    expect(h.codec.opened).toHaveLength(0);

    // The signature is right, but the engine cannot decode what follows it.
    h.codec.refuse(new DOMException("The source image could not be decoded.", "InvalidStateError"));
    await h.store.photoChoose(picked());
    expect(h.store.get()).toMatchObject({
        photoError: "Happy could not read this picture. Try a different PNG, JPEG, or WebP file.",
    });
    expect(h.store.get().photoCrop).toBeUndefined();
    expect(h.store.get().photoActivity).toBeUndefined();
    h.dispose();
});

it("explains a refused removal and clears the explanation on the next attempt", async () => {
    const h = harness({ ...steve, photo: { thumbhash: "abc", imageUrl: "blob:abc" } });
    const removing = h.store.photoRemove();
    expect(h.store.get().photoActivity).toBe("removing");
    h.settle().reject(new HappyAgentApiError(409, "The resource has changed.", "conflict", null));
    await removing;
    expect(h.store.get()).toMatchObject({
        photoError: "The profile changed somewhere else in the meantime. Try again.",
        photo: { thumbhash: "abc", imageUrl: "blob:abc" },
    });
    expect(h.store.get().photoActivity).toBeUndefined();

    const again = h.store.photoRemove();
    expect(h.store.get().photoError).toBeUndefined();
    h.deliver({ ...steve, updatedAt: 3 });
    h.settle().resolve();
    await again;
    expect(h.removals()).toBe(2);
    expect(h.store.get().photo).toBeUndefined();
    h.dispose();
});
