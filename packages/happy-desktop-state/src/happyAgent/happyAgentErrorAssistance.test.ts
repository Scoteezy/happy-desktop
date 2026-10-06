import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentDraftSnapshot, MessageMode } from "@slopus/happy-agent-client";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChatDraftAppend, happyAgentDraftAppended } from "./happyAgentChatDraftAppend.js";
import { happyAgentChatStoreCreate } from "./happyAgentChatStore.js";
import { happyAgentErrorAssistanceText } from "./happyAgentErrorAssistance.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

const DIAGNOSTIC = {
    sessionId: "agent-source" as HappyAgentSessionId,
    sessionTitle: "Fix the build",
    providerId: "claude_extra",
    modelId: "opus-5-5",
    messageId: "message-1",
    runId: "run-1",
    text: "The selected provider, model, effort, or service tier is unavailable.\n\nRun /model.",
};

/** The failing session runs on an account that is gone. */
const SOURCE_MODE: MessageMode = {
    effort: "max",
    modelId: "opus-5-5",
    permissionMode: "full_access",
    providerId: "claude_extra",
    serviceTier: "fast",
};

/** The Chief of Staff's own choice, which a handoff must keep. */
const CHIEF_MODE: MessageMode = {
    effort: "high",
    modelId: "gpt-6-sol",
    permissionMode: "read_only",
    providerId: "codex",
    serviceTier: null,
};

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

/**
 * A real connection and chat store over the fake daemon, holding a failing
 * session and a Chief of Staff conversation whose draft is `chiefDraft`.
 */
function handoffHarness(chiefDraft: AgentDraftSnapshot) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-source" });
    daemon.modeSeed("agent-source", SOURCE_MODE);
    daemon.agentSeed(project.id, { id: "agent-chief" });
    daemon.modeSeed("agent-chief", CHIEF_MODE);
    daemon.draftSeed("agent-chief", chiefDraft);
    const connection = connectHappyAgent({
        endpoint: "http://happy-agent.test/",
        token: "token",
        client: daemon.client,
        wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
        now: () => 1_000,
    });
    openConnections.push(connection);
    let live = false;
    connection.connectGroups({
        onChange: (_projects, state) => {
            live = state.connection === "live";
        },
        onError: () => undefined,
    });
    const store = happyAgentChatStoreCreate("agent-chief" as HappyAgentSessionId, {
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
    // A conversation is handed off from an open, connected app.
    const handoff = async () => {
        await vi.waitFor(() => expect(live).toBe(true));
        await happyAgentChatDraftAppend(store, happyAgentErrorAssistanceText(DIAGNOSTIC), {
            updatedAt: () => 2_000,
            origin: "test",
            closed: () => false,
        });
    };
    /** The draft the daemon saved for the Chief of Staff, once the debounced save lands. */
    const savedDraft = async () => {
        await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBe(1));
        const call = daemon.calls.find((candidate) => candidate.method === "saveAgentDraft")!;
        const request = call.args[1] as { readonly draft: AgentDraftSnapshot["value"] };
        return { agentId: call.args[0], draft: request.draft };
    };
    return { daemon, store, handoff, savedDraft };
}

describe("Chief of Staff error handoff", () => {
    it("labels the draft as troubleshooting and quotes the error with its session and account", () => {
        const text = happyAgentErrorAssistanceText(DIAGNOSTIC);
        expect(text.split("\n\n")[0]).toBe("Troubleshooting: conversation failure");
        expect(text).toContain("Agent: Fix the build (agent-source)");
        expect(text).toContain("Account: claude_extra, model opus-5-5");
        expect(text).toContain("Message: message-1\nRun: run-1");
        expect(text).toContain(
            "> The selected provider, model, effort, or service tier is unavailable.\n>\n> Run /model.",
        );
        expect(text).not.toContain("(truncated)");
    });

    it("says when a long error was cut short", () => {
        const text = happyAgentErrorAssistanceText({ ...DIAGNOSTIC, text: "x".repeat(12_001) });
        expect(text).toContain("(truncated)");
        expect(text).toContain(`> ${"x".repeat(12_000)}`);
        expect(text).not.toContain("x".repeat(12_001));
    });

    it("appends below an existing draft, fills an empty one, and does not repeat itself", () => {
        expect(happyAgentDraftAppended("", "help")).toBe("help");
        expect(happyAgentDraftAppended("my notes", "help")).toBe("my notes\n\nhelp");
        expect(happyAgentDraftAppended("my notes\n\nhelp", "help")).toBeUndefined();
        expect(happyAgentDraftAppended("help", "help")).toBeUndefined();
    });

    it("writes an empty Chief of Staff draft in its own mode and sends nothing", async () => {
        const { daemon, handoff, savedDraft } = handoffHarness({ value: null, updatedAt: null });
        await handoff();
        const saved = await savedDraft();
        expect(saved.agentId).toBe("agent-chief");
        expect(saved.draft).toEqual({
            ...CHIEF_MODE,
            text: happyAgentErrorAssistanceText(DIAGNOSTIC),
        });
        expect(daemon.callCount("sendMessage")).toBe(0);
    });

    it("keeps what the reader typed and the draft's own mode, and sends nothing", async () => {
        const draftMode: MessageMode = { ...CHIEF_MODE, effort: "low" };
        const { daemon, store, handoff, savedDraft } = handoffHarness({
            value: { ...draftMode, text: "my notes" },
            updatedAt: 500,
        });
        await handoff();
        const saved = await savedDraft();
        expect(saved.draft).toEqual({
            ...draftMode,
            text: `my notes\n\n${happyAgentErrorAssistanceText(DIAGNOSTIC)}`,
        });
        // Opening the Chief of Staff shows the combined draft in its composer.
        const unsubscribe = store.subscribe(() => undefined);
        await vi.waitFor(() => expect(store.get().draft).toBe(saved.draft?.text));
        unsubscribe();
        expect(daemon.callCount("sendMessage")).toBe(0);
        // The failing session's mode went nowhere: nothing was written to it.
        expect(
            daemon.calls.filter(
                (call) => call.args[0] === "agent-source" && call.method !== "getAgentBootstrap",
            ),
        ).toEqual([]);
    });
});
