import { expect, it } from "vitest";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import type { ChatElement, SessionState } from "../happyAgentConnection/types.js";
import { happyAgentChatStoreCreate, type HappyAgentChatStore } from "./happyAgentChatStore.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* A finished turn folds its work away, but never under the reader's eyes: one
 * the reader watched finish stays open until all of it has left the screen,
 * while history, and anything already finished when the chat opened, arrives
 * folded. */

const session: SessionState = {
    activity: { kind: "idle", label: "Idle", since: 0 },
    status: "idle",
    archived: false,
    sessionId: "trace-agent",
    ownerInstanceId: "instance",
    scope: { kind: "unsorted" },
    cwd: "",
    modelId: "model",
    providerId: "provider",
    titleStatus: "idle",
    permissionMode: "auto",
    modelLocked: false,
    modelCatalog: {
        defaultModelId: "model",
        defaultProviderId: "provider",
        models: [],
        providers: [],
    },
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
    transcriptComplete: true,
    loadingMore: false,
};

/** A turn's elements: the reader's prompt, a step, and an answer. */
function turn(groupId: string, at: number): ChatElement[] {
    const base = { groupId, runId: `run-${groupId}` };
    return [
        {
            ...base,
            id: `${groupId}:user`,
            createdAt: at,
            kind: "user_message",
            messageId: `${groupId}:user`,
            authority: "server",
            identity: null,
            delivery: "sent",
            text: `Prompt for ${groupId}`,
        },
        {
            ...base,
            id: `${groupId}:tool`,
            createdAt: at + 1,
            kind: "tool_call",
            toolCallId: `${groupId}:call`,
            name: "exec_command",
            arguments: { cmd: "ls" },
            argumentsComplete: true,
            status: "succeeded",
        },
        {
            ...base,
            id: `${groupId}:text`,
            createdAt: at + 2,
            kind: "agent_text",
            messageId: `${groupId}:answer`,
            text: `Answer for ${groupId}`,
            complete: true,
        },
    ];
}
function end(
    groupId: string,
    at: number,
    reason: "completed" | "steering" = "completed",
): ChatElement {
    return {
        id: `group-end:${groupId}`,
        groupId,
        runId: `run-${groupId}`,
        createdAt: at,
        kind: "group_end",
        outcome: "success",
        reason,
        startedAt: at - 10,
        endedAt: at,
        elapsedMs: 10,
        turnStartedAt: at - 10,
        turnElapsedMs: 10,
        modelTurn: true,
    };
}

