import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import * as Y from "yjs";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import {
    HAPPY_AGENT_SURFACE_DOCUMENT_EVENT_TYPES,
    happyAgentSurfaceDocumentEventProject,
    happyAgentSurfaceDocumentProject,
    happyAgentVersionNewer,
} from "./surfaceProject.js";
import type { HappyAgentSurfaceDocument, HappyAgentSurfaceId } from "./surfaceTypes.js";

/** The least time between two changes sent for one document. */
const SEND_SPACING = 200;
/** The least time between two presence updates sent for one document. */
const PRESENCE_SPACING = 250;
/**
 * The most change bytes merged into one request, under the daemon's 1 MiB
 * bound on one change. A single change larger than this is still sent alone.
 */
const SEND_BATCH_BYTES = 768 * 1024;

/** Whether the reader's changes have reached the Happy Agent. */
export type HappyAgentSurfaceDocumentSync = "saved" | "saving" | "offline";

/** Someone else's window in the document, as its editor last described itself. */
export interface HappyAgentSurfaceDocumentPresence {
    /** Names one window in this document; assigned by the Happy Agent, opaque. */
    readonly clientKey: string;
    /** Rises with each update from that window. */
    readonly revision: number;
    readonly active: boolean;
    /** That editor's awareness update, base64; absent once the window has left. */
    readonly update?: string;
    /** That editor's awareness client, so its caret can be taken away when it leaves. */
    readonly awarenessClientId?: number;
}

/** The reader's own editor's awareness, to be relayed to everyone else in the document. */
export interface HappyAgentSurfaceDocumentPresencePayload {
    readonly update: string;
    readonly awarenessClientId: number;
}

export type HappyAgentSurfaceDocumentSnapshot =
    | {
          readonly surfaceId: HappyAgentSurfaceId;
          /** Not read yet. A read that failed is retried, and says why meanwhile. */
          readonly status: "loading";
          readonly error?: UserError;
      }
    | { readonly surfaceId: HappyAgentSurfaceId; readonly status: "missing" }
    | {
          readonly surfaceId: HappyAgentSurfaceId;
          /** A collaborative document, open for writing. */
          readonly status: "live";
          /**
           * The shared document itself. It is the CRDT everyone's changes merge
           * in: the editor writes to it directly, and the store sends what is
           * written and applies what arrives. It stays the same object until the
           * Happy Agent refuses a change, when it is replaced by what it holds.
           */
          readonly ydoc: Y.Doc;
          readonly sync: HappyAgentSurfaceDocumentSync;
          /** Everyone else with the document open, by window. */
          readonly presence: readonly HappyAgentSurfaceDocumentPresence[];
          /** The Happy Agent refused a change, which was undone; cleared by the next one. */
          readonly failure?: UserError;
          /** Made in this window, so the reader is about to write its first line. */
          readonly madeHere: boolean;
      }
    | {
          readonly surfaceId: HappyAgentSurfaceId;
          /**
           * A Happy Agent too old for collaborative documents: its Markdown,
           * shown as it is and kept current, but not written here.
           */
          readonly status: "readOnly";
          readonly text: string;
          readonly error?: UserError;
      };

export interface HappyAgentSurfaceDocumentStore {
    get(): HappyAgentSurfaceDocumentSnapshot;
    subscribe(listener: () => void): () => void;
    /** The reader's editor says where its caret is; everyone else is told, at a steady pace. */
    presenceUpdate(payload: HappyAgentSurfaceDocumentPresencePayload): void;
    /**
     * The reader's pointer went down in the document, or came back up. While
     * it is down, everyone else's changes wait: one arriving while a click is
     * still placing the caret would put back the caret from before the click.
     */
    pointerPressUpdate(pressed: boolean): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceDocumentDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "getHealth"
        | "getSurfaceDocument"
        | "getSurfaceDocumentState"
        | "sendSurfaceDocumentUpdate"
        | "subscribeSurfaceDocument"
        | "unsubscribeSurfaceDocument"
        | "sendSurfaceDocumentPresence"
    >;
    readonly sync: HappyAgentSync;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly now?: () => number;
    /**
     * Given for a document this window is still making: settles once the
     * daemon has it, rejected if it refused it. A document is only made here
     * when the Happy Agent serves collaborative documents, so it is open for
     * writing at once, empty; sending and subscribing wait for it.
     */
    readonly surfaceCreated?: Promise<void>;
}

/** The origin of every change this store applies to the document from elsewhere. */
const REMOTE = Symbol("happy-agent-surface-document-remote");

