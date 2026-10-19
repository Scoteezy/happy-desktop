import {
    HappyAgentApiError,
    type HappyAgentClient,
    type SystemMonitorSnapshot,
} from "@slopus/happy-agent-client";
import type { HappyAgentSurfaceId } from "./surfaceTypes.js";
import type {
    HappyAgentSystemMonitorSample,
    HappyAgentSystemMonitorSnapshot,
    HappyAgentSystemMonitorProcessColumn,
    HappyAgentSystemMonitorProcessRow,
} from "./surfaceSystemMonitorTypes.js";
import {
    HAPPY_AGENT_SYSTEM_MONITOR_PROCESS_SORT,
    happyAgentSystemMonitorProcessesFilter,
    happyAgentSystemMonitorProcessesSort,
} from "./surfaceSystemMonitorProcesses.js";

export interface HappyAgentSystemMonitorStore {
    get(): HappyAgentSystemMonitorSnapshot;
    subscribe(listener: () => void): () => void;
    processFilterUpdate(value: string): void;
    processSortUpdate(column: HappyAgentSystemMonitorProcessColumn): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSystemMonitorDeps {
    readonly client: Pick<HappyAgentClient, "getSystemMonitor">;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly surfaceCreated?: Promise<void>;
}

/** Explicitly owns the product contract, independently of the daemon's wire envelope. */
function sampleProject(wire: SystemMonitorSnapshot): HappyAgentSystemMonitorSample {
    return {
        sampledAt: wire.sampledAt,
        intervalMs: wire.intervalMs,
        host: {
            hostname: wire.host.hostname,
            platform: wire.host.platform,
            arch: wire.host.arch,
            osName: wire.host.osName,
            uptimeSeconds: wire.host.uptimeSeconds,
        },
        cpu: {
            model: wire.cpu.model,
            logicalCores: wire.cpu.logicalCores,
            usagePercent: wire.cpu.usagePercent,
            perCoreUsagePercent:
                wire.cpu.perCoreUsagePercent === null ? null : [...wire.cpu.perCoreUsagePercent],
            loadAverage:
                wire.cpu.loadAverage === null
                    ? null
                    : [wire.cpu.loadAverage[0], wire.cpu.loadAverage[1], wire.cpu.loadAverage[2]],
            speedMhz: wire.cpu.speedMhz,
            temperatureCelsius: wire.cpu.temperatureCelsius,
        },
        memory: {
            totalBytes: wire.memory.totalBytes,
            usedBytes: wire.memory.usedBytes,
            availableBytes: wire.memory.availableBytes,
            cachedBytes: wire.memory.cachedBytes,
            swapTotalBytes: wire.memory.swapTotalBytes,
            swapUsedBytes: wire.memory.swapUsedBytes,
        },
        gpus: wire.gpus.map((gpu) => ({
            name: gpu.name,
            vendor: gpu.vendor,
            usagePercent: gpu.usagePercent,
            memoryTotalBytes: gpu.memoryTotalBytes,
            memoryUsedBytes: gpu.memoryUsedBytes,
            temperatureCelsius: gpu.temperatureCelsius,
            powerWatts: gpu.powerWatts,
        })),
        disks: wire.disks.map((disk) => ({
            mountPoint: disk.mountPoint,
            device: disk.device,
            fileSystem: disk.fileSystem,
            totalBytes: disk.totalBytes,
            usedBytes: disk.usedBytes,
            availableBytes: disk.availableBytes,
        })),
        diskIo:
            wire.diskIo === null
                ? null
                : {
                      readBytesPerSecond: wire.diskIo.readBytesPerSecond,
                      writeBytesPerSecond: wire.diskIo.writeBytesPerSecond,
                  },
        processes:
            wire.processes === null
                ? null
                : {
                      total: wire.processes.total,
                      threads: wire.processes.threads,
                      items: wire.processes.items.map((process) => ({
                          pid: process.pid,
                          parentPid: process.parentPid,
                          name: process.name,
                          user: process.user,
                          state: process.state,
                          cpuPercent: process.cpuPercent,
                          memoryBytes: process.memoryBytes,
                          threads: process.threads,
                          startedAt: process.startedAt,
                      })),
                  },
        history: wire.history.map((point) => ({
            sampledAt: point.sampledAt,
            cpuPercent: point.cpuPercent,
            memoryUsedBytes: point.memoryUsedBytes,
            gpuPercent: point.gpuPercent,
            diskReadBytesPerSecond: point.diskReadBytesPerSecond,
            diskWriteBytesPerSecond: point.diskWriteBytesPerSecond,
        })),
    };
}

/** Polls only while subscribed. Browser visibility is handled by the framework binding. */
export function happyAgentSystemMonitorStoreCreate(
    deps: HappyAgentSystemMonitorDeps,
): HappyAgentSystemMonitorStore {
    let snapshot: HappyAgentSystemMonitorSnapshot = {
        status: "loading",
        sample: null,
        error: null,
        processFilter: "",
        processSort: HAPPY_AGENT_SYSTEM_MONITOR_PROCESS_SORT,
        processRows: [],
    };
    const listeners = new Set<() => void>();
    let active: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let processRows: readonly HappyAgentSystemMonitorProcessRow[] = [];
    let lastRankedAt = 0;
    const set = (next: HappyAgentSystemMonitorSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const read = async (signal: AbortSignal): Promise<void> => {
        let delay = 5000;
        try {
            await deps.surfaceCreated;
            if (signal.aborted) return;
            const wire = await deps.client.getSystemMonitor(deps.surfaceId, {
                signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
            });
            if (signal.aborted) return;
            const sample = sampleProject(wire);
            const needsInitialRanking = processRows.length === 0;
            const previous = new Map(processRows.map((row) => [row.process.pid, row]));
            const next = new Map(
                (sample.processes?.items ?? []).map((process) => {
                    const before = previous.get(process.pid);
                    const same =
                        before?.process.startedAt === process.startedAt &&
                        before?.process.name === process.name;
                    const row: HappyAgentSystemMonitorProcessRow = {
                        process,
                        cpuHistory: [...(same ? before.cpuHistory : []), process.cpuPercent].slice(
                            -60,
                        ),
                    };
                    return [process.pid, row] as const;
                }),
            );
            // Hold row positions between five-second ranking windows. Values and
            // tiny histories still update every sample; explicit sorting is immediate.
            const retained = processRows.flatMap((row) => {
                const current = next.get(row.process.pid);
                return current ? [current] : [];
            });
            processRows = [
                ...retained,
                ...[...next.values()].filter((row) => !previous.has(row.process.pid)),
            ];
            const now = Date.now();
            if (needsInitialRanking || lastRankedAt === 0 || now - lastRankedAt >= 5_000) {
                processRows = happyAgentSystemMonitorProcessesSort(
                    processRows,
                    snapshot.processSort,
                );
                lastRankedAt = now;
            }
            set({
                ...snapshot,
                status: "ready",
                sample,
                error: null,
                processRows: happyAgentSystemMonitorProcessesFilter(
                    processRows,
                    snapshot.processFilter,
                ),
            });
            delay = Math.max(1000, sample.intervalMs);
        } catch (error) {
            if (signal.aborted) return;
            const status = error instanceof HappyAgentApiError ? error.status : undefined;
            if (status === 404 || status === 410) {
                set({ ...snapshot, status: "missing", error: null });
                return;
            }
            if (status === 501 || status === 405) {
                set({ ...snapshot, status: "unsupported", error: null });
                return;
            }
            set({
                ...snapshot,
                status: "reconnecting",
                error: "The machine could not be reached. Connection retries automatically.",
            });
        }
        if (!signal.aborted)
            timer = setTimeout(() => {
                void read(signal);
            }, delay);
    };
    const stop = (): void => {
        active?.abort();
        active = undefined;
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        lastRankedAt = 0;
    };
    return {
        get: () => snapshot,
        processFilterUpdate(value) {
            if (disposed || value === snapshot.processFilter) return;
            set({
                ...snapshot,
                processFilter: value,
                processRows: happyAgentSystemMonitorProcessesFilter(processRows, value),
            });
        },
        processSortUpdate(column) {
            if (disposed) return;
            const current = snapshot.processSort;
            const direction =
                current.column === column
                    ? current.direction === "ascending"
                        ? "descending"
                        : "ascending"
                    : column === "cpu" || column === "memory" || column === "threads"
                      ? "descending"
                      : "ascending";
            const processSort = { column, direction } as const;
            processRows = happyAgentSystemMonitorProcessesSort(processRows, processSort);
            lastRankedAt = Date.now();
            set({
                ...snapshot,
                processSort,
                processRows: happyAgentSystemMonitorProcessesFilter(
                    processRows,
                    snapshot.processFilter,
                ),
            });
        },
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (!active) {
                active = new AbortController();
                void read(active.signal);
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        [Symbol.dispose]() {
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
