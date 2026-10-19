import { expect, it, vi } from "vitest";
import {
    happyAgentProviderUsageStoreCreate,
    type HappyAgentProviderUsageEntry,
    type HappyAgentProviderUsageSource,
    type HappyAgentProviderUsageSourceReading,
} from "./happyAgentProviderUsageStore.js";

/* The store holds the latest reading and follows the source only while
 * something watches. It starts following with every new watcher, however
 * recent its reading: a refresh asked for on opening answers only through
 * the source's later readings. */

function sourceCreate() {
    const listeners = new Set<(reading: HappyAgentProviderUsageSourceReading) => void>();
    const refresh = vi.fn<(providerIds: readonly string[]) => void>();
    let subscriptions = 0;
    const source: HappyAgentProviderUsageSource = {
        subscribe(listener) {
            subscriptions += 1;
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        refresh,
    };
    return {
        source,
        refresh,
        subscriptions: () => subscriptions,
        live: () => listeners.size,
        emit(reading: HappyAgentProviderUsageSourceReading) {
            for (const listener of listeners) listener(reading);
        },
    };
}

const CLAUDE: HappyAgentProviderUsageEntry = {
    providerId: "claude",
    refreshedAt: 1_000,
    usage: { capturedAt: 1_000, fiveHour: { usedPercent: 20 } },
};

it("follows the source again for every new watcher, even right after a reading", () => {
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });

    const release = store.subscribe(() => undefined);
    fake.emit({ loading: false, loadedAt: Date.now(), providers: [CLAUDE] });
    release();
    expect(fake.live()).toBe(0);

    const again = store.subscribe(() => undefined);
    expect(fake.subscriptions()).toBe(2);
    // The held reading shows at once while the source reads again.
    expect(store.get().providers).toEqual([CLAUDE]);
    fake.emit({ loading: true, providers: [] });
    expect(store.get()).toMatchObject({ loading: false, providers: [CLAUDE] });
    again();
});

it("replaces an account with each reading the source reports", () => {
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });
    const release = store.subscribe(() => undefined);

    fake.emit({ loading: false, loadedAt: 1, providers: [CLAUDE] });
    const refreshing = { ...CLAUDE, refreshing: true };
    fake.emit({ loading: false, loadedAt: 1, providers: [refreshing] });
    expect(store.get().providers).toEqual([refreshing]);

    const spent: HappyAgentProviderUsageEntry = {
        providerId: "claude",
        refreshedAt: 2_000,
        usage: { capturedAt: 2_000, exhausted: true, fiveHour: { usedPercent: 100 } },
    };
    fake.emit({ loading: false, loadedAt: 1, providers: [spent] });
    expect(store.get().providers).toEqual([spent]);
    release();
});

it("passes a refresh on to the source without claiming anything itself", () => {
    const fake = sourceCreate();
    const store = happyAgentProviderUsageStoreCreate({ source: fake.source });
    const notified = vi.fn();
    const release = store.subscribe(notified);
    fake.emit({ loading: false, loadedAt: 1, providers: [CLAUDE] });
    notified.mockClear();

    store.usageRefresh(["claude", "claude_extra"]);
    expect(fake.refresh).toHaveBeenCalledWith(["claude", "claude_extra"]);
    expect(notified).not.toHaveBeenCalled();
    expect(store.get().providers).toEqual([CLAUDE]);

    store.usageRefresh([]);
    expect(fake.refresh).toHaveBeenCalledTimes(1);
    // Naming no account asks about every one.
    store.usageRefresh();
    expect(fake.refresh).toHaveBeenLastCalledWith(undefined);
    release();

    store[Symbol.dispose]();
    store.usageRefresh(["claude"]);
    expect(fake.refresh).toHaveBeenCalledTimes(2);
});
