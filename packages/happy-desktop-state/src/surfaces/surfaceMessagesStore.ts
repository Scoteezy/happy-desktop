import {
    HappyAgentApiError,
    type HappyAgentClient,
    type SurfaceMessage,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import {
    HAPPY_AGENT_SURFACE_MESSAGE_EVENT_TYPES,
    happyAgentSurfaceMessageChangesApply,
    happyAgentSurfaceMessageEventProject,
    happyAgentSurfaceMessageProject,
    happyAgentVersionNewer,
    type HappyAgentSurfaceMessageEvent,
} from "./surfaceProject.js";
import { happyAgentSurfacePeopleReaderCreate } from "./surfacePeople.js";
import type {
    HappyAgentSurfaceId,
    HappyAgentSurfaceMessage,
    HappyAgentSurfaceMessageId,
    HappyAgentSurfacePerson,
} from "./surfaceTypes.js";

const NO_AUTHORS: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map();
const NO_MESSAGES: readonly HappyAgentSurfaceMessage[] = [];
const NO_OUTGOING: readonly HappyAgentSurfaceOutgoingMessage[] = [];

/** The daemon's bound on a message's text, in UTF-16 units. */
export const HAPPY_AGENT_SURFACE_MESSAGE_TEXT_LIMIT = 20_000;
/** How many messages one page of history holds when the reader scrolls back. */
const PAGE_LIMIT = 50;
/** The daemon's largest page, used to catch up and to read the held history again. */
const PAGE_LIMIT_MAX = 200;
/** How often one change is re-sent after the message moved on under it before it gives up. */
const CONFLICT_RETRIES = 3;
/**
 * The control characters the daemon refuses in a message: everything below a
 * space except tab and line feed, and DEL. They become spaces before the
 * message is ever shown.
 */
// eslint-disable-next-line no-control-regex
const MESSAGE_TEXT_FORBIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f]/gu;

/** A message posted here that the daemon has not taken yet. */
export interface HappyAgentSurfaceOutgoingMessage {
    readonly id: HappyAgentSurfaceMessageId;
    readonly text: string;
    readonly createdAt: number;
}

/** The message being edited, and its text so far. */
export interface HappyAgentSurfaceMessageEditing {
    readonly messageId: HappyAgentSurfaceMessageId;
    readonly text: string;
}

/**
 * Whether there is history before the oldest message held: none, more to
 * read, or a page of it being read now.
 */
export type HappyAgentSurfaceMessagesOlder = "none" | "more" | "loading";

export interface HappyAgentSurfaceMessagesSnapshot {
    readonly surfaceId: HappyAgentSurfaceId;
    /**
     * `loading` until the newest page has been read once, and `missing` when
     * the daemon has no such Surface. A conversation read before stays
     * `ready` while it is read again. Messages can be posted in either of the
     * first two; they are shown at once and reach the daemon once it has the
     * Surface.
     */
    readonly status: "loading" | "ready" | "missing";
    /**
     * The messages held, oldest first, with this window's own edits and
     * deletions applied as they are made. Deleted ones keep their place.
     */
    readonly messages: readonly HappyAgentSurfaceMessage[];
    /** Messages posted here and still on their way, in posting order, after every message. */
    readonly sending: readonly HappyAgentSurfaceOutgoingMessage[];
    readonly older: HappyAgentSurfaceMessagesOlder;
    /** The people the messages name as their authors, by user ID, as they are learned. */
    readonly authors: ReadonlyMap<string, HappyAgentSurfacePerson>;
    /** What is typed into the composer for a new message. */
    readonly draft: string;
    /** The message being edited, whose text the composer holds instead of the draft. */
    readonly editing?: HappyAgentSurfaceMessageEditing;
    /** The last change the daemon refused, until another change is made. */
    readonly failure?: UserError;
    /** The last read failed; what was held stays visible and the read is retried. */
    readonly error?: UserError;
}

