import { liveAppStateSchema } from "@slopus/happy-agent-client";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import type { ConversationSummary } from "../conversation/conversationSummary.js";
import type { HappyAgentModelStore } from "../happyAgent/happyAgentModelStore.js";
import type { HappyAgentWorkspaceStore } from "../happyAgent/happyAgentWorkspaceStore.js";
import { GPT_LIVE_APP_STATE_BYTES, gptLiveAppStateRead } from "./gptLiveAppState.js";
import { gptLiveSerializedBytes } from "./gptLiveDesktopContext.js";
import type { GptLiveDesktopConnection, GptLiveDesktopSource } from "./gptLiveDesktopSource.js";

const MINUTE = 60_000;

function summary(id: string, updatedAt = 0, title = id): ConversationSummary {
    return { id, title, activity: "idle", updatedAt, participants: [] };
}

function message(
    id: string,
    sender: "human" | "agent",
    text: string,
    generationStatus?: "streaming" | "complete",
): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        message: {
            id,
            text,
            sender: { kind: sender },
            ...(generationStatus ? { generationStatus } : {}),
        },
    } as unknown as ConversationEntry;
}

interface WorkspaceShape {
    readonly projects?: readonly unknown[];
    readonly bots?: readonly unknown[];
    readonly tasks?: readonly unknown[];
    readonly address?: { groupId?: string; conversationId?: string };
    readonly tabOrder?: readonly string[];
    readonly conversation?: unknown;
}

/** Only the fields the projection reads; everything else about a workspace is irrelevant here. */
function workspace(shape: WorkspaceShape): HappyAgentWorkspaceStore {
    const snapshot = {
        address: shape.address ?? {},
        tabOrder: shape.tabOrder ?? [],
        list: {
            projects: { type: "ready", value: shape.projects ?? [] },
            bots: shape.bots ?? [],
            tasks: shape.tasks ?? [],
        },
        conversation: shape.conversation ?? { type: "loading" },
    };
    return {
        get: () => snapshot,
        subscribe: () => () => {},
    } as unknown as HappyAgentWorkspaceStore;
}

function models(
    options: readonly {
        providerId: string;
        providerType?: string;
        modelId: string;
        disabled?: boolean;
        efforts?: readonly string[];
    }[],
): HappyAgentModelStore {
    const snapshot = {
        type: "ready",
        menus: {
            modelOptions: options.map((option) => ({
                providerId: option.providerId,
                modelId: option.modelId,
                name: option.modelId.toUpperCase(),
                providerType: option.providerType ?? "codex",
                disabled: option.disabled ?? false,
                current: false,
                efforts: (option.efforts ?? ["low"]).map((level) => ({ level, label: level })),
                defaultEffort: "low",
            })),
        },
    };
    return { get: () => snapshot, subscribe: () => () => {} } as unknown as HappyAgentModelStore;
}

function source(
    connections: readonly GptLiveDesktopConnection[],
    activeConnectionId: string | null = connections[0]?.id ?? null,
): GptLiveDesktopSource {
    return {
        get: () => ({ activeConnectionId, connections }),
        subscribe: () => () => {},
        targetOpen: () => {},
    };
}

const subtask = (workspaceId: string, conversationId: string) => ({
    workspaceId,
    path: `/tmp/${workspaceId}`,
    conversation: summary(conversationId),
    subtasks: [],
});

