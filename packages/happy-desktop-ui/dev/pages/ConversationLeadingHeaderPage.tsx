import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
    type ConversationMessageEntry,
} from "happy-desktop-state";
import { Button } from "../../src/Button";
import { clayIconMarkLarge } from "../../src/clayIcons";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { makeStuffIntroHeader, type MakeStuffOption } from "../../src/MakeStuffView";
import type { ImageMark } from "../../src/StemCellGrowth";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-309";

const noop = () => undefined;
const frame = { width: 856, height: 720 } as const;
/* Tall enough for the first message and the status line under the resting
   intro; in a shorter scrollport the transcript lifts by what does not fit. */
const liveFrame = { width: 1024, height: 900 } as const;
const spaceId = "window-navigation";
const options: readonly MakeStuffOption[] = [
    { id: "todos", icon: "tasks", label: "New todo list" },
    { id: "document", icon: "doc", label: "New document" },
    { id: "calendar", icon: "calendar", label: "New calendar" },
    { id: "bot", icon: "agents", label: "New bot" },
];
const icon: ImageMark = { ...clayIconMarkLarge("crash"), growsFromStemCell: true };
const draft = "Plan a long weekend in Lisbon for the four of us.";

function message(
    id: string,
    author: "you" | "agent",
    text: string,
    delivery: ConversationMessageEntry["delivery"] = "sent",
): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery,
        ...(author === "you" ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "leading-header",
            sequence: id,
            changePts: id,
            sender: author === "you" ? happyAgentOwnerAuthor : agentAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-24T09:41:00.000Z",
        },
    };
}

const first = message("1", "you", draft);
const history: readonly ConversationEntry[] = [
    first,
    message(
        "2",
        "agent",
        "Here's a first pass: Alfama and the castle on Friday, Sintra on Saturday, and the coast at Cascais on Sunday before the evening flight.",
    ),
    message("3", "you", "Swap Sintra and Cascais — the forecast is better on Sunday."),
    message("4", "agent", "Done. Sintra moves to Sunday, and Saturday is the coast."),
];
const longHistory: readonly ConversationEntry[] = Array.from({ length: 12 }, (_, round) =>
    history.map((entry) =>
        entry.kind === "message"
            ? {
                  ...entry,
                  message: {
                      ...entry.message,
                      id: `${String(round)}-${entry.message.id}`,
                      sequence: `${String(round)}-${entry.message.sequence}`,
                  },
              }
            : entry,
    ),
).flat();

function composer(text: string): ComposerSnapshot {
    return {
        agentUserIds: [],
        attachments: [],
        capabilities: { commands: [], mentions: false, shellMode: false },
        focused: false,
        mentionCandidates: [],
        revision: 0,
        scopeId: "conversation-leading-header",
        submission: { status: "idle" },
        text,
    };
}

function conversation(props: {
    id: string;
    entries: readonly ConversationEntry[];
    imageMark?: ImageMark;
    running?: boolean;
    softwareRendering?: boolean;
    text?: string;
}) {
    return (
        <ConversationView
            activityTreatment="focused"
            agentAuthor={agentAuthor}
            conversationId={props.id}
            dock={
                <ConversationDock
                    composer={composer(props.text ?? "")}
                    composerPlaceholder="Message Happy…"
                    onAbort={noop}
                    onComposerSend={noop}
                    onComposerValueChange={noop}
                    running={props.running ?? false}
                />
            }
            elapsedMs={0}
            entries={props.entries}
            leadingHeader={makeStuffIntroHeader({
                id: spaceId,
                ...(props.imageMark ? { imageMark: props.imageMark } : {}),
                settled: props.entries.length > 0,
                options,
                onOptionSelect: noop,
                ...(props.softwareRendering ? { softwareRendering: true } : {}),
            })}
            motion="calm-typed"
            running={props.running ?? false}
            style={{ flex: "1 1 auto", minWidth: 0 }}
            viewerId={happyAgentOwnerAuthor.id}
            workingPhase="thinking"
        />
    );
}