/** A change being sent, kept whole so a retry repeats it under the same mutation ID. */
interface Sending {
    readonly mutationId: string;
    readonly update: string;
}

function base64Encode(bytes: Uint8Array): string {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = (): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
        };
        const timer = setTimeout(done, milliseconds);
        signal.addEventListener("abort", done, { once: true });
    });
}

function notFound(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status === 404;
}

/** The daemon answered and refused, as opposed to never answering or failing. */
function refusal(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status >= 400 && error.status < 500;
}

/**
 * One document Surface, kept for the life of the connection.
 *
 * The constructor opens nothing. The first subscriber asks the Happy Agent's
 * health whether it serves collaborative documents, and asks again on every
 * new connection, since a different daemon may be answering.
 *
 * A collaborative document is one Yjs document. While something shows it, the
 * connection's event stream is subscribed to it, and every change anyone makes
 * arrives on that stream in order and is merged in; what the stream missed,
 * across a gap or a reconnect, is read as whatever the document here lacks.
 * The reader's own changes are written to the document by the editor and sent
 * from here: merged while one request is in flight, at most one request at a
 * time and no closer than 200 ms apart, each repeated under its mutation ID
 * until the daemon has it, whether or not the document is still on screen. A
 * change the daemon refuses cannot be taken back out of a CRDT, so the
 * document is replaced by what the daemon holds, and says so.
 *
 * The reader's editor describes its caret through `presenceUpdate`; that is
 * sent at most every 250 ms, and the editor itself renews it every 15 seconds
 * while it is open. Everyone else's arrives on the same stream.
 *
 * An older Happy Agent has the Markdown text only, which is shown read-only
 * and kept current from its `surface.document.updated` events.
 */
