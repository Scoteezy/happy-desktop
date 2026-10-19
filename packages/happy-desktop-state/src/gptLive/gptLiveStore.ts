import type {
    GptLiveAccount,
    GptLiveAvailability,
    GptLiveCall,
    GptLiveRuntime,
    GptLiveRuntimeEvent,
    GptLiveTranscriptFragment,
    GptLiveVoiceFocus,
} from "./gptLiveRuntime.js";
import type { ExperimentsStore } from "../experiments/experimentsStore.js";
import { UserError } from "../types.js";

/** A desktop preference, independent of any coding session or provider default. */
export interface GptLiveDocument {
    readonly gptLiveEnabled: boolean;
    readonly accountId?: string;
}

export interface GptLivePersistence {
    read(): GptLiveDocument | undefined;
    write(document: GptLiveDocument): void;
}

export interface GptLiveSnapshot {
    readonly gptLiveEnabled: boolean;
    readonly status:
        | "disabled"
        | "idle"
        | "checking"
        | "unavailable"
        | "connecting"
        | "active"
        | "error";
    readonly availability?: GptLiveAvailability;
    readonly accountId?: string;
    readonly microphoneMuted: boolean;
    readonly panelVisible: boolean;
    readonly transcripts: readonly GptLiveTranscriptFragment[];
    readonly actionStatus?: string;
    readonly error?: string;
    /** Successful prompt revision captured when this call started, published once it is active. */
    readonly promptRevision?: number;
    /** A failed restart stays visible until the next explicit Start or End. */
    readonly restartStatus?: "closing" | "connecting" | "failed";
    /**
     * What the call is pointing at, separate from the window's own selection.
     * It lasts until the call points elsewhere, the call ends, or
     * `GPT_LIVE_VOICE_FOCUS_MS` passes, whichever comes first.
     */
    readonly voiceFocus?: GptLiveVoiceFocus;
}

/** How long a voice highlight stays up when nothing replaces or clears it. */
export const GPT_LIVE_VOICE_FOCUS_MS = 30_000;

export interface GptLiveStore {
    get(): GptLiveSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opts into the desktop voice surface; never starts a call or a coding task. */
    gptLiveEnabledUpdate(enabled: boolean): void;
    /** Reads capability/account choices only when enabled and explicitly requested by the surface. */
    availabilityRead(): void;
    accountSelect(id: string): void;
    /** A deliberate human Start action; restoring a preference never starts recording. */
    callStart(): void;
    callEnd(): void;
    /** Explicitly replaces an established call, after its normal close confirms completion. */
    callRestart(): void;
    panelOpen(): void;
    panelClose(): void;
    microphoneMutedUpdate(muted: boolean): void;
    [Symbol.dispose](): void;
}

const DISABLED: GptLiveSnapshot = {
    gptLiveEnabled: false,
    status: "disabled",
    microphoneMuted: false,
    panelVisible: false,
    transcripts: [],
};

/**
 * Window-owned opt-in. Construction and subscription open no microphone,
 * transport, controller, timer, or session subscription. Even a persisted true
 * value is a preference, never consent to start recording on the next launch.
 * The runtime is supplied by the desktop and owns all external resources.
 */
