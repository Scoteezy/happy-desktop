/**
 * The frame size of each recording, as its own metadata reported it.
 *
 * A presented recording is supposed to arrive with its frame size, the way a
 * picture does, so its box is reserved at its own shape before a byte loads.
 * Daemons that state no size for videos leave the layout guessing a shape,
 * and a guessed box letterboxes the recording inside it. This is the boundary
 * that closes that gap: the first time a recording's metadata arrives, its
 * size is kept here by address, and every layout of an item that stated none
 * reads it from then on — the one resize when it first loads, and the exact
 * box at once on every later mount. A size the producer stated always wins.
 *
 * Bounded, and memory only: an address is the item's own media URL, so a
 * reload measures again.
 */

type MediaVideoFrame = { readonly width: number; readonly height: number };

/** How many recordings' sizes are kept; the oldest is forgotten first. */
const FRAMES_LIMIT = 512;

const frames = new Map<string, MediaVideoFrame>();
const listeners = new Set<() => void>();
let version = 0;

/** Keeps a recording's frame size, from its element's metadata. */
export function mediaVideoFrameRecord(url: string, frame: MediaVideoFrame): void {
    if (!(frame.width > 0 && frame.height > 0)) return;
    const held = frames.get(url);
    if (held?.width === frame.width && held.height === frame.height) return;
    frames.delete(url);
    frames.set(url, { width: frame.width, height: frame.height });
    if (frames.size > FRAMES_LIMIT) frames.delete(frames.keys().next().value!);
    version += 1;
    for (const listener of listeners) listener();
}

/** Changes whenever a size is learned; a layout that read the sizes reads them again. */
export function mediaVideoFramesVersion(): number {
    return version;
}

export function mediaVideoFramesSubscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

type Framable = {
    readonly kind: string;
    readonly url: string;
    readonly width?: number;
    readonly height?: number;
};

const framed = new WeakMap<readonly Framable[], { version: number; items: readonly Framable[] }>();

/**
 * `items` with each recording that stated no size given the one its metadata
 * reported, if it has. The same array when nothing changes, and the same
 * result for the same array until a size is learned, so a layout keyed on the
 * items stays put. `at` is the version the caller read, so a render that
 * subscribed asks again exactly when a size arrives.
 */
export function mediaItemsFramed<Item extends Framable>(
    items: readonly Item[],
    at: number = version,
): readonly Item[] {
    const held = framed.get(items);
    if (held?.version === at) return held.items as readonly Item[];
    let changed = false;
    const result = items.map((item) => {
        if (item.kind !== "video" || (item.width && item.height)) return item;
        const frame = frames.get(item.url);
        if (!frame) return item;
        changed = true;
        return { ...item, width: frame.width, height: frame.height };
    });
    const value = changed ? result : items;
    framed.set(items, { version: at, items: value });
    return value;
}

/** Whether any item is a recording whose layout waits on its metadata. */
export function mediaItemsUnframed(items: readonly Framable[]): boolean {
    return items.some((item) => item.kind === "video" && !(item.width && item.height));
}

/**
 * What the layout of `items` reads from learned sizes, as part of a cache key:
 * empty when every recording stated its size, and otherwise each unstated
 * one's learned size or `?`. `at` is the version the caller read, so a value
 * derived from it is recomputed exactly when a size arrives.
 */
export function mediaVideoFramesSignature(
    items: readonly Framable[],
    _at: number = version,
): string {
    let signature = "";
    for (const item of items) {
        if (item.kind !== "video" || (item.width && item.height)) continue;
        const frame = frames.get(item.url);
        signature += frame ? `${String(frame.width)}x${String(frame.height)},` : "?,";
    }
    return signature;
}
