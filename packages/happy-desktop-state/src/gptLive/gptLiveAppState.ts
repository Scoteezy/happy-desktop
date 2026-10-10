import type {
    LiveAppState,
    LiveAppStateModel,
    LiveAppStateServer,
    LiveAppStateSession,
} from "@slopus/happy-agent-client";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import type { ConversationSummary } from "../conversation/conversationSummary.js";
import type { HappyAgentModelStore } from "../happyAgent/happyAgentModelStore.js";
import {
    happyAgentSidebarTree,
    happyAgentTabsOrdered,
} from "../happyAgent/happyAgentSidebarTree.js";
import { happyAgentServiceName } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentWorkspaceSnapshot } from "../happyAgent/happyAgentWorkspaceStore.js";
import { gptLiveSerializedBytes, gptLiveWorkspaceStatus } from "./gptLiveDesktopContext.js";
import type { GptLiveDesktopSource, GptLiveNavigationTarget } from "./gptLiveDesktopSource.js";

/**
 * The window as its sidebar shows it, for voice to answer from without asking
 * the controller. It is a whole replacement each time, never a revision.
 */
export type GptLiveAppState = LiveAppState;

/**
 * What is on screen and its newest settled public message, read from what the
 * window has already loaded. Nothing is fetched to fill it: a transcript that
 * has not loaded says so instead of claiming an empty conversation.
 */
type GptLiveAppStateFocus = NonNullable<LiveAppState["focused"]>;

const SERVER_LIMIT = 32;
const ROW_LIMIT = 100;
const MODEL_LIMIT = 200;
const EFFORT_LIMIT = 16;
/** Per-row text bound. */
const NAME_LIMIT = 256;
const LATEST_MESSAGE_LIMIT = 16_384;
/** Leaves the create request room for the desktop context beside it. */
export const GPT_LIVE_APP_STATE_BYTES = 128 * 1024;
const MINUTE_MS = 60_000;

function lastActivityAt(summary: ConversationSummary): number | null {
    return summary.updatedAt > 0 ? Math.floor(summary.updatedAt / MINUTE_MS) * MINUTE_MS : null;
}

function sessionOf(
    connectionId: string,
    groupId: string,
    summary: ConversationSummary,
): LiveAppStateSession {
    return {
        target: { connectionId, groupId, sessionId: summary.id },
        title: summary.title.slice(0, NAME_LIMIT) || null,
        status: summary.activity,
        lastActivityAt: lastActivityAt(summary),
    };
}

/**
 * A group's sessions in the order its tab strip shows them: the workspace's
 * recorded tab order for the group on screen, the host's arrangement for every
 * other. Files, reviews, and tools share that strip and are left out.
 */
function sessionsOf(
    connectionId: string,
    groupId: string,
    conversations: readonly ConversationSummary[],
    workspace: HappyAgentWorkspaceSnapshot,
): LiveAppStateSession[] {
    const ordered =
        workspace.address.groupId === groupId
            ? happyAgentTabsOrdered(conversations, workspace.tabOrder)
            : conversations;
    return ordered.map((summary) => sessionOf(connectionId, groupId, summary));
}

/**
 * The models the session pickers on this server offer, in their order, each
 * named with the service its picker files it under. A model without reasoning
 * levels has no default one.
 */
function modelsOf(models: HappyAgentModelStore | undefined): LiveAppStateModel[] {
    const snapshot = models?.get();
    if (snapshot?.type !== "ready") return [];
    return snapshot.menus.modelOptions
        .filter((option) => !option.disabled)
        .map((option) => ({
            providerId: option.providerId,
            providerName: happyAgentServiceName(option.providerType).slice(0, NAME_LIMIT),
            modelId: option.modelId,
            name: option.name.slice(0, NAME_LIMIT),
            efforts: option.efforts.slice(0, EFFORT_LIMIT).map((effort) => effort.level),
            defaultEffort: option.efforts.length > 0 ? option.defaultEffort : null,
        }));
}

