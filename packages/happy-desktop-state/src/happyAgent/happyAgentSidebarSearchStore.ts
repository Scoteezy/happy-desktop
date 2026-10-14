/**
 * What the reader has typed into the sidebar's search field.
 *
 * While it holds anything, the sidebar lists what matches it — Surfaces,
 * bots, tasks, projects, and chats alike — in place of its usual contents.
 * This is the window's own transient view state: it is not in the address and
 * not remembered across launches, and it holds no results. The matches are a
 * pure transform of the snapshots the sidebar already reads, recomputed as
 * those change, so a chat renamed while it is listed is listed by its new name.
 */
export interface HappyAgentSidebarSearchSnapshot {
    /** Exactly what was typed; the sidebar decides what an all-blank query means. */
    readonly query: string;
}

export interface HappyAgentSidebarSearchStore {
    get(): HappyAgentSidebarSearchSnapshot;
    subscribe(listener: () => void): () => void;
    queryUpdate(value: string): void;
}

const EMPTY: HappyAgentSidebarSearchSnapshot = { query: "" };

/**
 * Creates the window-lifetime sidebar search store. The constructor opens
 * nothing, so a host can make one the moment a window exists.
 */
export function happyAgentSidebarSearchStoreCreate(): HappyAgentSidebarSearchStore {
    let snapshot = EMPTY;
    const listeners = new Set<() => void>();
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        queryUpdate(value) {
            if (snapshot.query === value) return;
            snapshot = value.length === 0 ? EMPTY : { query: value };
            for (const listener of listeners) listener();
        },
    };
}

/**
 * The search a window that offers none stands in: always empty, ignoring every
 * keystroke, so a sidebar can read one unconditionally.
 */
export const happyAgentSidebarSearchStoreNoop: HappyAgentSidebarSearchStore = {
    get: () => EMPTY,
    subscribe: () => () => undefined,
    queryUpdate: () => undefined,
};
