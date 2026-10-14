import { HappyAgentApiError, type HappyAgentClient, type Todo } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { orderKeyDecimalBetween, stringCompare } from "../utils/orderKeyDecimal.js";
import {
    HAPPY_AGENT_TODO_EVENT_TYPES,
    happyAgentTodoChangesApply,
    happyAgentTodoEventProject,
    happyAgentTodoProject,
    happyAgentVersionNewer,
    type HappyAgentTodoEvent,
} from "./surfaceProject.js";
import { happyAgentSurfacePeopleReaderCreate } from "./surfacePeople.js";
import type {
    HappyAgentSurfaceActiveTodo,
    HappyAgentSurfaceCompletedTodo,
    HappyAgentSurfaceId,
    HappyAgentSurfacePerson,
    HappyAgentSurfaceTodo,
    HappyAgentSurfaceTodoId,
} from "./surfaceTypes.js";

const NO_AUTHORS: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map();

/** The daemon's bound on a todo's text. */
export const HAPPY_AGENT_TODO_TEXT_LIMIT = 10_000;
/** How often one change is re-sent after the todo moved on under it before it gives up. */
const CONFLICT_RETRIES = 3;
/**
 * The control characters the daemon refuses in a todo: everything below a
 * space except tab and line feed, and DEL. A change it would refuse is undone,
 * so a pasted one becomes a space before the todo is ever shown.
 */
// eslint-disable-next-line no-control-regex
const TODO_TEXT_FORBIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f]/gu;

/** The todo being edited in place, and its text so far. */
export interface HappyAgentTodoEditing {
    readonly todoId: HappyAgentSurfaceTodoId;
    readonly text: string;
}

export interface HappyAgentTodoListSnapshot {
    readonly surfaceId: HappyAgentSurfaceId;
    /**
     * `loading` until the list has been read once, and `missing` when the
     * daemon has no such Surface. A list read before stays `ready` while it is
     * read again, so returning to it shows what it held rather than a loader.
     * Todos can be added in either of the first two; they apply at once and
     * reach the daemon once it has the list.
     */
    readonly status: "loading" | "ready" | "missing";
    /** Active todos in list order, with this window's own changes applied as they are made. */
    readonly active: readonly HappyAgentSurfaceActiveTodo[];
    /** Completed todos, newest completion first. They are never moved. */
    readonly completed: readonly HappyAgentSurfaceCompletedTodo[];
    readonly completedShown: boolean;
    /** The people the todos name as their authors, by user ID, as they are learned. */
    readonly authors: ReadonlyMap<string, HappyAgentSurfacePerson>;
    /** What is typed into the add field. */
    readonly draft: string;
    readonly editing?: HappyAgentTodoEditing;
    /** The last change the daemon refused, until another change is made. */
    readonly failure?: UserError;
    /** The last read failed; what was held stays visible and the read is retried. */
    readonly error?: UserError;
}

export interface HappyAgentTodoListStore {
    get(): HappyAgentTodoListSnapshot;
    subscribe(listener: () => void): () => void;
    draftUpdate(text: string): void;
    /** Adds the draft to the end of the active list and empties the field. */
    draftSubmit(): void;
    /** Checks a todo off, or puts a completed one back at the end of the active list. */
    todoStatusUpdate(todoId: HappyAgentSurfaceTodoId, status: "active" | "completed"): void;
    todoTextUpdate(todoId: HappyAgentSurfaceTodoId, text: string): void;
    todoDelete(todoId: HappyAgentSurfaceTodoId): void;
    /**
     * Moves an active todo to `toIndex` among the active todos. A drag reports
     * every slot it crosses, so this is called often; the list follows each
     * call at once and the daemon is sent only where the todo finally lands.
     */
    todoMove(todoId: HappyAgentSurfaceTodoId, toIndex: number): void;
    todoEditStart(todoId: HappyAgentSurfaceTodoId): void;
    todoEditTextUpdate(text: string): void;
    /** Saves the edit when it changed the text, and ends it either way. */
    todoEditCommit(): void;
    todoEditCancel(): void;
    completedShownUpdate(shown: boolean): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentTodoListDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "endpoint"
        | "listTodos"
        | "getTodo"
        | "createTodo"
        | "updateTodo"
        | "reorderTodo"
        | "deleteTodo"
        | "getUsers"
    >;
    readonly sync: HappyAgentSync;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly now?: () => number;
    /**
     * Given for a list this window is still making: settles once the daemon
     * has it, rejected if it refused it. Reading the list and sending changes
     * to it wait for it; changes made meanwhile apply at once as always.
     */
    readonly surfaceCreated?: Promise<void>;
}

