import { HappyAgentApiError, type SurfaceMessage } from "@slopus/happy-agent-client";
import { expect, it, vi } from "vitest";
import { happyAgentSyncCreate } from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentSurfaceMessagesStoreCreate,
    type HappyAgentSurfaceMessagesDeps,
} from "./surfaceMessagesStore.js";
import type { HappyAgentSurfaceId, HappyAgentSurfaceMessageId } from "./surfaceTypes.js";

/**
 * A chat Surface's messages against a daemon held in memory: one unbroken run
 * up to the newest, history read as it is scrolled to, gaps read forward, and
 * the reader's own posts, edits, and deletions applied at once and carried to
 * the daemon under one mutation ID each.
 */

const SURFACE = "surface_chat" as HappyAgentSurfaceId;

type Client = HappyAgentSurfaceMessagesDeps["client"];

function wire(seq: number, text: string, authorUserId = "u2"): SurfaceMessage {
    return {
        id: `m${String(seq)}`,
        surfaceId: SURFACE,
        seq,
        authorUserId,
        text,
        status: "active",
        createdAt: seq,
        updatedAt: seq,
        editedAt: null,
        deletedAt: null,
        version: `0000-${String(seq).padStart(4, "0")}`,
    };
}

/** The daemon's messages, paged as it pages them. */
function daemon(count: number) {
    const messages: SurfaceMessage[] = [];
    for (let seq = 1; seq <= count; seq += 1) messages.push(wire(seq, `message ${String(seq)}`));
    let versions = 9000;
    const nextVersion = () => `0000-${String((versions += 1))}`;
    const listSurfaceMessages = vi.fn(
        async (
            _surfaceId: string,
            options: { beforeSeq?: number; afterSeq?: number; limit?: number } = {},
        ) => {
            const limit = options.limit ?? 50;
            let page: SurfaceMessage[];
            if (options.afterSeq !== undefined)
                page = messages.filter((m) => m.seq > options.afterSeq!).slice(0, limit);
            else
                page = messages
                    .filter((m) => options.beforeSeq === undefined || m.seq < options.beforeSeq)
                    .slice(-limit);
            const first = page[0]?.seq;
            const last = page.at(-1)?.seq;
            return {
                messages: page,
                nextBeforeSeq: first !== undefined && first > 1 ? first : null,
                nextAfterSeq:
                    last !== undefined && last < (messages.at(-1)?.seq ?? 0) ? last : null,
                cursor: "c",
            };
        },
    );
    const sendSurfaceMessage = vi.fn(
        async (_surfaceId: string, request: { id?: string; text: string; mutationId?: string }) => {
            const existing = messages.find((m) => m.id === request.id);
            if (existing) return { message: existing };
            const message = {
                ...wire(messages.length + 1, request.text, "u1"),
                id: request.id ?? "x",
            };
            messages.push(message);
            return { message };
        },
    );
    const editSurfaceMessage = vi.fn(
        async (
            _surfaceId: string,
            messageId: string,
            request: { text: string },
            options: { ifMatch: string },
        ) => {
            const index = messages.findIndex((m) => m.id === messageId);
            const current = messages[index]!;
            if (current.version !== options.ifMatch)
                throw new HappyAgentApiError(409, "Stale", "version_conflict", {
                    error: "Stale",
                    currentVersion: current.version,
                    message: current,
                });
            const message = {
                ...current,
                text: request.text,
                editedAt: 99,
                version: nextVersion(),
            };
            messages[index] = message;
            return { message };
        },
    );
    const deleteSurfaceMessage = vi.fn(
        async (_surfaceId: string, messageId: string, _options: { ifMatch: string }) => {
            const index = messages.findIndex((m) => m.id === messageId);
            const message = {
                ...messages[index]!,
                status: "deleted" as const,
                deletedAt: 99,
                version: nextVersion(),
            };
            messages[index] = message;
            return { message };
        },
    );
    const client = {
        endpoint: "http://daemon",
        listSurfaceMessages,
        getSurfaceMessage: vi.fn(async (_surfaceId: string, messageId: string) => ({
            message: messages.find((m) => m.id === messageId)!,
        })),
        sendSurfaceMessage,
        editSurfaceMessage,
        deleteSurfaceMessage,
        getUsers: vi.fn(async () => ({ users: [] })),
    } as unknown as Client;
    return {
        messages,
        client,
        listSurfaceMessages,
        sendSurfaceMessage,
        editSurfaceMessage,
        deleteSurfaceMessage,
    };
}

function open(server: ReturnType<typeof daemon>) {
    const sync = happyAgentSyncCreate();
    const store = happyAgentSurfaceMessagesStoreCreate({
        client: server.client,
        sync: sync.source,
        surfaceId: SURFACE,
    });
    const release = store.subscribe(() => undefined);
    sync.writer.bootstrapReceived({} as never);
    return { store, sync, release };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function until(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200 && !check(); attempt += 1) await settle();
    expect(check()).toBe(true);
}