describe("GPT-Live AppState projection", () => {
    it("bounds model-heavy servers without projects and retains the selected server and picker order", () => {
        const catalog = models(
            Array.from({ length: 200 }, (_, i) => ({
                providerId: "codex",
                modelId: `model-${i}`,
                efforts: ["low", "medium", "high"],
            })),
        );
        const connections = Array.from({ length: 16 }, (_, i) => ({
            id: `server-${i}`,
            name: `Server ${i}`,
            kind: "remote" as const,
            online: true,
            models: catalog,
        }));
        const result = gptLiveAppStateRead(source(connections, "server-15"));
        expect(gptLiveSerializedBytes(result)).toBeLessThanOrEqual(GPT_LIVE_APP_STATE_BYTES);
        expect(result.truncated).toBe(true);
        expect(Value.Check(liveAppStateSchema, result)).toBe(true);
        expect(result.servers.map((item) => item.connectionId)).toEqual(
            connections.map((item) => item.id),
        );
        expect(result.servers.at(-1)!.models).toHaveLength(200);
        for (const server of result.servers)
            expect(server.models.map((item) => item.modelId)).toEqual(
                Array.from({ length: server.models.length }, (_, i) => `model-${i}`),
            );
    });

    it("bounds oversized list metadata, flags shortened text and preserves current focus", () => {
        const catalog = models(
            Array.from({ length: 200 }, (_, i) => ({
                providerId: "codex",
                modelId: `model-${i}`,
                efforts: Array(16).fill("x".repeat(1000)),
            })),
        );
        const result = gptLiveAppStateRead(
            source(
                Array.from({ length: 40 }, (_, i) => ({
                    id: `server-${i}`,
                    name: "界".repeat(1000),
                    kind: "remote" as const,
                    online: true,
                    models: catalog,
                    workspace: workspace({
                        projects: [{ id: "p", name: "Project", conversations: [], worktrees: [] }],
                        address: { groupId: "p" },
                    }),
                })),
                "server-39",
            ),
        );
        expect(gptLiveSerializedBytes(result)).toBeLessThanOrEqual(GPT_LIVE_APP_STATE_BYTES);
        expect(result.truncated).toBe(true);
        expect(result.focused?.target).toMatchObject({ connectionId: "server-39", groupId: "p" });
        expect(result.servers.at(-1)!.connectionId).toBe("server-39");
        expect(result.servers.at(-1)!.projects[0]!.name).toBe("Project");
        const small = gptLiveAppStateRead(
            source([{ id: "s", name: "x".repeat(1000), kind: "local", online: true }]),
        );
        expect(small.truncated).toBe(true);
        expect(small.servers[0]!.name).toHaveLength(256);
    });

    it("lists servers in directory order and each one's bots, then tasks, then projects, as the sidebar does", () => {
        const local = workspace({
            bots: [
                {
                    id: "bot-1",
                    workspaceId: "bot-ws-1",
                    name: "Release bot",
                    conversation: summary("bot-session-1", 5 * MINUTE + 59_999),
                    subtasks: [subtask("subtask-ws", "subtask-session")],
                },
            ],
            tasks: [
                {
                    id: "task-1",
                    workspaceId: "task-ws-1",
                    name: "Fix the login flow",
                    conversation: summary("task-session-1", 0),
                    subtasks: [subtask("task-subtask-ws", "task-subtask-session")],
                },
            ],
            projects: [
                {
                    id: "project-1",
                    name: "Happy",
                    conversations: [summary("s-a", MINUTE), summary("s-b", 2 * MINUTE)],
                    worktrees: [
                        {
                            id: "worktree-1",
                            name: "voice-v2",
                            lifecycle: { phase: "creating" },
                            conversations: [summary("w-a"), summary("w-b"), summary("w-c")],
                        },
                        // Owned by the bot's subtask: listed under the bot, never here.
                        {
                            id: "subtask-ws",
                            name: "subtask checkout",
                            lifecycle: { phase: "ready" },
                            conversations: [],
                        },
                        {
                            id: "task-subtask-ws",
                            name: "task subtask checkout",
                            lifecycle: { phase: "ready" },
                            conversations: [],
                        },
                    ],
                },
            ],
            address: { groupId: "worktree-1", conversationId: "w-b" },
            tabOrder: ["w-c", "w-a"],
        });
        const remote = workspace({
            projects: [{ id: "remote-project", name: "Server", conversations: [], worktrees: [] }],
        });
        const appState = gptLiveAppStateRead(
            source([
                {
                    id: "local",
                    name: "This Mac",
                    kind: "local",
                    online: true,
                    workspace: local,
                    models: models([
                        { providerId: "codex", modelId: "gpt-6.1-sol" },
                        { providerId: "codex", modelId: "switched-off", disabled: true },
                        {
                            providerId: "local-llm",
                            providerType: "local_llm",
                            modelId: "plain",
                            efforts: [],
                        },
                    ]),
                },
                {
                    id: "remote-1",
                    name: "Build box",
                    kind: "remote",
                    online: false,
                    workspace: remote,
                },
                { id: "remote-2", name: "Not yet", kind: "remote", online: false },
            ]),
        );
        expect(typeof appState.timeZone).toBe("string");
        expect(appState.timeZone.length).toBeGreaterThan(0);
        expect(appState.truncated).toBe(false);
        // The runtime ends a call on a frame outside the contract, so the projection must hold to it.
        expect(Value.Check(liveAppStateSchema, appState)).toBe(true);
        expect(
            appState.servers.map((server) => [server.connectionId, server.kind, server.catalog]),
        ).toEqual([
            ["local", "local", "ready"],
            ["remote-1", "remote", "ready"],
            ["remote-2", "remote", "loading"],
        ]);
        const [server] = appState.servers;
        expect(server!.bots).toEqual([
            {
                target: {
                    kind: "bot",
                    connectionId: "local",
                    groupId: "bot-ws-1",
                    sessionId: "bot-session-1",
                    botId: "bot-1",
                },
                name: "Release bot",
                status: "idle",
                // Floored to the minute; the voice side words it in `timeZone`.
                lastActivityAt: 5 * MINUTE,
            },
        ]);
        expect(server!.tasks).toEqual([
            {
                target: {
                    kind: "task",
                    connectionId: "local",
                    groupId: "task-ws-1",
                    sessionId: "task-session-1",
                    taskId: "task-1",
                },
                name: "Fix the login flow",
                status: "idle",
                lastActivityAt: null,
            },
        ]);
        expect(server!.projects).toHaveLength(1);
        const [project] = server!.projects;
        expect(project!.sessions.map((session) => session.target.sessionId)).toEqual([
            "s-a",
            "s-b",
        ]);
        // Subtask checkouts are left out; the open group's sessions follow its tab strip.
        expect(project!.workspaces.map((item) => item.target.workspaceId)).toEqual(["worktree-1"]);
        expect(project!.workspaces[0]!.status).toBe("preparing");
        expect(project!.workspaces[0]!.sessions.map((session) => session.target.sessionId)).toEqual(
            ["w-c", "w-a", "w-b"],
        );
        expect(JSON.stringify(appState)).not.toContain("subtask-session");
        expect(server!.models).toEqual([
            {
                providerId: "codex",
                providerName: "Codex",
                modelId: "gpt-6.1-sol",
                name: "GPT-6.1-SOL",
                efforts: ["low"],
                defaultEffort: "low",
            },
            // Named as the picker files it; a model without reasoning levels has no default one.
            {
                providerId: "local-llm",
                providerName: "Local Llm",
                modelId: "plain",
                name: "PLAIN",
                efforts: [],
                defaultEffort: null,
            },
        ]);
        expect(appState.servers[1]!.models).toEqual([]);
    });

    it("names what is on screen by the bot, task, project or workspace it belongs to", () => {
        const bots = [
            {
                id: "bot-1",
                workspaceId: "bot-ws",
                name: "Release bot",
                conversation: summary("bot-session"),
                subtasks: [],
            },
        ];
        const tasks = [
            {
                id: "task-1",
                workspaceId: "task-ws",
                name: "Fix the login flow",
                conversation: summary("task-session"),
                subtasks: [],
            },
        ];
        const projects = [
            {
                id: "project-1",
                name: "Happy",
                conversations: [],
                worktrees: [
                    {
                        id: "worktree-1",
                        name: "voice-v2",
                        lifecycle: { phase: "ready" },
                        conversations: [],
                    },
                ],
            },
        ];
        const focusOf = (address: { groupId?: string; conversationId?: string }) =>
            gptLiveAppStateRead(
                source([
                    {
                        id: "local",
                        name: "This Mac",
                        kind: "local",
                        online: true,
                        workspace: workspace({ bots, tasks, projects, address }),
                    },
                ]),
            ).focused;
        expect(focusOf({ groupId: "bot-ws", conversationId: "bot-session" })).toMatchObject({
            target: { kind: "bot", botId: "bot-1" },
            title: "Release bot",
            latestMessage: { state: "notLoaded" },
        });
        expect(focusOf({ groupId: "task-ws", conversationId: "task-session" })).toMatchObject({
            target: { kind: "task", taskId: "task-1" },
            title: "Fix the login flow",
        });
        expect(focusOf({ groupId: "project-1" })).toEqual({
            target: {
                kind: "project",
                connectionId: "local",
                projectId: "project-1",
                groupId: "project-1",
            },
            title: "Happy",
            latestMessage: { state: "empty" },
        });
        expect(focusOf({ groupId: "worktree-1" })).toMatchObject({
            target: { kind: "workspace", workspaceId: "worktree-1" },
            title: "voice-v2",
        });
        expect(focusOf({})).toBeNull();
        // Nothing is focused while the window shows no Happy Agent at all.
        expect(
            gptLiveAppStateRead(
                source(
                    [
                        {
                            id: "local",
                            name: "This Mac",
                            kind: "local",
                            online: true,
                            workspace: workspace({ projects, address: { groupId: "project-1" } }),
                        },
                    ],
                    null,
                ),
            ).focused,
        ).toBeNull();
    });

    it("reads the newest settled public message from what is loaded, and says when nothing is", () => {
        const focusWith = (entries: readonly ConversationEntry[], transcriptComplete: boolean) =>
            gptLiveAppStateRead(
                source([
                    {
                        id: "local",
                        name: "This Mac",
                        kind: "local",
                        online: true,
                        workspace: workspace({
                            projects: [
                                {
                                    id: "project-1",
                                    name: "Happy",
                                    conversations: [summary("session-1", 0, "Voice work")],
                                    worktrees: [],
                                },
                            ],
                            address: { groupId: "project-1", conversationId: "session-1" },
                            conversation: {
                                type: "ready",
                                value: {
                                    conversationId: "session-1",
                                    title: "Voice work",
                                    entries,
                                    transcriptComplete,
                                },
                            },
                        }),
                    },
                ]),
            ).focused?.latestMessage;
        expect(
            focusWith(
                [
                    message("m1", "human", "Please run the build."),
                    message("m2", "agent", "The build passed.", "complete"),
                    // Still arriving: not a message yet.
                    message("m3", "agent", "Now looking at", "streaming"),
                ],
                false,
            ),
        ).toEqual({
            state: "loaded",
            role: "assistant",
            text: "The build passed.",
            truncated: false,
        });
        expect(focusWith([message("m1", "human", "x".repeat(20_000))], true)).toMatchObject({
            state: "loaded",
            role: "user",
            truncated: true,
        });
        expect(focusWith([], true)).toEqual({ state: "empty" });
        // Older history may simply not be loaded: never claimed empty.
        expect(focusWith([], false)).toEqual({ state: "notLoaded" });
    });

    it("bounds every list and says so", () => {
        const appState = gptLiveAppStateRead(
            source([
                {
                    id: "local",
                    name: "This Mac",
                    kind: "local",
                    online: true,
                    workspace: workspace({
                        projects: Array.from({ length: 120 }, (_, index) => ({
                            id: `project-${index}`,
                            name: `Project ${index}`,
                            conversations: [],
                            worktrees: [],
                        })),
                        address: { groupId: "project-119" },
                    }),
                },
            ]),
        );
        expect(appState.servers[0]!.projects).toHaveLength(100);
        expect(appState.servers[0]!.projects.at(-1)!.target.projectId).toBe("project-119");
        expect(appState.focused?.target).toMatchObject({ projectId: "project-119" });
        expect(appState.truncated).toBe(true);
        expect(Value.Check(liveAppStateSchema, appState)).toBe(true);
    });
});
