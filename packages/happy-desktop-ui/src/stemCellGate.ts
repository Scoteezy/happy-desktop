import type { StemCellAcceleration } from "./stemCellEngine";
import type { StemCellSupport } from "./stemCellWorkerProtocol";

/** What the worker found when it asked for a context. */
export interface StemCellProbe {
    readonly offscreenCanvas: boolean;
    /** The context's renderer, or null when no WebGL2 context could be created. */
    readonly webgl2: StemCellAcceleration | null;
    readonly allowSoftware: boolean;
}

/**
 * Whether the growth may run here. It needs an OffscreenCanvas, a WebGL2
 * context created with `failIfMajorPerformanceCaveat`, and a renderer that is
 * not a CPU rasteriser, which would run the whole shader on the CPU.
 */
export function stemCellSupportOf(probe: StemCellProbe): StemCellSupport {
    if (!probe.offscreenCanvas) return { supported: false, reason: "No OffscreenCanvas" };
    if (probe.webgl2 === null) return { supported: false, reason: "No hardware WebGL2" };
    const { accelerated, renderer } = probe.webgl2;
    if (!accelerated && !probe.allowSoftware)
        return { supported: false, reason: `Software renderer: ${renderer}` };
    return { supported: true, renderer, accelerated };
}

/** What a mark does when its stem cell is replaced by a picture on screen. */
export type StemCellGrowthGate =
    | { readonly kind: "play" }
    /** Support is not known yet: keep the stem cell up while the worker is asked. */
    | { readonly kind: "probe" }
    | { readonly kind: "skip"; readonly reason: "setting" | "reducedMotion" | "unsupported" };

export interface StemCellGrowthInput {
    /** The reader's "Animate new work's icon" setting, as the picture carries it. */
    readonly enabled: boolean;
    readonly reducedMotion: boolean;
    /** This session's probe result, or undefined while it has not answered. */
    readonly support: StemCellSupport | undefined;
}

/** Plays only when every gate is open; anything else shows the picture at once. */
export function stemCellGrowthGate(input: StemCellGrowthInput): StemCellGrowthGate {
    if (!input.enabled) return { kind: "skip", reason: "setting" };
    if (input.reducedMotion) return { kind: "skip", reason: "reducedMotion" };
    if (input.support === undefined) return { kind: "probe" };
    return input.support.supported ? { kind: "play" } : { kind: "skip", reason: "unsupported" };
}
