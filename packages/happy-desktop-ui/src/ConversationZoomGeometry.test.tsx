import { useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { cdp, server } from "vitest/browser";
import { expect, it } from "vitest";
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
    loadingMore: false,
};
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}

/*
 * The desktop app zooms the way a browser does. Electron's page zoom multiplies
 * the device pixel ratio and divides the CSS viewport, so a panel of the same
 * physical size holds fewer CSS pixels. The test frame's own viewport does not
 * follow the emulated one, so the panel is sized in CSS pixels here. Chromium
 * lays text out exactly as at 100%, as the canvas the text model measures
 * with does. CSS `zoom` is not
 * that in Chromium: it lays text out at the zoomed font size, whose hinted
 * advances do not scale, so lines near a wrap boundary break differently from
 * any model. Chromium therefore zooms here the way the app does. Firefox's
 * ancestor CSS zoom changes native scroll units, so it covers width changes
 * at scale 1; page zoom is covered in Chromium.
 */
const pageZoom = server.browser === "chromium";
async function pageZoomSet(baseScale: number, zoom: number) {
    await cdp().send("Emulation.setDeviceMetricsOverride", {
        ...pageViewport(),
        deviceScaleFactor: baseScale * zoom,
        mobile: false,
    });
}

it.each(pageZoom ? [1, 0.5, 0.67, 0.9, 1.5, 2] : [1])(
    "matches painted text heights after a width change at zoom %f (seed 733)",
    async (zoom) => {
        const baseScale = devicePixelRatio;
        const view = createRenderer();
        let change!: (elements: readonly ChatElement[]) => void;
        let resize!: () => void;
        const store = happyAgentChatStoreCreate("a" as HappyAgentSessionId, {
            catalog,
            transcriptConnect: (options) => {
                change = (elements) => options.onChange(elements, state, []);
                return { close: () => undefined, loadMore: () => undefined };
            },
            connectActions: {} as never,
            connectMutationSubscribe: () => () => undefined,
        });
        function Harness() {
            const snapshot = useSyncExternalStore(store.subscribe, store.get);
            const [geometry, update] = useState({ width: 820, height: 650, zoom: 1 });
            /* The panel keeps its physical size: under page zoom it holds
               880 / zoom CSS pixels. */
            resize = () =>
                flushSync(() =>
                    update(
                        pageZoom
                            ? { width: 880 / zoom, height: 650 / zoom, zoom: 1 }
                            : { width: 880, height: 650, zoom },
                    ),
                );
            return (
                <div
                    style={{ height: geometry.height, width: geometry.width, zoom: geometry.zoom }}
                >
                    <ConversationView
                        conversationId="a"
                        motion="calm"
                        running
                        agentAuthor={{
                            id: "fuzz-agent",
                            displayName: "Happy",
                            username: "happy",
                            kind: "agent",
                            agentRole: "default",
                        }}
                        entries={snapshot.entries}
                    />
                </div>
            );
        }
        view.render(Harness, { width: 1550, height: 1550 });
        flushSync(() =>
            change(
                Array.from(
                    { length: 65 },
                    (_, index): ChatElement => ({
                        id: `a:${index}`,
                        groupId: `a:${index}`,
                        runId: `run:a:${index}`,
                        createdAt: 1_790_000_000_000,
                        kind: "agent_text",
                        messageId: `a:${index}`,
                        complete: true,
                        text: `History a:${index}. ${"A stable paragraph stays where the reader left it. ".repeat(2 + (index % 5))}`,
                    }),
                ),
            ),
        );
        const check = (scale: number, stage: string) => {
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const bounds = viewport.getBoundingClientRect();
            const rows = [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ];
            for (const row of rows) {
                const painted = row.getBoundingClientRect();
                if (painted.bottom <= bounds.top || painted.top >= bounds.bottom) continue;
                const next = rows.find(
                    (candidate) =>
                        Number(candidate.dataset.index) === Number(row.dataset.index) + 1,
                );
                if (!next) continue;
                const start = Number.parseFloat(row.style.transform.slice("translateY(".length));
                const end = Number.parseFloat(next.style.transform.slice("translateY(".length));
                const prose = row.querySelector<HTMLElement>(".happy-message__body") ?? row;
                expect(
                    Math.abs((end - start) * scale - painted.height),
                    `${stage} row${row.dataset.index}: model=${(end - start) * scale} paint=${painted.height} width=${painted.width} font=${getComputedStyle(prose).font} DOM=${row.innerHTML.slice(0, 1000)}`,
                ).toBeLessThanOrEqual(1);
            }
        };
        try {
            await view.ready();
            await frames();
            check(1, "before");
            if (pageZoom) await pageZoomSet(baseScale, zoom);
            resize();
            await frames();
            check(pageZoom ? 1 : zoom, "after");
        } finally {
            if (pageZoom) await pageZoomSet(baseScale, 1);
            view.destroy();
            store[Symbol.dispose]();
        }
    },
);
