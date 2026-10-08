/**
 * Whether this installation sends product analytics events.
 *
 * It is the window's own switch, kept by the host's storage like the
 * experiments switch beside it: it describes this app on this machine, so no
 * Happy Agent and no account has a say in it. On until the reader turns it off.
 */
export interface UsageAnalyticsDocument {
    readonly usageAnalyticsEnabled: boolean;
}

export interface UsageAnalyticsPersistence {
    read(): UsageAnalyticsDocument | undefined;
    write(document: UsageAnalyticsDocument): void;
}

export interface UsageAnalyticsSnapshot {
    readonly usageAnalyticsEnabled: boolean;
}

export interface UsageAnalyticsStore {
    get(): UsageAnalyticsSnapshot;
    subscribe(listener: () => void): () => void;
    usageAnalyticsUpdate(enabled: boolean): void;
}

function documentParse(value: unknown): UsageAnalyticsDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const enabled = (value as { usageAnalyticsEnabled?: unknown }).usageAnalyticsEnabled;
    return typeof enabled === "boolean" ? { usageAnalyticsEnabled: enabled } : undefined;
}

const ENABLED: UsageAnalyticsSnapshot = { usageAnalyticsEnabled: true };

/** Creates the window-lifetime switch, hydrated once from the host's storage. */
export function usageAnalyticsStoreCreate(
    persistence?: UsageAnalyticsPersistence,
): UsageAnalyticsStore {
    let snapshot: UsageAnalyticsSnapshot = (() => {
        try {
            return documentParse(persistence?.read()) ?? ENABLED;
        } catch {
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
        usageAnalyticsUpdate(enabled) {
            if (snapshot.usageAnalyticsEnabled === enabled) return;
            snapshot = { usageAnalyticsEnabled: enabled };
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
