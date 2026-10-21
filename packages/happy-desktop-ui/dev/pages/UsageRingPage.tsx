import { UsageRing, usageRingTone } from "../../src/UsageRing";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-305";

const column = {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-start",
    gap: "12px",
};

const row = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontFamily: "var(--happy-font-ui)",
    fontSize: "12px",
    lineHeight: "16px",
    fontVariantNumeric: "tabular-nums",
    color: "var(--text-secondary)",
};

export function UsageRingPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="How much of a usage window is left, read like a battery: the arc runs clockwise from twelve o'clock and drains as the window is spent. Quiet while there is room, the warning colour under 25% left, red under 10% left or while the account is blocked."
            title="Usage ring"
        >
            <Specimen
                detail="12px box · 2px stroke · the number sits 4px before its ring"
                label="Across a window"
                number="01"
                stage="surface"
            >
                <div style={column}>
                    {[100, 64, 24, 9, 0].map((left) => (
                        <span key={left} style={row}>
                            {`${String(left)}%`}
                            <UsageRing left={left} tone={usageRingTone(left)} />
                        </span>
                    ))}
                </div>
            </Specimen>
            <Specimen
                detail="A blocked account is red whatever is left; an unread window is the bare track"
                label="Blocked and unknown"
                number="02"
                stage="surface"
            >
                <div style={column}>
                    <span style={row}>
                        59%
                        <UsageRing left={59} tone={usageRingTone(59, true)} />
                    </span>
                    <span style={row}>
                        <UsageRing />
                    </span>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
