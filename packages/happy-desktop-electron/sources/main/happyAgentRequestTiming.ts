import { performance } from "node:perf_hooks";
import type { ServerResponse } from "node:http";

export type HappyAgentRequestMilestone = "daemon-headers" | "daemon-first-byte";

/** Debug-only, path-free timings. Never log URLs, credentials or request bodies. */
export function happyAgentRequestTimingCreate(
    response: ServerResponse,
    debug?: (message: string) => void,
    now: () => number = () => performance.now(),
): ((milestone: HappyAgentRequestMilestone) => void) | undefined {
    if (!debug) return undefined;
    const start = now();
    const stages = new Map<HappyAgentRequestMilestone, number>();
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        const finishNow = now();
        const elapsed = finishNow - start;
        if (elapsed < 150) return;
        const headers = stages.get("daemon-headers");
        const firstByte = stages.get("daemon-first-byte");
        debug(
            `Happy Agent HTTP slow total=${elapsed.toFixed(0)}ms ` +
                `daemonHeaders=${headers === undefined ? "-" : (headers - start).toFixed(0)}ms ` +
                `firstByte=${firstByte === undefined ? "-" : (firstByte - start).toFixed(0)}ms ` +
                `body=${headers === undefined ? "-" : (finishNow - headers).toFixed(0)}ms ` +
                `status=${String(response.statusCode)} completed=${String(response.writableFinished)}`,
        );
    };
    response.once("finish", finish);
    response.once("close", finish);
    return (milestone) => {
        if (!finished && !stages.has(milestone)) stages.set(milestone, now());
    };
}
