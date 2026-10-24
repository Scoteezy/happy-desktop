import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { cdp, server } from "vitest/browser";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    happyAgentChatStoreCreate,
    type ChatElement,
    type ComposerSnapshot,
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
    scopeId: "zoom",
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
    backgroundProcesses: [],
    connection: "live",
    transcriptComplete: false,
    loadMoreToken: "older-page",
    loadingMore: false,
};

it("updates retained long-history geometry in the first frames after zoom (seed 4093)", async () => {
    const initialDpr = devicePixelRatio;
    const view = createRenderer();
    const chats = ["a", "b", "c"].map((id) => {
        let publish!: () => void;
        const elements: ChatElement[] = Array.from({ length: 400 }, (_, index) => ({
            id: `${id}:${index}`,
            groupId: `${id}:${index}`,
            runId: `run:${id}:${index}`,
            createdAt: 1_790_000_000_000,
            kind: "agent_text",
            messageId: `${id}:${index}`,
            complete: true,
            text: `History ${id}:${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
        }));
        const store = happyAgentChatStoreCreate(id as HappyAgentSessionId, {
            catalog,
            transcriptConnect: (options) => {
                publish = () =>
                    flushSync(() => options.onChange(elements, { ...state, sessionId: id }, []));
                return { close: () => undefined, loadMore: () => undefined };
            },
            connectActions: {} as never,
            connectMutationSubscribe: () => () => undefined,
        });
        const release = store.subscribe(() => undefined);
        store.reasoningToggle();
        return { id, store, release, publish };
    });
    const listeners = new Set<() => void>();
    let geometry = { width: 820, height: 650, zoom: 1, chats: [...chats] };
    function Chat({ chat }: { chat: (typeof chats)[number] }) {
        const snapshot = useSyncExternalStore(chat.store.subscribe, chat.store.get);
        return (
            <ConversationView
                conversationId={chat.id}
                agentAuthor={agentAuthor}
                viewerId={happyAgentOwnerAuthor.id}
                motion="calm"
                running
                entries={[...snapshot.entries]}
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
            () => geometry,
        );
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    width:
                        server.browser === "chromium"
                            ? current.width / current.zoom
                            : current.width,
                    height:
                        server.browser === "chromium"
                            ? current.height / current.zoom
                            : current.height,
                    zoom: server.browser === "chromium" ? 1 : current.zoom,
                }}
            >
                <RetainedViews
                    activeId="a"
                    views={current.chats.map((chat) => ({
                        id: chat.id,
                        content: <Chat chat={chat} />,
                    }))}
                />
            </div>
        );
    }
    const metrics = (scale: number) =>
        cdp().send("Emulation.setDeviceMetricsOverride", {
            width: 1550,
            height: 1550,
            deviceScaleFactor: initialDpr * scale,
            mobile: false,
        });
    view.render(Harness, { width: 1550, height: 1550 });
    for (const chat of chats) chat.publish();
    try {
        await view.ready();
        await frames();
        if (server.browser === "chromium") await metrics(2);
        flushSync(() => {
            geometry = { ...geometry, zoom: 2, chats: chats.map((chat) => ({ ...chat })) };
            for (const notify of listeners) notify();
        });
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
                Math.abs(delta * (server.browser === "chromium" ? 1 : 2) - rect.height),
                `row${row.dataset.index} model=${delta} paint=${rect.height} width=${rect.width}`,
            ).toBeLessThanOrEqual(1);
        }
    } finally {
        view.destroy();
        for (const chat of chats) {
            chat.release();
            chat.store[Symbol.dispose]();
        }
        if (server.browser === "chromium") await metrics(1);
    }
});