export interface HappyAgentSurfaceMessagesStore {
    get(): HappyAgentSurfaceMessagesSnapshot;
    subscribe(listener: () => void): () => void;
    draftUpdate(text: string): void;
    /** Posts the draft at the end of the conversation and empties the composer. */
    draftSubmit(): void;
    /** Reads the page of history before the oldest message held, once. */
    olderLoad(): void;
    messageEditStart(messageId: HappyAgentSurfaceMessageId): void;
    messageEditTextUpdate(text: string): void;
    /** Saves the edit when it changed the text, and ends it either way. */
    messageEditCommit(): void;
    messageEditCancel(): void;
    messageDelete(messageId: HappyAgentSurfaceMessageId): void;
    /** Puts away the last refusal. */
    failureDismiss(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceMessagesDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "endpoint"
        | "listSurfaceMessages"
        | "getSurfaceMessage"
        | "sendSurfaceMessage"
        | "editSurfaceMessage"
        | "deleteSurfaceMessage"
        | "getUsers"
    >;
    readonly sync: HappyAgentSync;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly now?: () => number;
    /**
     * Given for a Surface this window is still making: settles once the
     * daemon has it, rejected if it refused it. Reading and posting wait for it.
     */
    readonly surfaceCreated?: Promise<void>;
}

/** One change this window asked for, held over the conversation until the daemon answers. */
type MessageOp =
    | {
          readonly kind: "create";
          readonly messageId: HappyAgentSurfaceMessageId;
          readonly text: string;
          readonly at: number;
      }
    | {
          readonly kind: "edit";
          readonly messageId: HappyAgentSurfaceMessageId;
          readonly text: string;
          readonly at: number;
      }
    | {
          readonly kind: "delete";
          readonly messageId: HappyAgentSurfaceMessageId;
          readonly at: number;
      };

interface QueuedOp {
    op: MessageOp;
    /** One idempotency key for every attempt of this change. */
    readonly mutationId: string;
    sent: boolean;
    conflicts: number;
}

/** A message with one pending change applied. */
function opApply(message: HappyAgentSurfaceMessage, op: MessageOp): HappyAgentSurfaceMessage {
    if (message.status === "deleted") return message;
    switch (op.kind) {
        case "create":
            return message;
        case "edit":
            return message.text === op.text
                ? message
                : { ...message, text: op.text, editedAt: op.at };
        case "delete":
            return { ...message, status: "deleted", deletedAt: op.at };
    }
}

function conflictMessage(error: HappyAgentApiError): SurfaceMessage | undefined {
    const message = error.body?.["message"];
    return typeof message === "object" && message !== null
        ? (message as SurfaceMessage)
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

function seqCompare(left: HappyAgentSurfaceMessage, right: HappyAgentSurfaceMessage): number {
    return left.seq - right.seq;
}

/**
 * One chat Surface's messages, kept live while something shows it.
 *
 * The constructor opens nothing. The first subscriber follows
 * `surface_message.*` events and reads the newest page; older pages are read
 * as the reader scrolls back. The last subscriber stops following, and what
 * was held is shown again, while it is read once more, when the conversation
 * is next opened.
 *
 * Messages are numbered contiguously from 1, so what is held is always one
 * unbroken run up to the newest. A message heard of past a gap, or a
 * reconnect, reads forward from the end of that run until it is the newest
 * again; a reconnect reads the whole run again, since an edit or a deletion
 * may have been missed. Events and reads are both applied by version, so
 * either can arrive first.
 *
 * Posting, editing, and deleting apply at once and are sent one at a time in
 * the order they were made, each under its own mutation ID. A post is made
 * with an ID chosen here, so a post sent again is the same post. An edit or a
 * deletion names the version it read as `If-Match`; a message that moved on
 * meanwhile is adopted from the conflict, and the change is sent again only if
 * it still changes anything. A request that never arrived is retried; one the
 * daemon refused is dropped and the refusal is stated.
 */
export function happyAgentSurfaceMessagesStoreCreate(
    deps: HappyAgentSurfaceMessagesDeps,
): HappyAgentSurfaceMessagesStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const surfaceId = deps.surfaceId;
    const listeners = new Set<() => void>();
    /** The daemon's messages as last read or confirmed, by ID. */
    let authoritative = new Map<HappyAgentSurfaceMessageId, HappyAgentSurfaceMessage>();
    /** The same messages in conversation order, kept with the map. */
    let ordered: readonly HappyAgentSurfaceMessage[] = NO_MESSAGES;
    let snapshot: HappyAgentSurfaceMessagesSnapshot = {
        surfaceId,
        status: "loading",
        messages: NO_MESSAGES,
        sending: NO_OUTGOING,
        older: "none",
        authors: NO_AUTHORS,
        draft: "",
    };
    let queue: QueuedOp[] = [];
    let queueRunning = false;
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reads = new AbortController();
    /** The read that brings the held run up to the newest, while one is going. */
    let forward: Promise<void> | undefined;
    /** Another forward read was asked for while one was going. */
    let forwardAgain = false;
    let olderReading = false;
    let failed = false;
    let disposed = false;
    const life = new AbortController();

    const publish = (next: Partial<HappyAgentSurfaceMessagesSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };

    const authors = happyAgentSurfacePeopleReaderCreate({
        client: deps.client,
        signal: life.signal,
        read(read) {
            if (disposed) return;
            publish({ authors: new Map([...snapshot.authors, ...read]) });
        },
    });

    const olderOf = (): HappyAgentSurfaceMessagesOlder =>
        olderReading ? "loading" : (ordered[0]?.seq ?? 1) > 1 ? "more" : "none";

    const republish = (next: Partial<HappyAgentSurfaceMessagesSnapshot> = {}): void => {
        snapshot = { ...snapshot, ...next };
        let messages = ordered;
        const sending: HappyAgentSurfaceOutgoingMessage[] = [];
        if (queue.length > 0) {
            const changed = new Map<HappyAgentSurfaceMessageId, HappyAgentSurfaceMessage>();
            for (const { op } of queue) {
                if (op.kind === "create") {
                    if (!authoritative.has(op.messageId))
                        sending.push({ id: op.messageId, text: op.text, createdAt: op.at });
                    continue;
                }
                const message = changed.get(op.messageId) ?? authoritative.get(op.messageId);
                if (message !== undefined) changed.set(op.messageId, opApply(message, op));
            }
            if (changed.size > 0)
                messages = ordered.map((message) => changed.get(message.id) ?? message);
        }
        // Unchanged lists keep their identity, and so does every unchanged
        // message, so nothing downstream redraws for a change that moved nothing.
        const same = <Item>(left: readonly Item[], right: readonly Item[]): boolean =>
            left.length === right.length && left.every((item, index) => item === right[index]);
        const sameOutgoing =
            sending.length === snapshot.sending.length &&
            sending.every(
                (entry, index) =>
                    entry.id === snapshot.sending[index]!.id &&
                    entry.text === snapshot.sending[index]!.text,
            );
        publish({
            messages: same(messages, snapshot.messages) ? snapshot.messages : messages,
            sending: sameOutgoing ? snapshot.sending : sending.length === 0 ? NO_OUTGOING : sending,
            older: olderOf(),
        });
    };

    /** Takes messages the daemon gave; answers whether anything changed. */
    const messagesAdopt = (messages: readonly HappyAgentSurfaceMessage[]): boolean => {
        let next: Map<HappyAgentSurfaceMessageId, HappyAgentSurfaceMessage> | undefined;
        for (const message of messages) {
            if (message.surfaceId !== surfaceId) continue;
            const current = (next ?? authoritative).get(message.id);
            if (current !== undefined && !happyAgentVersionNewer(message.version, current.version))
                continue;
            next ??= new Map(authoritative);
            next.set(message.id, message);
        }
        if (next === undefined) return false;
        authoritative = next;
        ordered = [...next.values()].sort(seqCompare);
        authors.request(messages.map((message) => message.authorUserId));
        return true;
    };

    /** The last message of the unbroken run from the oldest held, or `undefined` when none is held. */
    const runEnd = (): HappyAgentSurfaceMessage | undefined => {
        for (let index = 0; index + 1 < ordered.length; index += 1)
            if (ordered[index + 1]!.seq !== ordered[index]!.seq + 1) return ordered[index];
        return ordered.at(-1);
    };

    const pageRead = (
        signal: AbortSignal,
        options: {
            readonly beforeSeq?: number;
            readonly afterSeq?: number;
            readonly limit: number;
        },
    ) =>
        happyAgentSyncRead(
            signal,
            async () => {
                try {
                    await deps.surfaceCreated;
                } catch {
                    return undefined;
                }
                try {
                    const page = await deps.client.listSurfaceMessages(surfaceId, {
                        ...options,
                        signal,
                    });
                    return {
                        messages: page.messages.map(happyAgentSurfaceMessageProject),
                        nextBeforeSeq: page.nextBeforeSeq,
                        nextAfterSeq: page.nextAfterSeq,
                    };
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
        );

    const readSucceeded = (): void => {
        failed = false;
        if (snapshot.error === undefined) return;
        const { error: _error, ...rest } = snapshot;
        snapshot = rest;
    };

    const missing = (): void => {
        authoritative = new Map();
        ordered = NO_MESSAGES;
        republish({ status: "missing" });
    };

    /**
     * Brings what is held up to the newest message. With `again`, the whole
     * run held is read once more from its oldest message, for a reconnect
     * that may have missed changes to any of them.
     */
    const forwardRead = (again: boolean): void => {
        if (following === undefined) return;
        if (forward !== undefined) {
            forwardAgain ||= again;
            return;
        }
        const signal = reads.signal;
        forward = (async () => {
            let after: number | undefined;
            if (ordered.length === 0) {
                const page = await pageRead(signal, { limit: PAGE_LIMIT });
                if (signal.aborted) return;
                readSucceeded();
                if (page === undefined) return missing();
                messagesAdopt(page.messages);
                republish({ status: "ready" });
            } else after = again ? ordered[0]!.seq - 1 : runEnd()?.seq;
            while (after !== undefined) {
                const page = await pageRead(signal, { afterSeq: after, limit: PAGE_LIMIT_MAX });
                if (signal.aborted) return;
                readSucceeded();
                if (page === undefined) return missing();
                messagesAdopt(page.messages);
                republish({ status: "ready" });
                after = page.nextAfterSeq ?? undefined;
            }
            // A message heard of past a gap is a run of its own until the gap is read.
            const end = runEnd();
            if (end !== undefined && end !== ordered.at(-1)) forwardAgain = true;
        })()
            .catch(() => undefined)
            .finally(() => {
                forward = undefined;
                if (signal.aborted || !forwardAgain) return;
                forwardAgain = false;
                forwardRead(false);
            });
    };

    const messageReread = (messageId: HappyAgentSurfaceMessageId): void => {
        void deps.client.getSurfaceMessage(surfaceId, messageId, { signal: life.signal }).then(
            (response) => {
                if (messagesAdopt([happyAgentSurfaceMessageProject(response.message)])) republish();
            },
            () => undefined,
        );
    };

    /** Applies one event; answers whether the conversation changed. */
    const eventApply = (event: HappyAgentSurfaceMessageEvent): boolean => {
        if (event.type === "created") {
            const message = event.message;
            const oldest = ordered[0];
            // History before the oldest held is read when it is scrolled to.
            if (oldest !== undefined && message.seq < oldest.seq) return false;
            const end = ordered.at(-1);
            const changed = messagesAdopt([message]);
            if (snapshot.status === "ready" && end !== undefined && message.seq > end.seq + 1)
                forwardRead(false);
            return changed;
        }
        const current = authoritative.get(event.messageId);
        if (current === undefined) return false;
        if (!happyAgentVersionNewer(event.version, current.version)) return false;
        const next =
            current.version === event.previousVersion
                ? happyAgentSurfaceMessageChangesApply(current, event.changes, event.version)
                : undefined;
        if (next === undefined) {
            messageReread(event.messageId);
            return false;
        }
        return messagesAdopt([next]);
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...HAPPY_AGENT_SURFACE_MESSAGE_EVENT_TYPES, "profile.updated"],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                // What was held from an earlier visit may have been edited
                // since, so it is read again with whatever came after it.
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    forwardRead(ordered.length > 0);
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const raw = input.update.event;
                if (raw.type === "profile.updated") {
                    // An author renamed or rephotographed is read again.
                    const userId = raw.payload.userId ?? raw.payload.profile?.userId;
                    if (userId != null && snapshot.authors.has(userId)) authors.request([], userId);
                    continue;
                }
                const event = happyAgentSurfaceMessageEventProject(raw);
                if (event === undefined) continue;
                if (event.type === "created" && event.message.surfaceId !== surfaceId) continue;
                if (event.type === "updated" && event.surfaceId !== surfaceId) continue;
                if (eventApply(event)) republish();
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
        forward = undefined;
        forwardAgain = false;
        olderReading = false;
        if (retry) clearTimeout(retry);
        retry = undefined;
        // Only the newest page is kept for the next visit, which reads it
        // again; the history scrolled back through is read again if wanted.
        // Changes still on their way keep everything, as they name what they change.
        if (ordered.length > PAGE_LIMIT && queue.length === 0) {
            ordered = ordered.slice(-PAGE_LIMIT);
            authoritative = new Map(ordered.map((message) => [message.id, message]));
            republish();
        }
    };

    /**
     * Whether a pending change would still change the daemon's message. A
     * change the message already reflects, or one it can no longer take, is
     * dropped rather than sent.
     */
    const opNeeded = (op: MessageOp): boolean => {
        const message = authoritative.get(op.messageId);
        if (op.kind === "create") return message === undefined;
        if (message === undefined || message.status === "deleted") return false;
        return op.kind === "delete" || message.text !== op.text;
    };

    const opSend = async (entry: QueuedOp): Promise<SurfaceMessage> => {
        const op = entry.op;
        const signal = life.signal;
        if (op.kind === "create")
            return (
                await deps.client.sendSurfaceMessage(
                    surfaceId,
                    { id: op.messageId, text: op.text, mutationId: entry.mutationId },
                    { signal },
                )
            ).message;
        const ifMatch = authoritative.get(op.messageId)!.version;
        if (op.kind === "edit")
            return (
                await deps.client.editSurfaceMessage(
                    surfaceId,
                    op.messageId,
                    { text: op.text, mutationId: entry.mutationId },
                    { ifMatch, signal },
                )
            ).message;
        return (
            await deps.client.deleteSurfaceMessage(surfaceId, op.messageId, {
                ifMatch,
                mutationId: entry.mutationId,
                signal,
            })
        ).message;
    };

    /** Why a change was refused, in words for the reader. */
    const refusal = (op: MessageOp, error: HappyAgentApiError): UserError => {
        const reason = happyAgentUserError(error);
        switch (op.kind) {
            case "create":
                return new UserError(
                    `That message couldn’t be sent: ${reason.message}`,
                    undefined,
                    error,
                );
            case "edit":
                return new UserError(
                    `That edit couldn’t be saved: ${reason.message}`,
                    undefined,
                    error,
                );
            case "delete":
                return new UserError(
                    `That message couldn’t be deleted: ${reason.message}`,
                    undefined,
                    error,
                );
        }
    };

    const queueRun = async (): Promise<void> => {
        if (queueRunning) return;
        queueRunning = true;
        try {
            // A Surface still being made takes messages once it exists; one the
            // daemon refused turns each into a refusal of its own.
            await deps.surfaceCreated?.catch(() => undefined);
            let delay = 1_000;
            while (!disposed && queue.length > 0) {
                const entry = queue[0]!;
                if (!opNeeded(entry.op)) {
                    queue = queue.slice(1);
                    republish();
                    continue;
                }
                entry.sent = true;
                try {
                    const message = happyAgentSurfaceMessageProject(await opSend(entry));
                    if (disposed) return;
                    delay = 1_000;
                    const end = ordered.at(-1);
                    messagesAdopt([message]);
                    queue = queue.filter((queued) => queued !== entry);
                    republish();
                    // A post that landed past messages not heard of yet reads them.
                    if (
                        entry.op.kind === "create" &&
                        end !== undefined &&
                        message.seq > end.seq + 1
                    )
                        forwardRead(false);
                } catch (error) {
                    if (disposed || life.signal.aborted) return;
                    if (error instanceof HappyAgentApiError && error.status === 409) {
                        const current = conflictMessage(error);
                        if (current !== undefined)
                            messagesAdopt([happyAgentSurfaceMessageProject(current)]);
                        entry.sent = false;
                        entry.conflicts += 1;
                        if (entry.conflicts <= CONFLICT_RETRIES) {
                            republish();
                            continue;
                        }
                    }
                    if (
                        error instanceof HappyAgentApiError &&
                        error.status >= 400 &&
                        error.status < 500
                    ) {
                        queue = queue.filter((queued) => queued !== entry);
                        // A post that was refused goes back into an empty composer,
                        // so what was written is not lost with it.
                        const draft =
                            entry.op.kind === "create" && snapshot.draft === ""
                                ? { draft: entry.op.text }
                                : {};
                        republish({ ...draft, failure: refusal(entry.op, error) });
                        continue;
                    }
                    // Never arrived, or the daemon failed: the same change, under
                    // the same mutation ID, once it can be heard again.
                    entry.sent = false;
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            queueRunning = false;
        }
    };

    /**
     * Queues one change. An edit of a message whose last pending change is an
     * edit or a post that has not gone yet replaces its text, and deleting a
     * post that has not gone yet takes it back, so neither is ever sent.
     */
    const enqueue = (op: MessageOp): void => {
        if (disposed) return;
        const { failure: _failure, ...rest } = snapshot;
        snapshot = rest;
        let last: QueuedOp | undefined;
        for (let index = queue.length - 1; index >= 0; index -= 1)
            if (queue[index]!.op.messageId === op.messageId) {
                last = queue[index];
                break;
            }
        if (last !== undefined && !last.sent && op.kind === "edit" && last.op.kind !== "delete")
            last.op = { ...last.op, text: op.text };
        else if (
            last !== undefined &&
            !last.sent &&
            op.kind === "delete" &&
            last.op.kind === "create"
        )
            queue = queue.filter((queued) => queued !== last);
        else queue = [...queue, { op, mutationId: idCreate(), sent: false, conflicts: 0 }];
        republish();
        void queueRun();
    };

    /** The text a message may hold: within the daemon's bound and not blank. */
    const textClean = (text: string): string | undefined => {
        const clean = text.replace(MESSAGE_TEXT_FORBIDDEN, " ").trim();
        if (clean.length === 0) return undefined;
        return clean.slice(0, HAPPY_AGENT_SURFACE_MESSAGE_TEXT_LIMIT);
    };

    const editEnd = (): void => {
        const { editing: _editing, ...rest } = snapshot;
        snapshot = rest;
    };

    const store: HappyAgentSurfaceMessagesStore = {
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
        draftUpdate(text) {
            if (disposed || text === snapshot.draft) return;
            publish({ draft: text });
        },
        draftSubmit() {
            if (disposed || snapshot.status === "missing") return;
            const text = textClean(snapshot.draft);
            if (text === undefined) {
                if (snapshot.draft !== "") publish({ draft: "" });
                return;
            }
            snapshot = { ...snapshot, draft: "" };
            enqueue({
                kind: "create",
                messageId: idCreate() as HappyAgentSurfaceMessageId,
                text,
                at: now(),
            });
        },
        olderLoad() {
            const oldest = ordered[0];
            if (
                disposed ||
                following === undefined ||
                olderReading ||
                snapshot.status !== "ready" ||
                oldest === undefined ||
                oldest.seq <= 1
            )
                return;
            olderReading = true;
            republish();
            const signal = reads.signal;
            void pageRead(signal, { beforeSeq: oldest.seq, limit: PAGE_LIMIT })
                .then((page) => {
                    if (signal.aborted) return;
                    readSucceeded();
                    olderReading = false;
                    if (page === undefined) return missing();
                    messagesAdopt(page.messages);
                    republish();
                })
                .catch(() => undefined);
        },
        messageEditStart(messageId) {
            if (disposed || snapshot.editing?.messageId === messageId) return;
            const message = snapshot.messages.find((entry) => entry.id === messageId);
            if (message === undefined || message.status === "deleted") return;
            publish({ editing: { messageId, text: message.text } });
        },
        messageEditTextUpdate(text) {
            const editing = snapshot.editing;
            if (disposed || editing === undefined || editing.text === text) return;
            publish({ editing: { messageId: editing.messageId, text } });
        },
        messageEditCommit() {
            const editing = snapshot.editing;
            if (disposed || editing === undefined) return;
            const message = snapshot.messages.find((entry) => entry.id === editing.messageId);
            const text = textClean(editing.text);
            // A message is never edited down to nothing; that is a deletion.
            if (text === undefined) return;
            editEnd();
            if (message === undefined || message.status === "deleted" || text === message.text) {
                publish({});
                return;
            }
            enqueue({ kind: "edit", messageId: editing.messageId, text, at: now() });
        },
        messageEditCancel() {
            if (disposed || snapshot.editing === undefined) return;
            editEnd();
            publish({});
        },
        messageDelete(messageId) {
            if (disposed) return;
            const held =
                snapshot.messages.some(
                    (entry) => entry.id === messageId && entry.status === "active",
                ) || snapshot.sending.some((entry) => entry.id === messageId);
            if (!held) return;
            if (snapshot.editing?.messageId === messageId) editEnd();
            enqueue({ kind: "delete", messageId, at: now() });
        },
        failureDismiss() {
            if (disposed || snapshot.failure === undefined) return;
            const { failure: _failure, ...rest } = snapshot;
            snapshot = rest;
            publish({});
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            life.abort();
            listeners.clear();
            queue = [];
        },
    };
    return store;
}
