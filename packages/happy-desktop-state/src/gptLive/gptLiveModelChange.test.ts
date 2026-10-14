import { expect, it, vi } from "vitest";
import type { LiveControlClientMessage } from "@slopus/happy-agent-client";
import { connectHappyAgent } from "../happyAgentConnection/connectHappyAgent.js";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChatStoreCreate } from "../happyAgent/happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "../happyAgent/happyAgentProject.js";
import type { HappyAgentSessionId } from "../happyAgent/happyAgentTypes.js";
import type { HappyAgentWorkspaceStore } from "../happyAgent/happyAgentWorkspaceStore.js";
import { GPT_LIVE_DESKTOP_CAPABILITIES, gptLiveControllerCreate } from "./gptLiveController.js";

function gateCreate() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

it.each([0, 1, 2, 3])(
    "waits for model, effort and tier saves and reports refusal at save %s",
    async (refusedSave) => {
        const daemon = fakeHappyAgentDaemonCreate();
        const config = daemon.configGet();
        daemon.configSet({
            ...config,
            models: { ...config.models, other: { ...config.models["test-model"]!, name: "Other" } },
            providers: {
                ...config.providers,
                "test-provider": {
                    ...config.providers["test-provider"]!,
                    models: [
                        { id: "test-model", enabled: true },
                        { id: "other", enabled: true },
                    ],
                },
            },
        });
        const project = daemon.projectSeed({ id: "p" });
        daemon.agentSeed(project.id, { id: "a" });
        using connection = {
            value: connectHappyAgent({
                endpoint: "http://happy-agent.test/",
                token: "token",
                client: daemon.client,
                wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
            }),
            [Symbol.dispose]() {
                this.value.close();
            },
        };
        connection.value.connectGroups({ onChange: () => {}, onError: () => {} });
        using chat = happyAgentChatStoreCreate("a" as HappyAgentSessionId, {
            catalog: happyAgentModelCatalogProject(daemon.configGet()),
            transcriptConnect: (options) => {
                const session = connection.value.connectSession({
                    sessionId: options.sessionId,
                    onChange: (elements, state) => options.onChange(elements, state, []),
                    onError: options.onError,
                });
                return {
                    close: () => session.close(),
                    loadMore: (token) => session.loadMore(token),
                };
            },
            connectActions: connection.value,
            connectMutationSubscribe: () => () => {},
            modelSelect: (current, input) => ({
                ...current,
                ...input,
                effort: "high",
                serviceTier: "priority",
            }),
        });
        const stop = chat.subscribe(() => {});
        await vi.waitFor(() => expect(chat.get().session.type).toBe("ready"));
        const gates = Array.from({ length: 3 }, gateCreate);
        const save = daemon.client.saveAgentDraft.bind(daemon.client);
        let call = 0;
        const saving = vi
            .spyOn(daemon.client, "saveAgentDraft")
            .mockImplementation(async (...args) => {
                const index = call++;
                await gates[index]!.promise;
                if (index + 1 === refusedSave) throw new Error("Model save refused.");
                return save(...args);
            });
        const workspace = {
            get: () => ({
                address: {},
                tabOrder: [],
                conversation: { type: "loading" },
                list: {
                    bots: [],
                    tasks: [],
                    projects: {
                        type: "ready",
                        value: [
                            {
                                id: "p",
                                name: "Project",
                                worktrees: [],
                                conversations: [
                                    {
                                        id: "a",
                                        title: "Agent",
                                        activity: "idle",
                                        updatedAt: 1,
                                        participants: [],
                                    },
                                ],
                            },
                        ],
                    },
                },
            }),
            subscribe: () => () => {},
            voiceSessionAcquire: async () => ({
                get: chat.get,
                subscribe: chat.subscribe,
                modelChange: chat.modelChange,
                [Symbol.dispose]: () => {},
            }),
        } as unknown as HappyAgentWorkspaceStore;
        const frames: LiveControlClientMessage[] = [];
        const controller = gptLiveControllerCreate({
            windowId: "w",
            capabilities: GPT_LIVE_DESKTOP_CAPABILITIES,
            source: {
                get: () => ({
                    activeConnectionId: "local",
                    connections: [
                        {
                            id: "local",
                            name: "This Mac",
                            kind: "local",
                            online: true,
                            workspace,
                        },
                    ],
                }),
                subscribe: () => () => {},
                targetOpen: () => {},
            },
            send: (frame) => frames.push(frame),
            receive: () => {},
        });
        controller.start(GPT_LIVE_DESKTOP_CAPABILITIES);
        controller.actionReceive({
            type: "actionRequested",
            actionId: "model",
            contextRevision: controller.contextRead().revision,
            inputTranscriptIds: [],
            action: {
                type: "sessionModelChange",
                target: { connectionId: "local", groupId: "p", sessionId: "a" },
                providerId: "test-provider",
                modelId: "other",
            },
        });
        const result = () => frames.find((frame) => frame.type === "actionResult");
        for (let index = 0; index < 3; index++) {
            await vi.waitFor(() => expect(saving).toHaveBeenCalledTimes(index + 1));
            if (index === 0) {
                // Picker equality already holds, while the host has acknowledged nothing.
                expect(chat.get().menus?.currentModelId).toBe("other");
                expect(result()).toBeUndefined();
            } else if (refusedSave === 0 || refusedSave > index) expect(result()).toBeUndefined();
            gates[index]!.resolve();
        }
        await vi.waitFor(() => expect(result()).toBeDefined());
        expect(result()).toMatchObject({
            result:
                refusedSave === 0
                    ? { status: "succeeded", output: { type: "ack" } }
                    : { status: "refused", code: "failed", message: "Model save refused." },
        });
        expect(daemon.callCount("sendMessage")).toBe(0);
        controller.close();
        stop();
    },
);
