import type { UserSettingValue } from "@slopus/happy-agent-client";
import type { UserError } from "../types.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsDocument,
    type HappyAgentUserSettingsPersistence,
} from "../happyAgent/happyAgentUserSettings.js";

/** Shared with other clients; explicit false is a saved choice, not a missing setting. */
export const PROJECTS_VISIBILITY_SETTING_KEY = "happy-desktop.projectsVisibility";
export interface ProjectsVisibilityDocument {
    readonly projectsHidden: boolean;
}
export type ProjectsVisibilityCacheDocument = HappyAgentUserSettingsDocument;
export type ProjectsVisibilityPersistence = HappyAgentUserSettingsPersistence;
export interface ProjectsVisibilityConnection extends ProjectsVisibilityDocument {
    readonly synchronization: "waitingForIdentity" | "pending" | "synced" | "unsupported" | "error";
    readonly readError?: UserError;
    readonly saveError?: UserError;
}
export interface ProjectsVisibilitySnapshot {
    readonly connections: ReadonlyMap<string, ProjectsVisibilityConnection>;
}
export interface ProjectsVisibilityStore {
    get(): ProjectsVisibilitySnapshot;
    subscribe(listener: () => void): () => void;
    projectsHiddenUpdate(connectionId: string, hidden: boolean): void;
}
export interface ProjectsVisibilityStoreOptions {
    readonly persistence?: ProjectsVisibilityPersistence;
    readonly now?: () => number;
    /** Consumed only after this connection authenticates; never imported into a team identity. */
    readonly legacyLocal?: {
        readonly connectionId: string;
        consume(): ProjectsVisibilityDocument | undefined;
    };
}

function documentParse(value: unknown): ProjectsVisibilityDocument | undefined {
    if (typeof value !== "object" || value === null || !("projectsHidden" in value))
        return undefined;
    return typeof value.projectsHidden === "boolean"
        ? { projectsHidden: value.projectsHidden }
        : undefined;
}
const SHOWN: ProjectsVisibilityConnection = {
    projectsHidden: false,
    synchronization: "waitingForIdentity",
};
const EMPTY: ProjectsVisibilitySnapshot = { connections: new Map() };

export function projectsVisibilityConnection(
    snapshot: ProjectsVisibilitySnapshot,
    connectionId: string,
): ProjectsVisibilityConnection {
    return snapshot.connections.get(connectionId) ?? SHOWN;
}

/** One authenticated daemon preference per connection, with a durable offline queue. */
export function projectsVisibilityStoreOwnedCreate(options: ProjectsVisibilityStoreOptions = {}) {
    const driver = happyAgentUserSettingsCreate<ProjectsVisibilityDocument | undefined>({
        empty: undefined,
        equal: (left, right) => left?.projectsHidden === right?.projectsHidden,
        keyAccept: (key) => key === PROJECTS_VISIBILITY_SETTING_KEY,
        decode: (values) => documentParse(values.get(PROJECTS_VISIBILITY_SETTING_KEY)),
        encode: (choice) =>
            new Map<string, UserSettingValue>([
                [
                    PROJECTS_VISIBILITY_SETTING_KEY,
                    choice ? { projectsHidden: choice.projectsHidden } : null,
                ],
            ]),
        deviceParse: documentParse,
        deviceSerialize: (choice) => choice,
        persistence: options.persistence,
        now: options.now,
        deviceMigrate(connectionId, owner) {
            if (!options.legacyLocal || connectionId !== options.legacyLocal.connectionId)
                return undefined;
            const legacy = options.legacyLocal.consume();
            return owner === null ? documentParse(legacy) : undefined;
        },
        // The old device choice has no timestamp. It must lose to any actual
        // user edit, including one made remotely while bootstrap was in flight.
        deviceImportUpdatedAt: 0,
        requireOwnerIdentity: true,
    });
    let previous: ReturnType<typeof driver.get> | undefined;
    let snapshot = EMPTY;
    const store: ProjectsVisibilityStore = {
        get() {
            const current = driver.get();
            if (current !== previous) {
                previous = current;
                const connections = new Map<string, ProjectsVisibilityConnection>();
                for (const [id, entry] of current.connections) {
                    const prior = snapshot.connections.get(id);
                    const projectsHidden = entry.choices?.projectsHidden ?? false;
                    const synchronization =
                        entry.readError || entry.saveError
                            ? "error"
                            : entry.support === "unsupported"
                              ? "unsupported"
                              : !entry.ownerConfirmed
                                ? "waitingForIdentity"
                                : entry.saving
                                  ? "pending"
                                  : "synced";
                    connections.set(
                        id,
                        prior &&
                            prior.projectsHidden === projectsHidden &&
                            prior.synchronization === synchronization &&
                            prior.readError === entry.readError &&
                            prior.saveError === entry.saveError
                            ? prior
                            : {
                                  projectsHidden,
                                  synchronization,
                                  ...(entry.readError ? { readError: entry.readError } : {}),
                                  ...(entry.saveError ? { saveError: entry.saveError } : {}),
                              },
                    );
                }
                snapshot = { connections };
            }
            return snapshot;
        },
        subscribe: driver.subscribe,
        projectsHiddenUpdate(connectionId, projectsHidden) {
            driver.choicesUpdate(connectionId, { projectsHidden });
        },
    };
    return { store, connectionFollow: driver.connectionFollow };
}

export function projectsVisibilityStoreCreate(
    options?: ProjectsVisibilityStoreOptions,
): ProjectsVisibilityStore {
    return projectsVisibilityStoreOwnedCreate(options).store;
}
export const projectsVisibilityStoreNoop: ProjectsVisibilityStore = {
    get: () => EMPTY,
    projectsHiddenUpdate: () => {},
    subscribe: () => () => {},
};
