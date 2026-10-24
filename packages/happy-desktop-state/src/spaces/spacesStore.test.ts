import { afterEach, expect, it, vi } from "vitest";
import { HappyAgentApiError } from "@slopus/happy-agent-client";
import {
    fakeHappyAgentDaemonCreate,
    type FakeHappyAgentDaemon,
} from "../testing/fakeHappyAgentDaemon.js";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import type { TaskGroup } from "../happyAgentConnection/types.js";
import { happyAgentSpacesStoreCreate } from "./spacesStore.js";

afterEach(() => vi.useRealTimers());

/** One window on one daemon: its connection, and the Spaces store beside it. */
async function windowOpen(daemon: FakeHappyAgentDaemon) {
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    const listed: { tasks: readonly TaskGroup[] } = { tasks: [] };
    connection.connectGroups({
        onChange(_projects, _state, _bots, tasks) {
            listed.tasks = tasks;
        },
        onError: () => undefined,
    });
    const store = happyAgentSpacesStoreCreate({
        client: daemon.client,
        sync: connection.sync,
        stemCellTaskBegin: (identity, created) => connection.beginStemCellTask(identity, created),
    });
    const unsubscribe = store.subscribe(() => {});
    await vi.waitFor(() => expect(store.get().availability).toBe("available"));
    await vi.waitFor(() => expect(connection.config()).toBeDefined());
    return {
        connection,
        store,
        /** The reader's joined task at a workspace, as the task list shows it. */
        joined: (workspaceId: string) =>
            listed.tasks.find(
                (task) => task.workspaceId === workspaceId && task.membership !== undefined,
            ),
        close() {
            unsubscribe();
            store[Symbol.dispose]();
            connection.close();
        },
    };
}

it("makes new work in the click, and holds its first message until the daemon has made it", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    const window = await windowOpen(daemon);
    try {
        const release = daemon.pause("createStemCell");
        const creation = window.store.stemCellCreate(null, null);
        // Before the daemon has answered anything: the row, its joined task,
        // and the chat the window opens, all under the names it chose.
        const cell = creation.cell!;
        expect(window.store.get().spaces.get(cell.space.id)?.icon).toEqual({ type: "stem_cell" });
        expect(window.joined(cell.workspaceId)?.session.id).toBe(cell.agentId);
        const sent = window.connection.sendMessage(cell.agentId, "Draft a release note");
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(daemon.callCount("sendMessage")).toBe(0);
        const [request] = daemon.calls.find((call) => call.method === "createStemCell")!.args;
        expect(request).toMatchObject({
            id: cell.space.id,
            taskId: cell.space.target.id,
            workspaceId: cell.workspaceId,
            agentId: cell.agentId,
        });

        release();
        await expect(creation.created).resolves.toMatchObject({
            agentId: cell.agentId,
            workspaceId: cell.workspaceId,
        });
        await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
        expect(daemon.calls.find((call) => call.method === "sendMessage")?.args[0]).toBe(
            cell.agentId,
        );
        expect(sent).toEqual(expect.any(String));
        // The daemon's row replaces the window's, and the task stays listed.
        await vi.waitFor(() =>
            expect(window.store.get().spaces.get(cell.space.id)?.version).toBe(1),
        );
        expect(window.joined(cell.workspaceId)).toBeDefined();
        expect(window.store.get().stemCellError).toBeUndefined();
    } finally {
        window.close();
    }
});

it("takes new work the daemon refuses back out of the sidebar and the task list, and says so", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.healthSet({ stemCellIdentities: true });
    daemon.failOnce(
        "createStemCell",
        new HappyAgentApiError(409, "That name is taken.", "conflict", null),
    );
    const window = await windowOpen(daemon);
    try {
        const creation = window.store.stemCellCreate(null, null);
        const cell = creation.cell!;
        expect(window.store.get().spaces.has(cell.space.id)).toBe(true);
        expect(window.joined(cell.workspaceId)).toBeDefined();
        await expect(creation.created).rejects.toThrow("That name is taken.");
        expect(window.store.get().spaces.has(cell.space.id)).toBe(false);
        expect(window.joined(cell.workspaceId)).toBeUndefined();
        expect(window.store.get().stemCellError?.message).toBe(
            "New work could not be made. That name is taken.",
        );
        window.store.stemCellErrorDismiss();
        expect(window.store.get().stemCellError).toBeUndefined();
    } finally {
        window.close();
    }
});

it("leaves the naming to a daemon that does not take the window's names", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const window = await windowOpen(daemon);
    try {
        const creation = window.store.stemCellCreate(null, null);
        expect(creation.cell).toBeUndefined();
        const cell = await creation.created;
        const [request] = daemon.calls.find((call) => call.method === "createStemCell")!.args;
        expect(request).not.toHaveProperty("taskId");
        expect(request).not.toHaveProperty("agentId");
        expect(window.store.get().spaces.get(cell.space.id)?.version).toBe(1);
    } finally {
        window.close();
    }
});

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
