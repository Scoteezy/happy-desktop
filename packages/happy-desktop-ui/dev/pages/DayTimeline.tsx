import { useState } from "react";
import { ThemeScope } from "../../src/ThemeScope";
import { PersonalDayShell } from "./PersonalDayShell";
import { dayFocus, type DayMoment, type DayPerson } from "./personalDayFixtures";

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
        kChange: "user: Desktop tail + Steve inline; scroll",
        steve: null,
        sChange: "09:20 reply clears wait; connector continues",
    },
    {
        time: "10:29",
        kirill: "K5",
        kChange: "user closes both; batch: viewer → Older",
        steve: "S4",
        sChange: "no change · docs focus since 10:27",
    },
] as const;

function TimelineSidebar({ frame }: { frame: DayMoment }) {
    const [selected, setSelected] = useState<string>(dayFocus(frame));
    return (
        <div
            data-timeline-moment={frame}
            style={{ display: "flex", width: 288, height: 804, flex: "none" }}
        >
            <div style={{ display: "flex", flex: "none", width: 8 }} />
            <div
                style={{
                    display: "flex",
                    width: 280,
                    flex: "none",
                    borderRight: "1px solid var(--divider)",
                    position: "relative",
                    contain: "layout paint",
                }}
            >
                <PersonalDayShell
                    sidebarOnly
                    frame={frame}
                    activeId={selected}
                    onSelect={setSelected}
                />
            </div>
        </div>
    );
}

/** Workbench annotations live above/beside the real, unmodified sidebar. */
export function DayTimeline({ person }: { person: DayPerson }) {
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
                        height: 48,
                        flex: "none",
                        padding: "8px 16px",
                        color: "var(--text-secondary)",
                        fontSize: 12,
                        lineHeight: "20px",
                    }}
                >
                    <strong style={{ color: "var(--text)", fontSize: 16 }}>
                        19 October · {person === "kirill" ? "Kirill" : "Steve"}
                    </strong>
                    <span>
                        Real work; staged focus, dependency and batches · 280 px / 32 px · UTC ·
                        reply at 09:20 in 12j
                    </span>
                </div>
                <div style={{ display: "flex", flex: "none" }}>
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
                                        height: 48,
                                        flex: "none",
                                        padding: "2px 12px",
                                        borderTop: "1px solid var(--divider)",
                                        color: "var(--text-secondary)",
                                        fontSize: 11,
                                        lineHeight: "16px",
                                    }}
                                >
                                    <strong style={{ fontSize: 14, color: "var(--text)" }}>
                                        {person === "kirill" ? "Kirill" : "Steve"} · {point.time}{" "}
                                        {frame ? `· ${frame}` : ""}
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
                                            height: 804,
                                            background: "var(--surface)",
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </ThemeScope>
    );
}
