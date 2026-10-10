import { happyAgentBotSubtasks } from "../happyAgent/happyAgentBotSubtasks.js";
import type { HappyAgentProjectGroup } from "../happyAgent/happyAgentProjectGroupProject.js";
import type { HappyAgentBot, HappyAgentTask } from "../happyAgent/happyAgentTypes.js";
import type { HappyAgentArtifactChatContext } from "./artifactCatalogStore.js";
import type { HappyAgentArtifactNames } from "./artifactLabels.js";

/** What one Happy Agent holds, as the window has it listed. */
export interface HappyAgentArtifactPlaces {
    readonly projects: readonly HappyAgentProjectGroup[];
    readonly bots: readonly HappyAgentBot[];
    readonly tasks: readonly HappyAgentTask[];
}

/**
 * The lists a chat's artifacts can be narrowed to, from where the window has
 * the chat open.
 *
 * The daemon records an agent's artifact against the first bot, task,
 * workspace, or project root found walking up from that agent, and always
 * names the acting conversation beside it. So a bot's or a task's own chat is
 * that bot or task, which also holds what its subtasks made; a subtask is its
 * own conversation; and a chat in a project root or a workspace is its own
 * conversation, inside a place that holds every chat there. A group with no
 * chat open is narrowed to nothing, since there is no chat to sit beside.
 */
export function happyAgentArtifactChatContext(
    places: HappyAgentArtifactPlaces,
    groupId: string | undefined,
    chatId: string | undefined,
): HappyAgentArtifactChatContext | undefined {
    if (groupId === undefined || chatId === undefined) return undefined;
    const bot = places.bots.find((candidate) => candidate.workspaceId === groupId);
    if (bot?.conversation.id === chatId) return { chat: { by: "source", kind: "bot", id: bot.id } };
    const task = places.tasks.find((candidate) => candidate.workspaceId === groupId);
    if (task?.conversation.id === chatId)
        return { chat: { by: "source", kind: "task", id: task.id } };
    const chat = { by: "agent", agentId: chatId } as const;
    const subtask = happyAgentBotSubtasks([...places.bots, ...places.tasks]).some(
        (candidate) => candidate.conversation.id === chatId,
    );
    if (subtask || bot !== undefined || task !== undefined) return { chat };
    for (const project of places.projects) {
        if (project.id === groupId)
            return {
                chat,
                place: {
                    kind: "project",
                    narrowing: { by: "source", kind: "project", id: project.id },
                },
            };
        const worktree = project.worktrees.find((candidate) => candidate.id === groupId);
        if (worktree)
            return {
                chat,
                place: {
                    kind: "workspace",
                    narrowing: { by: "source", kind: "workspace", id: worktree.id },
                },
            };
    }
    return { chat };
}

/**
 * What the window already calls the places and conversations of one Happy
 * Agent, and the people the artifact surfaces have read the names of.
 */
export function happyAgentArtifactNames(
    places: HappyAgentArtifactPlaces,
    people: ReadonlyMap<string, string>,
): HappyAgentArtifactNames {
    const conversations = new Map<string, string>();
    const titled = (conversation: { readonly id: string; readonly title: string }): void => {
        if (conversation.title.length > 0) conversations.set(conversation.id, conversation.title);
    };
    const workspaces = new Map<string, string>();
    for (const project of places.projects) {
        project.conversations.forEach(titled);
        for (const worktree of project.worktrees) {
            workspaces.set(worktree.id, worktree.name);
            worktree.conversations.forEach(titled);
        }
    }
    for (const root of [...places.bots, ...places.tasks]) titled(root.conversation);
    for (const subtask of happyAgentBotSubtasks([...places.bots, ...places.tasks]))
        titled(subtask.conversation);
    return {
        bot: (botId) => places.bots.find((bot) => bot.id === botId)?.name,
        task: (taskId) => places.tasks.find((task) => task.id === taskId)?.name,
        project: (projectId) => places.projects.find((project) => project.id === projectId)?.name,
        workspace: (workspaceId) => workspaces.get(workspaceId),
        agent: (agentId) => conversations.get(agentId),
        user: (userId) => people.get(userId),
    };
}
