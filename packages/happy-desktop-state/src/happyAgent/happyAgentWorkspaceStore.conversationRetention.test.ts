import { expect, it } from "vitest";
import { entryKey, type ConversationEntry } from "../conversation/conversationEntry.js";
import type { HappyAgentChatSnapshot, HappyAgentChatStore } from "./happyAgentChatStore.js";
import type { HappyAgentChatHandle, HappyAgentWorkspaceClient } from "./happyAgentClient.js";
import {
    happyAgentConversationRetentionFor,
    type HappyAgentConversationRetention,
} from "./happyAgentConversationRetention.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type {
    HappyAgentGroupId,
    HappyAgentProjectId,
    HappyAgentSessionId,
} from "./happyAgentTypes.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

/**
 * Leaving a conversation keeps it materialized, so a window can keep its view
 * mounted and show it again at once. The workspace keeps the ones left most
 * recently while they fit the count and the size its host gave it, lets the
 * rest go oldest first, and drops any the list stops listing.
 */

const PROJECT = "prj_retention" as HappyAgentProjectId;
const GROUP = PROJECT as unknown as HappyAgentGroupId;

const summary = (id: string) => ({
    id,
    title: id,
    subtitle: "~/retention",
    updatedAt: 1_763_999_000_000,
    activity: "idle" as const,
    participants: [],
});

function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) =>
            property === "then"
                ? undefined
                : property === Symbol.iterator
                  ? function* () {}
                  : inert(),
        apply: () => undefined,
    });
}

function entry(id: string): ConversationEntry {
    return { kind: "notice", id, level: "info", sequence: id, text: id, variant: "notice" };
}

