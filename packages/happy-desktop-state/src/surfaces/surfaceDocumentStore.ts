import {
    HappyAgentApiError,
    type HappyAgentClient,
    type SurfaceDocument,
} from "@slopus/happy-agent-client";
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
    type HappyAgentSurfaceDocumentEvent,
} from "./surfaceProject.js";
import type { HappyAgentSurfaceDocument, HappyAgentSurfaceId } from "./surfaceTypes.js";

/** The daemon's bound on a document's text, in UTF-16 code units. */
export const HAPPY_AGENT_SURFACE_DOCUMENT_TEXT_LIMIT = 262_144;
/** How long typing rests before it is saved. */
const SAVE_IDLE = 1_000;
/**
 * The longest typing goes unsaved while it never rests. Every save is a
 * permanent version, so a save per keystroke would bury the history.
 */
const SAVE_LONGEST = 5_000;
/** How many conflicts in a row are answered at once before answering waits. */
const CONFLICT_RETRIES = 5;

/**
 * The version the reader's typing was saved over because both changed the
 * same part of the text at once.
 */
export interface HappyAgentSurfaceDocumentConflict {
    readonly lastEditorUserId: string | null;
    readonly updatedAt: number;
}

export interface HappyAgentSurfaceDocumentSnapshot {
    readonly surfaceId: HappyAgentSurfaceId;
    /**
     * `loading` until the document has been read once, and `missing` when the
     * daemon has no such document. A document this window is making is
     * `ready` at once, empty, and can be written in before the daemon has it.
     */
    readonly status: "loading" | "ready" | "missing";
    /** The text as it stands here: the daemon's, with the reader's own typing over it. */
    readonly text: string;
    /** Whether the text is open for writing, rather than shown rendered. */
    readonly editing: boolean;
    /** Whether some of the reader's typing has not reached the daemon yet. */
    readonly saving: boolean;
    /**
     * Someone changed the same part of the text while the reader was typing,
     * and the reader's text was kept. Theirs is still among the versions.
     */
    readonly conflict?: HappyAgentSurfaceDocumentConflict;
    /** The daemon refused the reader's text. It is kept, and sent again with the next change. */
    readonly failure?: UserError;
    /** The last read failed; what was held stays visible and the read is retried. */
    readonly error?: UserError;
}

