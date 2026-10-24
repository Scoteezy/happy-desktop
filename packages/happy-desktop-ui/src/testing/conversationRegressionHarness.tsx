import { useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { cdp, server } from "vitest/browser";
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
import "../styles.css";
import { ConversationView } from "../ConversationView";
import { ConversationDock } from "../ConversationDock";
import { createRenderer, pageViewport } from "./index";

export const regressionFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
export async function regressionFrames() {
    await regressionFrame();
    await regressionFrame();
}
export const regressionBase = (id: string, groupId = id) => ({
    id,
    groupId,
    runId: `run:${groupId}`,
    createdAt: 1_790_000_000_000,
});
export function regressionAnswer(
    id: string,
    text: string,
    complete = true,
    groupId = id,
): ChatElement {
    return { ...regressionBase(id, groupId), kind: "agent_text", messageId: id, text, complete };
}
export function regressionOwn(
    id: string,
    delivery: "sending" | "pending_steering" | "sent" | "failed",
    text = `Sent ${id}`,
): ConversationEntry {
    return {
        kind: "message",
        source: delivery === "sent" ? "server" : "local",
        delivery,
        sentHere: true,
        message: {
            id,
            chatId: "regression",
            sequence: id,
            changePts: id,
            sender: happyAgentOwnerAuthor,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-23T13:27:00.000Z",
        },
    };
}

/** Real transport/store boundary for focused transcript regressions. */
export function conversationRegressionHarness(id: string, historyCount: number) {
    const catalog = {
        defaultModelId: "model",
        defaultProviderId: "provider",
        models: [],
        providers: [],
    };
    const composer: ComposerSnapshot = {
        scopeId: id,
        agentUserIds: [],
        attachments: [],
        capabilities: { commands: [], mentions: false, shellMode: false },
        focused: false,
        mentionCandidates: [],
        revision: 0,
        submission: { status: "idle" },
        text: "",
    };
    const view = createRenderer();
    const initialDpr = devicePixelRatio;
    let height = 650,
        width = 820,
        zoom = 1;
    let redraw: () => void = () => undefined;
    let transport!: (elements: readonly ChatElement[], state: SessionState) => void;
    const store = happyAgentChatStoreCreate(id as HappyAgentSessionId, {
        catalog,
        transcriptConnect: (options) => {
            transport = (elements, state) => options.onChange(elements, state, []);
            return { close: () => undefined, loadMore: () => undefined };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });
    const release = store.subscribe(() => undefined);
    store.reasoningToggle();
    const h = {
        view,
        store,
        elements: Array.from({ length: historyCount }, (_, i) =>
            regressionAnswer(
                `${id}:${i}`,
                `History ${id}:${i}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (i % 5))}`,
            ),
        ),
        extras: [] as ConversationEntry[],
        group: "running",
        state: {
            activity: { kind: "generating_message", label: "Working", since: 0 },
            status: "running",
            archived: false,
            sessionId: id,
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
            backgroundProcesses: [],
            connection: "live",
            transcriptComplete: false,
            loadMoreToken: "older-page",
            loadingMore: false,
        } as SessionState,
        publish() {
            transport(h.elements, h.state);
            redraw();
        },
        viewport() {
            return view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
        },
        async ready() {
            await view.ready();
            await regressionFrames();
        },
        async resize(nextHeight: number, nextWidth: number, nextZoom = 1) {
            if (server.browser === "chromium" && nextZoom !== zoom)
                await cdp().send("Emulation.setDeviceMetricsOverride", {
                    ...pageViewport(),
                    deviceScaleFactor: initialDpr * nextZoom,
                    mobile: false,
                });
            height = nextHeight;
            width = nextWidth;
            zoom = nextZoom;
            redraw();
            await regressionFrames();
        },
        wheel(delta: number) {
            const viewport = h.viewport();
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, cancelable: true }));
            viewport.scrollTop += delta;
        },
        stop() {
            h.elements = [
                ...h.elements.map((entry) =>
                    entry.kind === "agent_text" ? { ...entry, complete: true } : entry,
                ),
                {
                    ...regressionBase(`stop:${h.elements.length}`, h.group),
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
            h.state = { ...h.state, status: "idle" };
            h.publish();
        },
        queue(count: number) {
            h.elements = [
                ...h.elements,
                regressionAnswer(
                    `reply:${h.elements.length}`,
                    "The current turn is streaming. ".repeat(8),
                    false,
                    h.group,
                ),
            ];
            const queued = Array.from({ length: count }, (_, i) => {
                const entry = regressionOwn(
                    `queued:${i}`,
                    "pending_steering",
                    `Queued follow-up ${i}`,
                );
                return { ...entry, sentHere: false };
            });
            h.extras = [...h.extras, ...queued];
            h.state = {
                ...h.state,
                status: "running",
                pendingSteeringMessages: queued.flatMap((entry) =>
                    entry.kind === "message"
                        ? [
                              {
                                  message: {
                                      id: entry.message.id,
                                      blocks: [{ type: "text" as const, text: entry.message.text }],
                                  },
                              },
                          ]
                        : [],
                ),
            };
            h.publish();
        },
        accept() {
            const queued = h.extras.filter(
                (entry) => entry.kind === "message" && entry.delivery === "pending_steering",
            );
            if (queued.length === 0) return;
            h.elements = [
                ...h.elements,
                ...queued.flatMap((entry): ChatElement[] =>
                    entry.kind === "message"
                        ? [
                              {
                                  ...regressionBase(entry.message.id, "dequeued"),
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
            h.extras = h.extras.filter((entry) => !queued.includes(entry));
            h.state = { ...h.state, status: "running", pendingSteeringMessages: [] };
            h.publish();
        },
        async close() {
            view.destroy();
            release();
            store[Symbol.dispose]();
            if (server.browser === "chromium" && zoom !== 1)
                await cdp().send("Emulation.setDeviceMetricsOverride", {
                    ...pageViewport(),
                    deviceScaleFactor: initialDpr,
                    mobile: false,
                });
        },
    };
    function Harness() {
        const snapshot = useSyncExternalStore(store.subscribe, store.get);
        const [, setVersion] = useState(0);
        redraw = () => flushSync(() => setVersion((value) => value + 1));
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    height: height / zoom,
                    width: width / zoom,
                }}
            >
                <ConversationView
                    conversationId={id}
                    agentAuthor={agentAuthor}
                    viewerId={happyAgentOwnerAuthor.id}
                    entries={[...snapshot.entries, ...h.extras]}
                    expandedTurnIds={snapshot.expandedTurnIds}
                    onTraceToggle={store.turnTraceToggle}
                    motion="calm"
                    running={h.state.status === "running"}
                    dock={
                        <ConversationDock
                            composer={composer}
                            running={h.state.status === "running"}
                            onAbort={() => h.stop()}
                            onComposerSend={() => undefined}
                            onComposerValueChange={() => undefined}
                        />
                    }
                />
            </div>
        );
    }
    view.render(Harness, { width: 1550, height: 1550 });
    h.publish();
    return h;
}
