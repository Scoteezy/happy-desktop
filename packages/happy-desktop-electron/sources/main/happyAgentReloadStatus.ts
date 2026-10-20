import { readFile, unwatchFile, watchFile } from "node:fs";
import { join } from "node:path";
import type { DesktopDrainAgent, DesktopDrainComponent } from "../shared/desktopContract";
import type { HappyDaemonPaths } from "./happyAgentBinaryPaths";

/** The steps `happy-agent reload` reports while it is still going. */
export type HappyAgentReloadRunningPhase = "draining" | "stopping" | "starting";

/**
 * What `happy-agent reload` says about the reload under way or last finished,
 * in `<happyHome>/agent/reload.json`. Every time is epoch milliseconds.
 *
 * The file is the reload command's own report: the daemon cannot say anything
 * between stopping and starting, and a reload run from a terminal or by an
 * agent has no other way to tell this app what it is doing. It is written to a
 * temporary file and renamed, rewritten on every change and at least every two
 * seconds while the reload runs, and never deleted.
 */
export interface HappyAgentReloadStatus {
    readonly operationId: string;
    /** The reload command's process, not the daemon's. */
    readonly pid: number;
    readonly startedAt: number;
    readonly updatedAt: number;
    readonly phase: HappyAgentReloadRunningPhase | "done" | "failed";
    /** The Happy Agent version being started. */
    readonly version: string;
    /** Draining only: the daemon's own drain report. */
    readonly waitingFor?: readonly DesktopDrainComponent[];
    /** Draining only: the most open work the drain has held at once. */
    readonly waitingPeak?: number;
    /** Done or failed only. */
    readonly finishedAt?: number;
    /** Failed only: the step that was running. */
    readonly failedAt?: HappyAgentReloadRunningPhase;
    /** Failed only: what went wrong, in plain words. */
    readonly message?: string;
}

/** How often the file is looked at. Phase changes are written at once. */
const RELOAD_STATUS_POLL_MS = 500;

export function happyAgentReloadStatusPath(
    paths: Pick<HappyDaemonPaths, "agentDirectory">,
): string {
    return join(paths.agentDirectory, "reload.json");
}

/**
 * Reads one `reload.json`. Anything this cannot read as format 1 is no reload
 * at all, and fields it does not know are left alone, so a newer writer never
 * breaks an older reader.
 */
export function happyAgentReloadStatusParse(text: string): HappyAgentReloadStatus | undefined {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!record(value) || value.format !== 1) return undefined;
    const phase =
        value.phase === "done" || value.phase === "failed" || runningPhase(value.phase)
            ? value.phase
            : undefined;
    if (
        phase === undefined ||
        typeof value.operationId !== "string" ||
        value.operationId.length === 0 ||
        !count(value.pid) ||
        value.pid < 1 ||
        !count(value.startedAt) ||
        !count(value.updatedAt) ||
        typeof value.version !== "string"
    )
        return undefined;
    const waitingFor = Array.isArray(value.waitingFor)
        ? value.waitingFor.flatMap((row) => drainComponent(row) ?? [])
        : undefined;
    return {
        operationId: value.operationId,
        phase,
        pid: value.pid,
        startedAt: value.startedAt,
        updatedAt: value.updatedAt,
        version: value.version,
        ...(waitingFor === undefined ? {} : { waitingFor }),
        ...(count(value.waitingPeak) ? { waitingPeak: value.waitingPeak } : {}),
        ...(count(value.finishedAt) ? { finishedAt: value.finishedAt } : {}),
        ...(runningPhase(value.failedAt) ? { failedAt: value.failedAt } : {}),
        ...(typeof value.message === "string" ? { message: value.message } : {}),
    };
}

/**
 * Follows `reload.json`: reports what it says now, then again whenever it
 * changes. It is polled rather than watched through the directory, because
 * the directory may not exist until the first reload makes it, and a rename
 * over the file is what every write is. Returns the function that stops it.
 */
export function happyAgentReloadStatusWatch(
    path: string,
    onStatus: (status: HappyAgentReloadStatus | undefined) => void,
): () => void {
    let stopped = false;
    let reading = 0;
    const read = (): void => {
        const generation = ++reading;
        readFile(path, "utf8", (error, text) => {
            if (stopped || generation !== reading) return;
            onStatus(error ? undefined : happyAgentReloadStatusParse(text));
        });
    };
    const changed = (): void => read();
    watchFile(path, { interval: RELOAD_STATUS_POLL_MS, persistent: false }, changed);
    read();
    return () => {
        stopped = true;
        unwatchFile(path, changed);
    };
}

function drainComponent(value: unknown): DesktopDrainComponent | undefined {
    if (!record(value) || typeof value.name !== "string" || !count(value.count)) return undefined;
    const agents = Array.isArray(value.agents)
        ? value.agents.flatMap((agent): DesktopDrainAgent[] => {
              if (!record(agent) || typeof agent.id !== "string") return [];
              const stage = agent.stage;
              return stage === "inference" ||
                  stage === "tools" ||
                  stage === "compaction" ||
                  stage === "settlement"
                  ? [{ id: agent.id, stage }]
                  : [];
          })
        : undefined;
    return {
        count: value.count,
        name: value.name,
        ...(agents === undefined ? {} : { agents }),
        ...(value.truncated === true ? { truncated: true } : {}),
    };
}

function runningPhase(value: unknown): value is HappyAgentReloadRunningPhase {
    return value === "draining" || value === "stopping" || value === "starting";
}

function count(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
