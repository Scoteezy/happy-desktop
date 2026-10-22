import {
    happyAgentAutoJoinSettingsCreate,
    type HappyAgentAutoJoinSettingsSnapshot,
} from "./happyAgentAutoJoinSettings.js";
import type { HappyAgentUserSettingsSource } from "./happyAgentUserSettings.js";

export type HappyAgentTaskSettingsSnapshot = HappyAgentAutoJoinSettingsSnapshot;

/** One authenticated person's task membership preference on one Happy Agent. */
export interface HappyAgentTaskSettingsStore {
    get(): HappyAgentTaskSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    taskAutoJoinUpdate(enabled: boolean): void;
    [Symbol.dispose](): void;
}

export function happyAgentTaskSettingsStoreCreate(
    source: HappyAgentUserSettingsSource,
): HappyAgentTaskSettingsStore {
    const store = happyAgentAutoJoinSettingsCreate(source, "tasks.autoJoin");
    return {
        get: store.get,
        subscribe: store.subscribe,
        taskAutoJoinUpdate: store.autoJoinUpdate,
        [Symbol.dispose]: store[Symbol.dispose],
    };
}
