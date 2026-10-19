export type HappyAgentSystemMonitorProcessState =
    | "running"
    | "sleeping"
    | "stopped"
    | "zombie"
    | "idle"
    | "other";
export interface HappyAgentSystemMonitorProcess {
    readonly pid: number;
    readonly parentPid: number | null;
    readonly name: string;
    readonly user: string | null;
    readonly state: HappyAgentSystemMonitorProcessState | null;
    readonly cpuPercent: number | null;
    readonly memoryBytes: number;
    readonly threads: number | null;
    readonly startedAt: number | null;
}
export interface HappyAgentSystemMonitorProcessRow {
    readonly process: HappyAgentSystemMonitorProcess;
    /** At most 60 samples, collected only while this Surface is open. */
    readonly cpuHistory: readonly (number | null)[];
}
export type HappyAgentSystemMonitorProcessColumn =
    | "pid"
    | "name"
    | "user"
    | "cpu"
    | "memory"
    | "state"
    | "threads";
export interface HappyAgentSystemMonitorProcessSort {
    readonly column: HappyAgentSystemMonitorProcessColumn;
    readonly direction: "ascending" | "descending";
}

/** Machine telemetry projected at the state boundary; no client wire types escape here. */
export interface HappyAgentSystemMonitorSample {
    readonly sampledAt: number;
    readonly intervalMs: number;
    readonly host: {
        readonly hostname: string;
        readonly platform: string;
        readonly arch: string;
        readonly osName: string;
        readonly uptimeSeconds: number;
    };
    readonly cpu: {
        readonly model: string;
        readonly logicalCores: number;
        readonly usagePercent: number | null;
        readonly perCoreUsagePercent: readonly number[] | null;
        readonly loadAverage: readonly [number, number, number] | null;
        readonly speedMhz: number | null;
        readonly temperatureCelsius: number | null;
    };
    readonly memory: {
        readonly totalBytes: number;
        readonly usedBytes: number;
        readonly availableBytes: number;
        readonly cachedBytes: number | null;
        readonly swapTotalBytes: number | null;
        readonly swapUsedBytes: number | null;
    };
    readonly gpus: readonly {
        readonly name: string;
        readonly vendor: string;
        readonly usagePercent: number | null;
        readonly memoryTotalBytes: number | null;
        readonly memoryUsedBytes: number | null;
        readonly temperatureCelsius: number | null;
        readonly powerWatts: number | null;
    }[];
    readonly disks: readonly {
        readonly mountPoint: string;
        readonly device: string;
        readonly fileSystem: string | null;
        readonly totalBytes: number;
        readonly usedBytes: number;
        readonly availableBytes: number;
    }[];
    readonly diskIo: {
        readonly readBytesPerSecond: number;
        readonly writeBytesPerSecond: number;
    } | null;
    readonly processes: {
        readonly total: number;
        readonly threads: number | null;
        readonly items: readonly HappyAgentSystemMonitorProcess[];
    } | null;
    readonly history: readonly {
        readonly sampledAt: number;
        readonly cpuPercent: number | null;
        readonly memoryUsedBytes: number;
        readonly gpuPercent: number | null;
        readonly diskReadBytesPerSecond: number | null;
        readonly diskWriteBytesPerSecond: number | null;
    }[];
}

export interface HappyAgentSystemMonitorSnapshot {
    readonly status: "loading" | "ready" | "reconnecting" | "missing" | "unsupported";
    /** Retained through outages so the last known values remain readable. */
    readonly sample: HappyAgentSystemMonitorSample | null;
    readonly error: string | null;
    readonly processFilter: string;
    readonly processSort: HappyAgentSystemMonitorProcessSort;
    readonly processRows: readonly HappyAgentSystemMonitorProcessRow[];
}
