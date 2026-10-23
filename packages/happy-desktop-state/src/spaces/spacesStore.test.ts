import { afterEach, expect, it, vi } from "vitest";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSpacesStoreCreate } from "./spacesStore.js";

afterEach(() => vi.useRealTimers());

it("holds incoming sidebar versions and attention through the saved drop", async () => {
    vi.useFakeTimers();
    const daemon = fakeHappyAgentDaemonCreate();
    const attention = vi.fn(async (_report: { state: "interacting" | "calm" }) => ({
        batch: null,
    }));
    daemon.client.reportSpaceAttention = attention;
    let finish = () => {};
    daemon.client.updateSpaceSidebar = vi.fn(
        () =>
            new Promise<Awaited<ReturnType<typeof daemon.client.updateSpaceSidebar>>>((resolve) => {
                finish = () =>
                    resolve({
                        artifactId: "sidebar",
                        version: 2,
                        html: "<nav>\n</nav>",
                        spaces: [],
                    });
            }),
    );
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const unsubscribe = store.subscribe(() => {});
    try {
        await vi.advanceTimersByTimeAsync(0);
        store.sidebarDragUpdate(true);
        await vi.advanceTimersByTimeAsync(0);
        const reads = daemon.callCount("getSpaceSidebar");
        const event = daemon.eventEmit("space.removed", { spaceId: "elsewhere" });
        sync.writer.updateReceived({ kind: "event", cursor: event.cursor, event });
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("getSpaceSidebar")).toBe(reads);
        store.sidebarWrite("<nav>\n</nav>");
        store.sidebarDragUpdate(false);
        // The window hides mid-save: calm waits for the saved drop.
        store.attentionVisibleUpdate(false);
        await vi.advanceTimersByTimeAsync(0);
        expect(attention.mock.calls.map(([report]) => report)).toEqual([{ state: "interacting" }]);
        expect(store.get().sidebar?.html).toBe("<nav>\n</nav>");
        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(attention.mock.calls.map(([report]) => report)).toEqual([
            { state: "interacting" },
            { state: "calm" },
        ]);
        expect(store.get().sidebar?.html).toBe("<nav>\n</nav>");
        expect(store.get().sidebar?.version).toBe(2);
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

it("lets queued changes land only after five quiet minutes or once out of sight", async () => {
    vi.useFakeTimers();
    const daemon = fakeHappyAgentDaemonCreate();
    const attention = vi.fn(async (_report: { state: "interacting" | "calm" }) => ({
        batch: null,
    }));
    daemon.client.reportSpaceAttention = attention;
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const unsubscribe = store.subscribe(() => {});
    const states = () => attention.mock.calls.map(([report]) => report.state);
    try {
        await vi.advanceTimersByTimeAsync(0);
        // In and out of the sidebar, clicking rows, for most of the quiet period each time.
        for (let round = 0; round < 3; round += 1) {
            store.attentionInteractingUpdate(true);
            store.attentionInput();
            store.attentionInteractingUpdate(false);
            await vi.advanceTimersByTimeAsync(4 * 60_000);
        }
        expect(states()).not.toContain("calm");
        await vi.advanceTimersByTimeAsync(60_000);
        expect(states().at(-1)).toBe("calm");
        store.attentionInput();
        await vi.advanceTimersByTimeAsync(0);
        expect(states().at(-1)).toBe("interacting");
        store.attentionVisibleUpdate(false);
        await vi.advanceTimersByTimeAsync(0);
        expect(states().at(-1)).toBe("calm");
        // Input that reaches a hidden window changes nothing.
        store.attentionInput();
        await vi.advanceTimersByTimeAsync(0);
        expect(states().at(-1)).toBe("calm");
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

it("aborts offline read retries on last unsubscribe and reads again on resubscribe", async () => {
    vi.useFakeTimers();
    const daemon = fakeHappyAgentDaemonCreate();
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    daemon.failOnce("listSpaces");
    daemon.failOnce("listSpaces");
    const unsubscribe = store.subscribe(() => undefined);
    try {
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("listSpaces")).toBe(1);
        const signal = (
            daemon.calls.find((call) => call.method === "listSpaces")?.args[0] as {
                signal: AbortSignal;
            }
        ).signal;
        unsubscribe();
        expect(signal.aborted).toBe(true);
        await vi.advanceTimersByTimeAsync(20_000);
        expect(daemon.callCount("listSpaces")).toBe(1);
        const unsubscribeAgain = store.subscribe(() => undefined);
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("listSpaces")).toBe(2);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(daemon.callCount("listSpaces")).toBe(3);
        expect(store.get().availability).toBe("available");
        unsubscribeAgain();
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

it("reads the sidebar document again when the daemon removes a row from it", async () => {
    vi.useFakeTimers();
    const daemon = fakeHappyAgentDaemonCreate();
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const unsubscribe = store.subscribe(() => undefined);
    try {
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("getSpaceSidebar")).toBe(1);
        // An emptied stem cell goes away and the daemon writes the document
        // without it; a write against the old version would be refused.
        const event = daemon.eventEmit("space.removed", { spaceId: "space-stem" });
        sync.writer.updateReceived({ kind: "event", cursor: event.cursor, event });
        await vi.advanceTimersByTimeAsync(0);
        expect(daemon.callCount("getSpaceSidebar")).toBe(2);
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});

it("puts a row's daemon picture behind the endpoint this connection talks to", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const row = (id: string, icon: { type: "image"; url: string } | null) => ({
        createdAt: 1,
        icon,
        id,
        orderKey: id,
        placement: "settled" as const,
        sectionId: null,
        target: {
            agentId: `agent-${id}`,
            id: `bot-${id}`,
            kind: "bot" as const,
            workspaceId: null,
        },
        title: id,
        updatedAt: 1,
        version: 1,
        visibility: "shown" as const,
        working: false,
    });
    daemon.client.listSpaces = vi.fn(async () => ({
        cursor: "0",
        sections: [],
        spaces: [
            row("uploaded", { type: "image", url: "/v0/bots/bot-uploaded/avatar" }),
            row("hosted", { type: "image", url: "https://cdn.test/face.png" }),
            row("bare", null),
        ],
    }));
    const sync = happyAgentSyncCreate();
    sync.writer.bootstrapReceived(await daemon.client.getDesktopBootstrap());
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: sync.source });
    const unsubscribe = store.subscribe(() => {});
    try {
        await vi.waitFor(() => expect(store.get().spaces.size).toBe(3));
        const icon = (id: string) => store.get().spaces.get(id as never)?.icon;
        // The same address the classic sidebar draws this bot's avatar from.
        expect(icon("uploaded")).toEqual({
            type: "image",
            url: "http://fake-happy-agent.test/v0/bots/bot-uploaded/avatar",
        });
        expect(icon("hosted")).toEqual({ type: "image", url: "https://cdn.test/face.png" });
        expect(icon("bare")).toBeNull();
    } finally {
        unsubscribe();
        store[Symbol.dispose]();
        sync.writer.close();
    }
});
