/** A desktop preference, independent of any coding session or provider default. */
export interface GptLiveDocument {
    readonly gptLiveEnabled: boolean;
}

export interface GptLivePersistence {
    read(): GptLiveDocument | undefined;
    write(document: GptLiveDocument): void;
}

export interface GptLiveSnapshot {
    readonly gptLiveEnabled: boolean;
}

export interface GptLiveStore {
    get(): GptLiveSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opts into the desktop voice surface; never starts a call or a coding task. */
    gptLiveEnabledUpdate(enabled: boolean): void;
}

const DISABLED: GptLiveSnapshot = { gptLiveEnabled: false };

/**
 * Window-owned opt-in. Construction and subscription open no microphone,
 * transport, controller, timer, or session subscription. Even a persisted true
 * value is a preference, never consent to start recording on the next launch.
 * The authenticated GPT-Live bridge is not available in this build yet.
 */
export function gptLiveStoreCreate(persistence?: GptLivePersistence): GptLiveStore {
    let snapshot = DISABLED;
    try {
        // Local storage is an external, editable boundary. Only literal true
        // opts in; missing, obsolete, malformed, or inaccessible records fail off.
        const document: unknown = persistence?.read();
        if (
            typeof document === "object" &&
            document !== null &&
            (document as { gptLiveEnabled?: unknown }).gptLiveEnabled === true
        ) {
            snapshot = { gptLiveEnabled: true };
        }
    } catch {
        // Keep the default when storage cannot be read.
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
        gptLiveEnabledUpdate(enabled) {
            if (snapshot.gptLiveEnabled === enabled) return;
            snapshot = { gptLiveEnabled: enabled };
            try {
                persistence?.write(snapshot);
            } catch {
                // An unavailable persistence adapter must not prevent disabling.
            }
            for (const listener of listeners) listener();
        },
    };
}

export const gptLiveStoreNoop: GptLiveStore = {
    get: () => DISABLED,
    subscribe: () => () => {},
    gptLiveEnabledUpdate: () => {},
};
