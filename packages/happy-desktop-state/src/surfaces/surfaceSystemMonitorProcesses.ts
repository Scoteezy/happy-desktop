import type {
    HappyAgentSystemMonitorProcess,
    HappyAgentSystemMonitorProcessRow,
    HappyAgentSystemMonitorProcessSort,
} from "./surfaceSystemMonitorTypes.js";

export const HAPPY_AGENT_SYSTEM_MONITOR_PROCESS_SORT: HappyAgentSystemMonitorProcessSort = {
    column: "cpu",
    direction: "descending",
};

export function happyAgentSystemMonitorProcessesFilter(
    rows: readonly HappyAgentSystemMonitorProcessRow[],
    filter: string,
): readonly HappyAgentSystemMonitorProcessRow[] {
    const needle = filter.trim().toLowerCase();
    return needle
        ? rows.filter(({ process }) =>
              `${process.pid} ${process.name} ${process.user ?? ""} ${process.state ?? ""}`
                  .toLowerCase()
                  .includes(needle),
          )
        : rows;
}

/** Nulls remain last in both directions; PID breaks ties deterministically. */
export function happyAgentSystemMonitorProcessesSort(
    rows: readonly HappyAgentSystemMonitorProcessRow[],
    sort: HappyAgentSystemMonitorProcessSort,
): readonly HappyAgentSystemMonitorProcessRow[] {
    const direction = sort.direction === "ascending" ? 1 : -1;
    const field = (process: HappyAgentSystemMonitorProcess): number | string | null => {
        switch (sort.column) {
            case "pid":
                return process.pid;
            case "name":
                return process.name;
            case "user":
                return process.user;
            case "cpu":
                return process.cpuPercent;
            case "memory":
                return process.memoryBytes;
            case "state":
                return process.state;
            case "threads":
                return process.threads;
        }
    };
    return [...rows].sort((a, b) => {
        const left = field(a.process);
        const right = field(b.process);
        if (left === null || right === null)
            return left === right ? a.process.pid - b.process.pid : left === null ? 1 : -1;
        const difference =
            typeof left === "number" && typeof right === "number"
                ? left - right
                : String(left).localeCompare(String(right));
        return difference * direction || a.process.pid - b.process.pid;
    });
}
