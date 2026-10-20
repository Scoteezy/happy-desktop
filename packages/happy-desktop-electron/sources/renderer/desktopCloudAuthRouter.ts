import type { HappyAgentCloudAuthOutcome, HappyAgentCloudHost } from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";

/** What became of one browser callback, as far as this window can tell. */
export type DesktopCloudAuthCallbackClass =
    /** The same callback arrived again; it was already handled once. */
    | { readonly kind: "duplicate" }
    /** It answers a login this window started, from the connection `id`. */
    | { readonly kind: "matched"; readonly id: string; readonly state: string }
    /**
     * It answers no login this window recorded. Such a callback is never
     * completed or handed to any connection: its code belongs to an attempt
     * whose PKCE verifier this app does not hold.
     */
    | {
          readonly kind: "unmatched";
          readonly reason: "malformed" | "stateMissing" | "stateUnknown";
          /** Whether the provider reported an OAuth `error` instead of a code. */
          readonly providerError: boolean;
      };

/** One sign-in event this window should tell the reader about. */
export type DesktopCloudAuthEvent =
    | { readonly kind: "matched"; readonly id: string }
    | { readonly kind: "unmatched"; readonly providerError: boolean }
    | {
          readonly kind: "settled";
          readonly id: string;
          readonly outcome: HappyAgentCloudAuthOutcome;
      };

/**
 * Sorts one callback by its OAuth `state` alone. A callback is matched only
 * when it carries exactly one state that this window recorded when it opened
 * a login; nothing is inferred from the focused connection or the callback's
 * other parameters.
 */
export function desktopCloudAuthCallbackClassify(
    callback: string,
    owners: ReadonlyMap<string, string>,
    seen: ReadonlySet<string>,
): DesktopCloudAuthCallbackClass {
    if (seen.has(callback)) return { kind: "duplicate" };
    let url: URL;
    try {
        url = new URL(callback);
    } catch {
        return { kind: "unmatched", reason: "malformed", providerError: false };
    }
    const providerError = url.searchParams.has("error");
    const states = url.searchParams.getAll("state");
    if (states.length === 0 || states[0] === "")
        return { kind: "unmatched", reason: "stateMissing", providerError };
    if (states.length > 1) return { kind: "unmatched", reason: "malformed", providerError };
    const state = states[0]!;
    const id = owners.get(state);
    if (!id) return { kind: "unmatched", reason: "stateUnknown", providerError };
    return { kind: "matched", id, state };
}

/** How many handled callbacks are remembered to recognize a repeat. */
const SEEN_LIMIT = 32;

/** Correlates the external OAuth state with the connection that opened its login. */
export function desktopCloudAuthRouterCreate(
    bridge: HappyDesktopBridge,
    onEvent: (event: DesktopCloudAuthEvent) => void,
) {
    const key = "happy.connection-oauth.v1";
    const owners = new Map<string, string>();
    try {
        const stored = localStorage.getItem(key);
        if (stored)
            for (const [state, id] of JSON.parse(stored) as [string, string][])
                owners.set(state, id);
    } catch {
        /* A missing correlation is never guessed from the focused connection. */
    }
    const pending = new Map<string, string>();
    const listeners = new Map<string, Set<() => void>>();
    // Callbacks already handled, kept in memory only, so the browser opening
    // the same address twice is one event rather than a second notice.
    const seen = new Set<string>();
    let reading = false;
    // A callback announced while one is being read waits in the shell; it is
    // read as soon as the current one is handled rather than at the next one.
    let again = false;
    const persist = (): void => {
        try {
            localStorage.setItem(key, JSON.stringify([...owners]));
        } catch {
            /* Current-window login still works. */
        }
    };
    const remember = (callback: string): void => {
        seen.add(callback);
        if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value!);
    };
    const receive = async (): Promise<void> => {
        if (reading) {
            again = true;
            return;
        }
        reading = true;
        again = false;
        try {
            const callback = await bridge.cloudAuthCallbackTake();
            if (!callback) return;
            const result = desktopCloudAuthCallbackClassify(callback, owners, seen);
            if (result.kind === "duplicate") return;
            remember(callback);
            if (result.kind === "unmatched") {
                onEvent({ kind: "unmatched", providerError: result.providerError });
                return;
            }
            pending.set(result.id, callback);
            onEvent({ kind: "matched", id: result.id });
            for (const listener of listeners.get(result.id) ?? []) listener();
        } finally {
            reading = false;
            if (again) void receive().catch(() => undefined);
        }
    };
    const unsubscribe = bridge.cloudAuthCallbackSubscribe(() => {
        void receive().catch(() => undefined);
    });
    void receive().catch(() => undefined);
    return {
        hostFor(id: string): HappyAgentCloudHost {
            return {
                cloudAuthConfigurationGet: () => bridge.cloudAuthConfigurationGet(),
                cloudAuthCallbackSubscribe(listener) {
                    let group = listeners.get(id);
                    if (!group) {
                        group = new Set();
                        listeners.set(id, group);
                    }
                    group.add(listener);
                    return () => {
                        group.delete(listener);
                        if (!group.size) listeners.delete(id);
                    };
                },
                async cloudAuthCallbackTake() {
                    const callback = pending.get(id);
                    pending.delete(id);
                    if (callback) {
                        const state = new URL(callback).searchParams.get("state");
                        if (state) owners.delete(state);
                        persist();
                    }
                    return callback;
                },
                cloudAuthCallbackSettle(outcome) {
                    onEvent({ kind: "settled", id, outcome });
                },
                async cloudAuthOpen(url) {
                    const state = new URL(url).searchParams.get("state");
                    if (!state)
                        throw new Error("The account login did not provide its OAuth state.");
                    owners.set(state, id);
                    persist();
                    await bridge.cloudAuthOpen(url);
                },
            };
        },
        dispose() {
            unsubscribe();
            listeners.clear();
            pending.clear();
            seen.clear();
        },
    };
}