/** One change this window asked for, held over the list until the daemon answers. */
type TodoOp =
    | {
          readonly kind: "create";
          readonly todoId: HappyAgentSurfaceTodoId;
          readonly text: string;
          readonly orderKey: string;
          readonly at: number;
      }
    | { readonly kind: "text"; readonly todoId: HappyAgentSurfaceTodoId; readonly text: string }
    | {
          readonly kind: "status";
          readonly todoId: HappyAgentSurfaceTodoId;
          readonly status: "active" | "completed";
          /** The key the todo is appended at when it becomes active again. */
          readonly orderKey: string;
          readonly at: number;
      }
    | { readonly kind: "delete"; readonly todoId: HappyAgentSurfaceTodoId; readonly at: number }
    | {
          readonly kind: "reorder";
          readonly todoId: HappyAgentSurfaceTodoId;
          readonly orderKey: string;
      };

interface QueuedOp {
    op: TodoOp;
    /** One idempotency key for every attempt of this change. */
    readonly mutationId: string;
    sent: boolean;
    conflicts: number;
}

function activeCompare(
    left: HappyAgentSurfaceActiveTodo,
    right: HappyAgentSurfaceActiveTodo,
): number {
    return stringCompare(left.orderKey, right.orderKey) || stringCompare(left.id, right.id);
}

function completedCompare(
    left: HappyAgentSurfaceCompletedTodo,
    right: HappyAgentSurfaceCompletedTodo,
): number {
    return right.completedAt - left.completedAt || stringCompare(left.id, right.id);
}

/** A todo with one pending change applied, or the todo unchanged when it does not apply. */
function opApply(
    todo: HappyAgentSurfaceTodo | undefined,
    op: TodoOp,
): HappyAgentSurfaceTodo | undefined {
    if (op.kind === "create") return todo;
    if (todo === undefined) return undefined;
    switch (op.kind) {
        case "text":
            return todo.text === op.text ? todo : { ...todo, text: op.text };
        case "status":
            if (todo.status === op.status || todo.status === "deleted") return todo;
            return op.status === "active"
                ? {
                      ...todo,
                      status: "active",
                      orderKey: op.orderKey,
                      completedAt: null,
                      deletedAt: null,
                  }
                : {
                      ...todo,
                      status: "completed",
                      orderKey: null,
                      completedAt: op.at,
                      deletedAt: null,
                  };
        case "delete":
            return todo.status === "deleted"
                ? todo
                : { ...todo, status: "deleted", orderKey: null, deletedAt: op.at };
        case "reorder":
            return todo.status === "active" && todo.orderKey !== op.orderKey
                ? { ...todo, orderKey: op.orderKey }
                : todo;
    }
}

/** The key between two neighbours, or the lower one when they share a key and nothing fits. */
function keyBetween(before: string | null, after: string | null): string {
    try {
        return orderKeyDecimalBetween(before, after);
    } catch {
        return before ?? after ?? orderKeyDecimalBetween(null, null);
    }
}

