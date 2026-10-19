import { useState } from "react";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { WorkTranscript } from "../../src/WorkTranscript";
import { PersonalDayShell } from "./PersonalDayShell";
import { dayCoordination, dayPairingAnswer } from "./dayCoordination";
import { dayHappyImage } from "./personalDayFixtures";
import { redesignComposer } from "./windowRedesignFixtures";

/** A workbench comparison, not a proposed two-sidebar application layout. */
export function PersonalDayReply() {
    const [draft, setDraft] = useState("");
    return (
        <ThemeScope mode="light">
            <div
                data-day-reply-comparison
                style={{ display: "flex", height: "100%", width: "100%" }}
            >
                {(["kirill", "steve"] as const).map((person) => (
                    <div
                        key={person}
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            width: 288,
                            flex: "none",
                            borderRight: "8px solid var(--surface-secondary)",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                height: 40,
                                flex: "none",
                                alignItems: "center",
                                padding: "0 12px",
                                fontFamily: "var(--happy-font-ui)",
                                fontSize: 12,
                                color: "var(--text-secondary)",
                            }}
                        >
                            {person === "kirill"
                                ? "Kirill · Happy focused"
                                : "Steve · connector focused"}
                        </div>
                        <div
                            style={{
                                display: "flex",
                                flex: 1,
                                minHeight: 0,
                                position: "relative",
                                contain: "layout paint",
                            }}
                        >
                            <PersonalDayShell
                                sidebarOnly
                                frame={person === "kirill" ? "K3" : "S3"}
                                activeId={person === "kirill" ? "happy" : "connector"}
                                onSelect={() => undefined}
                                pairingResolved
                            />
                        </div>
                    </div>
                ))}
                <div style={{ display: "flex", flex: 1, minWidth: 0, flexDirection: "column" }}>
                    <div
                        style={{
                            display: "flex",
                            height: 40,
                            flex: "none",
                            alignItems: "center",
                            padding: "0 16px",
                            fontFamily: "var(--happy-font-ui)",
                            fontSize: 12,
                            color: "var(--text-secondary)",
                        }}
                    >
                        09:20 · reply updates the same summary; no row moves
                    </div>
                    <TabbedPane
                        tabs={[{ id: "happy", label: "Happy", imageMark: dayHappyImage }]}
                        activeId="happy"
                        onSelect={() => undefined}
                        tabSizing="content"
                        size="medium"
                    >
                        <WorkTranscript
                            rows={[
                                dayCoordination("kirill", true, () => undefined),
                                {
                                    id: "pairing-answer",
                                    kind: "message",
                                    author: "Kirill",
                                    own: true,
                                    text: dayPairingAnswer,
                                },
                            ]}
                            composer={{
                                composer: { ...redesignComposer, text: draft },
                                onComposerValueChange: setDraft,
                                onComposerSend: () => setDraft(""),
                                composerPlaceholder: "Message Happy…",
                                composerFocusOnType: false,
                            }}
                        />
                    </TabbedPane>
                </div>
            </div>
        </ThemeScope>
    );
}