it("reads the newest page, and older pages as they are scrolled to", async () => {
    const server = daemon(120);
    const { store } = open(server);
    await until(() => store.get().status === "ready");
    expect(store.get().messages.map((m) => m.seq)).toEqual(
        Array.from({ length: 50 }, (_, index) => 71 + index),
    );
    expect(store.get().older).toBe("more");

    store.olderLoad();
    expect(store.get().older).toBe("loading");
    await until(() => store.get().older !== "loading");
    expect(store.get().messages[0]!.seq).toBe(21);

    store.olderLoad();
    await until(() => store.get().messages[0]!.seq === 1);
    expect(store.get().older).toBe("none");
    expect(store.get().messages).toHaveLength(120);
});

it("reads forward across a gap a created event reveals", async () => {
    const server = daemon(3);
    const { store, sync } = open(server);
    await until(() => store.get().status === "ready");
    // Two messages arrive while only the second's event is heard.
    server.messages.push(wire(4, "missed"), wire(5, "heard"));
    sync.writer.updateReceived({
        kind: "event",
        event: { type: "surface_message.created", payload: { message: server.messages[4]! } },
    } as never);
    await until(() => store.get().messages.length === 5);
    expect(store.get().messages.map((m) => m.text)).toEqual([
        "message 1",
        "message 2",
        "message 3",
        "missed",
        "heard",
    ]);
});

it("applies an update event by version, and reads one whose chain is broken", async () => {
    const server = daemon(2);
    const { store, sync } = open(server);
    await until(() => store.get().status === "ready");
    const first = server.messages[0]!;
    sync.writer.updateReceived({
        kind: "event",
        event: {
            type: "surface_message.updated",
            payload: {
                surfaceId: SURFACE,
                messageId: first.id,
                previousVersion: first.version,
                version: "0000-5000",
                changes: { text: "edited", editedAt: 7, updatedAt: 7 },
            },
        },
    } as never);
    await until(() => store.get().messages[0]!.text === "edited");
    expect(store.get().messages[0]!.editedAt).toBe(7);
    // An older version than the one held changes nothing.
    sync.writer.updateReceived({
        kind: "event",
        event: {
            type: "surface_message.updated",
            payload: {
                surfaceId: SURFACE,
                messageId: first.id,
                previousVersion: "0000-0000",
                version: "0000-0001",
                changes: { text: "stale", updatedAt: 1 },
            },
        },
    } as never);
    await settle();
    expect(store.get().messages[0]!.text).toBe("edited");
});

it("posts at once, and a post sent again is the same post", async () => {
    const server = daemon(1);
    const { store } = open(server);
    await until(() => store.get().status === "ready");
    let attempts = 0;
    const send = server.sendSurfaceMessage.getMockImplementation()!;
    server.sendSurfaceMessage.mockImplementation(async (...args) => {
        attempts += 1;
        // The first request lands but its answer never arrives.
        const answer = await send(...args);
        if (attempts === 1) throw new TypeError("fetch failed");
        return answer;
    });
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
        store.draftUpdate("  hello  ");
        store.draftSubmit();
        expect(store.get().draft).toBe("");
        expect(store.get().sending.map((m) => m.text)).toEqual(["hello"]);
        await vi.advanceTimersByTimeAsync(1_000);
    } finally {
        vi.useRealTimers();
    }
    await until(() => store.get().sending.length === 0);
    expect(server.messages.map((m) => m.text)).toEqual(["message 1", "hello"]);
    const [first, second] = server.sendSurfaceMessage.mock.calls;
    expect(second![1]).toEqual(first![1]);
    expect(store.get().messages.at(-1)!.text).toBe("hello");
});

it("edits through a conflict, and deletes", async () => {
    const server = daemon(2);
    const { store } = open(server);
    await until(() => store.get().status === "ready");
    const id = "m2" as HappyAgentSurfaceMessageId;
    // Somebody else's edit lands first; this one is sent again on the version it adopts.
    server.messages[1] = { ...server.messages[1]!, text: "theirs", version: "0000-8000" };
    store.messageEditStart(id);
    store.messageEditTextUpdate("mine");
    store.messageEditCommit();
    expect(store.get().editing).toBeUndefined();
    expect(store.get().messages[1]!.text).toBe("mine");
    await until(() => server.messages[1]!.text === "mine");
    expect(server.editSurfaceMessage).toHaveBeenCalledTimes(2);
    const [first, second] = server.editSurfaceMessage.mock.calls;
    expect(second![2]).toEqual(first![2]);

    store.messageDelete(id);
    expect(store.get().messages[1]!.status).toBe("deleted");
    await until(() => server.messages[1]!.status === "deleted");
    expect(store.get().messages).toHaveLength(2);
});

it("states a refusal, and puts a refused post back in the composer", async () => {
    const server = daemon(0);
    const { store } = open(server);
    await until(() => store.get().status === "ready");
    server.sendSurfaceMessage.mockRejectedValueOnce(
        new HappyAgentApiError(403, "Not a member", "forbidden", { error: "Not a member" }),
    );
    store.draftUpdate("hi");
    store.draftSubmit();
    await until(() => store.get().failure !== undefined);
    expect(store.get().sending).toEqual([]);
    expect(store.get().draft).toBe("hi");
    store.failureDismiss();
    expect(store.get().failure).toBeUndefined();
});

it("is missing when the daemon has no such Surface", async () => {
    const server = daemon(0);
    server.listSurfaceMessages.mockRejectedValue(
        new HappyAgentApiError(404, "Not found", "not_found", { error: "Not found" }),
    );
    const { store } = open(server);
    await until(() => store.get().status === "missing");
});
