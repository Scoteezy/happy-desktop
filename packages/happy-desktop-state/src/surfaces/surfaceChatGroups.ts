import type { HappyAgentSessionLocation } from "../happyAgent/happyAgentSessionListStore.js";
import type { HappyAgentGroupId, HappyAgentSessionId } from "../happyAgent/happyAgentTypes.js";

/**
 * The workspaces Surface chats are held in, each with the one agent it holds,
 * as far as this connection has learned them. The daemon makes one plain
 * workspace per Surface chat and lists it nowhere a project or a bot is
 * listed: it is found only through the chat's agent, which opening the chat
 * answers with. The conversation list reads this to accept such a workspace
 * as somewhere a reader may write, and only to that one agent.
 */
export interface HappyAgentSurfaceChatGroups {
    /** The chat's agent when `groupId` is a Surface chat's workspace, or `undefined`. */
    agentOf(groupId: HappyAgentGroupId): HappyAgentSessionId | undefined;
    /** Told whenever a workspace is learned. */
    subscribe(listener: () => void): () => void;
}

/** The pairs, and the private writer the Surface catalog adds to them through. */
export interface HappyAgentSurfaceChatGroupsOwner {
    readonly groups: HappyAgentSurfaceChatGroups;
    /** Learns where a Surface's chat is held, as the daemon answered when it was opened. */
    add(location: HappyAgentSessionLocation): void;
}

export function happyAgentSurfaceChatGroupsCreate(): HappyAgentSurfaceChatGroupsOwner {
    const known = new Map<HappyAgentGroupId, HappyAgentSessionId>();
    const listeners = new Set<() => void>();
    return {
        groups: {
            agentOf: (groupId) => known.get(groupId),
            subscribe(listener) {
                listeners.add(listener);
                return () => {
                    listeners.delete(listener);
                };
            },
        },
        add(location) {
            if (known.get(location.groupId) === location.sessionId) return;
            known.set(location.groupId, location.sessionId);
            for (const listener of listeners) listener();
        },
    };
}
