/**
 * Which list the sidebar shows: every workspace the window has, or what is
 * waiting on the person followed by everything recent. The attention list is
 * a mode of the same sidebar rather than a page of its own, so switching it on
 * leaves the screen alone — whatever was open stays open, and the list beside
 * it changes.
 */
export type HappyAgentSidebarView = "workspaces" | "attention";

/**
 * The window's record of which list is up. It is the window's, not a
 * machine's: it describes how this reader wants to see every machine's list,
 * and a machine going away or coming back changes nothing about that. The
 * search beside it is not recorded: a query is a question asked now, and a
 * window that reopened still filtered by last week's word would be hiding
 * rows for a reason the reader no longer remembers.
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
    /** Whether the search field is up. Closing it also clears the query. */
    readonly searchOpen: boolean;
    /** What the reader typed; the sidebar keeps only the sessions it names. */
    readonly searchQuery: string;
}

export interface HappyAgentSidebarViewStore {
    get(): HappyAgentSidebarViewSnapshot;
    subscribe(listener: () => void): () => void;
    viewSelect(view: HappyAgentSidebarView): void;
    /** Attention on becomes off and off becomes on: the bell in the heading. */
    viewToggle(): void;
    searchOpen(): void;
    searchClose(): void;
    searchQueryUpdate(value: string): void;
}

const DEFAULT: HappyAgentSidebarViewSnapshot = {
    view: "workspaces",
    searchOpen: false,
    searchQuery: "",
};

export function happyAgentSidebarViewStoreCreate(
    persistence?: HappyAgentSidebarViewPersistence,
): HappyAgentSidebarViewStore {
    const stored = persistence?.read();
    let snapshot: HappyAgentSidebarViewSnapshot =
        stored?.view === "attention" ? { ...DEFAULT, view: "attention" } : DEFAULT;
    const listeners = new Set<() => void>();
    const set = (next: HappyAgentSidebarViewSnapshot): void => {
        const viewChanged = next.view !== snapshot.view;
        snapshot = next;
        if (viewChanged) persistence?.write({ view: next.view });
        for (const listener of [...listeners]) listener();
    };
    const viewSelect = (view: HappyAgentSidebarView): void => {
        if (view === snapshot.view) return;
        set({ ...snapshot, view });
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        viewSelect,
        viewToggle() {
            viewSelect(snapshot.view === "attention" ? "workspaces" : "attention");
        },
        searchOpen() {
            if (snapshot.searchOpen) return;
            set({ ...snapshot, searchOpen: true });
        },
        searchClose() {
            if (!snapshot.searchOpen && snapshot.searchQuery === "") return;
            set({ ...snapshot, searchOpen: false, searchQuery: "" });
        },
        searchQueryUpdate(value) {
            if (value === snapshot.searchQuery) return;
            set({ ...snapshot, searchQuery: value });
        },
    };
}

/** A store that shows the workspace list, searches nothing, and remembers nothing. */
export const happyAgentSidebarViewStoreNoop: HappyAgentSidebarViewStore = {
    get: () => DEFAULT,
    subscribe: () => () => undefined,
    viewSelect: () => undefined,
    viewToggle: () => undefined,
    searchOpen: () => undefined,
    searchClose: () => undefined,
    searchQueryUpdate: () => undefined,
};
