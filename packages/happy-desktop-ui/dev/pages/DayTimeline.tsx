import { useState } from "react";
import { ThemeScope } from "../../src/ThemeScope";
import { PersonalDaySidebar } from "./PersonalDaySidebar";
import { dayFocus, dayPerson, type DayMoment } from "./personalDayFixtures";

const checkpoints = [
    {
        time: "06:10",
        kirill: "K1",
        kChange: "batch: group personal work",
        steve: "S1",
        sChange: "batch: native first · since 03:44",
    },
    {
        time: "08:27",
        kirill: "K2",
        kChange: "no change · focus resize probe",
        steve: "S2",
        sChange: "status in place · since 07:38",
    },
    {
        time: "09:18",
        kirill: "K3",
        kChange: "status in place · Steve needs you",
        steve: "S3",
        sChange: "status in place · waiting on Kirill",
    },
    {
        time: "10:05",
        kirill: "K4",
        kChange: "no change · tails opened by you",
        steve: null,
        sChange: "no change · S3 continues",
    },
    {
        time: "10:29",
        kirill: "K5",
        kChange: "batch: viewer release → Older",
        steve: "S4",
        sChange: "no change · docs focus since 10:27",
    },
] as const;

function TimelineSidebar({ frame }: { frame: DayMoment }) {
    const person = dayPerson(frame);
    const [space, setSpace] = useState(person);
    const [selected, setSelected] = useState<string>(dayFocus(frame));
    return (
        <div
            data-timeline-moment={frame}
            style={{ display: "flex", width: 288, height: 900, flex: "none" }}
            ref={(node) => {
                if (!node || frame !== "K5") return;
                const marker = node.querySelector<HTMLElement>("[data-move-tick]");
                const sidebar = node.querySelector<HTMLElement>("[data-day-space]");
                const update = () => {
                    const row = sidebar?.querySelector<HTMLElement>('[data-item-id="viewer"]');
                    if (!marker || !row) return;
                    marker.style.top = `${row.getBoundingClientRect().top - node.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 - 1}px`;
                };
                update();
                const observer = new ResizeObserver(update);
                const content = sidebar?.querySelector(".happy-sidebar__body-content");
                if (content) observer.observe(content);
                return () => observer.disconnect();
            }}
        >
            <div style={{ display: "flex", flex: "none", width: 8, position: "relative" }}>
                {frame === "K5" ? (
                    <span
                        data-move-tick
                        title="Preview viewer release moved from Release to Older"
                        style={{
                            display: "flex",
                            position: "absolute",
                            left: 1,
                            width: 5,
                            height: 2,
                            background: "var(--text-secondary)",
                            opacity: 0.6,
                        }}
                    />
                ) : null}
            </div>
            <div
                style={{
                    display: "flex",
                    width: 280,
                    flex: "none",
                    borderRight: "1px solid var(--divider)",
                }}
            >
                <PersonalDaySidebar
                    frame={frame}
                    activeId={selected}
                    space={space}
                    onSpaceChange={setSpace}
                    onSelect={setSelected}
                />
            </div>
        </div>
    );
}

/** Workbench annotations live above/beside the real, unmodified sidebar. */
export function DayTimeline() {
    return (
        <ThemeScope mode="light">
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    height: "100%",
                    background: "var(--surface)",
                    fontFamily: "var(--happy-font-ui)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: 4,
                        height: 72,
                        flex: "none",
                        padding: "8px 16px",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        lineHeight: "20px",
                    }}
                >
                    <strong style={{ color: "var(--text)", fontSize: 16 }}>
                        19 October · two personal sidebars
                    </strong>
                    <span>
                        Real work + file/artifact activity. Focus, completion, dependency and
                        batches are staged. 280 px sidebars · 32 px rows · UTC. The single gutter
                        tick marks the only move between columns.
                    </span>
                </div>
                {(["kirill", "steve"] as const).map((person) => (
                    <div key={person} style={{ display: "flex", flex: "none" }}>
                        {checkpoints.map((point) => {
                            const frame = person === "kirill" ? point.kirill : point.steve;
                            return (
                                <div
                                    key={point.time}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        flex: "none",
                                        width: 288,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            justifyContent: "center",
                                            gap: 4,
                                            height: 72,
                                            flex: "none",
                                            padding: "8px 12px",
                                            borderTop: "1px solid var(--divider)",
                                            color: "var(--text-secondary)",
                                            fontSize: 11,
                                            lineHeight: "16px",
                                        }}
                                    >
                                        <strong style={{ fontSize: 14, color: "var(--text)" }}>
                                            {person === "kirill" ? "Kirill" : "Steve"} ·{" "}
                                            {point.time} {frame ? `· ${frame}` : ""}
                                        </strong>
                                        <span>
                                            {person === "kirill" ? point.kChange : point.sChange}
                                        </span>
                                    </div>
                                    {frame ? (
                                        <TimelineSidebar frame={frame} />
                                    ) : (
                                        <div
                                            style={{
                                                display: "flex",
                                                height: 900,
                                                background: "var(--surface)",
                                            }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </ThemeScope>
    );
}
