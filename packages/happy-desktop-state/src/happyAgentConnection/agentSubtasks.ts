import type { Agent } from "@slopus/happy-agent-client";

/** The protocol carries this tree explicitly; hidden subagents never enter it. */
export function agentTreeFind(root: Agent, id: string): Agent | undefined {
    if (root.id === id) return root;
    for (const child of root.subtasks ?? []) {
        const found = agentTreeFind(child, id);
        if (found) return found;
    }
    return undefined;
}

/** Reconcile a full versioned agent into its existing active subtask ancestry. */
export function agentTreeUpdate(root: Agent, agent: Agent): Agent {
    if (root.id === agent.id) return agent;
    const previous = root.subtasks ?? [];
    const children: Agent[] = [];
    let changed = false;
    let present = false;
    for (const child of previous) {
        if (child.id === agent.id) {
            present = true;
            if (agent.archivedAt !== null || !agent.subtask || agent.parentAgentId !== root.id) {
                changed = true;
                continue;
            }
        }
        const next = agentTreeUpdate(child, agent);
        changed ||= next !== child;
        children.push(next);
    }
    if (!present && agent.subtask && agent.archivedAt === null && agent.parentAgentId === root.id) {
        children.push(agent);
        changed = true;
    }
    return changed ? { ...root, subtasks: children } : root;
}
