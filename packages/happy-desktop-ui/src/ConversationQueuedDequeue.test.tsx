import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    happyAgentChatStoreCreate,
    type ChatElement,
    type ComposerSnapshot,
    type ConversationEntry,
    type HappyAgentSessionId,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { ConversationDock } from "./ConversationDock";
import { RetainedViews } from "./RetainedViews";
import { createRenderer } from "./testing";
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}
const catalog = {
    defaultModelId: "model",
    defaultProviderId: "provider",
    models: [],
    providers: [],
};
const composer: ComposerSnapshot = {
    scopeId: "queued",
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    submission: { status: "idle" },
    text: "",
};
const state: SessionState = {
    activity: { kind: "generating_message", label: "Working", since: 0 },
    status: "running",
    archived: false,
    sessionId: "a",
    ownerInstanceId: "instance",
    scope: { kind: "unsorted" },
    cwd: "",
    modelId: "model",
    providerId: "provider",
    titleStatus: "idle",
    permissionMode: "auto",
    modelLocked: false,
    modelCatalog: catalog,
    models: [],
    pendingUserInputs: [],
    answeredUserInputs: [],
    pendingSteeringMessages: [],
    slashCommands: [],
    tasks: [],
    subagents: [],
    subagentsRunning: false,
    backgroundProcesses: [],
    connection: "live",
    transcriptComplete: false,
    loadMoreToken: "older-page",
    loadingMore: false,
};
const base = (id: string, groupId = id) => ({
    id,
    groupId,
    runId: `run:${groupId}`,
    createdAt: 1_790_000_000_000,
});
it.each([0, 65, 400])(
    "models a multi-screen queued message after Stop and dequeue with %i history (seed32749)",
    async (count) => {
        const view = createRenderer();
        const chats = ["a", "b", "c"].map((id) => {
            let change!: (elements: readonly ChatElement[], state: SessionState) => void;
            const store = happyAgentChatStoreCreate(id as HappyAgentSessionId, {
                catalog,
                transcriptConnect: (options) => {
                    change = (elements, state) => options.onChange(elements, state, []);
                    return { close: () => undefined, loadMore: () => undefined };
                },
                connectActions: {} as never,
                connectMutationSubscribe: () => () => undefined,
            });
            const release = store.subscribe(() => undefined);
            store.reasoningToggle();
            const chat = {
                id,
                store,
                release,
                elements: Array.from(
                    { length: count },
                    (_, i): ChatElement => ({
                        ...base(`${id}:${i}`),
                        kind: "agent_text",
                        messageId: `${id}:${i}`,
                        complete: true,
                        text: `History ${id}:${i}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (i % 5))}`,
                    }),
                ),
                state: { ...state, sessionId: id },
                extras: [] as ConversationEntry[],
                publish() {
                    change(chat.elements, chat.state);
                },
            };
            return chat;
        });
        const listeners = new Set<() => void>();
        let shell = chats.map((chat) => ({ ...chat }));
        const redraw = () =>
            flushSync(() => {
                shell = chats.map((chat) => ({ ...chat }));
                for (const notify of listeners) notify();
            });
        function Chat({ chat }: { chat: (typeof chats)[number] }) {
            const snapshot = useSyncExternalStore(chat.store.subscribe, chat.store.get);
            return (
                <ConversationView
                    conversationId={chat.id}
                    agentAuthor={agentAuthor}
                    viewerId={happyAgentOwnerAuthor.id}
                    motion="calm"
                    running={chat.state.status === "running"}
                    entries={[...snapshot.entries, ...chat.extras]}
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerSend={() => undefined}
                            onComposerValueChange={() => undefined}
                        />
                    }
                />
            );
        }
        function Harness() {
            const current = useSyncExternalStore(
                (notify) => {
                    listeners.add(notify);
                    return () => {
                        listeners.delete(notify);
                    };
                },
                () => shell,
            );
            return (
                <div style={{ display: "flex", flexDirection: "column", height: 650, width: 820 }}>
                    <RetainedViews
                        activeId="a"
                        views={current.map((chat) => ({
                            id: chat.id,
                            content: <Chat chat={chat} />,
                        }))}
                    />
                </div>
            );
        }
        view.render(Harness, { height: 1550, width: 1550 });
        for (const chat of chats) chat.publish();
        try {
            await view.ready();
            await frames();
            const chat = chats[0]!;
            chat.elements = [
                ...chat.elements,
                {
                    ...base("reply", "running"),
                    kind: "agent_text",
                    messageId: "reply",
                    complete: false,
                    text: "The current turn is streaming. ".repeat(8),
                },
            ];
            chat.extras = Array.from(
                { length: 5 },
                (_, i): ConversationEntry => ({
                    kind: "message",
                    source: "local",
                    delivery: "pending_steering",
                    sentHere: false,
                    message: {
                        id: `queued:${i}`,
                        chatId: "a",
                        sequence: `queued:${i}`,
                        changePts: `queued:${i}`,
                        sender: happyAgentOwnerAuthor,
                        text:
                            i === 4
                                ? "A multi-screen queued message.\n".repeat(160)
                                : `Queued follow-up ${i}`,
                        attachments: [],
                        reactions: [],
                        createdAt: "2026-10-23T13:27:00.000Z",
                    },
                }),
            );
            chat.publish();
            redraw();
            await frames();
            chat.elements = [
                ...chat.elements.map((entry) =>
                    entry.kind === "agent_text" ? { ...entry, complete: true } : entry,
                ),
                {
                    ...base("stop", "running"),
                    kind: "group_end",
                    outcome: "stopped",
                    reason: "abort",
                    startedAt: 1_790_000_000_000,
                    endedAt: 1_790_000_001_000,
                    elapsedMs: 1000,
                    turnStartedAt: 1_790_000_000_000,
                    turnElapsedMs: 1000,
                    modelTurn: true,
                },
            ];
            chat.state = { ...chat.state, status: "idle" };
            chat.publish();
            redraw();
            await frames();
            chat.elements = [
                ...chat.elements,
                ...chat.extras.flatMap((entry): ChatElement[] =>
                    entry.kind === "message"
                        ? [
                              {
                                  ...base(entry.message.id, "dequeued"),
                                  kind: "user_message",
                                  messageId: entry.message.id,
                                  authority: "server",
                                  identity: null,
                                  delivery: "sent",
                                  text: entry.message.text,
                              },
                          ]
                        : [],
                ),
            ];
            chat.extras = [];
            chat.state = { ...chat.state, status: "running" };
            chat.publish();
            redraw();
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                '[data-view-id="a"] .happy-message-list__viewport',
            )!;
            const bounds = viewport.getBoundingClientRect();
            const rows = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ];
            for (const row of rows) {
                const rect = row.getBoundingClientRect();
                if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
                const next = rows.find(
                    (node) => Number(node.dataset.index) === Number(row.dataset.index) + 1,
                );
                if (!next) continue;
                const delta =
                    Number.parseFloat(next.style.transform.slice("translateY(".length)) -
                    Number.parseFloat(row.style.transform.slice("translateY(".length));
                expect(
                    Math.abs(delta - rect.height),
                    `row${row.dataset.index} model=${delta} paint=${rect.height}`,
                ).toBeLessThanOrEqual(1);
            }
        } finally {
            view.destroy();
            for (const chat of chats) {
                chat.release();
                chat.store[Symbol.dispose]();
            }
        }
    },
);
