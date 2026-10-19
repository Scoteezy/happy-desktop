import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/** One rate-limit or spend window a provider reports, as a share already spent. */
export interface HappyAgentProviderUsageWindow {
    /** How much of the window is gone, 0–100. */
    readonly usedPercent: number;
    /** When the window starts over, in milliseconds. */
    readonly resetsAt?: number;
    /** When the current window began, in milliseconds. */
    readonly startsAt?: number;
    /** How long one window lasts, in milliseconds. */
    readonly durationMs?: number;
    /**
     * When the vendor last reported this window, in milliseconds. A refresh can
     * update one window and keep another from an earlier reading, so a window
     * may be older than the reading it belongs to.
     */
    readonly capturedAt?: number;
}

/** Money the account can still spend once its rate-limit window is used up. */
export interface HappyAgentProviderUsageCredits {
    readonly available: boolean;
    readonly unlimited: boolean;
    readonly remainingCents?: number;
    readonly usedPercent?: number;
}

/** One provider reading, carrying plan quota or absolute token usage when reported. */
export interface HappyAgentProviderUsageReading {
    /** When the daemon took this reading, in milliseconds. */
    readonly capturedAt: number;
    readonly planName?: string;
    /** True when every window this account has is spent. */
    readonly exhausted?: boolean;
    readonly fiveHour?: HappyAgentProviderUsageWindow;
    readonly weekly?: HappyAgentProviderUsageWindow;
    readonly monthly?: HappyAgentProviderUsageWindow;
    readonly credits?: HappyAgentProviderUsageCredits;
    /**
     * Absolute token counts reported by Happy Agent. These stay separated by
     * model because tokens from different models are not comparable.
     */
    readonly models?: readonly HappyAgentProviderModelTokenUsage[];
}

export interface HappyAgentProviderTokenCounts {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cacheReadTokens: number;
    readonly cacheWriteTokens: number;
}

export interface HappyAgentProviderModelTokenUsage {
    readonly modelId: string;
    readonly hour?: HappyAgentProviderTokenCounts;
    readonly day?: HappyAgentProviderTokenCounts;
    readonly week?: HappyAgentProviderTokenCounts;
    readonly month?: HappyAgentProviderTokenCounts;
}

/**
 * One provider account as the usage surface shows it. A provider with no reading
 * is still listed: knowing an account is configured but unread is different from
 * not having it at all, and the reason lives on the same row.
 *
 * The account is named by its configured id, which is the only name it has. Two
 * accounts with the same vendor behind them are two rows here, so the id is what
 * tells them apart and nothing may collapse them onto a vendor's name.
 */
export interface HappyAgentProviderUsageEntry {
    readonly providerId: string;
    readonly usage?: HappyAgentProviderUsageReading;
    /** When the daemon last tried this provider, in milliseconds. */
    readonly checkedAt?: number;
    /** Why the daemon's own last read of this provider failed. */
    readonly error?: string;
    /**
     * When the daemon last read this account successfully, in milliseconds.
     * Absent from a daemon older than protocol 29, which dates the reading only
     * by `usage.capturedAt`.
     */
    readonly refreshedAt?: number;
    /** Why the last refresh failed, even while an older reading is still kept. */
    readonly refreshError?: string;
    /** The daemon will not read this account again before this moment, in milliseconds. */
    readonly retryAt?: number;
    /** True while the daemon is reading this account now. */
    readonly refreshing?: boolean;
}

/**
 * One reading of every provider account, with how that read went.
 *
 * The source reads every account once and then follows the daemon's change
 * events for as long as something is watching. State says where that is:
 * `loading` is only true before the first answer, and a later failure leaves
 * the readings already held in place, because a read that could not reach the
 * daemon does not make what we last saw untrue.
 */
export interface HappyAgentProviderUsageSourceReading {
    readonly providers: readonly HappyAgentProviderUsageEntry[];
    readonly loading: boolean;
    /** When the last successful read finished, in milliseconds. */
    readonly loadedAt?: number;
    /** Why the last attempt failed, when it failed. */
    readonly error?: string;
}

/**
 * The provider-usage feed for one Happy Agent. Subscribing reads every account and
 * follows their changes; releasing the last subscriber stops both, so a
 * machine nobody is looking at is not read.
 */
export interface HappyAgentProviderUsageSource {
    subscribe(
        listener: (reading: HappyAgentProviderUsageSourceReading) => void,
        onError: (error: unknown) => void,
    ): () => void;
    /**
     * Asks the daemon to read these accounts again, or every account when none
     * are named, where its reading is older than a few minutes. The daemon
     * decides what is actually stale; the outcome arrives through `subscribe`,
     * never as an answer here.
     */
    refresh(providerIds?: readonly string[]): void;
}

