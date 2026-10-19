export function systemMonitorBytes(value: number | null): string {
    if (value === null) return "—";
    if (value === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const index = Math.min(
        units.length - 1,
        Math.max(0, Math.floor(Math.log(value) / Math.log(1024))),
    );
    return `${(value / 1024 ** index).toLocaleString("en-US", { maximumFractionDigits: index === 0 ? 0 : 1 })} ${units[index]}`;
}
export const systemMonitorPercent = (value: number | null) =>
    value === null ? "—" : `${value.toFixed(1)}%`;
export const systemMonitorRatio = (used: number, total: number) =>
    total > 0 ? (used / total) * 100 : 0;
