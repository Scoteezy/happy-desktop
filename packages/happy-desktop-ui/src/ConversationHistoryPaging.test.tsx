import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { cdp, server } from "vitest/browser";
import {
    happyAgentChatStoreCreate,
    type ChatElement,
    type HappyAgentSessionId,
    type SessionState,
} from "happy-desktop-state";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { createRenderer, pageViewport } from "./testing";

const catalog = {
    defaultModelId: "model",
    defaultProviderId: "provider",
    models: [],
    providers: [],
};
function history(prefix: string, count: number): ChatElement[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `${prefix}:${index}`,
        groupId: `${prefix}:${index}`,
        runId: `${prefix}:${index}`,
        createdAt: 1_790_000_000_000,
        kind: "agent_text",
        messageId: `${prefix}:${index}`,
        complete: true,
        text: `History ${prefix}:${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
    }));
}
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}

it.each(server.browser === "chromium" ? [1, 0.67, 2] : [1])(
    "retains the top reader's anchor while a history page arrives at zoom %f (seed 8191)",
    async (zoom) => {
        const baseScale = devicePixelRatio;
        const pageZoom = server.browser === "chromium";
        const scale = pageZoom ? 1 : zoom;
        const deviceScale = (factor: number) =>
            cdp().send("Emulation.setDeviceMetricsOverride", {
                ...pageViewport(),
                deviceScaleFactor: factor,
                mobile: false,
            });
        const view = createRenderer();
        let elements = history("a", 65);
        let state: SessionState = {
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
            loadingMore: false,
            loadMoreToken: "older",
        };
        let change!: () => void;
        const store = happyAgentChatStoreCreate("a" as HappyAgentSessionId, {
            catalog,
            transcriptConnect: (options) => {
                change = () => flushSync(() => options.onChange(elements, state, []));
                return {
                    close: () => undefined,
                    loadMore: () =>
                        queueMicrotask(() => {
                            state = { ...state, loadingMore: true };
                            change();
                        }),
                };
            },
            connectActions: {} as never,
            connectMutationSubscribe: () => () => undefined,
        });
        function Harness() {
            const snapshot = useSyncExternalStore(store.subscribe, store.get);
            return (
                <div
                    style={{
                        width: pageZoom ? 820 / zoom : 820,
                        height: pageZoom ? 650 / zoom : 650,
                        zoom: scale,
                    }}
                >
                    <ConversationView
                        conversationId="a"
                        motion="calm"
                        running
                        agentAuthor={{
                            id: "agent",
                            displayName: "Happy",
                            username: "happy",
                            kind: "agent",
                            agentRole: "default",
                        }}
                        entries={snapshot.entries}
                        onStartReached={store.historyLoadMore}
                    />
                </div>
            );
        }
        view.render(Harness, { width: 1550, height: 1550 });
        change();
        try {
            await view.ready();
            if (pageZoom) await deviceScale(baseScale * zoom);
            await frames();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            viewport.dispatchEvent(
                new WheelEvent("wheel", { deltaY: -viewport.scrollHeight, cancelable: true }),
            );
            viewport.scrollTop = 0;
            await frames();
            const bounds = viewport.getBoundingClientRect();
            const point = bounds.bottom - 32 * scale;
            const anchor = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ].find((row) => {
                const rect = row.getBoundingClientRect();
                return rect.top <= point && rect.bottom > point;
            })!;
            expect(anchor, "no initial anchor").toBeDefined();
            const top = anchor.getBoundingClientRect().top;
            const text = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT).nextNode()!;
            const range = document.createRange();
            range.selectNodeContents(text);
            const selection = window.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            const selected = selection.toString();
            elements = [...history("older", 23), ...elements];
            state = { ...state, loadingMore: false };
            change();
            await frames();
            expect(
                anchor.isConnected,
                `reader anchor ${anchor.textContent?.slice(0, 80)} removed while paging; scrollTop=${viewport.scrollTop}`,
            ).toBe(true);
            expect(Math.abs(anchor.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
            expect(text.isConnected).toBe(true);
            expect(selection.toString()).toBe(selected);
        } finally {
            if (pageZoom) await deviceScale(baseScale);
            view.destroy();
            store[Symbol.dispose]();
        }
    },
);