function storeOpen() {
    let change!: (elements: readonly ChatElement[]) => void;
    const store = happyAgentChatStoreCreate("trace-agent" as HappyAgentSessionId, {
        catalog: {
            defaultModelId: "model",
            defaultProviderId: "provider",
            models: [],
            providers: [],
        },
        transcriptConnect: (options) => {
            change = (elements) => options.onChange(elements, session, []);
            return { close: () => undefined, loadMore: () => undefined };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });
    const unsubscribe = store.subscribe(() => undefined);
    return { store, change, [Symbol.dispose]: () => (store[Symbol.dispose](), unsubscribe()) };
}
function rows(store: HappyAgentChatStore): string[] {
    return store
        .get()
        .entries.map((entry: ConversationEntry) =>
            entry.kind === "message" ? entry.message.id : entry.id,
        );
}

it("opens folded what finished before the chat was read", () => {
    using chat = storeOpen();
    chat.change([...turn("old", 1_000), end("old", 1_100)]);
    expect(chat.store.get().expandedTurnIds.has("old")).toBe(false);
    expect(rows(chat.store)).not.toContain("old:tool");
});

it("keeps a turn the reader watched finish open until it settles off screen", () => {
    using chat = storeOpen();
    const history = [...turn("old", 1_000), end("old", 1_100)];
    chat.change([...history, ...turn("live", 2_000)]);
    expect(rows(chat.store)).toContain("live:tool");

    chat.change([...history, ...turn("live", 2_000), end("live", 2_100)]);
    expect(chat.store.get().expandedTurnIds).toEqual(new Set(["live"]));
    // Nothing the reader was looking at goes away when the turn ends.
    expect(rows(chat.store)).toContain("live:tool");
    // Both ends of the open turn offer to hide it: the row it began with, and
    // the footer the end brought. The answer between keeps the shape it ran
    // with, so it carries nothing.
    const traced = chat.store
        .get()
        .entries.filter((entry) =>
            entry.kind === "message"
                ? entry.message.agentTrace?.turnId === "live"
                : (entry.kind === "agentActivity" ||
                      entry.kind === "delegation" ||
                      entry.kind === "turnStatus") &&
                  entry.agentTrace?.turnId === "live",
        )
        .map((entry) => (entry.kind === "message" ? entry.message.id : entry.id));
    expect(traced).toEqual(["live:tool", "group-end:live:status"]);

    // Later reads that do not touch the turn leave it as it is.
    chat.change([...history, ...turn("live", 2_000), end("live", 2_100), ...turn("next", 3_000)]);
    expect(chat.store.get().expandedTurnIds).toEqual(new Set(["live"]));

    // Two views show the chat. While either has any of the turn on screen it
    // stays open; once neither does, it folds.
    const main = { live: () => true };
    const panel = { live: () => true };
    chat.store.turnTracesSeen(main, new Set(["live"]));
    chat.store.turnTracesSeen(panel, new Set());
    expect(chat.store.get().expandedTurnIds).toEqual(new Set(["live"]));
    chat.store.turnTracesSeen(main, new Set());
    expect(chat.store.get().expandedTurnIds.size).toBe(0);
    expect(rows(chat.store)).not.toContain("live:tool");
    expect(rows(chat.store)).toContain("live:text");
});

it("waits for every view to report before folding, whichever reports first", () => {
    using chat = storeOpen();
    const main = { live: () => true };
    const panel = { live: () => true };
    chat.change(turn("live", 2_000));
    chat.store.turnTracesSeen(main, new Set());
    chat.store.turnTracesSeen(panel, new Set());
    chat.change([...turn("live", 2_000), end("live", 2_100)]);
    // The view that scrolled it away reports first; the one showing it has not yet.
    chat.store.turnTracesSeen(panel, new Set());
    expect(chat.store.get().expandedTurnIds).toEqual(new Set(["live"]));
    chat.store.turnTracesSeen(main, new Set(["live"]));
    expect(chat.store.get().expandedTurnIds).toEqual(new Set(["live"]));
    chat.store.turnTracesSeen(main, new Set());
    expect(chat.store.get().expandedTurnIds.size).toBe(0);
});

it("lets a view that is gone hold nothing open", () => {
    using chat = storeOpen();
    chat.change(turn("live", 2_000));
    chat.change([...turn("live", 2_000), end("live", 2_100)]);
    let mounted = true;
    chat.store.turnTracesSeen({ live: () => mounted }, new Set(["live"]));
    expect(chat.store.get().expandedTurnIds).toEqual(new Set(["live"]));
    mounted = false;
    chat.store.turnTracesSeen({ live: () => true }, new Set());
    expect(chat.store.get().expandedTurnIds.size).toBe(0);
});

it("keeps a steered turn open, and a turn the reader opened stays open off screen", () => {
    using chat = storeOpen();
    const live = turn("live", 2_000);
    chat.change(live);
    // Steering ends the running turn and starts the next one in the same read.
    const steered = [...live, end("live", 2_050, "steering"), ...turn("steer", 2_060)];
    chat.change(steered);
    expect(chat.store.get().expandedTurnIds).toEqual(new Set(["live"]));
    expect(rows(chat.store)).toContain("live:tool");

    // Closing it is the reader's; opening it again is theirs too, and off-screen
    // settling no longer folds it.
    chat.store.turnTraceToggle("live");
    expect(chat.store.get().expandedTurnIds.size).toBe(0);
    chat.store.turnTraceToggle("live");
    chat.store.turnTracesSeen({ live: () => true }, new Set());
    expect(chat.store.get().expandedTurnIds).toEqual(new Set(["live"]));
    chat.store.turnTraceToggle("live");
    expect(chat.store.get().expandedTurnIds.size).toBe(0);
});
