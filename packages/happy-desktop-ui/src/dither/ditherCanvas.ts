/** Ported from https://github.com/Boring-Software-Inc/dither-kit at
 * 1e7faee9aa252e499651e6736ed65f7a07d9a6bd. MIT per its package.json.
 * cartesian-canvas.tsx adapted to finite, event-driven animation. Entrance runs
 * once; sample updates interpolate existing surfaces. No idle loop or stars. */
import { ditherBackingSize, ditherEase, ditherPaintColumn } from "./ditherPaint";
import { ditherSurfaces } from "./ditherGeometry";
import { ditherPalette } from "./ditherPalette";
import type { DitherFrame, DitherSurface } from "./ditherTypes";

const visibilityListeners = new Map<Element, (visible: boolean) => void>();
const sizeListeners = new Map<Element, () => void>();
let intersection: IntersectionObserver | undefined;
let resize: ResizeObserver | undefined;

/** One observer per browser boundary serves all the process-row sparklines. */
function watch(
    root: HTMLElement,
    size: () => void,
    visibility: (visible: boolean) => void,
): () => void {
    intersection ??= new IntersectionObserver((entries) => {
        for (const entry of entries)
            visibilityListeners.get(entry.target)?.(
                entry.isIntersecting &&
                    entry.intersectionRect.width > 0 &&
                    entry.intersectionRect.height > 0,
            );
    });
    resize ??= new ResizeObserver((entries) => {
        for (const entry of entries) sizeListeners.get(entry.target)?.();
    });
    visibilityListeners.set(root, visibility);
    sizeListeners.set(root, size);
    intersection.observe(root);
    resize.observe(root);
    return () => {
        intersection?.unobserve(root);
        resize?.unobserve(root);
        visibilityListeners.delete(root);
        sizeListeners.delete(root);
        if (visibilityListeners.size === 0) {
            intersection?.disconnect();
            resize?.disconnect();
            intersection = undefined;
            resize = undefined;
        }
    };
}

export interface DitherCanvasController {
    attach(canvas: HTMLCanvasElement): () => void;
    frameUpdate(frame: DitherFrame): void;
    scrubUpdate(fraction: number | null): void;
    animationStop(): void;
}

