/**
 * Which rows in the sidebar the reader has folded shut — a project whose
 * worktrees they are not working in today, a folder they filled once and no
 * longer read — and which rows that fold by default they have opened.
 *
 * Both lists are stated as departures from the row's own default rather than
 * as the rows' current state, because the default is what everything is until
 * somebody says otherwise: a project that arrives after this record was
 * written must show its checkouts, a bot that arrives must hide its subtasks,
 * and a record of what is open or shut would get one of them wrong.
 *
 * A departure stays while the row is away. A machine that is unreachable, or a
 * folder that is not being listed right now, has not been reset by going
 * missing, and coming back to a tree that quietly rearranged itself is the
 * same defect as losing the arrangement entirely.
 */
export interface HappyAgentSidebarCollapseDocument {
    /** Rows that open by default and were folded shut. */
    readonly collapsed: readonly string[];
    /** Rows that fold by default and were opened. Absent in older records. */
    readonly expanded?: readonly string[];
}

/**
 * Where that record is kept. The state package never names a storage medium:
 * the host supplies one, and omitting it keeps the folding alive for this
 * window's lifetime only.
 */
export interface HappyAgentSidebarCollapsePersistence {
    read(): HappyAgentSidebarCollapseDocument | undefined;
    write(document: HappyAgentSidebarCollapseDocument): void;
}

export interface HappyAgentSidebarCollapseSnapshot {
    /** Every row this window has been told to fold shut, still folded. */
    readonly collapsed: ReadonlySet<string>;
    /** Every row that folds by default and this window has been told to open. */
    readonly expanded: ReadonlySet<string>;
}

export interface HappyAgentSidebarCollapseStore {
    get(): HappyAgentSidebarCollapseSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Folds `rowId` shut if it is open, and opens it if it is shut. A row that
     * folds by default says so, so the toggle records the departure in the
     * right list and a record of "opened" is never read as "collapsed".
     */
    rowCollapseToggle(rowId: string, defaultCollapsed?: boolean): void;
}

/**
 * Whether one row is folded, read from the record and the row's own default.
 * The one place the two lists are combined, so a caller never has to know
 * which of them a row's state lives in.
 */
export function happyAgentSidebarRowCollapsed(
    snapshot: HappyAgentSidebarCollapseSnapshot,
    rowId: string,
    defaultCollapsed = false,
): boolean {
    return defaultCollapsed ? !snapshot.expanded.has(rowId) : snapshot.collapsed.has(rowId);
}

/**
 * How many departures one window will remember, per list. Far past the number
 * of projects and folders anybody keeps, and small enough that a record nobody
 * prunes stays a record rather than a heap. Past the bound the oldest is let
 * go, so the row somebody just toggled is always the one that is kept.
 */
const COLLAPSED_MAX = 512;

function documentParse(value: unknown): HappyAgentSidebarCollapseDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as { collapsed?: unknown; expanded?: unknown };
    if (!Array.isArray(record.collapsed)) return undefined;
    const ids = (list: unknown): readonly string[] => {
        if (!Array.isArray(list)) return [];
        const seen = new Set<string>();
        for (const id of list) if (typeof id === "string" && id.length > 0) seen.add(id);
        return [...seen];
    };
    return { collapsed: ids(record.collapsed), expanded: ids(record.expanded) };
}

const EMPTY_SNAPSHOT: HappyAgentSidebarCollapseSnapshot = {
    collapsed: new Set<string>(),
    expanded: new Set<string>(),
};

/**
 * The window's folded sidebar rows, hydrated from the host's storage when it
 * has one. A stored document comes from a previous version of this app and from
 * a place a reader can edit, so it is parsed rather than trusted; an unreadable
 * one simply means nothing has been folded.
 */
export function happyAgentSidebarCollapseStoreCreate(
    persistence?: HappyAgentSidebarCollapsePersistence,
): HappyAgentSidebarCollapseStore {
    let snapshot: HappyAgentSidebarCollapseSnapshot = (() => {
        try {
            const document = documentParse(persistence?.read());
            return document
                ? {
                      collapsed: new Set(document.collapsed),
                      expanded: new Set(document.expanded ?? []),
                  }
                : EMPTY_SNAPSHOT;
        } catch {
            return EMPTY_SNAPSHOT;
        }
    })();
    const listeners = new Set<() => void>();
    const trim = (ids: Set<string>): void => {
        // Insertion order is the order they were toggled, so trimming from
        // the front lets go of the oldest departure first.
        while (ids.size > COLLAPSED_MAX) {
            const oldest = ids.values().next();
            if (oldest.done === true) break;
            ids.delete(oldest.value);
        }
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        rowCollapseToggle(rowId, defaultCollapsed = false) {
            if (rowId.length === 0) return;
            const collapsed = new Set(snapshot.collapsed);
            const expanded = new Set(snapshot.expanded);
            const departures = defaultCollapsed ? expanded : collapsed;
            if (!departures.delete(rowId)) departures.add(rowId);
            trim(departures);
            snapshot = { collapsed, expanded };
            try {
                persistence?.write({ collapsed: [...collapsed], expanded: [...expanded] });
            } catch {
                // Storage the host refused still keeps this window's folding for
                // as long as it stays open.
            }
            for (const listener of listeners) listener();
        },
    };
}

/**
 * A folding record for a window that keeps none. Nothing is folded and nothing
 * can be, so a sidebar that must read one unconditionally reads "as the rows
 * default" instead of offering a fold the next launch would forget.
 */
export const happyAgentSidebarCollapseStoreNoop: HappyAgentSidebarCollapseStore = {
    get: () => EMPTY_SNAPSHOT,
    subscribe: () => () => undefined,
    rowCollapseToggle: () => undefined,
};
