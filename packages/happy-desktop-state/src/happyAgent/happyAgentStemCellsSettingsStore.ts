import type { UserError } from "../types.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsSource,
} from "./happyAgentUserSettings.js";

export const HAPPY_AGENT_STEM_CELLS_SETTING = "happy-desktop.experiments.stemCells";

export type HappyAgentStemCellsSettingsSnapshot =
    | { readonly status: "loading"; readonly error?: UserError }
    | { readonly status: "unsupported" }
    | {
          readonly status: "ready";
          readonly stemCellsEnabled: boolean;
          readonly online: boolean;
          readonly saving: boolean;
          readonly error?: UserError;
          readonly saveError?: UserError;
      };

/** One authenticated person's Stem Cells preference on one daemon. */
export interface HappyAgentStemCellsSettingsStore {
    get(): HappyAgentStemCellsSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    stemCellsUpdate(enabled: boolean): void;
    [Symbol.dispose](): void;
}

const CONNECTION = "connection";
const LOADING: HappyAgentStemCellsSettingsSnapshot = { status: "loading" };
const UNSUPPORTED: HappyAgentStemCellsSettingsSnapshot = { status: "unsupported" };

export const happyAgentStemCellsSettingsStoreNoop: HappyAgentStemCellsSettingsStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    stemCellsUpdate: () => undefined,
    [Symbol.dispose]: () => undefined,
};

export function happyAgentStemCellsSettingsStoreCreate(
    source: HappyAgentUserSettingsSource,
): HappyAgentStemCellsSettingsStore {
    // No device fallback or import: a previous installation-local opt-in says
    // nothing about which authenticated person wanted the daemon's automation.
    const driver = happyAgentUserSettingsCreate<boolean>({
        empty: false,
        equal: (left, right) => left === right,
        keyAccept: (key) => key === HAPPY_AGENT_STEM_CELLS_SETTING,
        decode: (values) => values.get(HAPPY_AGENT_STEM_CELLS_SETTING) === true,
        encode: (enabled) => new Map([[HAPPY_AGENT_STEM_CELLS_SETTING, enabled ? true : null]]),
        deviceParse: () => false,
        deviceSerialize: () => undefined,
    });
    const listeners = new Set<() => void>();
    let disposed = false;
    let starting = false;
    let stop: (() => void) | undefined;
    let previous: ReturnType<typeof driver.get> | undefined;
    let snapshot: HappyAgentStemCellsSettingsSnapshot = LOADING;
    const get = (): HappyAgentStemCellsSettingsSnapshot => {
        const current = driver.get();
        if (current === previous) return snapshot;
        previous = current;
        const entry = current.connections.get(CONNECTION);
        if (!entry || entry.support === "unknown")
            snapshot = entry?.readError ? { status: "loading", error: entry.readError } : LOADING;
        else if (entry.support === "unsupported") snapshot = UNSUPPORTED;
        else
            snapshot = {
                status: "ready",
                stemCellsEnabled: entry.choices,
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
    const saving = (): boolean => driver.get().connections.get(CONNECTION)?.saving === true;
    const unsubscribe = driver.subscribe(() => {
        for (const listener of listeners) listener();
        // Closing Settings must not cancel a submitted preference change.
        if (listeners.size === 0 && !saving()) release();
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
                    if (disposed || (listeners.size === 0 && !saving())) releaseFollow();
                    else stop = releaseFollow;
                } finally {
                    starting = false;
                }
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0 && !saving()) release();
            };
        },
        stemCellsUpdate(enabled) {
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