/** One session's chat store as the client would lease it, recording its leases. */
function chatCreate(sessionId: string) {
    let snapshot = {
        sessionId,
        ready: true,
        session: { type: "loading" },
        entries: [entry(`${sessionId}:1`)],
        slashCommands: [],
        runStatus: "idle",
        workingPhase: "working",
        transcriptComplete: true,
        loadingMore: false,
        queuedMessages: [],
        requestSubmissions: [],
        requestSelections: new Map(),
        tasks: [],
        subagents: [],
        backgroundProcesses: [],
        detachedBackgroundProcessIds: new Set(),
        showReasoning: false,
        expandedTurnIds: new Set(),
        usageLoading: false,
        activityPanelOpen: false,
        modelLocked: false,
    } as unknown as HappyAgentChatSnapshot;
    const listeners = new Set<() => void>();
    const store = new Proxy(
        {
            get: () => snapshot,
            subscribe(listener: () => void) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentChatStore;
    const chat = {
        leases: 0,
        listeners,
        store,
        stream(text: string) {
            snapshot = { ...snapshot, entries: [...snapshot.entries, entry(text)] };
            for (const listener of listeners) listener();
        },
    };
    return chat;
}

function workspaceCreate(retention?: HappyAgentConversationRetention, ids = "abcdef") {
    let list = {
        projects: {
            type: "ready",
            value: [
                {
                    id: PROJECT,
                    path: "/work/retention",
                    displayPath: "~/retention",
                    name: "retention",
                    orderKey: "a",
                    kind: "regular",
                    lifecycle: { phase: "ready" },
                    worktrees: [],
                    activity: "idle",
                    updatedAt: 1,
                    conversations: [...ids].map(summary),
                },
            ],
        },
        bots: [],
        botsCreating: [],
        archivedSessions: [],
        catalogRevision: 1,
        sessionCreateFailures: new Map(),
        worktreeCreateFailures: new Map(),
        projectCreateFailures: new Map(),
        subtaskFailures: new Map(),
        tasks: [],
        taskDirectory: [],
        tasksJoining: new Set(),
        taskFailures: new Map(),
    } as unknown as HappyAgentSessionListSnapshot;
    const listListeners = new Set<() => void>();
    const chats = new Map([...ids].map((id) => [id, chatCreate(id)]));
    const reads: string[] = [];
    const loading = { type: "loading" } as const;
    const client = new Proxy(
        {
            models: {
                get: () => loading,
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    {
                        get: () => list,
                        subscribe: (listener: () => void) => {
                            listListeners.add(listener);
                            return () => listListeners.delete(listener);
                        },
                    },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: (sessionId: string): Promise<HappyAgentChatHandle> => {
                reads.push(sessionId);
                const chat = chats.get(sessionId)!;
                chat.leases += 1;
                let released = false;
                return Promise.resolve({
                    store: chat.store,
                    [Symbol.dispose]() {
                        if (released) return;
                        released = true;
                        chat.leases -= 1;
                    },
                });
            },
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFilesSubscribe: () => () => undefined,
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(
        client,
        retention === undefined ? {} : { conversationRetention: retention },
    );
    const unsubscribe = workspace.subscribe(() => undefined);
    return {
        workspace,
        chats,
        reads,
        unsubscribe,
        /** Opens one conversation and lets its lease arrive. */
        async open(id: string) {
            workspace.conversationOpen(id as HappyAgentSessionId, GROUP);
            await Promise.resolve();
            await Promise.resolve();
        },
        kept: () =>
            workspace.conversationsRetained.get().conversations.map((c) => c.conversationId),
        leased: () => [...chats].filter(([, chat]) => chat.leases > 0).map(([id]) => id),
        hostLists(remaining: string) {
            const projects = list.projects as unknown as { value: readonly object[] };
            list = {
                ...list,
                projects: {
                    type: "ready",
                    value: [{ ...projects.value[0]!, conversations: [...remaining].map(summary) }],
                },
                catalogRevision: list.catalogRevision + 1,
            } as unknown as HappyAgentSessionListSnapshot;
            for (const listener of listListeners) listener();
        },
    };
}

it("keeps the conversations just left, newest first, and lets the oldest go past the count", async () => {
    const view = workspaceCreate({ count: 2, size: 1_000 });
    for (const id of "abcd") await view.open(id);

    expect(view.kept()).toEqual(["c", "b"]);
    // The one on screen and the two kept hold leases; the oldest gave its lease back.
    expect(view.leased().sort()).toEqual(["b", "c", "d"]);
    view.unsubscribe();
});

it("opens a kept conversation again from its lease, whole, in the same call", async () => {
    const view = workspaceCreate({ count: 3, size: 1_000 });
    for (const id of "abc") await view.open(id);
    const reads = view.reads.length;

    view.workspace.conversationOpen("a" as HappyAgentSessionId, GROUP);

    // Nothing was read, and the transcript is there before anything settles.
    expect(view.reads.length).toBe(reads);
    const open = view.workspace.get().conversation;
    expect(open.type === "ready" && open.value.entries.map(entryKey)).toEqual(["a:1"]);
    expect(open.type === "ready" && open.value.conversationId).toBe("a");
    // Opening it takes it out of the kept ones, and what was open is kept instead.
    expect(view.kept()).toEqual(["c", "b"]);
    expect(view.leased().sort()).toEqual(["a", "b", "c"]);
    view.unsubscribe();
});

it("follows what a kept conversation streams while it is out of sight", async () => {
    const view = workspaceCreate({ count: 2, size: 1_000 });
    await view.open("a");
    await view.open("b");
    const before = view.workspace.conversationsRetained.get();
    let notified = 0;
    const stop = view.workspace.conversationsRetained.subscribe(() => (notified += 1));

    view.chats.get("a")!.stream("a:2");

    expect(notified).toBe(1);
    const kept = view.workspace.conversationsRetained.get();
    expect(kept).not.toBe(before);
    expect(kept.conversations[0]!.entries.map(entryKey)).toEqual(["a:1", "a:2"]);
    // A change to the open conversation's chat is not the kept store's to announce.
    view.chats.get("b")!.stream("b:2");
    expect(notified).toBe(1);
    stop();
    view.unsubscribe();
});

it("lets the least recently left views go once the kept ones no longer fit their size", async () => {
    const view = workspaceCreate({ count: 4, size: 100 });
    for (const id of "abcde") await view.open(id);
    expect(view.kept()).toEqual(["d", "c", "b", "a"]);

    view.workspace.conversationViewSizeUpdate("d" as HappyAgentSessionId, 60);
    view.workspace.conversationViewSizeUpdate("c" as HappyAgentSessionId, 30);
    expect(view.kept()).toEqual(["d", "c", "b", "a"]);

    // Ten more than fits: the oldest go until the rest fit, whatever their own size.
    view.workspace.conversationViewSizeUpdate("b" as HappyAgentSessionId, 20);
    expect(view.kept()).toEqual(["d", "c"]);
    expect(view.leased().sort()).toEqual(["c", "d", "e"]);

    // A view measured while it is on screen counts once it is left.
    view.workspace.conversationViewSizeUpdate("e" as HappyAgentSessionId, 90);
    await view.open("f");
    expect(view.kept()).toEqual(["e"]);
    expect(view.leased().sort()).toEqual(["e", "f"]);
    view.unsubscribe();
});

it("lets go of a kept conversation the list stops listing", async () => {
    const view = workspaceCreate({ count: 3, size: 1_000 });
    for (const id of "abc") await view.open(id);

    view.hostLists("bc");

    expect(view.kept()).toEqual(["b"]);
    expect(view.leased().sort()).toEqual(["b", "c"]);
    view.unsubscribe();
});

it("keeps nothing without a retention, and nothing once nobody is looking", async () => {
    const none = workspaceCreate();
    for (const id of "abc") await none.open(id);
    expect(none.kept()).toEqual([]);
    expect(none.leased()).toEqual(["c"]);
    none.unsubscribe();

    const view = workspaceCreate({ count: 3, size: 1_000 });
    for (const id of "abc") await view.open(id);
    view.unsubscribe();
    expect(view.kept()).toEqual([]);
    expect(view.leased()).toEqual([]);
});

it("affords one kept view per gigabyte, between one and seven, and a size to match", () => {
    expect(happyAgentConversationRetentionFor(8)).toEqual({ count: 7, size: 48_000 });
    expect(happyAgentConversationRetentionFor(4)).toEqual({ count: 3, size: 24_000 });
    expect(happyAgentConversationRetentionFor(2)).toEqual({ count: 1, size: 12_000 });
    expect(happyAgentConversationRetentionFor(0.5)).toEqual({ count: 1, size: 6_000 });
    // A device that does not say is treated as a modest one.
    expect(happyAgentConversationRetentionFor(undefined)).toEqual({ count: 3, size: 24_000 });
    // Chromium caps what it reports at 8; anything larger is still eight views.
    expect(happyAgentConversationRetentionFor(32)).toEqual({ count: 7, size: 48_000 });
});
