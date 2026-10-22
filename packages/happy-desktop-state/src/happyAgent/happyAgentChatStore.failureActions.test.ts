import { afterEach, describe, expect, it, vi } from "vitest";
import {
    HappyAgentApiError,
    type DaemonConfig,
    type MessageFailure,
    type MessageMode,
    type ServiceMessage,
} from "@slopus/happy-agent-client";
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
    // A daemon from protocol 32 stores no targets; the card's come from the live catalog.
    fallbackProviders: [],
};

/** Routes the live catalog below offers, as the model picker lists them. */
const CLAUDE_WORK = { providerId: "claude_work", modelId: "anthropic/opus-5-5" } as const;
const CODEX_FALLBACK = { providerId: "codex_fallback", modelId: "openai/gpt-5-codex" } as const;

const FAILED_MODE: MessageMode = {
    providerId: "claude",
    modelId: "anthropic/opus-5-5",
    effort: "max",
    permissionMode: "full_access",
    serviceTier: "fast",
};

function switchConfigOf(base: DaemonConfig, team: boolean): DaemonConfig {
    return {
        ...base,
        ...(team
            ? {
                  team: {
                      currentUserId: "user-1",
                      id: "team-1",
                      name: "Happy",
                      role: "member" as const,
                  },
              }
            : {}),
        defaults: {
            providerId: "claude",
            modelId: "anthropic/opus-5-5",
            effort: "high",
            permissionMode: "auto",
        },
        models: {
            ...base.models,
            "anthropic/opus-5-5": {
                autoCompactWindow: 160_000,
                contextWindow: 200_000,
                defaultEffort: "high",
                efforts: ["low", "medium", "high", "max"],
                name: "Claude Opus 5.5",
                serviceTiers: ["fast"],
                serviceTierOptions: [
                    { id: null, label: "Regular" },
                    { id: "fast", label: "Fast" },
                ],
            },
            "openai/gpt-5-codex": {
                autoCompactWindow: 160_000,
                contextWindow: 200_000,
                defaultEffort: "medium",
                efforts: ["low", "medium"],
                name: "GPT-5 Codex",
                serviceTiers: [],
                serviceTierOptions: [{ id: null, label: "Regular" }],
            },
        },
        providers: {
            ...base.providers,
            claude: {
                enabled: true,
                models: [{ enabled: true, id: "anthropic/opus-5-5" }],
                type: "claude",
            },
            claude_work: {
                enabled: true,
                models: [{ enabled: true, id: "anthropic/opus-5-5" }],
                type: "claude",
            },
            codex_fallback: {
                enabled: true,
                models: [{ enabled: true, id: "openai/gpt-5-codex" }],
                type: "codex",
            },
        },
    };
}

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

function harness(
    failed: ServiceMessage = FAILED,
    options?: { readonly team?: boolean; readonly draftText?: string },
) {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.configSet(switchConfigOf(daemon.configGet(), options?.team === true));
    const project = daemon.projectSeed({ id: "project-a" });
    daemon.agentSeed(project.id, { id: "agent-a" });
    daemon.agentSeed(project.id, { id: "subagent-1", parentAgentId: "agent-a" });
    daemon.modeSeed("agent-a", FAILED_MODE);
    daemon.modeSeed("subagent-1", FAILED_MODE);
    daemon.draftSeed("agent-a", {
        value: { ...FAILED_MODE, text: options?.draftText ?? "" },
        updatedAt: 10,
    });
    daemon.historySet("agent-a", [
        fakeRun({
            id: "run-1",
            status: "failed",
            messages: [
                fakeUserMessage({ id: "message-1", status: "accepted", mode: FAILED_MODE }),
                failed,
            ],
        }),
    ]);
    const connectFresh = (): HappyAgentConnection => {
        const fresh = connectHappyAgent({
            endpoint: "http://happy-agent.test/",
            token: "token",
            client: daemon.client,
            wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
            now: () => 1_000,
        });
        openConnections.push(fresh);
        fresh.connectGroups({ onChange: () => undefined, onError: () => undefined });
        return fresh;
    };
    const connection = connectFresh();
    const openStoreOn = (conn: HappyAgentConnection = connection) => {
        const nextStore = happyAgentChatStoreCreate("agent-a" as HappyAgentSessionId, {
            catalog: happyAgentModelCatalogProject(daemon.configGet()),
            transcriptConnect: (connectOptions) => {
                const session = conn.connectSession({
                    sessionId: connectOptions.sessionId,
                    onChange: (elements, state) => connectOptions.onChange(elements, state, []),
                    onError: connectOptions.onError,
                });
                return {
                    close: () => session.close(),
                    loadMore: (token) => session.loadMore(token),
                };
            },
            connectActions: conn,
            connectMutationSubscribe: () => () => undefined,
            daemonProtocol: () => conn.sync.health()?.version.protocol,
        });
        const nextUnsubscribe = nextStore.subscribe(() => undefined);
        const nextCard = (messageId?: string): ConversationServiceNoticeEntry | undefined => {
            for (const entry of nextStore.get().entries)
                if (
                    entry.kind === "notice" &&
                    entry.variant === "notice" &&
                    entry.failure &&
                    (messageId === undefined || entry.source?.messageId === messageId)
                )
                    return entry;
            return undefined;
        };
        const nextDispose = () => {
            nextStore[Symbol.dispose]();
            nextUnsubscribe();
        };
        return { store: nextStore, card: nextCard, dispose: nextDispose };
    };
    const { store, card, dispose } = openStoreOn(connection);
    return { daemon, connection, store, card, dispose, openStoreOn, connectFresh };
}