/**
 * The window as its sidebar shows it, for voice. Servers are the directory's
 * order (this Mac first, then the host's roster); within one, its bots, then
 * the reader's tasks, then its projects, exactly as `happyAgentSidebarTree`
 * arranges them. Only roots are listed: bot and task subtasks, the worktrees
 * they work in, and sessions started by another session, are not.
 */
export function gptLiveAppStateRead(source: GptLiveDesktopSource): GptLiveAppState {
    const current = source.get();
    let truncated = current.connections.length > SERVER_LIMIT;
    const servers: LiveAppStateServer[] = [];
    let focused: GptLiveAppStateFocus | null = null;
    const bounded = <Item>(items: readonly Item[], limit = ROW_LIMIT): Item[] => {
        if (items.length > limit) truncated = true;
        return items.slice(0, limit);
    };
    for (const connection of current.connections.slice(0, SERVER_LIMIT)) {
        const workspace = connection.workspace?.get();
        const connectionId = connection.id;
        const catalog = workspace?.list.projects;
        const server: LiveAppStateServer = {
            connectionId,
            name: connection.name.slice(0, NAME_LIMIT),
            kind: connection.kind,
            online: connection.online,
            catalog:
                catalog?.type === "ready"
                    ? "ready"
                    : catalog?.type === "error"
                      ? "error"
                      : "loading",
            bots: [],
            tasks: [],
            projects: [],
            models: bounded(modelsOf(connection.models), MODEL_LIMIT),
        };
        servers.push(server);
        if (!workspace || !catalog) continue;
        const tree = happyAgentSidebarTree({
            bots: workspace.list.bots,
            tasks: workspace.list.tasks,
            projects: catalog.type === "ready" ? catalog.value : [],
        });
        server.bots = bounded(tree.bots).map((bot) => ({
            target: {
                kind: "bot",
                connectionId,
                groupId: bot.workspaceId,
                sessionId: bot.conversation.id,
                botId: bot.id,
            },
            name: bot.name.slice(0, NAME_LIMIT),
            status: bot.conversation.activity,
            lastActivityAt: lastActivityAt(bot.conversation),
        }));
        server.tasks = bounded(tree.tasks).map((task) => ({
            target: {
                kind: "task",
                connectionId,
                groupId: task.workspaceId,
                sessionId: task.conversation.id,
                taskId: task.id,
            },
            name: task.name.slice(0, NAME_LIMIT),
            status: task.conversation.activity,
            lastActivityAt: lastActivityAt(task.conversation),
        }));
        server.projects = bounded(tree.projects).map(({ project, worktrees }) => ({
            target: { kind: "project", connectionId, projectId: project.id, groupId: project.id },
            name: project.name.slice(0, NAME_LIMIT),
            sessions: bounded(
                sessionsOf(connectionId, project.id, project.conversations, workspace),
            ),
            workspaces: bounded(worktrees).map((worktree) => ({
                target: {
                    kind: "workspace",
                    connectionId,
                    projectId: project.id,
                    workspaceId: worktree.id,
                    groupId: worktree.id,
                },
                name: worktree.name.slice(0, NAME_LIMIT),
                status: gptLiveWorkspaceStatus(worktree.lifecycle),
                sessions: bounded(
                    sessionsOf(connectionId, worktree.id, worktree.conversations, workspace),
                ),
            })),
        }));
        if (current.activeConnectionId === connectionId)
            focused = focusOf(connectionId, workspace, server);
    }
    const appState = {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        servers,
        focused,
        truncated,
    };
    return gptLiveAppStateBound(appState);
}

/**
 * Trims from the far end until the frame fits: the last server's last
 * project's sessions go first, its bots last, and the focused conversation and
 * the model list stay whole, since they are what voice acts on.
 */