export interface HappyAgentProviderUsageSnapshot {
    /** Every configured provider account, in the order the daemon reports them. */
    readonly providers: readonly HappyAgentProviderUsageEntry[];
    /** True until the first reading arrives, so "no providers" is not claimed early. */
    readonly loading: boolean;
    /** When the last successful reading was taken, in milliseconds. */
    readonly loadedAt?: number;
    /** Set when the feed itself failed; the retained readings stay visible beneath it. */
    readonly error?: UserError;
}

export interface HappyAgentProviderUsageStore {
    get(): HappyAgentProviderUsageSnapshot;
    /**
     * Someone is about to look at these accounts' usage, or at every account's
     * when none are named. Asks the daemon to read again the ones it last read a
     * while ago; fresh readings arrive as ordinary snapshots, and nothing here
     * claims they are already on the way.
     */
    usageRefresh(providerIds?: readonly string[]): void;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

export interface HappyAgentProviderUsageStoreDeps {
    readonly source: HappyAgentProviderUsageSource;
}

/**
 * How much of each provider account's plan this Happy Agent has spent, as one surface.
 *
 * The store owns no schedule of its own: the source reads the daemon and
 * follows its change events while anything is subscribed, and every reading it
 * reports replaces the list wholesale.
 *
 * The last successful reading outlives its subscribers for the life of the
 * store, so a surface that reopens shows it at once while the source reads
 * again. A new source cycle does not blank it: its opening "loading" report
 * says nothing about the accounts, so only a successful reading replaces them.
 * The source starts with the first subscriber however recent the held reading
 * is: a refresh asked for on opening reports its progress and result only as
 * events, which a source that is not following would miss. Usage is read,
 * never changed, so the one action only asks the daemon to read again and
 * emits no output.
 */
export function happyAgentProviderUsageStoreCreate(
    deps: HappyAgentProviderUsageStoreDeps,
): HappyAgentProviderUsageStore {
    const store = createStore<HappyAgentProviderUsageSnapshot>()(() => ({
        providers: [],
        loading: true,
    }));

    const listeners = new Set<() => void>();
    let unsubscribeSource: (() => void) | undefined;
    let disposed = false;

    const start = (): void => {
        if (disposed || unsubscribeSource) return;
        unsubscribeSource = deps.source.subscribe(
            (incoming) => {
                if (disposed) return;
                const current = store.getState();
                // Until the cycle succeeds, the accounts already held are still the latest known.
                const reading =
                    incoming.loadedAt === undefined && current.loadedAt !== undefined
                        ? {
                              ...incoming,
                              providers: current.providers,
                              loading: false,
                              loadedAt: current.loadedAt,
                          }
                        : incoming;
                const error =
                    reading.error === undefined
                        ? undefined
                        : current.error?.message === reading.error
                          ? current.error
                          : happyAgentUserError(reading.error);
                if (
                    current.providers === reading.providers &&
                    current.loading === reading.loading &&
                    current.loadedAt === reading.loadedAt &&
                    current.error === error
                )
                    return;
                store.setState(
                    {
                        providers: reading.providers,
                        loading: reading.loading,
                        ...(reading.loadedAt === undefined ? {} : { loadedAt: reading.loadedAt }),
                        ...(error === undefined ? {} : { error }),
                    },
                    true,
                );
            },
            (error) => {
                if (disposed) return;
                const current = store.getState();
                const failure = happyAgentUserError(error);
                if (current.loading === false && current.error?.message === failure.message) return;
                store.setState({ error: failure, loading: false }, false);
            },
        );
    };

    const stop = (): void => {
        unsubscribeSource?.();
        unsubscribeSource = undefined;
    };

    return {
        get: () => store.getState(),
        usageRefresh(providerIds) {
            if (disposed || providerIds?.length === 0) return;
            deps.source.refresh(providerIds);
        },
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}

const INERT_SNAPSHOT: HappyAgentProviderUsageSnapshot = { providers: [], loading: false };

/**
 * Usage for a Happy Agent that reports none. It is permanently empty and settled rather
 * than loading, so a surface that must subscribe unconditionally reads "nothing
 * to report" instead of waiting forever for a reading that is not coming.
 */
export const happyAgentProviderUsageStoreNoop: HappyAgentProviderUsageStore = {
    get: () => INERT_SNAPSHOT,
    usageRefresh: () => undefined,
    subscribe: () => () => undefined,
    [Symbol.dispose]: () => undefined,
};
