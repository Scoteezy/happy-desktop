/**
 * Which list the sidebar shows: every workspace the window has, or only the
 * conversations waiting on the person. The attention list is a view of the
 * same sidebar rather than a page of its own, so switching to it leaves the
 * screen alone — whatever was open stays open, and the list beside it changes.
 */
export type HappyAgentSidebarView = "workspaces" | "attention";

/**
 * How this window wants the sidebar shown: which of its two lists is up, and
 * which rows the workspace list leaves out to keep it to what is being worked
 * on — bots that are neither working nor waiting on the reader, and projects
 * and workspaces with nothing running or unread in them.
 *
 * The record is the window's, not a machine's: it describes how this reader
 * wants to see every machine's list, and a machine going away or coming back
 * changes nothing about that. Both filters keep the addressed group visible
 * whatever its state, which the surface applying them is responsible for — a
 * list that hid the thing on screen would be a list the reader could not find
 * themselves in.
 */
export interface HappyAgentSidebarFilterDocument {
    readonly view?: HappyAgentSidebarView;
    readonly hideIdle: boolean;
    readonly hideBots: boolean;
}

/**
 * Where that record is kept. The state package never names a storage medium:
 * the host supplies one, and omitting it keeps the record alive for this
 * window's lifetime only.
 */
export interface HappyAgentSidebarFilterPersistence {
    read(): HappyAgentSidebarFilterDocument | undefined;
    write(document: HappyAgentSidebarFilterDocument): void;
}

export interface HappyAgentSidebarFilterSnapshot {
    /** Which list the sidebar is showing. */
    readonly view: HappyAgentSidebarView;
    /** Leave out projects and workspaces with nothing running, waiting, or unread. */
    readonly hideIdle: boolean;
    /** Leave out bots that are neither working nor waiting on the reader. */
    readonly hideBots: boolean;
}

export interface HappyAgentSidebarFilterStore {
    get(): HappyAgentSidebarFilterSnapshot;
    subscribe(listener: () => void): () => void;
    viewSelect(view: HappyAgentSidebarView): void;
    hideIdleToggle(): void;
    hideBotsToggle(): void;
}

const DEFAULT: HappyAgentSidebarFilterSnapshot = {
    view: "workspaces",
    hideIdle: false,
    hideBots: false,
};

export function happyAgentSidebarFilterStoreCreate(
    persistence?: HappyAgentSidebarFilterPersistence,
): HappyAgentSidebarFilterStore {
    const stored = persistence?.read();
    let snapshot: HappyAgentSidebarFilterSnapshot = stored
        ? {
              view: stored.view === "attention" ? "attention" : "workspaces",
              hideIdle: stored.hideIdle === true,
              hideBots: stored.hideBots === true,
          }
        : DEFAULT;
    const listeners = new Set<() => void>();
    const set = (next: HappyAgentSidebarFilterSnapshot): void => {
        snapshot = next;
        persistence?.write({ view: next.view, hideIdle: next.hideIdle, hideBots: next.hideBots });
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
        viewSelect(view) {
            if (view === snapshot.view) return;
            set({ ...snapshot, view });
        },
        hideIdleToggle() {
            set({ ...snapshot, hideIdle: !snapshot.hideIdle });
        },
        hideBotsToggle() {
            set({ ...snapshot, hideBots: !snapshot.hideBots });
        },
    };
}

/** A store that shows the workspace list, filters nothing, and remembers nothing. */
export const happyAgentSidebarFilterStoreNoop: HappyAgentSidebarFilterStore = {
    get: () => DEFAULT,
    subscribe: () => () => undefined,
    viewSelect: () => undefined,
    hideIdleToggle: () => undefined,
    hideBotsToggle: () => undefined,
};