type Stage = "empty" | "sent" | "grown";

/** One conversation taken from its first message to its icon, a step per click. */
function LiveConversation() {
    const [stage, setStage] = useState<Stage>("empty");
    const [software, setSoftware] = useState(false);
    return (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%" }}>
            <div
                style={{
                    display: "flex",
                    flex: "none",
                    gap: 8,
                    padding: 8,
                    background: "var(--surface)",
                }}
            >
                <Button disabled={stage !== "empty"} onClick={() => setStage("sent")} size="small">
                    Send
                </Button>
                <Button disabled={stage !== "sent"} onClick={() => setStage("grown")} size="small">
                    Icon arrives
                </Button>
                <Button onClick={() => setSoftware(!software)} size="small" variant="secondary">
                    {software ? "Hardware only" : "Allow software"}
                </Button>
                <Button onClick={() => setStage("empty")} size="small" variant="secondary">
                    Reset
                </Button>
            </div>
            <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0 }}>
                {conversation({
                    id: "live",
                    entries: stage === "empty" ? [] : [message("1", "you", draft, "sending")],
                    ...(stage === "grown" ? { imageMark: icon } : {}),
                    running: stage !== "empty",
                    softwareRendering: software,
                    text: stage === "empty" ? draft : "",
                })}
            </div>
        </div>
    );
}

export function ConversationLeadingHeaderPage() {
    const screens = [
        {
            id: "empty",
            label: "New work · before its first message",
            detail: "The intro is the transcript's only row, resting where the empty state centres it",
            view: conversation({ id: "empty", entries: [], text: draft }),
        },
        {
            id: "sent",
            label: "First message sent",
            detail: "Same block, same place: the line and options hide but keep their height, and the message lands under them",
            view: conversation({
                id: "sent",
                entries: [message("1", "you", draft, "sending")],
                running: true,
            }),
        },
        {
            id: "reopened",
            label: "Reopened · icon, no growth",
            detail: "A chat that already has its icon opens with it at the top, the hidden area keeping the spacing",
            view: conversation({ id: "reopened", entries: history.slice(0, 2), imageMark: icon }),
        },
        {
            id: "long",
            label: "Long history",
            detail: "The header is the first row of a virtualized transcript; the reader opens at the newest message",
            view: conversation({ id: "long", entries: longHistory, imageMark: icon }),
        },
    ];
    return (
        <ComponentPage
            number={componentNumber}
            summary="A conversation's leading header: MessageList's first row, with a reserved key and a height computed from its data, here new work's intro. While the transcript fits, the header rests where the empty state centres it and rows fill in below; past that it scrolls with the transcript. The intro's mark grows from stem cell to icon in place."
            title="Conversation leading header"
        >
            {screens.map((screen, index) => {
                const number = String(index + 1).padStart(2, "0");
                return (
                    <FullScreenSpecimen
                        detail={screen.detail}
                        key={screen.id}
                        label={screen.label}
                        number={number}
                        screen={`${number}-${screen.id}-${String(frame.width)}x${String(frame.height)}`}
                        window={frame}
                    >
                        <ThemeScope mode="light">
                            <div style={{ display: "flex", width: "100%", height: "100%" }}>
                                {screen.view}
                            </div>
                        </ThemeScope>
                    </FullScreenSpecimen>
                );
            })}
            <FullScreenSpecimen
                detail="Send, then Icon arrives: the mark grows into the icon where it stands. A software renderer shows the icon at once unless allowed. In a scrollport too short for the first message and the status line under the resting intro, the transcript lifts by exactly what does not fit"
                label="Live · first message to icon"
                number="05"
                screen={`05-live-${String(liveFrame.width)}x${String(liveFrame.height)}`}
                window={liveFrame}
            >
                <ThemeScope mode="light">
                    <LiveConversation />
                </ThemeScope>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
