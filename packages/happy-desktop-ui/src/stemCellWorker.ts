/**
 * Runs stem-cell growths off the main thread. Each run owns an OffscreenCanvas
 * transferred from the page; the page only learns when it starts and ends.
 */
import {
    createStemCellEngine,
    stemCellAcceleration,
    webgl2,
    type StemCellAssignment,
    type StemCellEngine,
} from "./stemCellEngine";
import { stemCellSupportOf } from "./stemCellGate";
import type {
    StemCellSupport,
    StemCellWorkerReply,
    StemCellWorkerRequest,
} from "./stemCellWorkerProtocol";

/** The parts of the dedicated worker scope this file uses; the package compiles against DOM. */
interface WorkerScope {
    onmessage: ((event: MessageEvent<StemCellWorkerRequest>) => void) | null;
    postMessage(message: StemCellWorkerReply): void;
    requestAnimationFrame?: (callback: (now: number) => void) => number;
}

const scope = self as unknown as WorkerScope;

const frame = (callback: (now: number) => void): void => {
    if (scope.requestAnimationFrame) scope.requestAnimationFrame(callback);
    else setTimeout(() => callback(performance.now()), 16);
};

const runs = new Map<number, StemCellEngine>();

function probe(allowSoftware: boolean): StemCellSupport {
    if (typeof OffscreenCanvas === "undefined")
        return stemCellSupportOf({ offscreenCanvas: false, webgl2: null, allowSoftware });
    const gl = webgl2(new OffscreenCanvas(1, 1), {
        failIfMajorPerformanceCaveat: !allowSoftware,
    });
    const acceleration = gl ? stemCellAcceleration(gl) : null;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return stemCellSupportOf({ offscreenCanvas: true, webgl2: acceleration, allowSoftware });
}

scope.onmessage = (event) => {
    const message = event.data;
    if (message.type === "probe") {
        scope.postMessage({
            type: "probe",
            requestId: message.requestId,
            support: probe(message.allowSoftware),
        });
        return;
    }
    if (message.type === "dispose") {
        runs.get(message.runId)?.destroy();
        runs.delete(message.runId);
        return;
    }

    const { runId, canvas, bitmap } = message;
    let engine: StemCellEngine;
    let stats: StemCellAssignment;
    try {
        engine = createStemCellEngine(canvas, message.options);
        stats = engine.assign(bitmap);
    } catch (error) {
        bitmap.close();
        scope.postMessage({
            type: "end",
            runId,
            result: {
                played: false,
                reason: error instanceof Error ? error.message : String(error),
            },
        });
        return;
    }
    runs.set(runId, engine);
    bitmap.close();

    const started = performance.now();
    let cpu = 0;
    let worst = 0;
    let frames = 0;
    const tick = (now: number) => {
        if (!runs.has(runId)) return;
        const before = performance.now();
        const elapsed = Math.max(0, now - started);
        const more = engine.render(elapsed, message.clock + elapsed);
        const spent = performance.now() - before;
        cpu += spent;
        worst = Math.max(worst, spent);
        frames++;
        if (frames === 1) scope.postMessage({ type: "started", runId });
        if (more) frame(tick);
        else
            scope.postMessage({
                type: "end",
                runId,
                result: {
                    played: true,
                    ...stats,
                    frames,
                    cpuMsPerFrame: cpu / frames,
                    worstCpuMs: worst,
                    wallMs: performance.now() - started,
                },
            });
    };
    frame(tick);
};
