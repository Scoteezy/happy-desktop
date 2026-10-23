/**
 * Whether new work's stem cell grows into its icon when the icon arrives, or
 * the icon simply replaces it.
 *
 * It is the window's own visual choice, like the experiments switch, so it is
 * kept by the host's storage rather than by any machine the window connects
 * to. It is on until the reader turns it off.
 *
 * The constructor opens nothing: it reads the host's record once, and writes
 * back only when the reader changes the setting.
 */
export interface StemCellAnimationDocument {
    readonly stemCellAnimationEnabled: boolean;
}

/** Where the choice is kept. Omitting it keeps the choice for this window's lifetime only. */
export interface StemCellAnimationPersistence {
    read(): StemCellAnimationDocument | undefined;
    write(document: StemCellAnimationDocument): void;
}

export interface StemCellAnimationSnapshot {
    /** On until the reader turns it off. */
    readonly stemCellAnimationEnabled: boolean;
}

export interface StemCellAnimationStore {
    get(): StemCellAnimationSnapshot;
    subscribe(listener: () => void): () => void;
    stemCellAnimationUpdate(enabled: boolean): void;
}

/**
 * A stored record read back as this window's own value. Anything that is not
 * the field this version knows is no record at all, since a person can edit the
 * host's storage by hand.
 */
function documentParse(value: unknown): StemCellAnimationDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const enabled = (value as { stemCellAnimationEnabled?: unknown }).stemCellAnimationEnabled;
    return typeof enabled === "boolean" ? { stemCellAnimationEnabled: enabled } : undefined;
}

const ENABLED: StemCellAnimationSnapshot = { stemCellAnimationEnabled: true };

/** Creates the window-lifetime store, hydrated from the host's storage when it has one. */
export function stemCellAnimationStoreCreate(
    persistence?: StemCellAnimationPersistence,
): StemCellAnimationStore {
    let snapshot: StemCellAnimationSnapshot = (() => {
        try {
            return documentParse(persistence?.read()) ?? ENABLED;
        } catch {
            // Storage the host refused is a window with no record.
            return ENABLED;
        }
    })();
    const listeners = new Set<() => void>();

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        stemCellAnimationUpdate(enabled) {
            if (snapshot.stemCellAnimationEnabled === enabled) return;
            snapshot = { stemCellAnimationEnabled: enabled };
            try {
                persistence?.write(snapshot);
            } catch {
                // Storage the host refused still keeps this window's choice for
                // as long as it stays open.
            }
            for (const listener of listeners) listener();
        },
    };
}

/** The store a host that remembers nothing stands in: animated, never changing. */
export const stemCellAnimationStoreNoop: StemCellAnimationStore = {
    get: () => ENABLED,
    stemCellAnimationUpdate: () => {},
    subscribe: () => () => {},
};
