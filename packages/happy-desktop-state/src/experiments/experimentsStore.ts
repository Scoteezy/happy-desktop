/**
 * Each unfinished feature is a separate choice, kept on this installation. The
 * Spaces sidebar is not one of them: it comes with Stem Cells, the person's own
 * setting on each daemon, and an installation's old Spaces switch is ignored.
 */
export const EXPERIMENTAL_FEATURES = [
    { id: "batchNotes", label: "Sidebar batch notes" },
    { id: "inbox", label: "Inbox" },
    { id: "voice", label: "Voice calls" },
] as const;

export type ExperimentalFeature = (typeof EXPERIMENTAL_FEATURES)[number]["id"];
export type ExperimentsSnapshot = Readonly<Record<ExperimentalFeature, boolean>>;
export type ExperimentsDocument = ExperimentsSnapshot;

export interface ExperimentsPersistence {
    read(): unknown;
    write(document: ExperimentsDocument): void;
}

export interface ExperimentsStore {
    get(): ExperimentsSnapshot;
    subscribe(listener: () => void): () => void;
    featureUpdate(feature: ExperimentalFeature, enabled: boolean): void;
}

const DISABLED: ExperimentsSnapshot = {
    batchNotes: false,
    inbox: false,
    voice: false,
};

/**
 * The features the old single switch covered keep that explicit choice; the sidebar redesign's
 * features came after it, so they wait for their own.
 */
const LEGACY_SWITCH_FEATURES: ReadonlySet<ExperimentalFeature> = new Set(["inbox", "voice"]);

/** Each feature is its own choice on this installation. */
function documentParse(value: unknown): ExperimentsSnapshot {
    if (typeof value !== "object" || value === null) return DISABLED;
    const legacy =
        "experimentalFeaturesEnabled" in value && value.experimentalFeaturesEnabled === true;
    const enabled = (id: ExperimentalFeature) =>
        id in value ? Reflect.get(value, id) === true : legacy && LEGACY_SWITCH_FEATURES.has(id);
    return {
        batchNotes: enabled("batchNotes"),
        inbox: enabled("inbox"),
        voice: enabled("voice"),
    };
}

export function experimentsStoreCreate(persistence?: ExperimentsPersistence): ExperimentsStore {
    let snapshot: ExperimentsSnapshot;
    try {
        snapshot = documentParse(persistence?.read());
    } catch {
        snapshot = DISABLED;
    }
    const listeners = new Set<() => void>();
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        featureUpdate(feature, enabled) {
            if (snapshot[feature] === enabled) return;
            snapshot = { ...snapshot, [feature]: enabled };
            try {
                persistence?.write(snapshot);
            } catch {
                // Denied storage still preserves this window's choice until it closes.
            }
            for (const listener of listeners) listener();
        },
    };
}

export const experimentsStoreNoop: ExperimentsStore = {
    featureUpdate: () => {},
    get: () => DISABLED,
    subscribe: () => () => {},
};
