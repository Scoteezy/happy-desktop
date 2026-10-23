/**
 * Plays an item's stem cell growing into its picture.
 *
 * The waiting stem cell stays the SVG `<StemCell>`; nothing runs while it
 * waits. When the picture is assigned, the mark puts a `<canvas>` where the
 * cell was and calls `playStemCellToIcon()`. The growth runs in a worker on an
 * OffscreenCanvas, so the main thread only posts one message. It resolves when
 * the icon has formed; then the mark shows the plain `<img>`.
 *
 * It does not play (resolves `{ played: false }` at once, and the mark just
 * shows the picture) when the GPU is missing or software-emulated. The reader's
 * setting and reduced motion are decided before a canvas exists, by
 * `stemCellGrowthGate`.
 */
import { stemCellVariantFor, type StemCellColor, type StemCellPalette } from "./stemCellEngine";
import type {
    StemCellPlayResult,
    StemCellSupport,
    StemCellWorkerReply,
    StemCellWorkerRequest,
} from "./stemCellWorkerProtocol";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Whether the reader asked the system for less motion. */
export function stemCellReducedMotion(): boolean {
    return typeof matchMedia === "function" && matchMedia(REDUCED_MOTION).matches;
}

function offscreenAvailable(): boolean {
    return (
        typeof Worker !== "undefined" &&
        typeof OffscreenCanvas !== "undefined" &&
        typeof HTMLCanvasElement !== "undefined" &&
        "transferControlToOffscreen" in HTMLCanvasElement.prototype
    );
}

type Listener = (reply: StemCellWorkerReply) => void;

/** One worker for the window, made the first time anything asks for it. */
interface SharedWorker {
    readonly post: (message: StemCellWorkerRequest, transfer?: Transferable[]) => void;
    readonly listeners: Set<Listener>;
}

let worker: SharedWorker | null = null;
let workerFailed = false;

function sharedWorker(): SharedWorker | null {
    if (worker || workerFailed) return worker;
    try {
        const instance = new Worker(new URL("./stemCellWorker.ts", import.meta.url), {
            type: "module",
        });
        const listeners = new Set<Listener>();
        instance.addEventListener("message", (event: MessageEvent<StemCellWorkerReply>) => {
            for (const listener of listeners) listener(event.data);
        });
        // A worker that cannot load answers nothing; everything waiting on it
        // hears that it is unsupported instead of waiting forever.
        instance.addEventListener("error", () => {
            workerFailed = true;
            worker = null;
            for (const listener of listeners)
                listener({
                    type: "probe",
                    requestId: -1,
                    support: { supported: false, reason: "The worker could not start" },
                });
        });
        worker = {
            post: (message, transfer) => instance.postMessage(message, transfer ?? []),
            listeners,
        };
    } catch {
        workerFailed = true;
    }
    return worker;
}

let nextId = 1;

const support = new Map<boolean, StemCellSupport>();
const supportPending = new Map<boolean, Promise<StemCellSupport>>();

/** This session's answer, once the worker has given one. */
export function stemCellSupportKnown(allowSoftware = false): StemCellSupport | undefined {
    if (!offscreenAvailable()) return { supported: false, reason: "No OffscreenCanvas" };
    if (workerFailed) return { supported: false, reason: "The worker could not start" };
    return support.get(allowSoftware);
}

/** Whether this machine draws WebGL2 on a real GPU, asked once per session. */
export function stemCellSupportProbe(allowSoftware = false): Promise<StemCellSupport> {
    const known = stemCellSupportKnown(allowSoftware);
    if (known) return Promise.resolve(known);
    const pending = supportPending.get(allowSoftware);
    if (pending) return pending;
    const shared = sharedWorker();
    if (!shared) return Promise.resolve({ supported: false, reason: "The worker could not start" });
    const requestId = nextId++;
    const asked = new Promise<StemCellSupport>((resolve) => {
        const listen: Listener = (reply) => {
            if (reply.type !== "probe" || (reply.requestId !== requestId && reply.requestId !== -1))
                return;
            shared.listeners.delete(listen);
            support.set(allowSoftware, reply.support);
            resolve(reply.support);
        };
        shared.listeners.add(listen);
        shared.post({ type: "probe", requestId, allowSoftware });
    });
    supportPending.set(allowSoftware, asked);
    return asked;
}

