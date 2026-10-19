import type {
    HappyAgentSystemMonitorSample,
    HappyAgentSystemMonitorSnapshot,
} from "happy-desktop-state";
import {
    HAPPY_AGENT_SYSTEM_MONITOR_PROCESS_SORT,
    happyAgentSystemMonitorProcessesFilter,
    happyAgentSystemMonitorProcessesSort,
    type HappyAgentSystemMonitorProcessSort,
    type HappyAgentSystemMonitorProcessColumn,
} from "happy-desktop-state";
import { useState } from "react";
import { HappyAgentSystemMonitorProcessesPanel } from "../../src/pages/surfaces/HappyAgentSystemMonitorProcessesPanel";
import { HappyAgentSurfaceHeader } from "../../src/pages/surfaces/HappyAgentSurfaceHeader";
import { ThemeScope } from "../../src/ThemeScope";
import { HappyAgentSystemMonitorSurfacePage } from "../../src/pages/surfaces/HappyAgentSystemMonitorSurfacePage";
import { HappyAgentSurfaceCreateDialog } from "../../src/pages/surfaces/HappyAgentSurfaceCreateDialog";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "P-022";
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const NOW = 1791974400000;
const sample: HappyAgentSystemMonitorSample = {
    sampledAt: NOW,
    intervalMs: 1000,
    host: {
        hostname: "studio-workstation",
        platform: "linux",
        arch: "x64",
        osName: "Ubuntu 24.04 LTS",
        uptimeSeconds: 802632,
    },
    cpu: {
        model: "AMD Ryzen 9 7950X",
        logicalCores: 32,
        usagePercent: 23.4,
        perCoreUsagePercent: Array.from({ length: 32 }, (_, index) => 8 + ((index * 17) % 63)),
        loadAverage: [2.4, 1.9, 1.7],
        speedMhz: 4500,
        temperatureCelsius: 52,
    },
    memory: {
        totalBytes: 64 * GB,
        usedBytes: 24.8 * GB,
        availableBytes: 39.2 * GB,
        cachedBytes: 12.6 * GB,
        swapTotalBytes: 8 * GB,
        swapUsedBytes: 0,
    },
    gpus: [
        {
            name: "NVIDIA GeForce RTX 4090",
            vendor: "nvidia",
            usagePercent: 38.2,
            memoryTotalBytes: 24 * GB,
            memoryUsedBytes: 8.4 * GB,
            temperatureCelsius: 46,
            powerWatts: 118.5,
        },
    ],
    disks: [
        {
            mountPoint: "/",
            device: "/dev/nvme0n1p2",
            fileSystem: "ext4",
            totalBytes: 2 * 1024 * GB,
            usedBytes: 824 * GB,
            availableBytes: 1224 * GB,
        },
    ],
    diskIo: { readBytesPerSecond: 24.6 * MB, writeBytesPerSecond: 8.2 * MB },
    processes: {
        total: 248,
        threads: 1624,
        items: [
            {
                pid: 3102,
                parentPid: 1,
                name: "happy-agent",
                user: "steve",
                state: "running",
                cpuPercent: 23.4,
                memoryBytes: 1.8 * GB,
                threads: 38,
                startedAt: NOW - 86400000,
            },
            {
                pid: 2874,
                parentPid: 3102,
                name: "typescript",
                user: "steve",
                state: "running",
                cpuPercent: 12.8,
                memoryBytes: 7.4 * GB,
                threads: 24,
                startedAt: NOW - 3600000,
            },
            {
                pid: 4211,
                parentPid: 3102,
                name: "renderer",
                user: "steve",
                state: "sleeping",
                cpuPercent: 5.2,
                memoryBytes: 1.2 * GB,
                threads: 16,
                startedAt: NOW - 7200000,
            },
            {
                pid: 5190,
                parentPid: 3102,
                name: "node",
                user: "steve",
                state: "running",
                cpuPercent: 3.6,
                memoryBytes: 824 * MB,
                threads: 12,
                startedAt: NOW - 1800000,
            },
            {
                pid: 2267,
                parentPid: 1,
                name: "postgres",
                user: "postgres",
                state: "sleeping",
                cpuPercent: 1.4,
                memoryBytes: 2.3 * GB,
                threads: 8,
                startedAt: NOW - 86400000,
            },
            {
                pid: 1298,
                parentPid: 1,
                name: "Xwayland",
                user: "steve",
                state: "sleeping",
                cpuPercent: 0.8,
                memoryBytes: 320 * MB,
                threads: 4,
                startedAt: NOW - 86400000,
            },
            {
                pid: 6204,
                parentPid: 3102,
                name: "node",
                user: "steve",
                state: "sleeping",
                cpuPercent: 0.6,
                memoryBytes: 468 * MB,
                threads: 10,
                startedAt: NOW - 600000,
            },
            {
                pid: 1884,
                parentPid: 1,
                name: "pipewire",
                user: "steve",
                state: "sleeping",
                cpuPercent: 0.2,
                memoryBytes: 28 * MB,
                threads: 3,
                startedAt: NOW - 86400000,
            },
            {
                pid: 1,
                parentPid: 0,
                name: "systemd",
                user: "root",
                state: "sleeping",
                cpuPercent: 0.1,
                memoryBytes: 16 * MB,
                threads: 1,
                startedAt: NOW - 802632000,
            },
            {
                pid: 6402,
                parentPid: 3102,
                name: "git",
                user: "steve",
                state: "stopped",
                cpuPercent: 0,
                memoryBytes: 12 * MB,
                threads: 1,
                startedAt: NOW - 60000,
            },
            {
                pid: 6640,
                parentPid: 3102,
                name: "rg",
                user: "steve",
                state: "running",
                cpuPercent: null,
                memoryBytes: 8 * MB,
                threads: 2,
                startedAt: NOW - 2000,
            },
        ],
    },
    history: Array.from({ length: 120 }, (_, index) => ({
        sampledAt: NOW - (119 - index) * 1000,
        cpuPercent:
            23 +
            Math.sin(index * 0.18) * 7 +
            Math.sin(index * 0.71) * 4 +
            (index > 45 && index < 66 ? 32 : 0),
        memoryUsedBytes: (23.6 + index / 100 + Math.sin(index / 8) * 0.2) * GB,
        gpuPercent: 30 + Math.sin(index / 6) * 12 + Math.cos(index / 2) * 3,
        diskReadBytesPerSecond: (18 + Math.sin(index / 4) * 12) * MB,
        diskWriteBytesPerSecond: (6 + Math.cos(index / 7) * 4) * MB,
    })),
};
const surface = {
    name: "System Monitor",
    type: { kind: "system_monitor" as const },
    members: [{ key: "steve", name: "Steve" }],
};
const INITIAL = {
    processFilter: "",
    processSort: HAPPY_AGENT_SYSTEM_MONITOR_PROCESS_SORT,
    processRows: [],
};
const ready: HappyAgentSystemMonitorSnapshot = {
    ...INITIAL,
    status: "ready",
    sample,
    error: null,
    processRows: (sample.processes?.items ?? []).map((process) => ({
        process,
        cpuHistory: Array.from({ length: 40 }, (_, index) =>
            process.cpuPercent === null
                ? null
                : Math.max(
                      0,
                      process.cpuPercent +
                          Math.sin(index * 0.4 + process.pid) * process.cpuPercent * 0.4,
                  ),
        ),
    })),
};
const unavailable = {
    ...sample,
    gpus: [],
    cpu: { ...sample.cpu, temperatureCelsius: null, speedMhz: null, perCoreUsagePercent: null },
    diskIo: null,
    processes: null,
    history: sample.history.map((point) => ({
        ...point,
        gpuPercent: null,
        diskReadBytesPerSecond: null,
        diskWriteBytesPerSecond: null,
    })),
};