export interface HappyAgentSurfaceDocumentStore {
    get(): HappyAgentSurfaceDocumentSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens the text for writing; a document not read yet stays closed. */
    editStart(): void;
    /** Closes the text, and sends what was typed without waiting for the typing to rest. */
    editEnd(): void;
    /** Replaces the text. It is saved once the typing rests, as a new version. */
    textUpdate(text: string): void;
    conflictDismiss(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceDocumentDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "getSurfaceDocument"
        | "updateSurfaceDocument"
        | "listSurfaceDocumentVersions"
        | "getSurfaceDocumentVersion"
    >;
    readonly sync: HappyAgentSync;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly now?: () => number;
    /**
     * Given for a document this window is still making: settles once the
     * daemon has it, rejected if it refused it. Reading and saving wait for it.
     */
    readonly surfaceCreated?: Promise<void>;
}

/** The reader's text, and the daemon's version and text it was written over. */
interface Draft {
    readonly text: string;
    /** `undefined` only for a document made here and not read yet, which is empty. */
    readonly baseVersion: string | undefined;
    readonly baseText: string;
}

/** One save: the whole text, the version it was written over, and its mutation ID. */
interface Save {
    readonly text: string;
    readonly ifMatch: string;
    readonly mutationId: string;
}

/** Where `next` differs from `base`, as one span: `base[start, end)` becomes `text`. */
function spanOf(base: string, next: string): { start: number; end: number; text: string } {
    const limit = Math.min(base.length, next.length);
    let start = 0;
    while (start < limit && base.charCodeAt(start) === next.charCodeAt(start)) start += 1;
    let tail = 0;
    while (
        tail < limit - start &&
        base.charCodeAt(base.length - 1 - tail) === next.charCodeAt(next.length - 1 - tail)
    )
        tail += 1;
    return { start, end: base.length - tail, text: next.slice(start, next.length - tail) };
}

/**
 * Both changes to `base`, when they touch different parts of it, or
 * `undefined` when they overlap. Each side's change is taken as the one span
 * it differs from `base` by, which is what typing between two saves a second
 * apart nearly always is.
 */
export function happyAgentSurfaceDocumentMerge(
    base: string,
    ours: string,
    theirs: string,
): string | undefined {
    if (ours === base || ours === theirs) return theirs;
    if (theirs === base) return ours;
    const mine = spanOf(base, ours);
    const other = spanOf(base, theirs);
    if (mine.end <= other.start)
        return (
            base.slice(0, mine.start) +
            mine.text +
            base.slice(mine.end, other.start) +
            other.text +
            base.slice(other.end)
        );
    if (other.end <= mine.start)
        return (
            base.slice(0, other.start) +
            other.text +
            base.slice(other.end, mine.start) +
            mine.text +
            base.slice(mine.end)
        );
    return undefined;
}

function conflictDocument(error: HappyAgentApiError): SurfaceDocument | undefined {
    const document = error.body?.["document"];
    return typeof document === "object" && document !== null
        ? (document as SurfaceDocument)
        : undefined;
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

/**
 * One document Surface, kept live while something shows it.
 *
 * The constructor opens nothing. The first subscriber follows
 * `surface.document.updated` and reads the document; the last one stops
 * following, and the text it held is shown again, while it is read once more,
 * when the document is next opened.
 *
 * Typing applies at once and is held over the daemon's text until the daemon
 * has it. It is saved once it rests for a second, or every five seconds while
 * it never does, and at once when writing ends; one save is in flight at a
 * time, naming the version the typing was written over as `If-Match`. A save
 * that never arrived is sent again under the same mutation ID. One whose
 * answer was lost may still have been taken; when the daemon's next version
 * turns out to be it, the typing done since stands on it instead of being
 * merged with it. An event says so by the save's mutation ID. A read or a
 * conflict names none, so the document's history is asked: the revision right
 * after the version the save named carries the mutation ID that made it, and
 * its text is what the typing then stands on.
 *
 * Someone else's change is merged into the reader's typing as it arrives, and
 * again when a save meets a version it did not name. Changes to different
 * parts of the text both stand. Changes to the same part keep the reader's
 * typing, which is saved over theirs and said so; theirs stays among the
 * document's permanent versions. A save the daemon refuses keeps the typing
 * and states the refusal. Typing is sent whether or not the document is still
 * on screen.
 */
export function happyAgentSurfaceDocumentStoreCreate(
    deps: HappyAgentSurfaceDocumentDeps,
): HappyAgentSurfaceDocumentStore {
    const idCreate = cuid2Create(deps.now ?? Date.now);
    const surfaceId = deps.surfaceId;
    const listeners = new Set<() => void>();
    /** The daemon's document as last read, confirmed, or followed. */
    let authoritative: HappyAgentSurfaceDocument | undefined;
    let draft: Draft | undefined;
    let snapshot: HappyAgentSurfaceDocumentSnapshot = {
        surfaceId,
        status: deps.surfaceCreated === undefined ? "loading" : "ready",
        text: "",
        editing: false,
        saving: false,
    };
    /** The save last sent, so the same text over the same version reuses its mutation ID. */
    let sent: Save | undefined;
    /**
     * Saves sent over the typing's version and not answered: the one in flight,
     * and any whose answer never came. The daemon may have taken one of them,
     * and at most one, since each names that version. Once one shows up as the
     * next version, the typing stands on its text rather than on the version
     * it was written over, or what was saved would be merged in twice.
     */
    let unanswered: Save[] = [];
    /** Whether the typing has rested, or writing ended, so it should be sent. */
    let due = false;
    let saveRunning = false;
    /** The daemon refused the last save; nothing is sent until the reader types again. */
    let refused = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let longest: ReturnType<typeof setTimeout> | undefined;
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reads = new AbortController();
    let readsInFlight = 0;
    let readLatest = 0;
    let journal: HappyAgentSurfaceDocumentEvent[] = [];
    let failed = false;
    let disposed = false;
    const life = new AbortController();

    const publish = (next: Partial<HappyAgentSurfaceDocumentSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };

    const republish = (next: Partial<HappyAgentSurfaceDocumentSnapshot> = {}): void => {
        publish({
            ...next,
            text: draft?.text ?? authoritative?.text ?? "",
            saving: draft !== undefined,
        });
    };

    /** Takes a later version of the document; answers whether anything changed. */
    const documentAdopt = (document: HappyAgentSurfaceDocument): boolean => {
        if (document.surfaceId !== surfaceId) return false;
        if (
            authoritative !== undefined &&
            !happyAgentVersionNewer(document.version, authoritative.version)
        )
            return false;
        authoritative = document;
        return true;
    };

    /** Moves the reader's typing onto a version that holds the reader's own save. */
    const draftStandOn = (version: string, text: string): void => {
        unanswered = [];
        if (draft === undefined) return;
        draft =
            draft.text === text
                ? undefined
                : { text: draft.text, baseVersion: version, baseText: text };
    };

    /**
     * Moves the reader's typing onto the daemon's latest version: merged when
     * the two changed different parts, the reader's kept when they did not.
     */
    const rebase = (): void => {
        const current = authoritative;
        if (draft === undefined || current === undefined) return;
        if (draft.baseVersion === current.version) return;
        const base = draft.baseVersion;
        // Until it is known whether a save over that version was taken, the
        // typing has no certain text to be merged from; the history says.
        if (unanswered.some((save) => save.ifMatch === base)) return;
        const merged = happyAgentSurfaceDocumentMerge(draft.baseText, draft.text, current.text);
        if (merged === undefined) {
            snapshot = {
                ...snapshot,
                conflict: {
                    lastEditorUserId: current.lastEditorUserId,
                    updatedAt: current.updatedAt,
                },
            };
            draft = { text: draft.text, baseVersion: current.version, baseText: current.text };
            return;
        }
        draft =
            merged === current.text
                ? undefined
                : { text: merged, baseVersion: current.version, baseText: current.text };
    };

    /**
     * Learns whether a save whose answer never came was taken, once the
     * document has moved past the version it named. Every save names the
     * version it is written over, so the revision right after that version is
     * the only one that can be it: it carries the mutation ID that made it, or
     * `null` when it was made without one. A daemon too old to keep that ID
     * leaves it out, which says nothing either way, and the typing is merged
     * as it was before the history could tell. Answers false when the history
     * could not be read, to be asked again.
     */
    const unansweredSettle = async (): Promise<boolean> => {
        const base = draft?.baseVersion;
        const current = authoritative;
        if (base === undefined || current === undefined || current.version === base) return true;
        if (!unanswered.some((save) => save.ifMatch === base)) return true;
        try {
            const page = await deps.client.listSurfaceDocumentVersions(surfaceId, {
                afterVersion: base,
                limit: 1,
                signal: life.signal,
            });
            const next = page.versions[0];
            const taken =
                next === undefined
                    ? undefined
                    : unanswered.find(
                          (save) => save.ifMatch === base && save.mutationId === next.mutationId,
                      );
            if (next === undefined || taken === undefined) {
                // Someone else's version came next, so none of them can be
                // taken now; or this daemon keeps no mutation IDs, and nothing
                // says one was. Either way the typing is merged.
                unanswered = [];
                return true;
            }
            const { revision } = await deps.client.getSurfaceDocumentVersion(
                surfaceId,
                next.version,
                { signal: life.signal },
            );
            // An event naming the save may have moved the typing meanwhile.
            if (draft?.baseVersion === base && revision.mutationId === taken.mutationId)
                draftStandOn(revision.document.version, revision.document.text);
            return true;
        } catch (error) {
            if (error instanceof HappyAgentApiError && error.status >= 400 && error.status < 500) {
                // A history this window may not read settles nothing; the
                // typing is merged as it stands.
                unanswered = [];
                return true;
            }
            return false;
        }
    };

    const timersClear = (): void => {
        if (idle) clearTimeout(idle);
        if (longest) clearTimeout(longest);
        idle = undefined;
        longest = undefined;
    };

    const saveRun = async (): Promise<void> => {
        if (saveRunning || disposed) return;
        saveRunning = true;
        try {
            if (deps.surfaceCreated !== undefined) {
                try {
                    await deps.surfaceCreated;
                } catch {
                    return;
                }
            }
            let delay = 1_000;
            let conflicts = 0;
            while (!disposed && due && draft !== undefined && !refused) {
                if (authoritative === undefined) {
                    // A version must be named, so a document never read is read first.
                    try {
                        const response = await deps.client.getSurfaceDocument(surfaceId, {
                            signal: life.signal,
                        });
                        if (disposed) return;
                        documentAdopt(happyAgentSurfaceDocumentProject(response.document));
                        rebase();
                        republish({ status: "ready" });
                    } catch (error) {
                        if (disposed || life.signal.aborted) return;
                        if (error instanceof HappyAgentApiError && error.status === 404) {
                            republish({ status: "missing", editing: false });
                            return;
                        }
                        await waitFor(delay, life.signal);
                        delay = Math.min(delay * 2, 10_000);
                    }
                    continue;
                }
                if (!(await unansweredSettle())) {
                    if (disposed || life.signal.aborted) return;
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                    continue;
                }
                if (disposed) return;
                rebase();
                if (draft === undefined) {
                    republish();
                    break;
                }
                const text = draft.text;
                const ifMatch = draft.baseVersion ?? authoritative.version;
                if (sent === undefined || sent.text !== text || sent.ifMatch !== ifMatch)
                    sent = { text, ifMatch, mutationId: idCreate() };
                const save = sent;
                if (!unanswered.includes(save)) unanswered.push(save);
                due = false;
                try {
                    const response = await deps.client.updateSurfaceDocument(
                        surfaceId,
                        { text, mutationId: save.mutationId },
                        { ifMatch, signal: life.signal },
                    );
                    if (disposed) return;
                    delay = 1_000;
                    conflicts = 0;
                    sent = undefined;
                    const saved = happyAgentSurfaceDocumentProject(response.document);
                    documentAdopt(saved);
                    // What was typed meanwhile now stands on the version just saved.
                    draftStandOn(saved.version, saved.text);
                    republish();
                } catch (error) {
                    if (disposed || life.signal.aborted) return;
                    if (
                        error instanceof HappyAgentApiError &&
                        error.status >= 400 &&
                        error.status < 500
                    )
                        unanswered = unanswered.filter((other) => other !== save);
                    if (error instanceof HappyAgentApiError && error.status === 409) {
                        const current = conflictDocument(error);
                        if (current === undefined) authoritative = undefined;
                        else documentAdopt(happyAgentSurfaceDocumentProject(current));
                        due = true;
                        conflicts += 1;
                        if (conflicts > CONFLICT_RETRIES) {
                            await waitFor(delay, life.signal);
                            delay = Math.min(delay * 2, 10_000);
                        }
                        continue;
                    }
                    if (
                        error instanceof HappyAgentApiError &&
                        error.status >= 400 &&
                        error.status < 500
                    ) {
                        refused = true;
                        sent = undefined;
                        republish({ failure: happyAgentUserError(error) });
                        return;
                    }
                    // Never arrived, or the daemon failed: the same save, under
                    // the same mutation ID, once it can be heard again.
                    due = true;
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            saveRunning = false;
        }
    };

    const flush = (): void => {
        timersClear();
        if (draft === undefined) return;
        due = true;
        void saveRun();
    };

    /** Applies one event; answers whether the document changed. */
    const eventApply = (event: HappyAgentSurfaceDocumentEvent): boolean => {
        const current = authoritative;
        if (event.surfaceId !== surfaceId || current === undefined) return false;
        if (!happyAgentVersionNewer(event.version, current.version)) return false;
        if (event.previousVersion !== current.version) {
            // A version this window never saw came between: read it whole.
            reload();
            return false;
        }
        authoritative = {
            ...current,
            text: event.text,
            lastEditorUserId: event.lastEditorUserId,
            updatedAt: event.updatedAt,
            version: event.version,
        };
        // An event names the save that made it; one that names none leaves
        // the question to the document's history.
        if (
            draft !== undefined &&
            draft.baseVersion === event.previousVersion &&
            event.mutationId !== undefined &&
            unanswered.some((save) => save.mutationId === event.mutationId)
        )
            draftStandOn(event.version, event.text);
        return true;
    };

    const reload = (): void => {
        if (following === undefined) return;
        readsInFlight += 1;
        readLatest += 1;
        const token = readLatest;
        const signal = reads.signal;
        const mark = journal.length;
        let ended = false;
        const end = (): void => {
            if (ended || signal.aborted) return;
            ended = true;
            readsInFlight -= 1;
            if (readsInFlight === 0) journal = [];
        };
        void happyAgentSyncRead(
            signal,
            async () => {
                try {
                    await deps.surfaceCreated;
                } catch {
                    return undefined;
                }
                try {
                    return (await deps.client.getSurfaceDocument(surfaceId, { signal })).document;
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 404)
                        return undefined;
                    throw error;
                }
            },
            (error) => {
                if (signal.aborted) return;
                failed = true;
                publish({ error: happyAgentUserError(error) });
            },
        )
            .then((document) => {
                if (signal.aborted || token !== readLatest) return;
                failed = false;
                const { error: _error, ...rest } = snapshot;
                snapshot = rest;
                if (document === undefined) {
                    republish({ status: "missing", editing: false });
                    return;
                }
                documentAdopt(happyAgentSurfaceDocumentProject(document));
                for (const event of journal.slice(mark)) eventApply(event);
                // A save in flight moves the typing itself when it is answered.
                if (!saveRunning) rebase();
                republish({ status: "ready" });
            })
            .catch(() => undefined)
            .finally(end);
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...HAPPY_AGENT_SURFACE_DOCUMENT_EVENT_TYPES],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    reload();
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const event = happyAgentSurfaceDocumentEventProject(input.update.event);
                if (event === undefined || event.surfaceId !== surfaceId) continue;
                if (readsInFlight > 0) journal.push(event);
                if (snapshot.status !== "ready") continue;
                if (!eventApply(event)) continue;
                if (!saveRunning) rebase();
                republish();
            }
        })()
            .catch(() => {
                failed = true;
            })
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };

    const stop = (): void => {
        following?.abort();
        following = undefined;
        reads.abort();
        reads = new AbortController();
        readsInFlight = 0;
        journal = [];
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    // A document this window could not make has nothing to show or save.
    deps.surfaceCreated?.catch(() => {
        if (!disposed) republish({ status: "missing", editing: false });
    });

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
        editStart() {
            if (disposed || snapshot.editing || snapshot.status !== "ready") return;
            publish({ editing: true });
        },
        editEnd() {
            if (disposed || !snapshot.editing) return;
            publish({ editing: false });
            flush();
        },
        textUpdate(value) {
            if (disposed || snapshot.status !== "ready") return;
            const text = value
                .replaceAll("\u0000", "")
                .slice(0, HAPPY_AGENT_SURFACE_DOCUMENT_TEXT_LIMIT);
            if (text === snapshot.text) return;
            draft = {
                text,
                baseVersion: draft?.baseVersion ?? authoritative?.version,
                baseText: draft?.baseText ?? authoritative?.text ?? "",
            };
            refused = false;
            const { failure: _failure, ...rest } = snapshot;
            snapshot = rest;
            republish();
            if (idle) clearTimeout(idle);
            idle = setTimeout(flush, SAVE_IDLE);
            longest ??= setTimeout(flush, SAVE_LONGEST);
        },
        conflictDismiss() {
            if (disposed || snapshot.conflict === undefined) return;
            const { conflict: _conflict, ...rest } = snapshot;
            snapshot = rest;
            publish({});
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            timersClear();
            life.abort();
            listeners.clear();
        },
    };
}
