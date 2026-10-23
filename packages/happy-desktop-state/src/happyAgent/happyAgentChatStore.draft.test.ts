import { afterEach, expect, it, vi } from "vitest";
import type { MessageMode } from "@slopus/happy-agent-client";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChatStoreCreate } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* The stored draft follows the composer a keystroke at a time. Each key must
 * leave the rest of the conversation's snapshot as it was, and the host's
 * echo of a key already typed past must never take the newer text back. */

const MODE: MessageMode = {
    providerId: "claude",
    modelId: "anthropic/opus-5-5",
    effort: "high",
    permissionMode: "full_access",
    serviceTier: null,
};

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

function harness() {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    daemon.modeSeed("agent-a", MODE);
    daemon.draftSeed("agent-a", { value: { ...MODE, text: "" }, updatedAt: 10 });
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    openConnections.push(connection);
    connection.connectGroups({ onChange: () => undefined, onError: () => undefined });
    const store = happyAgentChatStoreCreate("agent-a" as HappyAgentSessionId, {
        catalog: happyAgentModelCatalogProject(daemon.configGet()),
        transcriptConnect: (options) => {
            const session = connection.connectSession({
                sessionId: options.sessionId,
                onChange: (elements, state) => options.onChange(elements, state, []),
                onError: options.onError,
            });
            return { close: () => session.close(), loadMore: (token) => session.loadMore(token) };
        },
        connectActions: connection,
        connectMutationSubscribe: () => () => undefined,
    });
    const unsubscribe = store.subscribe(() => undefined);
    return {
        daemon,
        store,
        dispose: () => {
            store[Symbol.dispose]();
            unsubscribe();
        },
    };
}

it("keeps every other part of the snapshot while only the stored draft moves", async () => {
    const { store, dispose } = harness();
    await vi.waitFor(() => expect(store.get().ready).toBe(true));
    const before = store.get();

    void store.draftSet("Typing quickly", 2_000, "window-1");

    const after = store.get();
    expect(after).not.toBe(before);
    expect(after.draft).toBe("Typing quickly");
    expect(after.draftUpdatedAt).toBe(2_000);
    for (const key of Object.keys(before) as (keyof typeof before)[])
        if (key !== "draft" && key !== "draftUpdatedAt") expect(after[key]).toBe(before[key]);
    dispose();
});

it("never takes typed text back for the host's echo of an earlier key", async () => {
    const { daemon, store, dispose } = harness();
    await vi.waitFor(() => expect(store.get().ready).toBe(true));

    void store.draftSet("a", 2_001, "window-1");
    void store.draftSet("ab", 2_002, "window-1");
    void store.draftSet("abc", 2_003, "window-1");
    // The host answers the save of "ab" after "abc" has been typed.
    daemon.eventEmit("agent.draft.updated", {
        agentId: "agent-a",
        draft: { value: { ...MODE, text: "ab" }, updatedAt: 2_002 },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(store.get()).toMatchObject({ draft: "abc", draftUpdatedAt: 2_003 });
    dispose();
});