const PALETTE_PROPERTIES = {
    membrane: "--stem-cell-membrane",
    core: "--stem-cell-core",
} as const;

let colorProbe: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour the theme names, as the 8-bit sRGB the engine mixes from. */
function cssColor(value: string): StemCellColor {
    colorProbe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!colorProbe) throw new Error("No 2D context to resolve the stem cell's colours");
    colorProbe.clearRect(0, 0, 1, 1);
    colorProbe.fillStyle = value;
    colorProbe.fillRect(0, 0, 1, 1);
    const [r, g, b] = colorProbe.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!];
}

/** The theme's stem cell colours where `element` is drawn. */
export function stemCellPaletteOf(element: Element): StemCellPalette {
    const style = getComputedStyle(element);
    return {
        membrane: cssColor(style.getPropertyValue(PALETTE_PROPERTIES.membrane).trim()),
        core: cssColor(style.getPropertyValue(PALETTE_PROPERTIES.core).trim()),
    };
}

export interface StemCellPlayOptions {
    /** The item's id, which seeds its stem cell exactly as `<StemCell id>` does. */
    readonly id: string;
    /** The mark's side in CSS pixels. */
    readonly size: 20 | 64;
    /** The picture the cell grows into: the @40 clay PNG at 20px, the @64 one at 64px. */
    readonly src: string;
    /** Draw on a software rasteriser too. For the Blueprint and verification only. */
    readonly allowSoftware?: boolean;
    /** The first frame is on the canvas. */
    readonly onStarted?: () => void;
    /** The mark went away: stop, and free the context at once. */
    readonly signal?: AbortSignal;
}

export type StemCellPlay = StemCellPlayResult & {
    /** Frees the GPU context once the caller has swapped in the `<img>`. */
    readonly dispose: () => void;
};

/** Decodes the picture on the main thread too, so the `<img>` that follows paints at once. */
async function iconBitmap(src: string): Promise<ImageBitmap> {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    await image.decode();
    return createImageBitmap(image);
}

/**
 * Plays the growth on a fresh, never-used `<canvas>` already sized by CSS.
 * Resolves when the icon has formed, or at once with `played: false`.
 */
export async function playStemCellToIcon(
    canvas: HTMLCanvasElement,
    options: StemCellPlayOptions,
): Promise<StemCellPlay> {
    const allowSoftware = options.allowSoftware ?? false;
    const nothing = () => {};
    const supported = await stemCellSupportProbe(allowSoftware);
    if (!supported.supported) return { played: false, reason: supported.reason, dispose: nothing };
    const shared = sharedWorker();
    if (!shared) return { played: false, reason: "The worker could not start", dispose: nothing };

    let bitmap: ImageBitmap;
    try {
        bitmap = await iconBitmap(options.src);
    } catch {
        return { played: false, reason: "The picture could not be decoded", dispose: nothing };
    }
    if (options.signal?.aborted) {
        bitmap.close();
        return { played: false, reason: "The mark went away", dispose: nothing };
    }
    const palette = stemCellPaletteOf(canvas);
    const pixelRatio = Math.min(devicePixelRatio || 1, 3);
    const offscreen = canvas.transferControlToOffscreen();
    const runId = nextId++;
    const dispose = () => shared.post({ type: "dispose", runId });
    const result = await new Promise<StemCellPlayResult>((resolve) => {
        const listen: Listener = (reply) => {
            if (reply.type === "probe" && reply.requestId === -1) {
                shared.listeners.delete(listen);
                resolve({ played: false, reason: "The worker stopped" });
                return;
            }
            if (reply.type === "probe" || reply.runId !== runId) return;
            if (reply.type === "started") {
                options.onStarted?.();
                return;
            }
            shared.listeners.delete(listen);
            resolve(reply.result);
        };
        shared.listeners.add(listen);
        options.signal?.addEventListener("abort", () => {
            shared.listeners.delete(listen);
            dispose();
            resolve({ played: false, reason: "The mark went away" });
        });
        shared.post(
            {
                type: "play",
                runId,
                canvas: offscreen,
                bitmap,
                // The marks this replaces never wobble, so the cell starts at rest.
                clock: 0,
                options: {
                    id: options.id,
                    size: Math.round(options.size * pixelRatio),
                    palette,
                    variant: stemCellVariantFor(options.size),
                    allowSoftware,
                },
            },
            [offscreen, bitmap],
        );
    });
    return { ...result, dispose };
}