function gptLiveAppStateBound(appState: {
    timeZone: string;
    servers: LiveAppStateServer[];
    focused: GptLiveAppStateFocus | null;
    truncated: boolean;
}): GptLiveAppState {
    while (gptLiveSerializedBytes(appState) > GPT_LIVE_APP_STATE_BYTES) {
        appState.truncated = true;
        const server = [...appState.servers]
            .reverse()
            .find((item) => item.projects.length || item.tasks.length || item.bots.length);
        if (!server) {
            if (!appState.focused || appState.focused.latestMessage.state !== "loaded") break;
            appState.focused = { ...appState.focused, latestMessage: { state: "notLoaded" } };
            continue;
        }
        const project = server.projects.at(-1);
        if (project) {
            const workspace = project.workspaces.at(-1);
            if (project.sessions.length)
                server.projects[server.projects.length - 1] = {
                    ...project,
                    sessions: project.sessions.slice(0, -1),
                };
            else if (workspace?.sessions.length)
                server.projects[server.projects.length - 1] = {
                    ...project,
                    workspaces: [
                        ...project.workspaces.slice(0, -1),
                        { ...workspace, sessions: workspace.sessions.slice(0, -1) },
                    ],
                };
            else if (workspace)
                server.projects[server.projects.length - 1] = {
                    ...project,
                    workspaces: project.workspaces.slice(0, -1),
                };
            else server.projects.pop();
        } else if (server.tasks.length) server.tasks.pop();
        else server.bots.pop();
    }
    return appState;
}

/** The newest public message that has finished arriving; a reply still streaming is not one yet. */
function latestSettled(
    entries: readonly ConversationEntry[],
): { role: "user" | "assistant"; text: string } | undefined {
    for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index]!;
        if (
            entry.kind !== "message" ||
            entry.source !== "server" ||
            entry.pendingSend === true ||
            entry.message.generationStatus === "streaming" ||
            !entry.message.sender ||
            !entry.message.text
        )
            continue;
        const sender = entry.message.sender.kind;
        if (sender !== "human" && sender !== "agent") continue;
        return { role: sender === "human" ? "user" : "assistant", text: entry.message.text };
    }
    return undefined;
}

/**
 * What the active connection has on screen. A bot's or task's own
 * conversation is named as that bot or task, a group with no conversation open
 * as its project or workspace, and anything else as the session it is.
 */
function focusOf(
    connectionId: string,
    workspace: HappyAgentWorkspaceSnapshot,
    server: LiveAppStateServer,
): GptLiveAppStateFocus | null {
    const { groupId, conversationId } = workspace.address;
    if (!groupId) return null;
    if (!conversationId) {
        for (const project of server.projects) {
            if (project.target.groupId === groupId)
                return {
                    target: project.target,
                    title: project.name,
                    latestMessage: { state: "empty" },
                };
            const worktree = project.workspaces.find((item) => item.target.groupId === groupId);
            if (worktree)
                return {
                    target: worktree.target,
                    title: worktree.name,
                    latestMessage: { state: "empty" },
                };
        }
        return null;
    }
    const bot = server.bots.find(
        (item) => item.target.groupId === groupId && item.target.sessionId === conversationId,
    );
    const task = server.tasks.find(
        (item) => item.target.groupId === groupId && item.target.sessionId === conversationId,
    );
    const target: GptLiveNavigationTarget = bot?.target ??
        task?.target ?? { kind: "session", connectionId, groupId, sessionId: conversationId };
    const conversation = workspace.conversation;
    if (conversation.type !== "ready" || conversation.value.conversationId !== conversationId)
        return {
            target,
            title: bot?.name ?? task?.name ?? null,
            latestMessage: { state: "notLoaded" },
        };
    const latest = latestSettled(conversation.value.entries);
    return {
        target,
        title: (bot?.name ?? task?.name ?? conversation.value.title)?.slice(0, NAME_LIMIT) ?? null,
        latestMessage: latest
            ? {
                  state: "loaded",
                  role: latest.role,
                  text: latest.text.slice(0, LATEST_MESSAGE_LIMIT),
                  truncated: latest.text.length > LATEST_MESSAGE_LIMIT,
              }
            : // Older messages may simply not be loaded yet.
              { state: conversation.value.transcriptComplete ? "empty" : "notLoaded" },
    };
}