describe("failure card actions", () => {
    it("offers switching only to a daemon that checks the route against its live catalog", async () => {
        for (const [protocol, supported] of [
            [31, false],
            [32, true],
        ] as const) {
            const { daemon, connectFresh, openStoreOn, dispose } = harness();
            dispose();
            daemon.healthSet({ protocol });
            const opened = openStoreOn(connectFresh());
            await vi.waitFor(() => expect(opened.card()).toBeDefined());
            expect(opened.store.get().failureSwitchSupported, String(protocol)).toBe(supported);
            // Nothing the failure carries is a target: the card's come from the picker's catalog.
            expect(opened.card()!.failure).not.toHaveProperty("fallbackProviders");
            opened.dispose();
        }
    });

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

    it("switches to the chosen catalog route and names it on the card", async () => {
        const { daemon, store, card, dispose } = harness();
        await vi.waitFor(() => expect(card()).toBeDefined());
        const target = CLAUDE_WORK;

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
        await expect(store.failureSwitch(card()!.id, CLAUDE_WORK)).rejects.toThrow(
            "This failure has already been handled.",
        );
        await expect(store.failureRetry("no-such-entry")).rejects.toThrow(
            "This failure is no longer in the conversation.",
        );
        expect(daemon.callCount("retryFailedTurn")).toBe(0);
        expect(daemon.callCount("switchAndContinue")).toBe(0);
        dispose();
    });

    it("adopts the switched mode for the composer, saved draft, reopened store, and next send while leaving child subagents on their own route", async () => {
        for (const team of [false, true] as const) {
            const { daemon, connection, store, card, dispose, openStoreOn, connectFresh } = harness(
                FAILED,
                {
                    team,
                    draftText: "Original unsent draft",
                },
            );
            let subagentSession:
                | { readonly providerId?: string; readonly modelId?: string }
                | undefined;
            const subagentConn = connection.connectSession({
                sessionId: "subagent-1",
                onChange: (_elements, state) => {
                    subagentSession = state;
                },
                onError: () => undefined,
            });
            await vi.waitFor(() => {
                expect(card("message-failed")).toBeDefined();
                expect(store.get().draft).toBe("Original unsent draft");
                expect(store.get().session).toMatchObject({
                    type: "ready",
                    value: {
                        providerId: "claude",
                        modelId: "anthropic/opus-5-5",
                        effort: "max",
                        permissionMode: "full_access",
                        serviceTier: "fast",
                    },
                });
                expect(subagentSession).toMatchObject({
                    providerId: "claude",
                    modelId: "anthropic/opus-5-5",
                });
            });

            // Even if `intendedModes` held the failed route from an earlier picker interaction,
            // switching from the failure card must replace it so the next send uses the new route.
            await store.modelChange({ providerId: "claude", modelId: "anthropic/opus-5-5" });
            const getModeCallsBefore = daemon.callCount("getAgentMode");

            // 1. Switch to `claude_work` / `anthropic/opus-5-5`, which supports both `effort: "max"`
            //    and `serviceTier: "fast"`.
            await store.failureSwitch(card("message-failed")!.id, CLAUDE_WORK);
            await vi.waitFor(async () => {
                expect(daemon.callCount("getAgentMode")).toBeGreaterThan(getModeCallsBefore);
                expect(store.get().session).toMatchObject({
                    type: "ready",
                    value: {
                        providerId: "claude_work",
                        modelId: "anthropic/opus-5-5",
                        effort: "max",
                        permissionMode: "full_access",
                        serviceTier: "fast",
                    },
                });
                const savedBootstrap = await daemon.client.getAgentBootstrap("agent-a");
                expect(savedBootstrap.draft).toEqual({
                    value: {
                        text: "Original unsent draft",
                        providerId: "claude_work",
                        modelId: "anthropic/opus-5-5",
                        effort: "max",
                        permissionMode: "full_access",
                        serviceTier: "fast",
                    },
                    updatedAt: expect.any(Number),
                });
            });

            // Dispose the original store, then open a new store on the same connection AND
            // a new store on a fresh `connectHappyAgent` to prove B survives reload/reopen.
            dispose();
            const reopenedSame = openStoreOn(connection);
            const reopenedFresh = openStoreOn(connectFresh());
            await vi.waitFor(() => {
                for (const candidate of [reopenedSame.store, reopenedFresh.store]) {
                    expect(candidate.get().draft).toBe("Original unsent draft");
                    expect(candidate.get().session).toMatchObject({
                        type: "ready",
                        value: {
                            providerId: "claude_work",
                            modelId: "anthropic/opus-5-5",
                            effort: "max",
                            permissionMode: "full_access",
                            serviceTier: "fast",
                        },
                    });
                }
            });

            await reopenedFresh.store.messageSend("Follow up from fresh connection");
            await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
            const freshSend = daemon.calls.find((call) => call.method === "sendMessage")!;
            expect(freshSend.args[0]).toBe("agent-a");
            expect(freshSend.args[1]).toMatchObject({
                mode: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
            reopenedFresh.dispose();

            await reopenedSame.store.messageSend("Follow up on claude_work");
            await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(2));
            const firstSend = daemon.calls.filter((call) => call.method === "sendMessage")[1]!;
            expect(firstSend.args[0]).toBe("agent-a");
            expect(firstSend.args[1]).toMatchObject({
                mode: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
            // Child subagent stays on its own route.
            expect(subagentSession).toMatchObject({
                providerId: "claude",
                modelId: "anthropic/opus-5-5",
            });

            // 2. Append a second failure on `claude_work` and switch to `codex_fallback` /
            //    `openai/gpt-5-codex`, which does not support `effort: "max"` or `serviceTier: "fast"`.
            //    `effort` falls back to `defaultEffort` ("medium"), `serviceTier` becomes `null`,
            //    and `permissionMode` ("full_access") is preserved.
            const secondFailed: ServiceMessage = {
                ...FAILED,
                id: "message-failed-2",
                createdAt: 4,
            };
            const currentRuns = daemon.historyGet("agent-a").runs;
            const secondUser = fakeUserMessage({
                id: "message-2",
                status: "accepted",
                createdAt: 3,
                runId: "run-2",
                mode: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
            const secondRun = fakeRun({
                id: "run-2",
                status: "failed",
                startedAt: 3,
                messages: [secondUser, secondFailed],
            });
            daemon.historySet("agent-a", [...currentRuns, secondRun]);
            daemon.eventEmit("run.started", {
                agentId: "agent-a",
                run: secondRun,
                acceptedMessageIds: [secondUser.id],
            });
            daemon.eventEmit("message.updated", {
                agentId: "agent-a",
                runId: "run-2",
                message: secondUser,
            });
            daemon.eventEmit("message.updated", {
                agentId: "agent-a",
                runId: "run-2",
                message: secondFailed,
            });
            await vi.waitFor(() => expect(reopenedSame.card("message-failed-2")).toBeDefined());

            await reopenedSame.store.failureSwitch(
                reopenedSame.card("message-failed-2")!.id,
                CODEX_FALLBACK,
            );
            await vi.waitFor(async () => {
                const session = reopenedSame.store.get().session;
                expect(session).toMatchObject({
                    type: "ready",
                    value: {
                        providerId: "codex_fallback",
                        modelId: "openai/gpt-5-codex",
                        effort: "medium",
                        permissionMode: "full_access",
                    },
                });
                expect(
                    session.type === "ready" ? session.value.serviceTier : "loading",
                ).toBeUndefined();
                const savedBootstrap = await daemon.client.getAgentBootstrap("agent-a");
                expect(savedBootstrap.draft).toEqual({
                    value: {
                        text: "Original unsent draft",
                        providerId: "codex_fallback",
                        modelId: "openai/gpt-5-codex",
                        effort: "medium",
                        permissionMode: "full_access",
                        serviceTier: null,
                    },
                    updatedAt: expect.any(Number),
                });
            });

            await reopenedSame.store.messageSend("Follow up on codex_fallback");
            await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(3));
            const secondSend = daemon.calls.filter((call) => call.method === "sendMessage")[2]!;
            expect(secondSend.args[1]).toMatchObject({
                mode: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                    serviceTier: null,
                },
            });

            subagentConn.close();
            reopenedSame.dispose();
        }
    });

    it("reconciles a pending or draining-held draft save to the switched mode with the same text, updatedAt, and mutationId", async () => {
        // Subcase (a): A debounced (`pendingDraftSaves`) draft edit is reconciled in place before flushing.
        {
            const { daemon, store, card, dispose } = harness();
            await vi.waitFor(() => expect(card()).toBeDefined());

            await store.draftSet("Typed before switching route", 700, "window-1");
            expect(daemon.callCount("saveAgentDraft")).toBe(0);

            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBe(1));

            const saveCall = daemon.calls.find((call) => call.method === "saveAgentDraft")!;
            expect(saveCall.args[0]).toBe("agent-a");
            expect(saveCall.args[1]).toEqual({
                draft: {
                    text: "Typed before switching route",
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
                updatedAt: 700,
                mutationId: expect.any(String),
            });
            dispose();
        }

        // Subcase (b): A draining-held (`heldDraftSaves`) draft save preserves its text, updatedAt,
        // and exact `mutationId`, and flushes with the switched mode once the stream reconnects.
        {
            const { daemon, store, card, dispose } = harness();
            await vi.waitFor(() => expect(card()).toBeDefined());

            daemon.failOnce(
                "saveAgentDraft",
                new HappyAgentApiError(503, "Happy Agent is draining.", "draining", null),
            );
            await store.draftSet("Held across draining and switch", 850, "window-1");
            await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBe(1));

            const firstAttempt = daemon.calls.find((call) => call.method === "saveAgentDraft")!;
            const firstPayload = firstAttempt.args[1] as {
                readonly draft: {
                    readonly text: string;
                    readonly providerId: string;
                };
                readonly updatedAt: number;
                readonly mutationId: string;
            };
            expect(firstPayload.draft.providerId).toBe("claude");
            expect(firstPayload.draft.text).toBe("Held across draining and switch");
            expect(firstPayload.updatedAt).toBe(850);

            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() =>
                expect(card()!.failure!.resolution).toMatchObject({
                    action: "switched",
                    providerId: "claude_work",
                }),
            );

            // Replace the draining daemon process so the new stream flushes `heldDraftSaves`.
            daemon.daemonReplace();
            await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBe(2));

            const secondAttempt = daemon.calls.filter(
                (call) => call.method === "saveAgentDraft",
            )[1]!;
            expect(secondAttempt.args[0]).toBe("agent-a");
            expect(secondAttempt.args[1]).toEqual({
                draft: {
                    text: "Held across draining and switch",
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
                updatedAt: 850,
                mutationId: firstPayload.mutationId,
            });
            dispose();
        }
    });

    it("keeps the switched mode when an in-flight or unpatched getAgentMode answers with the old route", async () => {
        // Subcase (a): An in-flight `getAgentMode` started before `failureSwitch` resolves after the switch.
        {
            const { daemon, store, card, dispose } = harness();
            await vi.waitFor(() => expect(card()).toBeDefined());

            const releaseModeRead = daemon.pause("getAgentMode");
            // Trigger a non-user message acceptance so `getAgentMode` starts before the switch and captures `FAILED_MODE`.
            daemon.eventEmit("run.started", {
                agentId: "agent-a",
                run: fakeRun({
                    id: "run-peer-1",
                    status: "running",
                    startedAt: 3,
                    messages: [],
                }),
                acceptedMessageIds: ["message-agent-1"],
            });
            await vi.waitFor(() => expect(daemon.callCount("getAgentMode")).toBe(1));

            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() =>
                expect(store.get().session).toMatchObject({
                    type: "ready",
                    value: {
                        providerId: "claude_work",
                        modelId: "anthropic/opus-5-5",
                    },
                }),
            );

            // Seed the stale mode right before releasing so the pre-switch read answers with `claude`.
            daemon.modeSeed("agent-a", FAILED_MODE);
            releaseModeRead();
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(store.get().session).toMatchObject({
                type: "ready",
                value: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
            await store.messageSend("Still on claude_work after stale getAgentMode");
            await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
            const sendCall = daemon.calls.find((call) => call.method === "sendMessage")!;
            expect(sendCall.args[1]).toMatchObject({
                mode: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
            dispose();
        }

        // Subcase (b): An unpatched daemon whose post-switch `getAgentMode` still answers with the old route `claude`.
        {
            const { daemon, store, card, dispose } = harness();
            await vi.waitFor(() => expect(card()).toBeDefined());

            const releaseModeRead = daemon.pause("getAgentMode");
            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() => expect(daemon.callCount("getAgentMode")).toBe(1));

            // Simulate an unpatched daemon where `switchAndContinue` did not update `metadata.lastMode`.
            daemon.modeSeed("agent-a", FAILED_MODE);
            releaseModeRead();
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(store.get().session).toMatchObject({
                type: "ready",
                value: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
            await store.messageSend("Still on claude_work on unpatched daemon");
            await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
            const sendCall = daemon.calls.find((call) => call.method === "sendMessage")!;
            expect(sendCall.args[1]).toMatchObject({
                mode: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
            dispose();
        }
    });

    it("adopts effort and serviceTier from getAgentMode when the server switch mode differs from the local estimate", async () => {
        const { daemon, connection, store, card, dispose, openStoreOn, connectFresh } = harness(
            FAILED,
            {
                draftText: "Draft kept across server mode refinement",
            },
        );
        await vi.waitFor(() => expect(card()).toBeDefined());

        const currentConfig = daemon.configGet();
        daemon.configSet({
            ...currentConfig,
            providers: {
                ...currentConfig.providers,
                claude_work: {
                    enabled: true,
                    type: "claude",
                    models: [
                        {
                            enabled: true,
                            id: "anthropic/opus-5-5",
                            efforts: ["low"],
                            defaultEffort: "low",
                            serviceTierOptions: [{ id: null, label: "Regular" }],
                        },
                    ],
                },
            },
        });
        const releaseModeRead = daemon.pause("getAgentMode");
        await store.failureSwitch(card()!.id, CLAUDE_WORK);
        await vi.waitFor(() => {
            expect(daemon.callCount("getAgentMode")).toBe(1);
            expect(store.get().session).toMatchObject({
                type: "ready",
                value: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
        });

        // Server's authoritative `/mode` for the switched route `claude_work` carries a different
        // `effort` ("low") and `serviceTier` (`null`) than `switchedModeOf` locally estimated.
        releaseModeRead();

        await vi.waitFor(async () => {
            const session = store.get().session;
            expect(session).toMatchObject({
                type: "ready",
                value: {
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "low",
                    permissionMode: "full_access",
                },
            });
            expect(
                session.type === "ready" ? session.value.serviceTier : "loading",
            ).toBeUndefined();
            const savedBootstrap = await daemon.client.getAgentBootstrap("agent-a");
            expect(savedBootstrap.draft).toEqual({
                value: {
                    text: "Draft kept across server mode refinement",
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    effort: "low",
                    permissionMode: "full_access",
                    serviceTier: null,
                },
                updatedAt: expect.any(Number),
            });
        });

        await store.messageSend("Send after server mode refinement");
        await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
        const sendCall = daemon.calls.find((call) => call.method === "sendMessage")!;
        expect(sendCall.args[1]).toMatchObject({
            mode: {
                providerId: "claude_work",
                modelId: "anthropic/opus-5-5",
                effort: "low",
                permissionMode: "full_access",
                serviceTier: null,
            },
        });

        dispose();
        const reopenedSame = openStoreOn(connection);
        const reopenedFresh = openStoreOn(connectFresh());
        await vi.waitFor(() => {
            for (const candidate of [reopenedSame.store, reopenedFresh.store]) {
                expect(candidate.get().draft).toBe("Draft kept across server mode refinement");
                const session = candidate.get().session;
                expect(session).toMatchObject({
                    type: "ready",
                    value: {
                        providerId: "claude_work",
                        modelId: "anthropic/opus-5-5",
                        effort: "low",
                        permissionMode: "full_access",
                    },
                });
                expect(
                    session.type === "ready" ? session.value.serviceTier : "loading",
                ).toBeUndefined();
            }
        });
        reopenedSame.dispose();
        reopenedFresh.dispose();
    });

    it("leaves composer mode, stored mode, daemon draft, and earlier manual intent unchanged when switchAndContinue is rejected or already resolved", async () => {
        // Subcase (a): `switchAndContinue` is rejected with 400 and then 409 (already resolved on server)
        // when no manual intent is active.
        {
            const { daemon, connection, store, card, dispose, openStoreOn, connectFresh } = harness(
                FAILED,
                {
                    draftText: "Draft before rejected switch",
                },
            );
            await vi.waitFor(() => expect(card()).toBeDefined());

            daemon.failOnce(
                "switchAndContinue",
                new HappyAgentApiError(
                    400,
                    "Fallback provider is not available.",
                    "invalid_request",
                    null,
                ),
            );
            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() => expect(daemon.callCount("switchAndContinue")).toBe(1));

            // Mark the failure resolved on the daemon without emitting SSE yet, so a second attempt answers 409.
            daemon.historySet("agent-a", [
                fakeRun({
                    id: "run-1",
                    status: "failed",
                    messages: [
                        fakeUserMessage({ id: "message-1", status: "accepted", mode: FAILED_MODE }),
                        {
                            ...FAILED,
                            failure: {
                                ...FAILURE,
                                resolution: { action: "retried", at: 1 },
                            },
                        },
                    ],
                }),
            ]);
            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() => expect(daemon.callCount("switchAndContinue")).toBe(2));
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(store.get().session).toMatchObject({
                type: "ready",
                value: {
                    providerId: "claude",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });
            expect(daemon.callCount("saveAgentDraft")).toBe(0);
            const savedBootstrap = await daemon.client.getAgentBootstrap("agent-a");
            expect(savedBootstrap.draft).toEqual({
                value: {
                    ...FAILED_MODE,
                    text: "Draft before rejected switch",
                },
                updatedAt: 10,
            });

            // A later unrelated `/mode` refetch or replay of an already-resolved switch message
            // does not adopt `claude_work` because the pending switch key was cleaned up.
            daemon.eventEmit("run.started", {
                agentId: "agent-a",
                run: fakeRun({
                    id: "run-peer-1",
                    status: "running",
                    startedAt: 3,
                    messages: [],
                }),
                acceptedMessageIds: ["message-agent-1"],
            });
            await vi.waitFor(() => expect(daemon.callCount("getAgentMode")).toBe(1));
            daemon.eventEmit("message.updated", {
                agentId: "agent-a",
                runId: "run-0",
                message: {
                    ...FAILED,
                    id: "message-failed-older",
                    createdAt: 0,
                    failure: {
                        ...FAILURE,
                        resolution: {
                            action: "switched",
                            providerId: "claude_work",
                            modelId: "anthropic/opus-5-5",
                            at: 1,
                        },
                    },
                },
            });
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(store.get().session).toMatchObject({
                type: "ready",
                value: {
                    providerId: "claude",
                    modelId: "anthropic/opus-5-5",
                    effort: "max",
                    permissionMode: "full_access",
                    serviceTier: "fast",
                },
            });

            dispose();
            const reopenedSame = openStoreOn(connection);
            const reopenedFresh = openStoreOn(connectFresh());
            await vi.waitFor(() => {
                for (const candidate of [reopenedSame.store, reopenedFresh.store]) {
                    expect(candidate.get().session).toMatchObject({
                        type: "ready",
                        value: {
                            providerId: "claude",
                            modelId: "anthropic/opus-5-5",
                            effort: "max",
                            permissionMode: "full_access",
                            serviceTier: "fast",
                        },
                    });
                }
            });
            reopenedSame.dispose();
            reopenedFresh.dispose();
        }

        // Subcase (b): An earlier manual intent (`codex_fallback`) is still pending in `intendedModes`
        // when `switchAndContinue` is rejected with 409; the failure callback restores `intendedModes`
        // and `modeRevisions` so the manual intent still wins over `agentModes` and a later `/mode` refetch.
        {
            const { daemon, store, card, dispose } = harness(FAILED, {
                draftText: "Draft with earlier manual intent",
            });
            await vi.waitFor(() => expect(card()).toBeDefined());

            store.modelUpdate({
                providerId: "codex_fallback",
                modelId: "openai/gpt-5-codex",
            });
            await store.draftSet("Typed after manual picker choice", 1_500, "window-1");
            await vi.waitFor(() => expect(daemon.callCount("saveAgentDraft")).toBe(3));

            // Clear the draft value via a newer remote draft update while the view is open so
            // `intendedModes` is the sole holder of `codex_fallback` and `agentModes` holds `claude`.
            daemon.eventEmit("agent.draft.updated", {
                agentId: "agent-a",
                draft: { value: null, updatedAt: 2_000 },
            });

            daemon.failOnce(
                "switchAndContinue",
                new HappyAgentApiError(
                    409,
                    "This failure has already been resolved.",
                    "conflict",
                    null,
                ),
            );
            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() => expect(daemon.callCount("switchAndContinue")).toBe(1));

            // Trigger an unrelated `/mode` refetch that answers with `FAILED_MODE` (`claude`).
            // Because `intendedModes` was restored on `switchAndContinue` failure, `codex_fallback` still wins.
            daemon.eventEmit("run.started", {
                agentId: "agent-a",
                run: fakeRun({
                    id: "run-peer-2",
                    status: "running",
                    startedAt: 3,
                    messages: [],
                }),
                acceptedMessageIds: ["message-agent-2"],
            });
            await vi.waitFor(() => expect(daemon.callCount("getAgentMode")).toBe(1));
            await new Promise((resolve) => setTimeout(resolve, 20));

            const session = store.get().session;
            expect(session).toMatchObject({
                type: "ready",
                value: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                },
            });
            expect(
                session.type === "ready" ? session.value.serviceTier : "loading",
            ).toBeUndefined();

            await store.messageSend("Send with restored manual intent after 409 switch");
            await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
            const sendCall = daemon.calls.find((call) => call.method === "sendMessage")!;
            expect(sendCall.args[1]).toMatchObject({
                mode: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                    serviceTier: null,
                },
            });
            dispose();
        }
    });

    it("preserves a manual picker choice made while switchAndContinue or its getAgentMode refetch is in flight", async () => {
        // Subcase (a): User manually selects C (`codex_fallback`) while the A→B (`claude_work`)
        // `switchAndContinue` HTTP request is still in flight (including after C's draft save has settled).
        {
            const { daemon, connection, store, card, dispose, openStoreOn, connectFresh } = harness(
                FAILED,
                {
                    draftText: "Draft with manual C",
                },
            );
            await vi.waitFor(() => expect(card()).toBeDefined());

            const releaseSwitch = daemon.pause("switchAndContinue");
            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() => expect(daemon.callCount("switchAndContinue")).toBe(1));

            // User manually selects C while `switchAndContinue` is still in flight on the agent lane.
            store.modelUpdate({
                providerId: "codex_fallback",
                modelId: "openai/gpt-5-codex",
            });
            const beforeSwitchSession = store.get().session;
            expect(beforeSwitchSession).toMatchObject({
                type: "ready",
                value: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                },
            });
            expect(
                beforeSwitchSession.type === "ready"
                    ? beforeSwitchSession.value.serviceTier
                    : "loading",
            ).toBeUndefined();

            releaseSwitch();
            await vi.waitFor(() => {
                expect(card()!.failure!.resolution).toMatchObject({
                    action: "switched",
                    providerId: "claude_work",
                });
                expect(daemon.callCount("saveAgentDraft")).toBeGreaterThanOrEqual(1);
            });
            await new Promise((resolve) => setTimeout(resolve, 20));

            // Manual selection C wins over both the immediate adoption of B and any `/mode` refetch.
            const afterSwitchSession = store.get().session;
            expect(afterSwitchSession).toMatchObject({
                type: "ready",
                value: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                },
            });
            expect(
                afterSwitchSession.type === "ready"
                    ? afterSwitchSession.value.serviceTier
                    : "loading",
            ).toBeUndefined();
            await store.messageSend("Send with manual C after in-flight switchAndContinue");
            await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
            const sendCall = daemon.calls.find((call) => call.method === "sendMessage")!;
            expect(sendCall.args[1]).toMatchObject({
                mode: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                    serviceTier: null,
                },
            });

            // Reopening on both the same connection and a fresh `connectHappyAgent` still shows C.
            dispose();
            const reopenedSame = openStoreOn(connection);
            const reopenedFresh = openStoreOn(connectFresh());
            await vi.waitFor(() => {
                for (const candidate of [reopenedSame.store, reopenedFresh.store]) {
                    expect(candidate.get().draft).toBe("Draft with manual C");
                    const session = candidate.get().session;
                    expect(session).toMatchObject({
                        type: "ready",
                        value: {
                            providerId: "codex_fallback",
                            modelId: "openai/gpt-5-codex",
                            effort: "medium",
                            permissionMode: "full_access",
                        },
                    });
                    expect(
                        session.type === "ready" ? session.value.serviceTier : "loading",
                    ).toBeUndefined();
                }
            });
            reopenedSame.dispose();
            reopenedFresh.dispose();
        }

        // Subcase (b): `switchAndContinue` resolves and adopts B (`claude_work`), then while its
        // `getAgentMode` refetch is in flight, the user manually selects C (`codex_fallback`).
        {
            const { daemon, connection, store, card, dispose, openStoreOn, connectFresh } = harness(
                FAILED,
                {
                    draftText: "Draft with manual C",
                },
            );
            await vi.waitFor(() => expect(card()).toBeDefined());

            const releaseModeRead = daemon.pause("getAgentMode");
            await store.failureSwitch(card()!.id, CLAUDE_WORK);
            await vi.waitFor(() => {
                expect(daemon.callCount("getAgentMode")).toBe(1);
                expect(store.get().session).toMatchObject({
                    type: "ready",
                    value: {
                        providerId: "claude_work",
                        modelId: "anthropic/opus-5-5",
                    },
                });
            });

            // User manually selects C while `getAgentMode` (which captured B) is still in flight.
            await store.modelChange({
                providerId: "codex_fallback",
                modelId: "openai/gpt-5-codex",
            });
            releaseModeRead();
            await new Promise((resolve) => setTimeout(resolve, 20));

            const afterRefetchSession = store.get().session;
            expect(afterRefetchSession).toMatchObject({
                type: "ready",
                value: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                },
            });
            expect(
                afterRefetchSession.type === "ready"
                    ? afterRefetchSession.value.serviceTier
                    : "loading",
            ).toBeUndefined();
            await store.messageSend("Send with manual C after in-flight getAgentMode");
            await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
            const sendCall = daemon.calls.find((call) => call.method === "sendMessage")!;
            expect(sendCall.args[1]).toMatchObject({
                mode: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                    serviceTier: null,
                },
            });

            // Reopening on both the same connection and a fresh `connectHappyAgent` still shows C.
            dispose();
            const reopenedSame = openStoreOn(connection);
            const reopenedFresh = openStoreOn(connectFresh());
            await vi.waitFor(() => {
                for (const candidate of [reopenedSame.store, reopenedFresh.store]) {
                    expect(candidate.get().draft).toBe("Draft with manual C");
                    const session = candidate.get().session;
                    expect(session).toMatchObject({
                        type: "ready",
                        value: {
                            providerId: "codex_fallback",
                            modelId: "openai/gpt-5-codex",
                            effort: "medium",
                            permissionMode: "full_access",
                        },
                    });
                    expect(
                        session.type === "ready" ? session.value.serviceTier : "loading",
                    ).toBeUndefined();
                }
            });
            reopenedSame.dispose();
            reopenedFresh.dispose();
        }
    });

    it("does not adopt an already-resolved historic switch message over the current mode on open, reopen, gap reconnect, or event replay", async () => {
        const currentModeC: MessageMode = {
            providerId: "codex_fallback",
            modelId: "openai/gpt-5-codex",
            effort: "medium",
            permissionMode: "full_access",
            serviceTier: null,
        };
        const historicSwitchedMessage: ServiceMessage = {
            ...FAILED,
            failure: {
                ...FAILURE,
                resolution: {
                    action: "switched",
                    providerId: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    at: 1,
                },
            },
        };

        const daemon = fakeHappyAgentDaemonCreate();
        daemon.configSet(switchConfigOf(daemon.configGet(), false));
        const project = daemon.projectSeed({ id: "project-a" });
        daemon.agentSeed(project.id, { id: "agent-a" });
        daemon.modeSeed("agent-a", currentModeC);
        daemon.draftSeed("agent-a", {
            value: { ...currentModeC, text: "" },
            updatedAt: 20,
        });
        daemon.historySet("agent-a", [
            fakeRun({
                id: "run-1",
                status: "failed",
                messages: [
                    fakeUserMessage({ id: "message-1", status: "accepted", mode: FAILED_MODE }),
                    historicSwitchedMessage,
                ],
            }),
            fakeRun({
                id: "run-2",
                status: "completed",
                messages: [
                    fakeUserMessage({ id: "message-2", status: "accepted", mode: currentModeC }),
                ],
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

        const openStore = () => {
            const store = happyAgentChatStoreCreate("agent-a" as HappyAgentSessionId, {
                catalog: happyAgentModelCatalogProject(daemon.configGet()),
                transcriptConnect: (connectOptions) => {
                    const session = connection.connectSession({
                        sessionId: connectOptions.sessionId,
                        onChange: (elements, state) => connectOptions.onChange(elements, state, []),
                        onError: connectOptions.onError,
                    });
                    return {
                        close: () => session.close(),
                        loadMore: (token) => session.loadMore(token),
                    };
                },
                connectActions: connection,
                connectMutationSubscribe: () => () => undefined,
            });
            const unsubscribe = store.subscribe(() => undefined);
            return {
                store,
                dispose: () => {
                    store[Symbol.dispose]();
                    unsubscribe();
                },
            };
        };

        // 1. Initial history hydration keeps currentModeC (`codex_fallback`), not historic B (`claude_work`).
        const first = openStore();
        await vi.waitFor(() => {
            const firstSession = first.store.get().session;
            expect(firstSession).toMatchObject({
                type: "ready",
                value: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                },
            });
            expect(
                firstSession.type === "ready" ? firstSession.value.serviceTier : "loading",
            ).toBeUndefined();
        });
        expect(daemon.callCount("getAgentMode")).toBe(0);

        // 2. Reopen keeps currentModeC.
        first.dispose();
        const second = openStore();
        await vi.waitFor(() =>
            expect(second.store.get().session).toMatchObject({
                type: "ready",
                value: {
                    providerId: "codex_fallback",
                    modelId: "openai/gpt-5-codex",
                    effort: "medium",
                    permissionMode: "full_access",
                },
            }),
        );

        // 3. Gap reconnect re-hydrates history and still keeps currentModeC.
        const historyReadsBeforeGap = daemon.callCount("getMessages");
        daemon.gapOnNextStream();
        daemon.streamDropAll();
        await vi.waitFor(() =>
            expect(daemon.callCount("getMessages")).toBeGreaterThan(historyReadsBeforeGap),
        );
        expect(second.store.get().session).toMatchObject({
            type: "ready",
            value: {
                providerId: "codex_fallback",
                modelId: "openai/gpt-5-codex",
                effort: "medium",
                permissionMode: "full_access",
            },
        });

        // 4. Replay of `message.updated` for an already-resolved switch message (both already in memory
        //    and unseen in the current window) keeps currentModeC.
        daemon.eventEmit("message.updated", {
            agentId: "agent-a",
            runId: "run-1",
            message: historicSwitchedMessage,
        });
        daemon.eventEmit("message.updated", {
            agentId: "agent-a",
            runId: "run-0",
            message: {
                ...historicSwitchedMessage,
                id: "message-failed-older",
                createdAt: 0,
            },
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(second.store.get().session).toMatchObject({
            type: "ready",
            value: {
                providerId: "codex_fallback",
                modelId: "openai/gpt-5-codex",
                effort: "medium",
                permissionMode: "full_access",
            },
        });
        expect(daemon.callCount("getAgentMode")).toBe(0);

        await second.store.messageSend("Send on currentModeC after historic switch replay");
        await vi.waitFor(() => expect(daemon.callCount("sendMessage")).toBe(1));
        const sendCall = daemon.calls.find((call) => call.method === "sendMessage")!;
        expect(sendCall.args[1]).toMatchObject({
            mode: currentModeC,
        });
        second.dispose();
    });
});
