import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { ConversationDock } from "./ConversationDock";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const composer: ComposerSnapshot = {
    scopeId: "steering-spacing",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
function message(
    id: string,
    text: string,
    own: boolean,
    delivery: "sent" | "pending_steering" = "sent",
): ConversationEntry {
    return {
        kind: "message",
        source: own ? "local" : "server",
        delivery,
        ...(own ? { sentHere: true } : {}),
        message: {
            id,
            chatId: "steering-spacing",
            sequence: id,
            changePts: id,
            sender: own ? happyAgentOwnerAuthor : agentAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}
const sent = ["send to a separate task tho", "just checking something, ignore this", "lol"];
const steering = ["yo", "still there?", "ok go"];
const replyWords =
    "Tracing the queue through the list model so every row keeps the place it was given while the rest of the turn streams in below it.".split(
        " ",
    );

/*
 * Several steering messages queued one after another while a turn streams,
 * then taken up by the next run. The queue is a run of the reader's own
 * bubbles, so it keeps their one rhythm from its first pair on, and nothing
 * the reader can see moves on its own: not as each message queues, not while
 * the reply streams above it, and not when the next run takes the queue.
 *
 * `own` is the report this came from: the reader's last messages sit right
 * above the live status, so the queue continues their run across it. `reply`
 * is the common case of steering a streaming answer.
 */
it.each(["reply", "own"] as const)(
    "keeps queued steering evenly spaced and still while it queues and is taken up: %s",
    async (tail) => {
        type State = { entries: readonly ConversationEntry[]; running: boolean };
        let change!: (update: (previous: State) => State) => void;
        function Harness() {
            const [state, setState] = useState<State>(() => ({
                entries: [
                    ...Array.from({ length: 6 }, (_, index) =>
                        message(
                            `history-${index}`,
                            `History ${index}. ${"A stable paragraph stays where the reader left it. ".repeat(3)}`,
                            index % 2 === 0,
                        ),
                    ),
                    ...sent.map((text, index) => message(`sent-${index}`, text, true)),
                    ...(tail === "reply" ? [message("reply", "Looking", false)] : []),
                ],
                running: true,
            }));
            change = (update) => flushSync(() => setState(update));
            return (
                <div style={{ height: 700, width: 880 }}>
                    <ConversationView
                        conversationId="steering-spacing"
                        agentAuthor={agentAuthor}
                        viewerId={happyAgentOwnerAuthor.id}
                        entries={state.entries}
                        running={state.running}
                        elapsedMs={4000}
                        motion="calm"
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerSend={() => undefined}
                                onComposerValueChange={() => undefined}
                            />
                        }
                    />
                </div>
            );
        }
        const view = createRenderer();
        view.render(Harness, { height: 900, width: 1000 });
        try {
            await view.ready();
            await frame();
            await frame();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            /* The reader's own bubbles on screen, by text, with their painted boxes. */
            const bubbles = () => {
                const bounds = viewport.getBoundingClientRect();
                const found = new Map<string, DOMRect>();
                for (const body of viewport.querySelectorAll<HTMLElement>(
                    ".happy-message[data-own] .happy-message__body",
                )) {
                    const rect = body.getBoundingClientRect();
                    if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
                    found.set(body.textContent ?? "", rect);
                }
                return found;
            };
            const gap = (boxes: Map<string, DOMRect>, above: string, below: string) => {
                expect(boxes.has(above) && boxes.has(below), `${above} / ${below}`).toBe(true);
                return boxes.get(below)!.top - boxes.get(above)!.bottom;
            };
            /* What a follower may see between two commits: everything carried by
               one distance, never two bubbles moving apart or changing size. */
            const heldTogether = (before: Map<string, DOMRect>, after: Map<string, DOMRect>) => {
                const shared = [...before.keys()].filter((text) => after.has(text));
                expect(shared.length).toBeGreaterThan(0);
                const shift = after.get(shared[0]!)!.top - before.get(shared[0]!)!.top;
                for (const text of shared) {
                    expect(
                        Math.abs(after.get(text)!.top - before.get(text)!.top - shift),
                        `"${text}" moved against the rest of the transcript`,
                    ).toBeLessThanOrEqual(0.5);
                    expect(
                        Math.abs(after.get(text)!.height - before.get(text)!.height),
                    ).toBeLessThanOrEqual(0.5);
                }
            };
            const streamed = (words: number) =>
                change((state) => ({
                    ...state,
                    entries: state.entries.map((entry) =>
                        entry.kind === "message" && entry.message.id === "reply"
                            ? {
                                  ...entry,
                                  message: {
                                      ...entry.message,
                                      text: replyWords.slice(0, words).join(" "),
                                  },
                              }
                            : entry,
                    ),
                }));
            /* The rhythm of the reader's own run as the transcript draws it. */
            const run = bubbles();
            const rhythm = gap(run, sent[1]!, sent[2]!);
            expect(gap(run, sent[0]!, sent[1]!)).toBeCloseTo(rhythm, 1);
            let words = 1;
            for (const [index, text] of steering.entries()) {
                if (tail === "reply") {
                    words += 4;
                    streamed(words);
                    await frame();
                }
                const before = bubbles();
                change((state) => ({
                    ...state,
                    entries: [
                        ...state.entries,
                        message(`queued-${index}`, text, true, "pending_steering"),
                    ],
                }));
                heldTogether(before, bubbles());
                await frame();
                heldTogether(before, bubbles());
                await frame();
            }
            const queued = bubbles();
            expect(gap(queued, steering[0]!, steering[1]!)).toBeCloseTo(rhythm, 1);
            expect(gap(queued, steering[1]!, steering[2]!)).toBeCloseTo(rhythm, 1);
            /* The run ends steered and the next one takes the queue, in one
               snapshot, as the Happy Agent projection publishes it. */
            change((state) => ({
                running: true,
                entries: [
                    ...state.entries.filter(
                        (entry) =>
                            entry.kind !== "message" || entry.delivery !== "pending_steering",
                    ),
                    {
                        kind: "turnStatus",
                        id: "steered",
                        sequence: "steered",
                        status: "steered",
                        reason: "steering",
                        durationMs: 4000,
                    },
                    ...state.entries.flatMap((entry): ConversationEntry[] =>
                        entry.kind === "message" && entry.delivery === "pending_steering"
                            ? [{ ...entry, delivery: "sent" }]
                            : [],
                    ),
                ],
            }));
            for (let index = 0; index < 4; index += 1) {
                const now = bubbles();
                for (const [text, rect] of queued) {
                    expect(now.has(text), `"${text}" left the screen`).toBe(true);
                    expect(
                        Math.abs(now.get(text)!.top - rect.top),
                        `"${text}" moved when the queue was taken up`,
                    ).toBeLessThanOrEqual(0.5);
                }
                await frame();
            }
        } finally {
            view.destroy();
        }
    },
);
