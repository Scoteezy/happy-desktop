import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
    type ConversationRequestQuestion,
    type ConversationToolCall,
} from "happy-desktop-state";
import type { AgentWorkingPhase } from "../../src/AgentWorkingStatus";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-024";

/*
 * One conversation played step by step: a message sent, a subagent started and
 * reporting back, a question with options answered in the dock, a follow-up,
 * and a question with no options answered from the input. Each step is the
 * props the app would hand the view at that moment, so the transcript's
 * geometry can be watched — and recorded — as the real surface draws it.
 */

const SEND_TEXT =
    'Two tests in this repo fail. First, use a subagent to investigate the code and report why. Then, before you change anything, ask me one multiple-choice question about how to handle escaped quotes ("" inside a quoted field). After I answer, fix src/parse.js and src/format.js, run npm test, and give me a three-line summary.';
const FOLLOW_UP_TEXT =
    "Now list the files in src with ls, then answer in two sentences what each one does.";
const FREE_FORM_ANSWER = "Call it tiny-csv-strict.";

function messageEntry(
    id: string,
    sender: ConversationAuthor,
    text: string,
    sending = false,
): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: sending ? "pending_steering" : "sent",
        ...(sending ? { pendingSend: true } : {}),
        ...(["u1", "u2"].includes(id) ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "chat-stability",
            sequence: id,
            changePts: id,
            sender,
            text,
            ...(sender.kind === "agent" ? { generationStatus: "complete" as const } : {}),
            attachments: [],
            reactions: [],
            createdAt: "2026-10-20T19:34:00.000Z",
        },
    };
}

function tool(
    id: string,
    toolName: string,
    args: Record<string, string>,
    status: ConversationToolCall["status"],
    extra: Partial<ConversationToolCall> = {},
): ConversationEntry {
    return {
        kind: "agentActivity",
        id,
        sequence: id,
        activity: {
            kind: "tool",
            tool: { toolCallId: id, toolName, arguments: args, status, failed: false, ...extra },
        },
    };
}

function edited(
    path: string,
    added: number,
    deleted: number,
): ConversationToolCall["presentation"] {
    return {
        type: "fileDiff",
        files: [{ path, kind: "update", added, deleted, omittedLines: 0, hunks: [] }],
        omittedFiles: 0,
    };
}

function turnStatus(id: string, durationMs: number): ConversationEntry {
    return { kind: "turnStatus", id, sequence: id, status: "complete", durationMs };
}

function subagentMessage(id: string, explanation: string, text: string): ConversationEntry {
    return {
        kind: "agentActivity",
        id,
        sequence: id,
        activity: {
            kind: "agentMessage",
            agentId: "subagent-investigate",
            agentName: "Investigate failing CSV tests",
            explanation,
            text,
        },
    };
}

function question(
    id: string,
    questions: readonly ConversationRequestQuestion[],
): ConversationEntry {
    return {
        kind: "request",
        id,
        sequence: id,
        request: { kind: "userInput", requestId: id, questions, status: "pending" },
    };
}

/** The same question once the daemon has recorded its answer; it keeps its place in history. */
function answeredQuestion(
    asked: ConversationEntry,
    answers: Readonly<Record<string, readonly string[]>>,
): ConversationEntry {
    if (asked.kind !== "request" || asked.request.kind !== "userInput") return asked;
    return {
        ...asked,
        request: {
            ...asked.request,
            status: "answered",
            answers,
        },
    };
}

const HISTORY: readonly ConversationEntry[] = [
    messageEntry("h1", happyAgentOwnerAuthor, "What does this repository do?"),
    messageEntry(
        "h2",
        agentAuthor,
        "It is a tiny CSV parser and formatter: `src/parse.js` turns CSV text into rows and `src/format.js` turns rows back into CSV text. There are three tests under `test/`.",
    ),
    turnStatus("h3", 4_000),
];

const ESCAPE_QUESTION = question("q-escape", [
    {
        id: "escaped-quotes",
        header: "Escaped quotes",
        question: 'How should the fix handle "" inside a quoted field?',
        multiSelect: false,
        required: true,
        options: [
            {
                label: "RFC 4180 (Recommended)",
                description: 'parse turns "" into one ", and format doubles every " it writes.',
            },
            {
                label: "Leave literal",
                description: "Keep both quote characters; fields with a quote do not round-trip.",
            },
            { label: "Reject as error", description: 'Throw when "" appears in a quoted field.' },
        ],
    },
]);

