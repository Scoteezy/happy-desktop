import type { CSSProperties } from "react";

/**
 * How a usage ring is coloured: quiet while there is room, a warning when
 * little is left, and red when almost nothing is or the account cannot be
 * used until the window starts over.
 */
export type UsageRingTone = "ample" | "low" | "critical";

/** Under this share left a ring turns to its warning colour. */
const LOW_BELOW = 25;
/** Under this share left, or while the account is blocked, a ring turns red. */
const CRITICAL_BELOW = 10;

/** The tone for a window with `left` percent remaining, as the native menu bar colours it. */
export function usageRingTone(left: number, blocked = false): UsageRingTone {
    if (blocked || left < CRITICAL_BELOW) return "critical";
    return left < LOW_BELOW ? "low" : "ample";
}

export type UsageRingProps = {
    /** The share of the window left, 0–100. Absent draws the empty track: nothing measured, not nothing left. */
    left?: number;
    tone?: UsageRingTone;
    /** Box size in CSS pixels. */
    size?: number;
    className?: string;
    style?: CSSProperties;
};

/** Ring stroke width in CSS pixels; the track and the arc share it. */
const RING_STROKE = 2;

/**
 * UsageRing — how much of a usage window is left, read like a battery: the
 * arc runs clockwise from twelve o'clock and drains as the window is spent.
 * It carries no text; the row it sits in sets the number beside it.
 */
export function UsageRing(props: UsageRingProps) {
    const size = props.size ?? 12;
    const left = props.left === undefined ? undefined : Math.min(100, Math.max(0, props.left));
    const radius = (size - RING_STROKE) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;
    return (
        <svg
            aria-hidden="true"
            className={["happy-usage-ring", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="usage-ring"
            data-left={left === undefined ? undefined : Math.round(left)}
            data-tone={props.tone ?? "ample"}
            height={size}
            style={props.style}
            viewBox={`0 0 ${size} ${size}`}
            width={size}
        >
            <circle
                className="happy-usage-ring__track"
                cx={center}
                cy={center}
                fill="none"
                r={radius}
                strokeWidth={RING_STROKE}
            />
            {left === undefined || left === 0 ? null : (
                <circle
                    className="happy-usage-ring__arc"
                    cx={center}
                    cy={center}
                    fill="none"
                    r={radius}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - left / 100)}
                    strokeLinecap={left < 100 ? "round" : "butt"}
                    strokeWidth={RING_STROKE}
                    transform={`rotate(-90 ${center} ${center})`}
                />
            )}
        </svg>
    );
}