export function happyAgentSurfaceDocumentStoreCreate(
    deps: HappyAgentSurfaceDocumentDeps,
): HappyAgentSurfaceDocumentStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const surfaceId = deps.surfaceId;
    const listeners = new Set<() => void>();
    const life = new AbortController();
    let disposed = false;

    /** What this Happy Agent serves, once its health has said. */
    let mode: "collaborative" | "markdown" | undefined =
        deps.surfaceCreated === undefined ? undefined : "collaborative";
    let missing = false;
    let error: UserError | undefined;

    // Collaborative.
    let ydoc: Y.Doc | undefined;
    /** Whether the document holds what the daemon had when it was first read. */
    let loaded = false;
    /** The latest change seen from the stream or a read; a frame past the next is a gap. */
    let seq = 0;
    /** The current connection's stream, while it is connected. */
    let streamId: string | undefined;
    /** The stream this document is subscribed on, once the daemon has said so. */
    let subscribed: string | undefined;
    const presence = new Map<string, HappyAgentSurfaceDocumentPresence>();
    /** The reader's changes not yet in a request. */
    let pending: Uint8Array[] = [];
    let sending: Sending | undefined;
    let sendRunning = false;
    let sendAt = 0;
    /** The last request failed without an answer; the reader is offline until one arrives. */
    let sendFailing = false;
    let failure: UserError | undefined;
    let presenceLatest: HappyAgentSurfaceDocumentPresencePayload | undefined;
    let presenceAt = 0;
    let presenceTimer: ReturnType<typeof setTimeout> | undefined;
    /** The reader's pointer is down in the document. */
    let pressed = false;
    /** Everyone else's changes that arrived while it was, for the document as it is now. */
    let held: Uint8Array[] = [];

    // Markdown.
    let markdown: HappyAgentSurfaceDocument | undefined;

    // Following.
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let health: AbortController | undefined;

    const snapshotOf = (): HappyAgentSurfaceDocumentSnapshot => {
        if (missing) return { surfaceId, status: "missing" };
        if (mode === "collaborative" && ydoc !== undefined && loaded)
            return {
                surfaceId,
                status: "live",
                ydoc,
                sync:
                    streamId === undefined || sendFailing
                        ? "offline"
                        : sending !== undefined || pending.length > 0
                          ? "saving"
                          : "saved",
                presence: [...presence.values()],
                ...(failure === undefined ? {} : { failure }),
                madeHere: deps.surfaceCreated !== undefined,
            };
        if (mode === "markdown" && markdown !== undefined)
            return {
                surfaceId,
                status: "readOnly",
                text: markdown.text,
                ...(error === undefined ? {} : { error }),
            };
        return { surfaceId, status: "loading", ...(error === undefined ? {} : { error }) };
    };
    let snapshot = snapshotOf();

    const publish = (): void => {
        if (disposed) return;
        const next = snapshotOf();
        const previous = snapshot;
        // The status line changes far less often than the document does.
        if (
            next.status === "live" &&
            previous.status === "live" &&
            next.ydoc === previous.ydoc &&
            next.sync === previous.sync &&
            next.failure === previous.failure &&
            next.presence.length === previous.presence.length &&
            next.presence.every((entry, index) => entry === previous.presence[index])
        )
            return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const created = async (): Promise<boolean> => {
        if (deps.surfaceCreated === undefined) return true;
        try {
            await deps.surfaceCreated;
            return true;
        } catch {
            return false;
        }
    };

    // ---- Collaborative --------------------------------------------------

    const localChange = (update: Uint8Array, origin: unknown): void => {
        if (origin === REMOTE || disposed) return;
        pending.push(update);
        failure = undefined;
        publish();
        void sendRun();
    };

    const ydocCreate = (): Y.Doc => {
        const doc = new Y.Doc();
        doc.on("update", localChange);
        return doc;
    };

    /** Applies what the daemon sent, as everyone else's change, once the reader's pointer is up. */
    const remoteApply = (doc: Y.Doc, update: string): void => {
        if (pressed && doc === ydoc) held.push(base64Decode(update));
        else Y.applyUpdate(doc, base64Decode(update), REMOTE);
    };

    const heldRelease = (): void => {
        const updates = held;
        held = [];
        if (updates.length > 0 && ydoc !== undefined && !disposed)
            Y.applyUpdate(ydoc, Y.mergeUpdates(updates), REMOTE);
    };

    /**
     * Reads what the document here lacks and merges it in: the whole document
     * the first time. Answers false once the document turns out to be gone.
     */
    const catchUp = async (signal: AbortSignal): Promise<boolean> => {
        const doc = (ydoc ??= ydocCreate());
        const stateVector = loaded ? base64Encode(Y.encodeStateVector(doc)) : undefined;
        try {
            const state = await happyAgentSyncRead(
                signal,
                () =>
                    deps.client.getSurfaceDocumentState(surfaceId, {
                        ...(stateVector === undefined ? {} : { stateVector }),
                        signal,
                    }),
                (readError) => {
                    if (notFound(readError)) throw readError;
                    if (!loaded) {
                        error = happyAgentUserError(readError);
                        publish();
                    }
                },
            );
            if (signal.aborted || disposed || ydoc !== doc) return true;
            remoteApply(doc, state.update);
            seq = Math.max(seq, state.seq);
            loaded = true;
            error = undefined;
            publish();
            return true;
        } catch (readError) {
            if (notFound(readError)) {
                missing = true;
                publish();
                return false;
            }
            return true;
        }
    };

    /** Subscribes the current stream to the document, then catches up on it. */
    const attach = async (signal: AbortSignal): Promise<void> => {
        if (!(await created())) {
            missing = true;
            publish();
            return;
        }
        if (signal.aborted || mode !== "collaborative") return;
        const stream = streamId;
        if (stream !== undefined && subscribed !== stream) {
            const answered = await happyAgentSyncRead(
                signal,
                () =>
                    deps.client.subscribeSurfaceDocument(
                        surfaceId,
                        { streamId: stream },
                        { signal },
                    ),
                (subscribeError) => {
                    // A refusal is not asked again: a document that is gone is
                    // found by the read below, a stream that is gone is
                    // replaced by the next connection, and a document open in
                    // too many windows is still read, without live changes.
                    if (refusal(subscribeError) || streamId !== stream) throw subscribeError;
                },
            ).then(
                () => true,
                () => false,
            );
            if (signal.aborted) return;
            if (answered && streamId === stream) {
                subscribed = stream;
                // Said again on the new subscription, still no sooner than the pace allows.
                presenceSchedule();
            }
        }
        await catchUp(signal);
    };

    const detach = (): void => {
        const stream = subscribed;
        subscribed = undefined;
        presenceLatest = undefined;
        if (presenceTimer) clearTimeout(presenceTimer);
        presenceTimer = undefined;
        presence.clear();
        // Ending the subscription also ends this window's presence there.
        if (stream !== undefined && !disposed)
            void deps.client
                .unsubscribeSurfaceDocument(
                    surfaceId,
                    { streamId: stream },
                    { signal: life.signal },
                )
                .catch(() => undefined);
    };

    const sendRun = async (): Promise<void> => {
        if (sendRunning || disposed) return;
        sendRunning = true;
        try {
            if (!(await created())) {
                missing = true;
                publish();
                return;
            }
            let delay = 1_000;
            while (!disposed && (sending !== undefined || pending.length > 0)) {
                if (sending === undefined) {
                    let bytes = 0;
                    let count = 0;
                    while (
                        count < pending.length &&
                        (count === 0 || bytes + pending[count]!.length <= SEND_BATCH_BYTES)
                    ) {
                        bytes += pending[count]!.length;
                        count += 1;
                    }
                    const batch = pending.slice(0, count);
                    pending = pending.slice(count);
                    sending = {
                        mutationId: idCreate(),
                        update: base64Encode(
                            batch.length === 1 ? batch[0]! : Y.mergeUpdates(batch),
                        ),
                    };
                }
                const wait = sendAt + SEND_SPACING - now();
                if (wait > 0) await waitFor(wait, life.signal);
                if (disposed) return;
                sendAt = now();
                const request = sending;
                try {
                    await deps.client.sendSurfaceDocumentUpdate(surfaceId, request, {
                        signal: life.signal,
                    });
                    if (disposed) return;
                    sending = undefined;
                    sendFailing = false;
                    delay = 1_000;
                    publish();
                } catch (sendError) {
                    if (disposed || life.signal.aborted) return;
                    if (notFound(sendError)) {
                        missing = true;
                        sending = undefined;
                        pending = [];
                        publish();
                        return;
                    }
                    if (refusal(sendError)) {
                        // What was refused, and everything written over it,
                        // cannot be taken out of the document; it is read again.
                        sending = undefined;
                        pending = [];
                        failure = happyAgentUserError(sendError);
                        ydocReplace();
                        return;
                    }
                    // Never answered, or the daemon failed: the same change,
                    // under the same mutation ID, once it can be heard again.
                    sendFailing = true;
                    publish();
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            sendRunning = false;
            // Written while the last run was ending, after it last looked.
            if (!disposed && !missing && pending.length > 0) void sendRun();
        }
    };

    /** Drops the document held here for what the daemon holds. */
    const ydocReplace = (): void => {
        const previous = ydoc;
        previous?.off("update", localChange);
        ydoc = ydocCreate();
        // The read below brings everything held for the old document.
        held = [];
        loaded = false;
        seq = 0;
        sendFailing = false;
        publish();
        previous?.destroy();
        const signal = following?.signal ?? life.signal;
        void catchUp(signal);
    };

    const presenceSend = (): void => {
        presenceTimer = undefined;
        const payload = presenceLatest;
        const stream = subscribed;
        if (payload === undefined || stream === undefined || disposed) return;
        presenceAt = now();
        void deps.client
            .sendSurfaceDocumentPresence(
                surfaceId,
                {
                    streamId: stream,
                    awarenessClientId: payload.awarenessClientId,
                    update: payload.update,
                },
                { signal: life.signal },
            )
            .catch(() => undefined);
    };

    const presenceSchedule = (): void => {
        if (presenceTimer !== undefined || subscribed === undefined) return;
        const wait = presenceAt + PRESENCE_SPACING - now();
        if (wait <= 0) presenceSend();
        else presenceTimer = setTimeout(presenceSend, wait);
    };

    // ---- Markdown -------------------------------------------------------

    const markdownRead = async (signal: AbortSignal): Promise<void> => {
        try {
            const response = await happyAgentSyncRead(
                signal,
                () => deps.client.getSurfaceDocument(surfaceId, { signal }),
                (readError) => {
                    if (notFound(readError)) throw readError;
                    error = happyAgentUserError(readError);
                    publish();
                },
            );
            if (signal.aborted || mode !== "markdown") return;
            const document = happyAgentSurfaceDocumentProject(response.document);
            // An event may already have brought a later version than this read.
            if (
                markdown === undefined ||
                !happyAgentVersionNewer(markdown.version, document.version)
            )
                markdown = document;
            error = undefined;
            publish();
        } catch (readError) {
            if (notFound(readError) && !signal.aborted) {
                missing = true;
                publish();
            }
        }
    };

    // ---- Following ------------------------------------------------------

    /** Learns what this Happy Agent serves, then reads the document as that. */
    const modeCheck = (signal: AbortSignal): void => {
        health?.abort();
        const own = new AbortController();
        health = own;
        const checkSignal = AbortSignal.any([signal, own.signal]);
        void (async () => {
            // A document this window is making is collaborative; asking would
            // only delay writing in it.
            let next = mode;
            if (deps.surfaceCreated === undefined) {
                try {
                    const answer = await happyAgentSyncRead(
                        checkSignal,
                        () => deps.client.getHealth({ signal: checkSignal }),
                        () => undefined,
                    );
                    next =
                        answer.capabilities?.collaborativeDocuments === true
                            ? "collaborative"
                            : "markdown";
                } catch {
                    return;
                }
            }
            if (checkSignal.aborted || disposed) return;
            if (next !== mode) {
                // A different daemon answers now; what the last one held is
                // read again in the form this one serves.
                if (mode === "collaborative") {
                    detach();
                    ydoc?.off("update", localChange);
                    ydoc?.destroy();
                    ydoc = undefined;
                    loaded = false;
                    seq = 0;
                    pending = [];
                    held = [];
                    sending = undefined;
                }
                markdown = undefined;
                mode = next;
                publish();
            }
            if (mode === "collaborative") await attach(checkSignal);
            else await markdownRead(checkSignal);
        })();
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        if (mode === "collaborative" && ydoc === undefined && deps.surfaceCreated !== undefined) {
            // Made here: empty, and open for writing before the daemon has it.
            ydoc = ydocCreate();
            loaded = true;
            publish();
        }
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...HAPPY_AGENT_SURFACE_DOCUMENT_EVENT_TYPES],
                documents: true,
            })) {
                if (input.kind === "error") continue;
                if (input.kind === "bootstrap" || input.kind === "reconcile") {
                    modeCheck(active.signal);
                    continue;
                }
                if (input.kind !== "update") continue;
                const update = input.update;
                if (update.kind === "connected") {
                    streamId = update.streamId;
                    if (subscribed !== undefined && subscribed !== streamId) {
                        // The old stream's subscription and presence ended with it.
                        subscribed = undefined;
                        presence.clear();
                    }
                    publish();
                    modeCheck(active.signal);
                    continue;
                }
                if (update.kind === "disconnected") {
                    streamId = undefined;
                    subscribed = undefined;
                    presence.clear();
                    publish();
                    continue;
                }
                if (update.kind === "document") {
                    const frame = update.frame;
                    // Frames reach this connection only for documents it
                    // subscribed, and can arrive before the subscription or
                    // the first read has answered; neither is waited for.
                    if (frame.data.surfaceId !== surfaceId || mode !== "collaborative") continue;
                    if (frame.type === "document.update") {
                        // Applied even before the first read lands: Yjs holds a
                        // change until what it builds on arrives, and the read
                        // may have been taken before this change was made.
                        const doc = (ydoc ??= ydocCreate());
                        const gap = loaded && frame.data.seq > seq + 1;
                        remoteApply(doc, frame.data.update);
                        seq = Math.max(seq, frame.data.seq);
                        // A change the stream skipped is read as whatever is missing.
                        if (gap) void catchUp(active.signal);
                        continue;
                    }
                    const known = presence.get(frame.data.clientKey);
                    if (known !== undefined && known.revision >= frame.data.revision) continue;
                    if (frame.data.active)
                        presence.set(frame.data.clientKey, {
                            clientKey: frame.data.clientKey,
                            revision: frame.data.revision,
                            active: true,
                            ...(frame.data.update === undefined
                                ? {}
                                : { update: frame.data.update }),
                            ...(frame.data.awarenessClientId === undefined
                                ? {}
                                : { awarenessClientId: frame.data.awarenessClientId }),
                        });
                    else presence.delete(frame.data.clientKey);
                    publish();
                    continue;
                }
                if (update.kind !== "event" || mode !== "markdown") continue;
                const event = happyAgentSurfaceDocumentEventProject(update.event);
                if (event === undefined || event.surfaceId !== surfaceId) continue;
                if (
                    markdown === undefined ||
                    !happyAgentVersionNewer(event.version, markdown.version)
                )
                    continue;
                markdown = {
                    ...markdown,
                    text: event.text,
                    lastEditorUserId: event.lastEditorUserId,
                    updatedAt: event.updatedAt,
                    version: event.version,
                };
                publish();
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };

    const stop = (): void => {
        following?.abort();
        following = undefined;
        health?.abort();
        health = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
        detach();
        // Nobody is reading it, so no pointer is down in it.
        pressed = false;
        heldRelease();
        publish();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        presenceUpdate(payload) {
            if (disposed || mode !== "collaborative") return;
            presenceLatest = payload;
            presenceSchedule();
        },
        pointerPressUpdate(next) {
            if (disposed || pressed === next) return;
            pressed = next;
            if (!next) heldRelease();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            stop();
            disposed = true;
            life.abort();
            ydoc?.off("update", localChange);
            listeners.clear();
        },
    };
}