export function ditherCanvasControllerCreate(): DitherCanvasController {
    let canvas: HTMLCanvasElement | undefined;
    let root: HTMLElement | undefined;
    let context: CanvasRenderingContext2D | null = null;
    let frame: DitherFrame = { series: [], maximum: undefined, animate: true };
    let current: readonly DitherSurface[] = [];
    let target: readonly DitherSurface[] = [];
    let from: readonly DitherSurface[] = [];
    let palette: ReturnType<typeof ditherPalette> | undefined;
    let columns = 0;
    let rows = 0;
    let raf = 0;
    let visible = false;
    let dirty = true;
    let entrancePlayed = false;
    let entrance = false;
    let started = 0;
    let duration = 0;
    let reveal = 1;
    let scrub: number | null = null;

    const stop = (): void => {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
    };
    const paint = (): void => {
        if (!context || !palette || !visible || document.hidden) return;
        const ctx = context;
        ctx.clearRect(0, 0, columns, rows);
        ctx.fillStyle = palette.grey;
        ctx.globalAlpha = 0.16;
        for (const y of [0, Math.round(rows / 2), rows - 1])
            for (let x = 0; x < columns; x += 4) ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = 1;
        for (const [index, surface] of current.entries()) {
            for (let x = 0; x < Math.ceil(reveal * columns); x++) {
                const top = surface.top[x];
                if (top == null) continue;
                ditherPaintColumn(ctx, x, top, rows - 1, palette[surface.color], index * 0.14);
            }
        }
        if (scrub !== null) {
            const x = Math.round(scrub * (columns - 1));
            ctx.fillStyle = palette.grey;
            ctx.globalAlpha = 0.35;
            for (let y = 0; y < rows; y += 2) ctx.fillRect(x, y, 1, 1);
            ctx.globalAlpha = 1;
            for (const surface of current) {
                const y = surface.top[x];
                if (y == null) continue;
                ctx.fillStyle = palette[surface.color];
                ctx.fillRect(x - 1, Math.round(y) - 1, 3, 3);
            }
        }
    };
    const tick = (now: number): void => {
        raf = 0;
        if (!visible || document.hidden) return;
        const progress = duration === 0 ? 1 : Math.min(1, (now - started) / duration);
        const eased = ditherEase(progress);
        current = target.map((surface, index) => {
            const before = from[index];
            return {
                ...surface,
                top: surface.top.map((value, column) => {
                    const previous = before?.top[column];
                    return value === null
                        ? null
                        : previous == null
                          ? value
                          : previous + (value - previous) * eased;
                }),
            };
        });
        reveal = entrance ? eased : 1;
        paint();
        if (progress < 1) raf = requestAnimationFrame(tick);
    };
    const render = (): void => {
        if (!canvas || !root || !visible || document.hidden) return;
        stop();
        const size = ditherBackingSize(root.clientWidth, root.clientHeight);
        const resized = columns !== size.cols || rows !== size.rows;
        columns = size.cols;
        rows = size.rows;
        if (resized) {
            canvas.width = columns;
            canvas.height = rows;
        }
        palette = ditherPalette(root);
        target = ditherSurfaces(frame.series, frame.maximum, columns, rows);
        const hasValues = target.some((surface) => surface.top.some((value) => value !== null));
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        entrance = !entrancePlayed && hasValues && frame.animate && !reduced;
        if (hasValues) entrancePlayed = true;
        from = target.map((surface) => {
            const previous = current.find((entry) => entry.id === surface.id);
            return previous && previous.top.length === columns && !resized ? previous : surface;
        });
        duration = frame.animate && !reduced ? (entrance ? 420 : resized ? 0 : 360) : 0;
        started = performance.now();
        dirty = false;
        tick(started);
    };
    return {
        attach(element) {
            canvas = element;
            root = element.parentElement ?? undefined;
            context = element.getContext("2d");
            const host = root;
            if (!host) return () => undefined;
            const release = watch(
                host,
                () => {
                    dirty = true;
                    render();
                },
                (next) => {
                    visible = next;
                    if (!next) {
                        if (raf) dirty = true;
                        stop();
                        return;
                    }
                    if (dirty) render();
                    else paint();
                },
            );
            const themeChange = (): void => {
                if (!root) return;
                if (!visible) {
                    dirty = true;
                    return;
                }
                palette = ditherPalette(root);
                paint();
            };
            const theme = new MutationObserver(themeChange);
            theme.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ["class", "style"],
            });
            const scope = host.closest(".happy-theme-scope");
            if (scope)
                theme.observe(scope, { attributes: true, attributeFilter: ["class", "style"] });
            const appearance = window.matchMedia("(prefers-color-scheme: dark)");
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
            appearance.addEventListener("change", themeChange);
            const motionChange = (): void => {
                dirty = true;
                render();
            };
            reduced.addEventListener("change", motionChange);
            const documentChange = (): void => {
                if (document.hidden) {
                    stop();
                    dirty = true;
                } else if (dirty) render();
            };
            document.addEventListener("visibilitychange", documentChange);
            return () => {
                stop();
                release();
                theme.disconnect();
                appearance.removeEventListener("change", themeChange);
                reduced.removeEventListener("change", motionChange);
                document.removeEventListener("visibilitychange", documentChange);
                visible = false;
                dirty = true;
                canvas = undefined;
                root = undefined;
                context = null;
            };
        },
        frameUpdate(next) {
            frame = next;
            dirty = true;
            render();
        },
        scrubUpdate(value) {
            scrub = value;
            paint();
        },
        animationStop: stop,
    };
}