const NAME_QUESTION = question("q-name", [
    {
        id: "package-name",
        header: "Package name",
        question: "What should the published package be called?",
        multiSelect: false,
        required: true,
        options: [],
    },
]);

interface Step {
    readonly entries: readonly ConversationEntry[];
    readonly running: boolean;
    readonly phase?: AgentWorkingPhase;
    readonly delegated?: number;
    readonly draft?: string;
    /** How long this step stays before the next, when playing. */
    readonly hold: number;
}

const spawn = (status: ConversationToolCall["status"]) =>
    tool(
        "t-spawn",
        "spawn_agent",
        { task: "Investigate failing CSV tests" },
        status,
        status === "success"
            ? {
                  presentation: {
                      type: "agentSpawn",
                      model: { modelId: "sonnet-5-5", providerId: "anthropic", name: "Sonnet 5.5" },
                  },
              }
            : {},
    );

function steps(): readonly Step[] {
    const sent = [...HISTORY, messageEntry("u1", happyAgentOwnerAuthor, SEND_TEXT, true)];
    const confirmed = [...HISTORY, messageEntry("u1", happyAgentOwnerAuthor, SEND_TEXT)];
    const firstTurn = [
        ...confirmed,
        spawn("success"),
        messageEntry(
            "a1",
            agentAuthor,
            "I've started a subagent to find out why the two tests fail. It won't change any files.\n\nWhen its report comes back, I'll ask you the question about escaped quotes before touching `src/parse.js` or `src/format.js`.",
        ),
        turnStatus("s1", 11_000),
    ];
    const reported = [
        ...firstTurn,
        subagentMessage(
            "m1",
            "Finished: final answer",
            "parse.js splits on every comma without looking at quotes; format.js never quotes a field.",
        ),
    ];
    const answered = [
        ...reported,
        answeredQuestion(ESCAPE_QUESTION, { "escaped-quotes": ["RFC 4180 (Recommended)"] }),
        tool("t-edit-parse", "edit", { path: "src/parse.js" }, "success", {
            presentation: edited("src/parse.js", 36, 7),
        }),
        tool("t-edit-format", "edit", { path: "src/format.js" }, "success", {
            presentation: edited("src/format.js", 9, 4),
        }),
    ];
    const summarized = [
        ...answered,
        tool("t-test", "bash", { command: "npm test" }, "success", {
            presentation: {
                type: "execCommand",
                command: "npm test",
                output: "ℹ pass 3\nℹ fail 0\n",
            },
        }),
        messageEntry(
            "a2",
            agentAuthor,
            '- **Cause:** `parse.js` split on every comma and `format.js` never quoted anything.\n- **Fix (RFC 4180):** `parse` reads character by character and turns `""` into `"`; `format` quotes fields with commas, quotes or newlines.\n- **Result:** `npm test` passes 3 of 3.',
        ),
        turnStatus("s2", 14_000),
    ];
    const followUp = [
        ...summarized,
        messageEntry("u2", happyAgentOwnerAuthor, FOLLOW_UP_TEXT, true),
    ];
    const followUpConfirmed = [
        ...summarized,
        messageEntry("u2", happyAgentOwnerAuthor, FOLLOW_UP_TEXT),
    ];
    const listed = [
        ...followUpConfirmed,
        tool("t-ls", "bash", { command: "ls src" }, "success", {
            presentation: {
                type: "execCommand",
                command: "ls src",
                output: "format.js\nparse.js\n",
            },
        }),
    ];
    const described = [
        ...listed,
        messageEntry(
            "a3",
            agentAuthor,
            "`format.js` turns an array of rows into CSV text, quoting any field that contains a comma, quote or line break.\n\n`parse.js` reads CSV text back into rows, character by character, keeping quoted commas and newlines inside their field.",
        ),
    ];
    return [
        { entries: HISTORY, running: false, hold: 1200 },
        { entries: sent, running: false, hold: 60 },
        { entries: confirmed, running: true, phase: "waiting", hold: 900 },
        {
            entries: [...confirmed, spawn("running")],
            running: true,
            phase: "callingTools",
            hold: 900,
        },
        { entries: firstTurn, running: false, delegated: 1, hold: 1600 },
        { entries: [...reported, ESCAPE_QUESTION], running: false, delegated: 1, hold: 1800 },
        { entries: answered, running: true, phase: "callingTools", hold: 900 },
        { entries: summarized, running: false, hold: 1600 },
        { entries: followUp, running: false, hold: 60 },
        { entries: followUpConfirmed, running: true, phase: "waiting", hold: 700 },
        { entries: listed, running: true, phase: "texting", hold: 900 },
        { entries: [...described, turnStatus("s3", 6_000)], running: false, hold: 1400 },
        {
            entries: [...described, turnStatus("s3", 6_000), NAME_QUESTION],
            running: false,
            hold: 1200,
        },
        {
            entries: [...described, turnStatus("s3", 6_000), NAME_QUESTION],
            running: false,
            draft: FREE_FORM_ANSWER,
            hold: 1000,
        },
        {
            entries: [
                ...described,
                turnStatus("s3", 6_000),
                answeredQuestion(NAME_QUESTION, { "package-name": [FREE_FORM_ANSWER] }),
            ],
            running: true,
            phase: "working",
            hold: 1400,
        },
    ];
}

