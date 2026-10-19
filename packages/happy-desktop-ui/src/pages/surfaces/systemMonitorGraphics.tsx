import { DitherChart } from "../../dither/DitherChart";
import { DitherSparkline } from "../../dither/DitherSparkline";
import type { DitherColor } from "../../dither/ditherTypes";
import { systemMonitorPercent } from "./systemMonitorFormat";
const BLOCKS = ["·", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
export const systemMonitorLevel = (
    percent: number | null,
): "unavailable" | "calm" | "warm" | "hot" =>
    percent === null ? "unavailable" : percent >= 85 ? "hot" : percent >= 60 ? "warm" : "calm";

function monitorColor(value: number | null): DitherColor {
    const level = systemMonitorLevel(value);
    return level === "hot"
        ? "red"
        : level === "warm"
          ? "orange"
          : level === "unavailable"
            ? "grey"
            : "blue";
}

export function SystemMonitorHistoryChart(props: {
    points: readonly { sampledAt: number; value: number | null }[];
    maximum?: number;
    label: string;
    valueFormat?: (value: number | null) => string;
}) {
    const value = props.points.at(-1)?.value ?? null;
    const level = value === null ? null : (value / Math.max(1, props.maximum ?? 100)) * 100;
    return (
        <DitherChart
            label={props.label}
            maximum={props.maximum}
            className="system-monitor__history-chart"
            series={[
                {
                    id: "usage",
                    label: props.label,
                    color: monitorColor(level),
                    points: props.points.map((point) => ({
                        x: point.sampledAt,
                        value: point.value,
                    })),
                },
            ]}
            valueFormat={props.valueFormat ?? systemMonitorPercent}
            xFormat={(x) => new Date(x).toLocaleTimeString("en-US")}
        />
    );
}

export function SystemMonitorAsciiMeter(props: {
    value: number | null;
    label: string;
    compact?: boolean;
}) {
    const cells = props.compact ? 6 : 16;
    const value = props.value === null ? null : Math.max(0, Math.min(100, props.value));
    const filled = value === null ? 0 : Math.round((value / 100) * cells);
    return (
        <span
            className="system-monitor__ascii-meter"
            data-level={systemMonitorLevel(value)}
            aria-label={props.label}
            {...(value === null
                ? {}
                : {
                      role: "meter",
                      "aria-valuemin": 0,
                      "aria-valuemax": 100,
                      "aria-valuenow": Math.round(value),
                  })}
        >
            <span className="system-monitor__meter-track" aria-hidden="true">
                <span>[</span>
                <span>{"|".repeat(filled)}</span>
                <span className="system-monitor__ascii-muted">{"·".repeat(cells - filled)}</span>
                <span>]</span>
            </span>
            {props.compact ? null : (
                <span className="system-monitor__meter-value">
                    {value === null ? "—" : `${Math.round(value)}%`}
                </span>
            )}
        </span>
    );
}

export function SystemMonitorProcessSpark(props: {
    values: readonly (number | null)[];
    label: string;
}) {
    return (
        <DitherSparkline
            values={props.values}
            label={props.label}
            color={monitorColor(props.values.at(-1) ?? null)}
        />
    );
}

export function SystemMonitorAsciiCores(props: { values: readonly number[] | null }) {
    return (
        <div className="system-monitor__cores" aria-label="Usage per logical core">
            {props.values?.map((usage, index) => (
                <span
                    className="system-monitor__core"
                    data-level={systemMonitorLevel(usage)}
                    key={index}
                    title={`Core ${index + 1}: ${usage.toFixed(1)}%`}
                >
                    {BLOCKS[Math.max(0, Math.min(8, Math.ceil((usage / 100) * 8)))]}
                </span>
            ))}
        </div>
    );
}
