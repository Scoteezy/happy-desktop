/**
 * Which optional controls the sidebar's status bar shows. The window's own
 * choice, kept by the host like the experiments switch. The theme is shown and
 * keep-awake hidden until the reader says otherwise in Settings.
 */
export interface StatusBarSnapshot {
    readonly themeShown: boolean;
    readonly keepAwakeShown: boolean;
}

export interface StatusBarPersistence {
    read(): unknown;
    write(document: StatusBarSnapshot): void;
}

export interface StatusBarStore {
    get(): StatusBarSnapshot;
    subscribe(listener: () => void): () => void;
    themeShownUpdate(shown: boolean): void;
    keepAwakeShownUpdate(shown: boolean): void;
}

const DEFAULT: StatusBarSnapshot = { themeShown: true, keepAwakeShown: false };

export function statusBarStoreCreate(persistence?: StatusBarPersistence): StatusBarStore {
    // A hand-edited or missing record keeps the defaults field by field.
    const stored = (persistence?.read() ?? {}) as Partial<Record<keyof StatusBarSnapshot, unknown>>;
    let snapshot: StatusBarSnapshot = {
        themeShown: typeof stored.themeShown === "boolean" ? stored.themeShown : DEFAULT.themeShown,
        keepAwakeShown:
            typeof stored.keepAwakeShown === "boolean"
                ? stored.keepAwakeShown
                : DEFAULT.keepAwakeShown,
    };
    const listeners = new Set<() => void>();
    const commit = (next: StatusBarSnapshot): void => {
        snapshot = next;
        persistence?.write(snapshot);
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        themeShownUpdate(shown) {
            if (snapshot.themeShown !== shown) commit({ ...snapshot, themeShown: shown });
        },
        keepAwakeShownUpdate(shown) {
            if (snapshot.keepAwakeShown !== shown) commit({ ...snapshot, keepAwakeShown: shown });
        },
    };
}

export const statusBarStoreNoop: StatusBarStore = {
    get: () => DEFAULT,
    subscribe: () => () => undefined,
    themeShownUpdate: () => undefined,
    keepAwakeShownUpdate: () => undefined,
};
