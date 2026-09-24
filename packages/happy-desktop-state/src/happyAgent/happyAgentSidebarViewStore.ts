/**
 * Which list the sidebar shows: every workspace the window has, or what is
 * waiting on the person followed by everything recent. The attention list is
 * a view of the same sidebar rather than a page of its own, so switching to it
 * leaves the screen alone — whatever was open stays open, and the list beside
 * it changes.
 */
export type HappyAgentSidebarView = "workspaces" | "attention";

/**
 * The window's record of which list is up. It is the window's, not a
 * machine's: it describes how this reader wants to see every machine's list,
 * and a machine going away or coming back changes nothing about that.
 */
export interface HappyAgentSidebarViewDocument {
    readonly view: HappyAgentSidebarView;
}

/**
 * Where that record is kept. The state package never names a storage medium:
 * the host supplies one, and omitting it keeps the choice alive for this
 * window's lifetime only.
 */
export interface HappyAgentSidebarViewPersistence {
    read(): HappyAgentSidebarViewDocument | undefined;
    write(document: HappyAgentSidebarViewDocument): void;
}

export interface HappyAgentSidebarViewSnapshot {
    /** Which list the sidebar is showing. */
    readonly view: HappyAgentSidebarView;
}

export interface HappyAgentSidebarViewStore {
    get(): HappyAgentSidebarViewSnapshot;
    subscribe(listener: () => void): () => void;
    viewSelect(view: HappyAgentSidebarView): void;
}

const DEFAULT: HappyAgentSidebarViewSnapshot = { view: "workspaces" };

export function happyAgentSidebarViewStoreCreate(
    persistence?: HappyAgentSidebarViewPersistence,
): HappyAgentSidebarViewStore {
    const stored = persistence?.read();
    let snapshot: HappyAgentSidebarViewSnapshot =
        stored?.view === "attention" ? { view: "attention" } : DEFAULT;
    const listeners = new Set<() => void>();
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
            snapshot = { view };
            persistence?.write({ view });
            for (const listener of [...listeners]) listener();
        },
    };
}

/** A store that shows the workspace list and remembers nothing, for a host without one. */
export const happyAgentSidebarViewStoreNoop: HappyAgentSidebarViewStore = {
    get: () => DEFAULT,
    subscribe: () => () => undefined,
    viewSelect: () => undefined,
};
