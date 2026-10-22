import {
    happyAgentAutoJoinSettingsCreate,
    type HappyAgentAutoJoinSettingsSnapshot,
} from "./happyAgentAutoJoinSettings.js";
import type { HappyAgentUserSettingsSource } from "./happyAgentUserSettings.js";

export { HAPPY_AGENT_SURFACE_AUTO_JOIN_PROTOCOL_VERSION } from "./happyAgentAutoJoinSettings.js";

export type HappyAgentSurfaceSettingsSnapshot = HappyAgentAutoJoinSettingsSnapshot;

/** One authenticated person's Surface membership preference on one Happy Agent. */
export interface HappyAgentSurfaceSettingsStore {
    get(): HappyAgentSurfaceSettingsSnapshot;
    subscribe(listener: () => void): () => void;
    surfaceAutoJoinUpdate(enabled: boolean): void;
    [Symbol.dispose](): void;
}

export function happyAgentSurfaceSettingsStoreCreate(
    source: HappyAgentUserSettingsSource,
): HappyAgentSurfaceSettingsStore {
    const store = happyAgentAutoJoinSettingsCreate(source, "surfaces.autoJoin");
    return {
        get: store.get,
        subscribe: store.subscribe,
        surfaceAutoJoinUpdate: store.autoJoinUpdate,
        [Symbol.dispose]: store[Symbol.dispose],
    };
}