/** Interactive fixture props; no daemon, application router, or transport is bootstrapped. */
function MonitorFixture(props: {
    monitor: HappyAgentSystemMonitorSnapshot;
    processesOnly?: boolean;
}) {
    const [filter, setFilter] = useState(props.monitor.processFilter);
    const [sort, setSort] = useState<HappyAgentSystemMonitorProcessSort>(props.monitor.processSort);
    const monitor = {
        ...props.monitor,
        processFilter: filter,
        processSort: sort,
        processRows: happyAgentSystemMonitorProcessesFilter(
            happyAgentSystemMonitorProcessesSort(props.monitor.processRows, sort),
            filter,
        ),
    };
    const onSort = (column: HappyAgentSystemMonitorProcessColumn) =>
        setSort((current) => ({
            column,
            direction:
                current.column === column
                    ? current.direction === "ascending"
                        ? "descending"
                        : "ascending"
                    : column === "cpu" || column === "memory" || column === "threads"
                      ? "descending"
                      : "ascending",
        }));
    return props.processesOnly ? (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
                minWidth: 0,
                background: "var(--groupped-background)",
            }}
        >
            <HappyAgentSurfaceHeader surface={surface} />
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    padding: "24px",
                    minHeight: 0,
                    flex: 1,
                }}
            >
                <HappyAgentSystemMonitorProcessesPanel
                    monitor={monitor}
                    onProcessFilterChange={setFilter}
                    onProcessSortChange={onSort}
                />
            </div>
        </div>
    ) : (
        <HappyAgentSystemMonitorSurfacePage
            surface={surface}
            monitor={monitor}
            onProcessFilterChange={setFilter}
            onProcessSortChange={onSort}
        />
    );
}