export function gptLiveStoreCreate(
    persistence?: GptLivePersistence,
    runtime?: GptLiveRuntime,
    experiments?: Pick<ExperimentsStore, "get">,
    promptRevisionRead: () => number = () => 0,
): GptLiveStore {
    const allowed = () => experiments?.get().experimentalFeaturesEnabled ?? true;
    let snapshot = DISABLED;
    try {
        // Local storage is an external, editable boundary. Only literal true
        // opts in; missing, obsolete, malformed, or inaccessible records fail off.
        const document: unknown = persistence?.read();
        if (
            typeof document === "object" &&
            document !== null &&
            typeof (document as { gptLiveEnabled?: unknown }).gptLiveEnabled === "boolean"
        ) {
            const enabled = (document as { gptLiveEnabled: boolean }).gptLiveEnabled && allowed();
            const accountId = (document as { accountId?: unknown }).accountId;
            snapshot = {
                ...DISABLED,
                gptLiveEnabled: enabled,
                status: enabled ? "idle" : "disabled",
                ...(typeof accountId === "string" ? { accountId } : {}),
            };
        }
    } catch {
        // Keep the default when storage cannot be read.
    }
    const listeners = new Set<() => void>();
    let disposed = false;
    let generation = 0;
    let availabilityController: AbortController | undefined;
    let callController: AbortController | undefined;
    let call: GptLiveCall | undefined;
    let opening: Promise<void> | undefined;
    let activeEpoch: number | undefined;
    let cleanup: Promise<void> = Promise.resolve();
    let cleanupPending = false;
    let startAfterAvailability = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const publish = (next: GptLiveSnapshot) => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const focusTimerClear = () => {
        if (focusTimer !== undefined) clearTimeout(focusTimer);
        focusTimer = undefined;
    };
    const focusUpdate = (focus: GptLiveVoiceFocus | null) => {
        focusTimerClear();
        const { voiceFocus: _previous, ...rest } = snapshot;
        if (!focus) {
            if (snapshot.voiceFocus) publish(rest);
            return;
        }
        publish({ ...rest, voiceFocus: focus });
        focusTimer = setTimeout(() => {
            focusTimer = undefined;
            if (disposed || snapshot.voiceFocus?.id !== focus.id) return;
            const { voiceFocus: _expired, ...remaining } = snapshot;
            publish(remaining);
        }, GPT_LIVE_VOICE_FOCUS_MS);
    };
    const stop = (): Promise<void> => {
        startAfterAvailability = false;
        focusTimerClear();
        generation++;
        availabilityController?.abort();
        availabilityController = undefined;
        const previous = call;
        const previousOpening = opening;
        call = undefined;
        opening = undefined;
        activeEpoch = undefined;
        if (previous || previousOpening) {
            cleanupPending = true;
            cleanup = previous ? Promise.resolve(previous.close()) : previousOpening!;
            // Track confirmed closure for an owned call, or a pending open's
            // late handle cleanup. Aborted uncertain creates retain the runtime's
            // existing background cleanup and do not become restart candidates.
            void cleanup.then(
                () => {
                    cleanupPending = false;
                },
                () => {
                    cleanupPending = false;
                },
            );
        }
        callController?.abort();
        callController = undefined;
        return cleanup;
    };
    const idle = (error?: string) => {
        const {
            actionStatus: _actionStatus,
            error: _error,
            voiceFocus: _voiceFocus,
            ...rest
        } = snapshot;
        publish({
            ...rest,
            status: snapshot.gptLiveEnabled ? (error ? "error" : "idle") : "disabled",
            microphoneMuted: false,
            restartStatus: error && snapshot.restartStatus ? "failed" : undefined,
            ...(error && snapshot.restartStatus
                ? { microphoneMuted: snapshot.microphoneMuted }
                : {}),
            ...(error ? { error } : {}),
        });
    };
    const receive = (epoch: number, promptRevision: number, event: GptLiveRuntimeEvent) => {
        if (disposed || epoch !== generation || !snapshot.gptLiveEnabled) return;
        switch (event.type) {
            case "callActive":
                // Provider readiness can precede the callOpen continuation.
                // Expose an active call only once its close handle is owned.
                if (!call) {
                    activeEpoch = epoch;
                    return;
                }
                publish({
                    ...snapshot,
                    status: "active",
                    promptRevision,
                    restartStatus: undefined,
                });
                break;
            case "callClosed":
                stop();
                idle();
                break;
            case "callFailed":
                stop();
                idle(event.message);
                break;
            case "transcriptReceived": {
                // Stable fragment IDs replace revisions without inventing user-turn boundaries.
                const transcripts = [...snapshot.transcripts];
                const existing = transcripts.findIndex((item) => item.id === event.fragment.id);
                if (existing < 0) transcripts.push(event.fragment);
                else transcripts[existing] = event.fragment;
                publish({ ...snapshot, transcripts: transcripts.slice(-100) });
                break;
            }
            case "actionStatusUpdated":
                publish({ ...snapshot, actionStatus: event.message });
                break;
            case "voiceFocusUpdated":
                // Only a live call points anywhere; a late event from a call
                // that is still connecting or already ending changes nothing.
                if (snapshot.status === "active") focusUpdate(event.focus);
                break;
        }
    };
    const store: GptLiveStore = {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => {};
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        gptLiveEnabledUpdate(enabled) {
            if (disposed || snapshot.gptLiveEnabled === enabled || (enabled && !allowed())) return;
            stop();
            const next: GptLiveSnapshot = {
                ...DISABLED,
                gptLiveEnabled: enabled,
                status: enabled ? "idle" : "disabled",
                ...(snapshot.accountId ? { accountId: snapshot.accountId } : {}),
                ...(snapshot.availability ? { availability: snapshot.availability } : {}),
            };
            try {
                persistence?.write({
                    gptLiveEnabled: enabled,
                    ...(next.accountId ? { accountId: next.accountId } : {}),
                });
            } catch {
                // An unavailable persistence adapter must not prevent disabling.
            }
            publish(next);
        },
        availabilityRead() {
            if (
                disposed ||
                !allowed() ||
                availabilityController ||
                callController ||
                cleanupPending
            )
                return;
            if (!runtime) {
                publish({
                    ...snapshot,
                    status: "unavailable",
                    error: "This desktop build does not support GPT-Live calls.",
                });
                return;
            }
            const controller = new AbortController();
            availabilityController = controller;
            const epoch = generation;
            publish({ ...snapshot, status: "checking", error: undefined });
            void runtime.availabilityRead(controller.signal).then(
                (availability) => {
                    if (disposed || controller.signal.aborted || generation !== epoch) return;
                    availabilityController = undefined;
                    publish({
                        ...snapshot,
                        availability,
                        status: !snapshot.gptLiveEnabled
                            ? "disabled"
                            : availability.supported
                              ? "idle"
                              : "unavailable",
                        error: availability.reason,
                        accountId: availability.accounts.some(
                            (item) => item.id === snapshot.accountId,
                        )
                            ? snapshot.accountId
                            : undefined,
                    });
                    if (startAfterAvailability) {
                        startAfterAvailability = false;
                        if (availability.supported) store.callStart();
                    }
                },
                () => {
                    if (disposed || controller.signal.aborted || generation !== epoch) return;
                    availabilityController = undefined;
                    startAfterAvailability = false;
                    publish({
                        ...snapshot,
                        status: "unavailable",
                        error: "GPT-Live availability could not be checked. Check your Happy Agent connection.",
                    });
                },
            );
        },
        accountSelect(id) {
            if (
                disposed ||
                callController ||
                cleanupPending ||
                snapshot.restartStatus === "closing" ||
                snapshot.restartStatus === "connecting" ||
                !snapshot.availability?.accounts.some((item) => item.id === id)
            )
                return;
            publish({ ...snapshot, accountId: id });
            try {
                persistence?.write({ gptLiveEnabled: snapshot.gptLiveEnabled, accountId: id });
            } catch {}
        },
        callStart() {
            if (
                disposed ||
                !allowed() ||
                !snapshot.gptLiveEnabled ||
                !runtime ||
                callController ||
                availabilityController ||
                cleanupPending ||
                snapshot.restartStatus === "closing"
            )
                return;
            if (!snapshot.accountId) {
                idle("Choose a voice account in Voice settings.");
                return;
            }
            if (!snapshot.availability || snapshot.status === "unavailable") {
                startAfterAvailability = true;
                store.availabilityRead();
                return;
            }
            if (!snapshot.availability.supported) return;
            const account: GptLiveAccount | undefined = snapshot.availability.accounts.find(
                (item) => item.id === snapshot.accountId,
            );
            if (!account) {
                idle("Choose a voice account in Voice settings.");
                return;
            }
            const abort = new AbortController();
            // A normal explicit Start also retains the existing recovery behavior
            // after an earlier close failed. Restart itself must confirm cleanup.
            cleanup = Promise.resolve();
            callController = abort;
            const epoch = ++generation;
            const promptRevision = promptRevisionRead();
            const restarting = snapshot.restartStatus !== undefined;
            publish({
                ...snapshot,
                status: "connecting",
                transcripts: [],
                error: undefined,
                microphoneMuted: restarting ? snapshot.microphoneMuted : false,
                restartStatus: restarting ? "connecting" : undefined,
            });
            const pendingOpen = runtime
                .callOpen(
                    { account, microphoneMuted: snapshot.microphoneMuted },
                    (event) => receive(epoch, promptRevision, event),
                    abort.signal,
                )
                .then(
                    (opened) => {
                        if (disposed || abort.signal.aborted || epoch !== generation) {
                            return opened.close();
                        }
                        call = opened;
                        opened.microphoneMutedUpdate(snapshot.microphoneMuted);
                        if (activeEpoch === epoch)
                            receive(epoch, promptRevision, { type: "callActive" });
                    },
                    (error: unknown) => {
                        if (disposed || abort.signal.aborted || epoch !== generation) return;
                        stop();
                        idle(
                            error instanceof UserError
                                ? error.message
                                : "The voice call could not connect.",
                        );
                    },
                );
            opening = pendingOpen;
            void pendingOpen.then(
                () => {
                    if (opening === pendingOpen) opening = undefined;
                },
                () => {
                    if (opening === pendingOpen) opening = undefined;
                },
            );
        },
        callEnd() {
            if (disposed) return;
            stop();
            idle();
        },
        callRestart() {
            // Pending microphone grants/uncertain creates keep their existing
            // cancellation path; only an established active call offers Restart.
            if (
                disposed ||
                !snapshot.gptLiveEnabled ||
                snapshot.restartStatus === "closing" ||
                snapshot.restartStatus === "connecting" ||
                snapshot.status !== "active" ||
                !call
            )
                return;
            const muted = snapshot.microphoneMuted;
            const closing = stop();
            const epoch = generation;
            publish({
                ...snapshot,
                status: "connecting",
                restartStatus: "closing",
                error: undefined,
            });
            void closing.then(
                () => {
                    if (disposed || epoch !== generation || !snapshot.gptLiveEnabled) return;
                    publish({ ...snapshot, restartStatus: "connecting", microphoneMuted: muted });
                    store.callStart();
                },
                (error: unknown) => {
                    if (disposed || epoch !== generation || !snapshot.gptLiveEnabled) return;
                    idle(
                        error instanceof UserError
                            ? error.message
                            : "The previous voice call could not be confirmed closed.",
                    );
                },
            );
        },
        panelOpen() {
            if (disposed || !allowed() || !snapshot.gptLiveEnabled) return;
            publish({ ...snapshot, panelVisible: true });
            if (!snapshot.availability) store.availabilityRead();
        },
        panelClose() {
            if (disposed || !snapshot.panelVisible) return;
            publish({ ...snapshot, panelVisible: false });
        },
        microphoneMutedUpdate(muted) {
            if (disposed || !callController || !snapshot.gptLiveEnabled) return;
            call?.microphoneMutedUpdate(muted);
            publish({ ...snapshot, microphoneMuted: muted });
        },
        [Symbol.dispose]() {
            if (disposed) return;
            stop();
            disposed = true;
            listeners.clear();
        },
    };
    return store;
}

/** Explicit window lifetime: withdrawing experiments ends voice through its normal close path. */
export function gptLiveExperimentsConnect(
    store: GptLiveStore,
    experiments: ExperimentsStore,
): () => void {
    const reconcile = () => {
        if (!experiments.get().experimentalFeaturesEnabled) store.gptLiveEnabledUpdate(false);
    };
    reconcile();
    return experiments.subscribe(reconcile);
}

export const gptLiveStoreNoop: GptLiveStore = {
    get: () => DISABLED,
    subscribe: () => () => {},
    gptLiveEnabledUpdate: () => {},
    availabilityRead: () => {},
    accountSelect: () => {},
    callStart: () => {},
    callEnd: () => {},
    callRestart: () => {},
    panelOpen: () => {},
    panelClose: () => {},
    microphoneMutedUpdate: () => {},
    [Symbol.dispose]: () => {},
};
