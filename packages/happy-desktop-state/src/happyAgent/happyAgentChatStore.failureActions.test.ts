import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageFailure, ServiceMessage } from "@slopus/happy-agent-client";
import type { ConversationServiceNoticeEntry } from "../conversation/conversationEntry.js";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import type { HappyAgentConnection } from "../happyAgentConnection/types.js";
import {
    fakeHappyAgentDaemonCreate,
    fakeRun,
    fakeUserMessage,
} from "../testing/fakeHappyAgentDaemon.js";
import { UserError } from "../types.js";
import { happyAgentChatStoreCreate } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* A failure card's Retry and Switch reach the daemon for the service message
 * the card was projected from, and the answer alone resolves the card. */

const FAILURE: MessageFailure = {
    kind: "usage_limit",
    provider: { id: "claude", type: "claude", vendorName: "Claude", label: "claude" },
    resetsAt: 1_792_449_600_000,
    message: "Claude usage limit reached.",
    fallbackProviders: [
        {
            providerId: "claude_work",
            providerLabel: "claude_work",
            modelId: "anthropic/opus-5-5",
            usedPercent: 38,
            usageWindow: "weekly",
            group: "same_model",
        },
    ],
};

const FAILED: ServiceMessage = {
    id: "message-failed",
    role: "service",
    createdAt: 2,
    content: [{ type: "text", text: "Claude usage limit reached." }],
    metadata: {},
    failure: FAILURE,
};

const openConnections: HappyAgentConnection[] = [];

afterEach(() => {
    for (const connection of openConnections.splice(0)) connection.close();
});

function harness(failed: ServiceMessage = FAILED) {
    const daemon = fakeHappyAgentDaemonCreate();
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    daemon.historySet("agent-a", [
        fakeRun({
            id: "run-1",
            status: "failed",
            messages: [fakeUserMessage({ id: "message-1", status: "accepted" }), failed],
        }),
    ]);
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
    const card = (): ConversationServiceNoticeEntry | undefined => {
        for (const entry of store.get().entries)
            if (entry.kind === "notice" && entry.variant === "notice" && entry.failure)
                return entry;
        return undefined;
    };
    const dispose = () => {
        store[Symbol.dispose]();
        unsubscribe();
    };
    return { daemon, store, card, dispose };
}

describe("failure card actions", () => {
    it("retries the failed message and shows the card as retried", async () => {
        const { daemon, store, card, dispose } = harness();
        await vi.waitFor(() => expect(card()).toBeDefined());
        expect(card()!.source?.messageId).toBe("message-failed");

        await store.failureRetry(card()!.id);
        await vi.waitFor(() =>
            expect(card()!.failure!.resolution).toEqual({ action: "retried", at: 1 }),
        );

        const calls = daemon.calls.filter((call) => call.method === "retryFailedTurn");
        expect(calls).toHaveLength(1);
        expect(calls[0]!.args[0]).toBe("agent-a");
        expect(calls[0]!.args[1]).toBe("message-failed");
        expect(calls[0]!.args[2]).toEqual({ mutationId: expect.any(String) });
        dispose();
    });

    it("switches to the chosen fallback and names it on the card", async () => {
        const { daemon, store, card, dispose } = harness();
        await vi.waitFor(() => expect(card()).toBeDefined());
        const target = card()!.failure!.fallbackProviders[0]!;

        await store.failureSwitch(card()!.id, target);
        await vi.waitFor(() =>
            expect(card()!.failure!.resolution).toMatchObject({
                action: "switched",
                providerId: "claude_work",
                providerLabel: "claude_work",
                modelId: "anthropic/opus-5-5",
            }),
        );

        const calls = daemon.calls.filter((call) => call.method === "switchAndContinue");
        expect(calls).toHaveLength(1);
        expect(calls[0]!.args.slice(0, 2)).toEqual(["agent-a", "message-failed"]);
        expect(calls[0]!.args[2]).toEqual({
            providerId: "claude_work",
            modelId: "anthropic/opus-5-5",
            mutationId: expect.any(String),
        });
        dispose();
    });

    it("refuses an already handled failure without reaching the daemon", async () => {
        const { daemon, store, card, dispose } = harness({
            ...FAILED,
            failure: { ...FAILURE, resolution: { action: "retried", at: 1 } },
        });
        await vi.waitFor(() => expect(card()).toBeDefined());

        await expect(store.failureRetry(card()!.id)).rejects.toBeInstanceOf(UserError);
        await expect(
            store.failureSwitch(card()!.id, card()!.failure!.fallbackProviders[0]!),
        ).rejects.toThrow("This failure has already been handled.");
        await expect(store.failureRetry("no-such-entry")).rejects.toThrow(
            "This failure is no longer in the conversation.",
        );
        expect(daemon.callCount("retryFailedTurn")).toBe(0);
        expect(daemon.callCount("switchAndContinue")).toBe(0);
        dispose();
    });
});
