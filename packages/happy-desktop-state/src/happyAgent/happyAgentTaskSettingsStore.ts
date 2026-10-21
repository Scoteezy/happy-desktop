import type { UserError } from "../types.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsSource,
} from "./happyAgentUserSettings.js";

export type HappyAgentTaskSettingsSnapshot =
    | { readonly status: "loading"; readonly error?: UserError }
    | { readonly status: "unsupported" }
    | {
          readonly status: "ready";
          readonly autoJoinEnabled: boolean;
          readonly online: boolean;
          readonly saving: boolean;
          readonly error?: UserError;
          readonly saveError?: UserError;
      };

/** One authenticated person's task membership preference on one Happy Agent. */
export interface HappyAgentTaskSettingsStore {
    get(): HappyAgentTaskSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    taskAutoJoinUpdate(enabled: boolean): void;
    [Symbol.dispose](): void;
}

const KEY = "tasks.autoJoin";
const CONNECTION = "connection";
const LOADING: HappyAgentTaskSettingsSnapshot = { status: "loading" };
const UNSUPPORTED: HappyAgentTaskSettingsSnapshot = { status: "unsupported" };

/** No device fallback: only the server can apply this preference or join tasks. */
export function happyAgentTaskSettingsStoreCreate(
    source: HappyAgentUserSettingsSource,
): HappyAgentTaskSettingsStore {
    const driver = happyAgentUserSettingsCreate<boolean>({
        empty: true,
        equal: (left, right) => left === right,
        keyAccept: (key) => key === KEY,
        decode: (values) => values.get(KEY) !== false,
        encode: (enabled) => new Map([[KEY, enabled ? null : false]]),
        deviceParse: () => true,
        deviceSerialize: () => undefined,
    });
    const listeners = new Set<() => void>();
    let disposed = false;
    let starting = false;
    let stop: (() => void) | undefined;
    let previous: ReturnType<typeof driver.get> | undefined;
    let snapshot: HappyAgentTaskSettingsSnapshot = LOADING;
    const get = (): HappyAgentTaskSettingsSnapshot => {
        const current = driver.get();
        if (previous === current) return snapshot;
        previous = current;
        const entry = current.connections.get(CONNECTION);
        if (!entry || entry.support === "unknown")
            snapshot = entry?.readError ? { status: "loading", error: entry.readError } : LOADING;
        else if (entry.support === "unsupported") snapshot = UNSUPPORTED;
        else
            snapshot = {
                status: "ready",
                autoJoinEnabled: entry.choices,
                online: entry.online,
                saving: entry.saving,
                ...(entry.readError ? { error: entry.readError } : {}),
                ...(entry.saveError ? { saveError: entry.saveError } : {}),
            };
        return snapshot;
    };
    const release = (): void => {
        const releaseFollow = stop;
        stop = undefined;
        releaseFollow?.();
    };
    const unsubscribe = driver.subscribe(() => {
        for (const listener of listeners) listener();
        const current = get();
        // Keep a submitted write alive if Settings closes before the server acknowledges it.
        if (listeners.size === 0 && !(current.status === "ready" && current.saving)) release();
    });
    return {
        get,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (!stop && !starting) {
                starting = true;
                try {
                    const releaseFollow = driver.connectionFollow(CONNECTION, source);
                    const current = get();
                    // Starting the driver notifies synchronously, so a listener may
                    // already have disposed the store or released the last lease.
                    if (
                        disposed ||
                        (listeners.size === 0 && !(current.status === "ready" && current.saving))
                    )
                        releaseFollow();
                    else stop = releaseFollow;
                } finally {
                    starting = false;
                }
            }
            return () => {
                listeners.delete(listener);
                const current = get();
                if (listeners.size === 0 && !(current.status === "ready" && current.saving))
                    release();
            };
        },
        taskAutoJoinUpdate(enabled) {
            const current = get();
            if (disposed || current.status !== "ready" || !current.online || current.saving) return;
            driver.choicesUpdate(CONNECTION, enabled);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            unsubscribe();
            listeners.clear();
            release();
        },
    };
}