export function SystemMonitorPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            title="System Monitor"
            summary="Live machine telemetry, resource history, per-core activity, and storage capacity. Fixtures cover both appearances, the minimum desktop window, initial loading, unavailable hardware, and reconnecting."
        >
            {(["light", "dark"] as const).flatMap((theme) =>
                [
                    { width: 1100, height: 760 },
                    { width: 720, height: 640 },
                ].map((size) => (
                    <FullScreenSpecimen
                        key={`${theme}-${size.width}`}
                        label={`${theme}, ${size.width} × ${size.height}`}
                        number={theme === "light" ? "01" : "02"}
                        screen={`${theme}-${size.width}x${size.height}`}
                        window={size}
                        detail="Deterministic telemetry fixture; the shipped Surface page."
                    >
                        <ThemeScope mode={theme}>
                            <MonitorFixture monitor={ready} />
                        </ThemeScope>
                    </FullScreenSpecimen>
                )),
            )}
            {(
                [
                    {
                        label: "Loading",
                        monitor: { ...INITIAL, status: "loading", sample: null, error: null },
                    },
                    { label: "Unavailable metrics", monitor: { ...ready, sample: unavailable } },
                    {
                        label: "Reconnecting",
                        monitor: {
                            ...ready,
                            status: "reconnecting",
                            error: "The machine could not be reached. Connection retries automatically.",
                        },
                    },
                    {
                        label: "Missing",
                        monitor: { ...INITIAL, status: "missing", sample: null, error: null },
                    },
                    {
                        label: "Unsupported",
                        monitor: { ...INITIAL, status: "unsupported", sample: null, error: null },
                    },
                ] satisfies { label: string; monitor: HappyAgentSystemMonitorSnapshot }[]
            ).map(({ label, monitor }) => (
                <FullScreenSpecimen
                    key={label}
                    label={label}
                    number="03"
                    screen={`${label.toLowerCase().replaceAll(" ", "-")}-1100x760`}
                    window={{ width: 1100, height: 760 }}
                    detail={label}
                >
                    <MonitorFixture monitor={monitor} />
                </FullScreenSpecimen>
            ))}
            {(["light", "dark"] as const).flatMap((theme) =>
                [
                    { width: 1100, height: 760 },
                    { width: 720, height: 640 },
                ].map((size) => (
                    <FullScreenSpecimen
                        key={`processes-${theme}-${size.width}`}
                        label={`Processes, ${theme}`}
                        number="04"
                        detail="CPU order, bounded per-PID histories, and live inline meters."
                        screen={`processes-${theme}-${size.width}x${size.height}`}
                        window={size}
                    >
                        <ThemeScope mode={theme}>
                            <MonitorFixture monitor={ready} processesOnly />
                        </ThemeScope>
                    </FullScreenSpecimen>
                )),
            )}
            {(
                [
                    {
                        label: "Sorted by memory",
                        monitor: {
                            ...ready,
                            processSort: { column: "memory", direction: "descending" },
                        },
                    },
                    { label: "Filtered", monitor: { ...ready, processFilter: "node" } },
                    {
                        label: "Empty filter",
                        monitor: { ...ready, processFilter: "no-such-process" },
                    },
                    {
                        label: "Processes unavailable",
                        monitor: {
                            ...ready,
                            sample: { ...sample, processes: null },
                            processRows: [],
                        },
                    },
                ] satisfies { label: string; monitor: HappyAgentSystemMonitorSnapshot }[]
            ).map(({ label, monitor }) => (
                <FullScreenSpecimen
                    key={label}
                    label={label}
                    number="05"
                    detail={label}
                    screen={`${label.toLowerCase().replaceAll(" ", "-")}-1100x760`}
                    window={{ width: 1100, height: 760 }}
                >
                    <MonitorFixture monitor={monitor} processesOnly />
                </FullScreenSpecimen>
            ))}
            <FullScreenSpecimen
                label="Create"
                number="04"
                screen="create-720x640"
                detail="System Monitor starts with its default name."
            >
                <div
                    style={{
                        width: "100%",
                        height: "100%",
                        position: "relative",
                        transform: "translateZ(0)",
                    }}
                >
                    <HappyAgentSurfaceCreateDialog
                        kind="system_monitor"
                        onClose={() => undefined}
                        onSubmit={() => undefined}
                    />
                </div>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
