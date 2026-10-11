import {
    happyAgentBotSubtasks,
    type HappyAgentBot,
    type HappyAgentProjectGroup,
    type HappyAgentTask,
} from "happy-desktop-state";
import type { AgentUpdateCardAgent, AgentUpdateCardView } from "happy-desktop-ui";
import type { AppHappyAgentUpdateProgress } from "./agentUpdate";

/** The conversations of the Happy Agent being updated, as the card can name them. */
export interface AgentUpdateCatalog {
    readonly bots: readonly HappyAgentBot[];
    readonly tasks?: readonly HappyAgentTask[];
    readonly projects: readonly HappyAgentProjectGroup[];
}

/**
 * The update as the card draws it. The daemon names each waiting agent by its
 * session ID; that is the conversation's own ID, so the card names it by the
 * conversation's title and opens it, and leaves unnamed any agent this window
 * does not have in its catalog.
 */
export function agentUpdateCardView(
    progress: AppHappyAgentUpdateProgress,
    catalog: AgentUpdateCatalog,
    open: (groupId: string, sessionId: string) => void,
): AgentUpdateCardView {
    switch (progress.kind) {
        case "draining": {
            const agents: AgentUpdateCardAgent[] = [];
            let agentCount = 0;
            let operationCount = 0;
            for (const component of progress.waitingFor) {
                if (component.agents === undefined) {
                    operationCount += component.count;
                    continue;
                }
                agentCount += Math.max(component.count, component.agents.length);
                for (const agent of component.agents) {
                    const found = conversationFind(catalog, agent.id);
                    agents.push({
                        id: agent.id,
                        stage: agent.stage,
                        ...(found
                            ? {
                                  name: found.name,
                                  onSelect: () => open(found.groupId, agent.id),
                              }
                            : {}),
                    });
                }
            }
            const remaining = progress.waitingFor.reduce((total, one) => total + one.count, 0);
            return {
                agentCount,
                agents,
                kind: "draining",
                operationCount,
                ...(progress.waitingPeak > 0
                    ? {
                          fraction: Math.min(
                              1,
                              Math.max(
                                  0,
                                  (progress.waitingPeak - remaining) / progress.waitingPeak,
                              ),
                          ),
                      }
                    : {}),
            };
        }
        case "stopping":
            return { kind: "stopping", killed: progress.killed };
        case "starting":
        case "reconnecting":
            return { kind: progress.kind };
        case "done":
            return {
                kind: "done",
                ...(progress.tookMs === undefined ? {} : { tookMs: progress.tookMs }),
            };
        case "failed":
            return { failedAt: progress.failedAt, kind: "failed", message: progress.message };
    }
}

function conversationFind(
    catalog: AgentUpdateCatalog,
    sessionId: string,
): { readonly groupId: string; readonly name: string } | undefined {
    const tasks = catalog.tasks ?? [];
    for (const bot of catalog.bots)
        if (bot.conversation.id === sessionId) return { groupId: bot.workspaceId, name: bot.name };
    for (const task of tasks)
        if (task.conversation.id === sessionId)
            return { groupId: task.workspaceId, name: task.name };
    for (const subtask of happyAgentBotSubtasks([...catalog.bots, ...tasks]))
        if (subtask.conversation.id === sessionId)
            return { groupId: subtask.workspaceId, name: subtask.conversation.title };
    for (const project of catalog.projects) {
        const own = project.conversations.find((one) => one.id === sessionId);
        if (own) return { groupId: project.id, name: own.title };
        for (const worktree of project.worktrees) {
            const found = worktree.conversations.find((one) => one.id === sessionId);
            if (found) return { groupId: worktree.id, name: found.title };
        }
    }
    return undefined;
}
