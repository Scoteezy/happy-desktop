/**
 * Which rows the sidebar leaves out to keep the list to what is being worked
 * on: bots that are neither working nor waiting on the reader, and projects
 * and workspaces with nothing running or unread in them.
 *
 * A filter is the window's, not a machine's: it describes how this reader
 * wants to see every machine's list, and a machine going away or coming back
 * changes nothing about that. Both filters keep the addressed group visible
 * whatever its state, which the surface applying them is responsible for — a
 * list that hid the thing on screen would be a list the reader could not find
 * themselves in.
 */
export interface HappyAgentSidebarFilterDocument {
    readonly hideIdle: boolean;
    readonly hideBots: boolean;
}

/**
 * Where that record is kept. The state package never names a storage medium:
 * the host supplies one, and omitting it keeps the filter alive for this
 * window's lifetime only.
 */
export interface HappyAgentSidebarFilterPersistence {
    read(): HappyAgentSidebarFilterDocument | undefined;
    write(document: HappyAgentSidebarFilterDocument): void;
}

export interface HappyAgentSidebarFilterSnapshot {
    /** Leave out projects and workspaces with nothing running, waiting, or unread. */
    readonly hideIdle: boolean;
    /** Leave out bots that are neither working nor waiting on the reader. */
    readonly hideBots: boolean;
}

export interface HappyAgentSidebarFilterStore {
    get(): HappyAgentSidebarFilterSnapshot;
    subscribe(listener: () => void): () => void;
    hideIdleToggle(): void;
    hideBotsToggle(): void;
}

const DEFAULT: HappyAgentSidebarFilterSnapshot = { hideIdle: false, hideBots: false };

export function happyAgentSidebarFilterStoreCreate(
    persistence?: HappyAgentSidebarFilterPersistence,
): HappyAgentSidebarFilterStore {
    const stored = persistence?.read();
    let snapshot: HappyAgentSidebarFilterSnapshot = stored
        ? { hideIdle: stored.hideIdle === true, hideBots: stored.hideBots === true }
        : DEFAULT;
    const listeners = new Set<() => void>();
    const set = (next: HappyAgentSidebarFilterSnapshot): void => {
        snapshot = next;
        persistence?.write({ hideIdle: next.hideIdle, hideBots: next.hideBots });
        for (const listener of [...listeners]) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        hideIdleToggle() {
            set({ ...snapshot, hideIdle: !snapshot.hideIdle });
        },
        hideBotsToggle() {
            set({ ...snapshot, hideBots: !snapshot.hideBots });
        },
    };
}

/** A store that filters nothing and remembers nothing, for a host without one. */
export const happyAgentSidebarFilterStoreNoop: HappyAgentSidebarFilterStore = {
    get: () => DEFAULT,
    subscribe: () => () => undefined,
    hideIdleToggle: () => undefined,
    hideBotsToggle: () => undefined,
};
