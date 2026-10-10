import { describe, expect, it } from "vitest";
import type { HappyAgentProjectGroup } from "../happyAgent/happyAgentProjectGroupProject.js";
import type { HappyAgentBot, HappyAgentTask } from "../happyAgent/happyAgentTypes.js";
import {
    happyAgentArtifactChatContext,
    happyAgentArtifactNames,
    type HappyAgentArtifactPlaces,
} from "./artifactChatContext.js";

const conversation = (id: string, title = "") => ({ id, title }) as never;

const places: HappyAgentArtifactPlaces = {
    projects: [
        {
            id: "project-1",
            name: "happy-desktop",
            conversations: [conversation("root-chat", "Root chat")],
            worktrees: [
                {
                    id: "worktree-1",
                    name: "artifacts",
                    conversations: [conversation("worktree-chat", "Worktree chat")],
                },
            ],
        } as unknown as HappyAgentProjectGroup,
    ],
    bots: [
        {
            id: "bot-1",
            name: "Release bot",
            workspaceId: "bot-workspace",
            conversation: conversation("bot-chat", "Release bot"),
            subtasks: [
                {
                    workspaceId: "bot-workspace",
                    conversation: conversation("bot-subtask", "Draft notes"),
                    subtasks: [],
                },
            ],
        } as unknown as HappyAgentBot,
    ],
    tasks: [
        {
            id: "task-1",
            name: "Quarterly report",
            workspaceId: "task-workspace",
            conversation: conversation("task-chat"),
            subtasks: [],
        } as unknown as HappyAgentTask,
    ],
};

describe("happyAgentArtifactChatContext", () => {
    it("narrows a bot's and a task's own chat to the bot and the task", () => {
        expect(happyAgentArtifactChatContext(places, "bot-workspace", "bot-chat")).toEqual({
            chat: { by: "source", kind: "bot", id: "bot-1" },
        });
        expect(happyAgentArtifactChatContext(places, "task-workspace", "task-chat")).toEqual({
            chat: { by: "source", kind: "task", id: "task-1" },
        });
    });

    it("narrows a subtask to its own conversation", () => {
        expect(happyAgentArtifactChatContext(places, "bot-workspace", "bot-subtask")).toEqual({
            chat: { by: "agent", agentId: "bot-subtask" },
        });
    });

    it("offers a project root's chat its project, and a worktree's chat its workspace", () => {
        expect(happyAgentArtifactChatContext(places, "project-1", "root-chat")).toEqual({
            chat: { by: "agent", agentId: "root-chat" },
            place: {
                kind: "project",
                narrowing: { by: "source", kind: "project", id: "project-1" },
            },
        });
        expect(happyAgentArtifactChatContext(places, "worktree-1", "worktree-chat")).toEqual({
            chat: { by: "agent", agentId: "worktree-chat" },
            place: {
                kind: "workspace",
                narrowing: { by: "source", kind: "workspace", id: "worktree-1" },
            },
        });
    });

    it("narrows nothing without a chat, and only the chat in a group it does not know", () => {
        expect(happyAgentArtifactChatContext(places, "project-1", undefined)).toBeUndefined();
        expect(happyAgentArtifactChatContext(places, undefined, "root-chat")).toBeUndefined();
        expect(happyAgentArtifactChatContext(places, "elsewhere", "lone-chat")).toEqual({
            chat: { by: "agent", agentId: "lone-chat" },
        });
    });
});

describe("happyAgentArtifactNames", () => {
    it("names places, conversations, and people the window knows, and nothing else", () => {
        const names = happyAgentArtifactNames(places, new Map([["user-1", "Steve"]]));
        expect(names.bot?.("bot-1")).toBe("Release bot");
        expect(names.task?.("task-1")).toBe("Quarterly report");
        expect(names.project?.("project-1")).toBe("happy-desktop");
        expect(names.workspace?.("worktree-1")).toBe("artifacts");
        expect(names.agent?.("worktree-chat")).toBe("Worktree chat");
        expect(names.agent?.("bot-subtask")).toBe("Draft notes");
        expect(names.agent?.("task-chat")).toBeUndefined();
        expect(names.user?.("user-1")).toBe("Steve");
        expect(names.user?.("user-2")).toBeUndefined();
    });
});