function conflictTodo(error: HappyAgentApiError): Todo | undefined {
    const todo = error.body?.["todo"];
    return typeof todo === "object" && todo !== null ? (todo as Todo) : undefined;
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
 * One todo list Surface, kept live while something shows it.
 *
 * The constructor opens nothing. The first subscriber follows `todo.*` events
 * and reads the active and completed todos; the last one stops following, and
 * the list it held is shown again, while it is read once more, when the list is
 * next opened. Deleted todos are tombstones and are not read or shown.
 *
 * Every change applies at once and is held over the daemon's list as a pending
 * change until the daemon answers. Changes are sent one at a time in the order
 * they were made, each naming the version it read as `If-Match`; a todo that
 * moved on meanwhile is adopted from the conflict, and the change is sent again
 * only if it still changes anything. Moves made during one drag replace each
 * other while they wait, so the daemon is told where the todo finally landed.
 * A request that never arrived is retried under the same mutation ID; one the
 * daemon refused is dropped, the list is read again, and the refusal is stated.
 * Pending changes are sent whether or not the list is still on screen.
 *
 * Events are delivery hints applied by version chain. One that arrives while a
 * read is in flight is replayed onto its answer, and a broken chain reads that
 * one todo again.
 */
export function happyAgentTodoListStoreCreate(
    deps: HappyAgentTodoListDeps,
): HappyAgentTodoListStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const surfaceId = deps.surfaceId;
    const listeners = new Set<() => void>();
    /** The daemon's todos as last read or confirmed, deleted ones included once seen. */
    let authoritative = new Map<HappyAgentSurfaceTodoId, HappyAgentSurfaceTodo>();
    let snapshot: HappyAgentTodoListSnapshot = {
        surfaceId,
        status: "loading",
        active: [],
        completed: [],
        completedShown: false,
        authors: NO_AUTHORS,
        draft: "",
    };
    let queue: QueuedOp[] = [];
    let queueRunning = false;
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reads = new AbortController();
    let readsInFlight = 0;
    let readLatest = 0;
    let journal: HappyAgentTodoEvent[] = [];
    let failed = false;
    let disposed = false;
    const life = new AbortController();

    const publish = (next: Partial<HappyAgentTodoListSnapshot>): void => {
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

    /** The daemon's todos with every pending change applied, in order. */
    const projected = (): Map<HappyAgentSurfaceTodoId, HappyAgentSurfaceTodo> => {
        if (queue.length === 0) return authoritative;
        const todos = new Map(authoritative);
        for (const { op } of queue) {
            if (op.kind === "create") {
                if (todos.has(op.todoId)) continue;
                todos.set(op.todoId, {
                    id: op.todoId,
                    surfaceId,
                    text: op.text,
                    // Who wrote it is the daemon's to say, once it answers;
                    // the reader is never credited here.
                    authorUserId: null,
                    status: "active",
                    orderKey: op.orderKey,
                    completedAt: null,
                    deletedAt: null,
                    createdAt: op.at,
                    updatedAt: op.at,
                    version: "",
                });
                continue;
            }
            const next = opApply(todos.get(op.todoId), op);
            if (next !== undefined) todos.set(op.todoId, next);
        }
        return todos;
    };

    const lists = (
        todos: ReadonlyMap<HappyAgentSurfaceTodoId, HappyAgentSurfaceTodo>,
    ): Pick<HappyAgentTodoListSnapshot, "active" | "completed"> => {
        const active: HappyAgentSurfaceActiveTodo[] = [];
        const completed: HappyAgentSurfaceCompletedTodo[] = [];
        for (const todo of todos.values()) {
            if (todo.status === "active") active.push(todo);
            else if (todo.status === "completed") completed.push(todo);
        }
        return { active: active.sort(activeCompare), completed: completed.sort(completedCompare) };
    };

    const republish = (next: Partial<HappyAgentTodoListSnapshot> = {}): void => {
        snapshot = { ...snapshot, ...next };
        const { active, completed } = lists(projected());
        // Unchanged lists keep their identity, so nothing downstream redraws
        // for a change that moved nothing.
        const same = <Item>(left: readonly Item[], right: readonly Item[]): boolean =>
            left.length === right.length && left.every((item, index) => item === right[index]);
        publish({
            active: same(active, snapshot.active) ? snapshot.active : active,
            completed: same(completed, snapshot.completed) ? snapshot.completed : completed,
        });
    };

    /** Takes a later version of a todo; answers whether anything changed. */
    const todoAdopt = (todo: HappyAgentSurfaceTodo): boolean => {
        if (todo.surfaceId !== surfaceId) return false;
        const current = authoritative.get(todo.id);
        if (current !== undefined && !happyAgentVersionNewer(todo.version, current.version))
            return false;
        authoritative = new Map(authoritative).set(todo.id, todo);
        authors.request([todo.authorUserId]);
        return true;
    };

    const todoReread = (todoId: HappyAgentSurfaceTodoId): void => {
        void deps.client.getTodo(surfaceId, todoId, { signal: life.signal }).then(
            (response) => {
                if (todoAdopt(happyAgentTodoProject(response.todo))) republish();
            },
            (error: unknown) => {
                if (!(error instanceof HappyAgentApiError) || error.status !== 404) return;
                if (!authoritative.has(todoId)) return;
                authoritative = new Map(authoritative);
                authoritative.delete(todoId);
                republish();
            },
        );
    };

    /** Applies one event; answers whether the list changed. */
    const eventApply = (event: HappyAgentTodoEvent): boolean => {
        if (event.type === "created") return todoAdopt(event.todo);
        if (event.surfaceId !== surfaceId) return false;
        const current = authoritative.get(event.todoId);
        if (current === undefined) {
            // A todo this list never read — a tombstone coming back, say.
            todoReread(event.todoId);
            return false;
        }
        if (!happyAgentVersionNewer(event.version, current.version)) return false;
        const next =
            current.version === event.previousVersion
                ? happyAgentTodoChangesApply(current, event.changes, event.version)
                : undefined;
        if (next === undefined) {
            todoReread(event.todoId);
            return false;
        }
        authoritative = new Map(authoritative).set(next.id, next);
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
                    const [active, completed] = await Promise.all([
                        deps.client.listTodos(surfaceId, { scope: "active", signal }),
                        deps.client.listTodos(surfaceId, { scope: "completed", signal }),
                    ]);
                    return [...active.todos, ...completed.todos];
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
            .then((todos) => {
                if (signal.aborted || token !== readLatest) return;
                failed = false;
                const { error: _error, ...rest } = snapshot;
                snapshot = rest;
                if (todos === undefined) {
                    authoritative = new Map();
                    republish({ status: "missing" });
                    return;
                }
                const read = new Map<HappyAgentSurfaceTodoId, HappyAgentSurfaceTodo>();
                for (const todo of todos) {
                    const projected = happyAgentTodoProject(todo);
                    read.set(projected.id, projected);
                }
                // A tombstone read before stays known, so its return is recognized.
                for (const todo of authoritative.values())
                    if (todo.status === "deleted" && !read.has(todo.id)) read.set(todo.id, todo);
                authoritative = read;
                authors.request([...read.values()].map((todo) => todo.authorUserId));
                for (const event of journal.slice(mark)) eventApply(event);
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
                events: [...HAPPY_AGENT_TODO_EVENT_TYPES, "profile.updated"],
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
                const raw = input.update.event;
                if (raw.type === "profile.updated") {
                    // An author renamed or rephotographed is read again.
                    const userId = raw.payload.userId ?? raw.payload.profile?.userId;
                    if (userId != null && snapshot.authors.has(userId)) authors.request([], userId);
                    continue;
                }
                const event = happyAgentTodoEventProject(raw);
                if (event === undefined) continue;
                if (event.type === "created" && event.todo.surfaceId !== surfaceId) continue;
                if (event.type === "updated" && event.surfaceId !== surfaceId) continue;
                if (readsInFlight > 0) journal.push(event);
                if (snapshot.status !== "ready") continue;
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
        readsInFlight = 0;
        journal = [];
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    /**
     * Whether a pending change would still change the daemon's todo, given the
     * list as it now stands. A change the todo already reflects, or one it can
     * no longer take, is dropped rather than sent.
     */
    const opNeeded = (op: TodoOp): boolean => {
        const todo = authoritative.get(op.todoId);
        if (op.kind === "create") return todo === undefined;
        if (todo === undefined || todo.status === "deleted") return false;
        switch (op.kind) {
            case "text":
                return todo.text !== op.text;
            case "status":
                return todo.status !== op.status;
            case "delete":
                return true;
            case "reorder": {
                if (todo.status !== "active") return false;
                const own = lists(authoritative).active;
                const wanted = lists(projected()).active;
                const ownIndex = own.findIndex((entry) => entry.id === op.todoId);
                const wantedIndex = wanted.findIndex((entry) => entry.id === op.todoId);
                return own[ownIndex - 1]?.id !== wanted[wantedIndex - 1]?.id;
            }
        }
    };

    const opSend = async (entry: QueuedOp): Promise<Todo> => {
        const op = entry.op;
        const signal = life.signal;
        if (op.kind === "create")
            return (
                await deps.client.createTodo(
                    surfaceId,
                    { id: op.todoId, text: op.text, mutationId: entry.mutationId },
                    { signal },
                )
            ).todo;
        const ifMatch = authoritative.get(op.todoId)!.version;
        switch (op.kind) {
            case "text":
                return (
                    await deps.client.updateTodo(
                        surfaceId,
                        op.todoId,
                        { text: op.text, mutationId: entry.mutationId },
                        { ifMatch, signal },
                    )
                ).todo;
            case "status":
                return (
                    await deps.client.updateTodo(
                        surfaceId,
                        op.todoId,
                        { status: op.status, mutationId: entry.mutationId },
                        { ifMatch, signal },
                    )
                ).todo;
            case "delete":
                return (
                    await deps.client.deleteTodo(surfaceId, op.todoId, {
                        ifMatch,
                        mutationId: entry.mutationId,
                        signal,
                    })
                ).todo;
            case "reorder": {
                const wanted = lists(projected()).active;
                const index = wanted.findIndex((todo) => todo.id === op.todoId);
                return (
                    await deps.client.reorderTodo(
                        surfaceId,
                        op.todoId,
                        { afterId: wanted[index - 1]?.id ?? null, mutationId: entry.mutationId },
                        { ifMatch, signal },
                    )
                ).todo;
            }
        }
    };

    const queueRun = async (): Promise<void> => {
        if (queueRunning) return;
        queueRunning = true;
        try {
            // A list still being made takes changes once it exists; one the
            // daemon refused turns each change into a refusal of its own.
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
                    const todo = await opSend(entry);
                    if (disposed) return;
                    delay = 1_000;
                    todoAdopt(happyAgentTodoProject(todo));
                    queue = queue.filter((queued) => queued !== entry);
                    republish();
                } catch (error) {
                    if (disposed || life.signal.aborted) return;
                    if (error instanceof HappyAgentApiError && error.status === 409) {
                        const current = conflictTodo(error);
                        if (current !== undefined) todoAdopt(happyAgentTodoProject(current));
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
                        republish({ failure: happyAgentUserError(error) });
                        reload();
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
     * Queues one change. A move or an edit of a todo whose last pending change
     * is a move or an edit that has not gone yet replaces it, so a drag across
     * ten slots sends one move.
     */
    const enqueue = (op: TodoOp): void => {
        if (disposed) return;
        const { failure: _failure, ...rest } = snapshot;
        snapshot = rest;
        let last: QueuedOp | undefined;
        for (let index = queue.length - 1; index >= 0; index -= 1)
            if (queue[index]!.op.todoId === op.todoId) {
                last = queue[index];
                break;
            }
        if (last !== undefined && !last.sent && last.op.kind === op.kind && op.kind !== "create")
            last.op = op;
        else queue = [...queue, { op, mutationId: idCreate(), sent: false, conflicts: 0 }];
        republish();
        void queueRun();
    };

    /** The key after the last active todo, as the daemon appends one. */
    const keyAppended = (): string => keyBetween(snapshot.active.at(-1)?.orderKey ?? null, null);

    /** The text a todo may hold: trimmed, within the daemon's bound, and not blank. */
    const textClean = (text: string): string | undefined => {
        const clean = text
            .replace(TODO_TEXT_FORBIDDEN, " ")
            .trim()
            .slice(0, HAPPY_AGENT_TODO_TEXT_LIMIT);
        return clean.length === 0 ? undefined : clean;
    };

    const todoOf = (todoId: HappyAgentSurfaceTodoId): HappyAgentSurfaceTodo | undefined =>
        snapshot.active.find((todo) => todo.id === todoId) ??
        snapshot.completed.find((todo) => todo.id === todoId);

    const store: HappyAgentTodoListStore = {
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
            const text = textClean(snapshot.draft);
            if (disposed || snapshot.status === "missing") return;
            if (text === undefined) {
                if (snapshot.draft !== "") publish({ draft: "" });
                return;
            }
            snapshot = { ...snapshot, draft: "" };
            enqueue({
                kind: "create",
                todoId: idCreate() as HappyAgentSurfaceTodoId,
                text,
                orderKey: keyAppended(),
                at: now(),
            });
        },
        todoStatusUpdate(todoId, status) {
            const todo = todoOf(todoId);
            if (todo === undefined || todo.status === status) return;
            if (snapshot.editing?.todoId === todoId) {
                const { editing: _editing, ...rest } = snapshot;
                snapshot = rest;
            }
            enqueue({ kind: "status", todoId, status, orderKey: keyAppended(), at: now() });
        },
        todoTextUpdate(todoId, text) {
            const todo = todoOf(todoId);
            const clean = textClean(text);
            if (todo === undefined || clean === undefined || clean === todo.text) return;
            enqueue({ kind: "text", todoId, text: clean });
        },
        todoDelete(todoId) {
            if (todoOf(todoId) === undefined) return;
            if (snapshot.editing?.todoId === todoId) {
                const { editing: _editing, ...rest } = snapshot;
                snapshot = rest;
            }
            enqueue({ kind: "delete", todoId, at: now() });
        },
        todoMove(todoId, toIndex) {
            const list = snapshot.active;
            const from = list.findIndex((todo) => todo.id === todoId);
            const to = Math.max(0, Math.min(list.length - 1, toIndex));
            if (from === -1 || from === to) return;
            const remaining = list.filter((todo) => todo.id !== todoId);
            const orderKey = keyBetween(
                remaining[to - 1]?.orderKey ?? null,
                remaining[to]?.orderKey ?? null,
            );
            enqueue({ kind: "reorder", todoId, orderKey });
        },
        todoEditStart(todoId) {
            const todo = todoOf(todoId);
            if (disposed || todo === undefined || snapshot.editing?.todoId === todoId) return;
            publish({ editing: { todoId, text: todo.text } });
        },
        todoEditTextUpdate(text) {
            const editing = snapshot.editing;
            if (disposed || editing === undefined || editing.text === text) return;
            publish({ editing: { todoId: editing.todoId, text } });
        },
        todoEditCommit() {
            const editing = snapshot.editing;
            if (disposed || editing === undefined) return;
            const { editing: _editing, ...rest } = snapshot;
            snapshot = rest;
            const todo = todoOf(editing.todoId);
            const text = textClean(editing.text);
            if (todo === undefined || text === undefined || text === todo.text) {
                publish({});
                return;
            }
            enqueue({ kind: "text", todoId: editing.todoId, text });
        },
        todoEditCancel() {
            if (disposed || snapshot.editing === undefined) return;
            const { editing: _editing, ...rest } = snapshot;
            snapshot = rest;
            publish({});
        },
        completedShownUpdate(shown) {
            if (disposed || shown === snapshot.completedShown) return;
            publish({ completedShown: shown });
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