const commands = [{ id: "usage", label: "/usage", description: "Token usage for the session." }];

function composer(text: string): ComposerSnapshot {
    return {
        scopeId: "chat-stability",
        text,
        attachments: [],
        revision: 0,
        submission: { status: "idle" },
        focused: false,
        capabilities: { shellMode: false, commands, mentions: true },
        mentionCandidates: [],
        agentUserIds: [],
    };
}

const noop = () => undefined;

function ChatStabilityPlayer() {
    const all = steps();
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const step = all[index]!;
    const play = () => {
        setPlaying(true);
        setIndex(0);
        let at = 0;
        const advance = () => {
            at += 1;
            if (at >= all.length) {
                setPlaying(false);
                return;
            }
            setIndex(at);
            window.setTimeout(advance, all[at]!.hold);
        };
        window.setTimeout(advance, all[0]!.hold);
    };
    return (
        <div
            data-playing={playing ? "" : undefined}
            data-step={index}
            data-testid="chat-stability-player"
            style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}
        >
            <div style={{ display: "flex", gap: 8, padding: 8, alignItems: "center" }}>
                <button data-testid="chat-stability-play" onClick={play} type="button">
                    Play
                </button>
                <button
                    onClick={() => setIndex((current) => Math.max(0, current - 1))}
                    type="button"
                >
                    Back
                </button>
                <button
                    onClick={() => setIndex((current) => Math.min(all.length - 1, current + 1))}
                    type="button"
                >
                    Next
                </button>
                <span>{`Step ${String(index + 1)} / ${String(all.length)}`}</span>
            </div>
            <div
                style={{
                    display: "flex",
                    flex: "1 1 auto",
                    minHeight: 0,
                    background: "var(--surface)",
                }}
            >
                <ConversationView
                    agentAuthor={agentAuthor}
                    conversationId="chat-stability"
                    delegatedAgents={step.delegated ?? 0}
                    dock={
                        <ConversationDock
                            composer={composer(step.draft ?? "")}
                            composerPlaceholder="Message Happy…"
                            onComposerSend={noop}
                            onComposerValueChange={noop}
                            running={step.running}
                        />
                    }
                    elapsedMs={step.running ? 3_000 : undefined}
                    entries={step.entries}
                    onRequestAnswer={noop}
                    running={step.running}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    viewerId={happyAgentOwnerAuthor.id}
                    {...(step.phase ? { workingPhase: step.phase } : {})}
                />
            </div>
        </div>
    );
}

export function ChatStabilityFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One conversation played step by step, to watch the transcript stay still as a reply arrives, a question is docked and answered, and a follow-up is sent."
            title="Chat stability flow"
        >
            <FullScreenSpecimen
                detail="Press Play, or step through the conversation."
                label="Conversation"
                number={`${componentNumber}.1`}
                screen="01-conversation-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <ChatStabilityPlayer />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
