import {
    HappyAgentApiError,
    type HappyAgentClient,
    type Profile,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { orderKeyDecimalBetween, stringCompare } from "../utils/orderKeyDecimal.js";
import {
    HAPPY_AGENT_SURFACE_EVENT_TYPES,
    HAPPY_AGENT_TODO_EVENT_TYPES,
    happyAgentSurfaceEventProject,
    happyAgentTodoEventProject,
    happyAgentSurfaceProject,
    happyAgentVersionNewer,
    type HappyAgentSurfaceEvent,
} from "./surfaceProject.js";
import { happyAgentSurfacePeopleReaderCreate, happyAgentSurfacePersonOf } from "./surfacePeople.js";
import type {
    HappyAgentSurface,
    HappyAgentSurfaceId,
    HappyAgentSurfaceMember,
    HappyAgentSurfacePerson,
    HappyAgentSurfacesAvailability,
} from "./surfaceTypes.js";

/** The daemon's bound on a Surface name. */
const NAME_LIMIT = 256;
/**
 * The control characters the daemon refuses in a name, tab among them. A
 * list it refused would vanish, so a pasted one becomes a space first.
 */
// eslint-disable-next-line no-control-regex
const NAME_FORBIDDEN = /[\u0000-\u001f\u007f]/gu;

/** A membership act on one Surface, as the sidebar reports it back when it fails. */
export type HappyAgentSurfaceMembershipAction = "join" | "leave" | "reorder";

/**
 * Whether the form that makes a new list is open. Making one never waits on
 * the daemon, so the form has nothing else to say.
 */
export type HappyAgentSurfaceCreateState =
    | { readonly phase: "closed" }
    | { readonly phase: "open" };

export interface HappyAgentSurfaceCatalogSnapshot {
    /** Whether this Happy Agent has Surfaces at all; an older one never will. */
    readonly availability: HappyAgentSurfacesAvailability;
    /**
     * Every Surface on this Happy Agent, whatever its type, in ID order, with
     * this reader's own lists, joins, and leaves applied as soon as they are
     * asked for.
     */
    readonly surfaces: readonly HappyAgentSurface[];
    /** The reader's sidebar: the Surfaces they joined, in their own order. */
    readonly joined: readonly HappyAgentSurface[];
    /**
     * Who the reader is among the members: their user ID, or `null` on a
     * standalone installation, where the one person has none. Absent until the
     * daemon has said, and nothing reads as joined until then.
     */
    readonly viewer?: { readonly userId: string | null };
    /** The standalone person, who is named by the profile rather than by a user ID. */
    readonly profile?: HappyAgentSurfacePerson;
    /** The team members and creators Surfaces name, by user ID, as they are learned. */
    readonly users: ReadonlyMap<string, HappyAgentSurfacePerson>;
    /** Surfaces whose join or leave this window asked for and the daemon has not answered. */
    readonly membershipPending: ReadonlySet<HappyAgentSurfaceId>;
    /**
     * How many todos are still open in each todo list the reader joined, as
     * last read from the daemon. A list missing from it has not been counted
     * yet. Read again whenever one of its todos is added, finished, reopened,
     * or deleted.
     */
    readonly activeTodoCounts: ReadonlyMap<HappyAgentSurfaceId, number>;
    /** The last membership act the daemon refused, until another one is asked for. */
    readonly failure?: {
        readonly surfaceId: HappyAgentSurfaceId;
        readonly action: HappyAgentSurfaceMembershipAction;
        readonly error: UserError;
    };
    readonly create: HappyAgentSurfaceCreateState;
    /** The last read failed; the retained catalog stays visible and the read is retried. */
    readonly error?: UserError;
}

/** What a new todo list is made from. */
export interface HappyAgentSurfaceCreateInput {
    readonly name: string;
    /**
     * A PNG, JPEG, or WebP picture, at most 8 MiB; the daemon normalizes it.
     * The list shows it once the daemon has it.
     */
    readonly image?: Blob;
}

export interface HappyAgentSurfaceCatalogStore {
    get(): HappyAgentSurfaceCatalogSnapshot;
    subscribe(listener: () => void): () => void;
    /** Adds a Surface to the end of the reader's sidebar. */
    surfaceJoin(surfaceId: HappyAgentSurfaceId): void;
    /** Takes a Surface out of the reader's sidebar; its content stays for everyone. */
    surfaceLeave(surfaceId: HappyAgentSurfaceId): void;
    /** Moves a joined Surface to just after `afterId` in the reader's sidebar, or first. */
    surfaceReorder(surfaceId: HappyAgentSurfaceId, afterId: HappyAgentSurfaceId | null): void;
    createOpen(): void;
    createClose(): void;
    /**
     * Makes a todo list, joined by the reader at the end of their sidebar,
     * and closes the form. The list is in the catalog at once and answers with
     * its ID; the daemon is told in the background, again until it hears. A
     * blank name makes nothing and answers `undefined`.
     */
    surfaceCreate(input: HappyAgentSurfaceCreateInput): HappyAgentSurfaceId | undefined;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceCatalogDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "endpoint"
        | "listSurfaces"
        | "listTodos"
        | "createSurface"
        | "joinSurface"
        | "leaveSurface"
        | "reorderSurface"
        | "getProfile"
        | "getUsers"
    >;
    readonly sync: HappyAgentSync;
    readonly now?: () => number;
    /**
     * Told of each list this store starts making, with a promise that settles
     * once the daemon has it — rejected if the daemon refused it — so a store
     * reading the new list can wait for it to exist.
     */
    readonly surfaceCreating?: (surfaceId: HappyAgentSurfaceId, created: Promise<void>) => void;
}

const NO_USERS: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map();
const NO_PENDING: ReadonlySet<HappyAgentSurfaceId> = new Set();
const NO_COUNTS: ReadonlyMap<HappyAgentSurfaceId, number> = new Map();
const CREATE_CLOSED: HappyAgentSurfaceCreateState = { phase: "closed" };
const CREATE_OPEN: HappyAgentSurfaceCreateState = { phase: "open" };

const UNSUPPORTED: HappyAgentSurfaceCatalogSnapshot = {
    availability: "unsupported",
    surfaces: [],
    joined: [],
    users: NO_USERS,
    membershipPending: NO_PENDING,
    activeTodoCounts: NO_COUNTS,
    create: CREATE_CLOSED,
};

/**
 * A catalog with nothing behind it, for a window whose Happy Agent has no
 * Surface stores — one still connecting, or none at all. It reads as a Happy
 * Agent without Surfaces, so nothing offers them.
 */
export const happyAgentSurfaceCatalogStoreNoop: HappyAgentSurfaceCatalogStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    surfaceJoin: () => undefined,
    surfaceLeave: () => undefined,
    surfaceReorder: () => undefined,
    createOpen: () => undefined,
    createClose: () => undefined,
    surfaceCreate: () => undefined,
    [Symbol.dispose]: () => undefined,
};

/** One membership act this reader asked for, held over the catalog until the daemon answers. */
type MembershipIntent =
    | { readonly kind: "join"; readonly orderKey: string; readonly joinedAt: number }
    | { readonly kind: "leave" }
    | { readonly kind: "reorder"; readonly orderKey: string };

/** A list this reader made that the daemon has not confirmed yet. */
interface PendingCreate {
    readonly surfaceId: HappyAgentSurfaceId;
    /** One idempotency key for every attempt; the ID alone already makes it once. */
    readonly mutationId: string;
    readonly name: string;
    readonly image?: Blob;
    /** Where it goes in the reader's sidebar until the daemon says. */
    readonly orderKey: string;
    readonly at: number;
    /** Settles once the daemon has it, or rejects once it refuses it. */
    readonly created: Promise<void>;
}

interface MembershipOp {
    readonly surfaceId: HappyAgentSurfaceId;
    /** One idempotency key for every attempt of this act. */
    readonly mutationId: string;
    intent: MembershipIntent;
    sent: boolean;
}

/** Whether a failure is the daemon's refusal rather than a request that never arrived. */
function refused(error: unknown): error is HappyAgentApiError {
    return error instanceof HappyAgentApiError && error.status >= 400 && error.status < 500;
}

function unsupported(error: unknown): boolean {
    return error instanceof HappyAgentApiError && (error.status === 404 || error.status === 501);
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

/** A whole picture as base64, the way the daemon takes it. */
async function base64Of(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let start = 0; start < bytes.length; start += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    return btoa(binary);
}

/** A member's place in a sidebar: its key, then the Surface's ID, in plain string order. */
function sidebarCompare(
    left: { readonly surface: HappyAgentSurface; readonly member: HappyAgentSurfaceMember },
    right: { readonly surface: HappyAgentSurface; readonly member: HappyAgentSurfaceMember },
): number {
    return (
        stringCompare(left.member.orderKey, right.member.orderKey) ||
        stringCompare(left.surface.id, right.surface.id)
    );
}

/**
 * One Happy Agent's Surface catalog and this reader's sidebar of it, kept live.
 *
 * The constructor opens nothing. The first subscriber follows the connection's
 * event stream for `surface.*` events; desktop bootstrap carries the whole
 * catalog, and any later reconciliation reads it again. A read is
 * authoritative and replaces the catalog, events are delivery hints applied on
 * top of it by their version chain, and a broken chain reads the catalog
 * again, since there is no route that reads one Surface.
 *
 * Making a list applies at once too: it is in the catalog, joined at the end
 * of the reader's sidebar, the moment it is asked for, and the daemon is told
 * in the background under the list's own ID until it hears. Its picture shows
 * once the daemon has it. A membership act on a list still being made waits
 * for it.
 *
 * Joining, leaving, and reordering are this reader's own and apply at once.
 * Each is held over the catalog as an intent until the daemon answers, and
 * they are sent one at a time, so a move anchored on a Surface just joined
 * reaches the daemon after that join. A request that never arrived is retried
 * with the same mutation ID; one the daemon refused is dropped, the catalog is
 * read again, and the refusal is stated.
 *
 * A daemon that answers the catalog with 404 or 501 has no Surfaces at all,
 * and the catalog says so through `availability` rather than through an error.
 */
export function happyAgentSurfaceCatalogStoreCreate(
    deps: HappyAgentSurfaceCatalogDeps,
): HappyAgentSurfaceCatalogStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const endpoint = deps.client.endpoint;
    const listeners = new Set<() => void>();
    /** The daemon's catalog as last read or confirmed, in ID order. */
    let authoritative: readonly HappyAgentSurface[] = [];
    let snapshot: HappyAgentSurfaceCatalogSnapshot = {
        availability: "checking",
        surfaces: [],
        joined: [],
        users: NO_USERS,
        membershipPending: NO_PENDING,
        activeTodoCounts: NO_COUNTS,
        create: CREATE_CLOSED,
    };
    let ops: MembershipOp[] = [];
    let creates: PendingCreate[] = [];
    let queueRunning = false;
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** Reads of the catalog; aborted together when following stops. */
    let reads = new AbortController();
    /** Count reads in flight, each marked when a hint arrives while it runs. */
    const countReads = new Map<HappyAgentSurfaceId, { again: boolean }>();
    let readsInFlight = 0;
    let readLatest = 0;
    /** Events seen while a read was in flight, replayed onto its answer. */
    let journal: HappyAgentSurfaceEvent[] = [];
    let failed = false;
    let disposed = false;
    /** Lives as long as the store: mutations finish whether or not anything is watching. */
    const life = new AbortController();

    const publish = (next: Partial<HappyAgentSurfaceCatalogSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };

    const profileAdopt = (profile: Profile): Partial<HappyAgentSurfaceCatalogSnapshot> => ({
        viewer: { userId: profile.userId ?? null },
        profile: happyAgentSurfacePersonOf(
            endpoint,
            profile.name,
            profile.photo,
            "/v0/profile/photo",
        ),
    });

    const people = happyAgentSurfacePeopleReaderCreate({
        client: deps.client,
        signal: life.signal,
        read(read) {
            if (disposed) return;
            publish({ users: new Map([...snapshot.users, ...read]) });
        },
    });

    /** Reads the names and photos of members and creators not known yet. */
    const usersRequest = (surfaces: readonly HappyAgentSurface[], again?: string): void => {
        // A creator who left is still named.
        people.request(
            surfaces.flatMap((surface) => [
                surface.creatorUserId,
                ...surface.members.map((member) => member.userId),
            ]),
            again,
        );
    };

    /** The catalog as the reader sees it: the daemon's, with their own pending acts applied. */
    const project = (): Pick<
        HappyAgentSurfaceCatalogSnapshot,
        "surfaces" | "joined" | "membershipPending"
    > => {
        const viewer = snapshot.viewer;
        const intents = new Map<HappyAgentSurfaceId, MembershipIntent>();
        for (const op of ops) intents.set(op.surfaceId, op.intent);
        const made = creates.filter(
            (create) => !authoritative.some((surface) => surface.id === create.surfaceId),
        );
        const base =
            made.length === 0
                ? authoritative
                : [
                      ...authoritative,
                      ...made.map(
                          (create): HappyAgentSurface => ({
                              id: create.surfaceId,
                              type: { kind: "todo" },
                              name: create.name,
                              image: null,
                              // Who made it is the daemon's to say, once it
                              // answers; the reader is never credited here.
                              creatorUserId: null,
                              members:
                                  viewer === undefined
                                      ? []
                                      : [
                                            {
                                                userId: viewer.userId,
                                                orderKey: create.orderKey,
                                                joinedAt: create.at,
                                            },
                                        ],
                              version: "",
                              updatedAt: create.at,
                          }),
                      ),
                  ].sort((left, right) => stringCompare(left.id, right.id));
        const surfaces =
            viewer === undefined || intents.size === 0
                ? base
                : base.map((surface) => {
                      const intent = intents.get(surface.id);
                      if (intent === undefined) return surface;
                      const others = surface.members.filter(
                          (member) => member.userId !== viewer.userId,
                      );
                      const own = surface.members.find((member) => member.userId === viewer.userId);
                      if (intent.kind === "leave")
                          return own === undefined ? surface : { ...surface, members: others };
                      const member: HappyAgentSurfaceMember = {
                          userId: viewer.userId,
                          orderKey: intent.orderKey,
                          joinedAt:
                              own?.joinedAt ?? (intent.kind === "join" ? intent.joinedAt : now()),
                      };
                      return {
                          ...surface,
                          members: [...others, member].sort((left, right) =>
                              stringCompare(left.userId ?? "", right.userId ?? ""),
                          ),
                      };
                  });
        const joined =
            viewer === undefined
                ? []
                : surfaces
                      .flatMap((surface) => {
                          const member = surface.members.find(
                              (entry) => entry.userId === viewer.userId,
                          );
                          return member === undefined ? [] : [{ surface, member }];
                      })
                      .sort(sidebarCompare)
                      .map((entry) => entry.surface);
        const pending = new Set<HappyAgentSurfaceId>();
        for (const op of ops) if (op.intent.kind !== "reorder") pending.add(op.surfaceId);
        return {
            surfaces,
            joined,
            membershipPending: pending.size === 0 ? NO_PENDING : pending,
        };
    };

    /** The joined todo lists that are counted: every one the daemon already has. */
    const countable = (joined: readonly HappyAgentSurface[]): Set<HappyAgentSurfaceId> =>
        new Set(
            joined
                .filter(
                    (surface) =>
                        surface.type.kind === "todo" &&
                        !creates.some((create) => create.surfaceId === surface.id),
                )
                .map((surface) => surface.id),
        );

    /**
     * Reads how many todos are open in one list. A hint arriving while a read
     * runs asks for one more read after it, so the count settles on the
     * daemon's latest answer however many changes arrive at once.
     */
    const countRead = (surfaceId: HappyAgentSurfaceId): void => {
        if (following === undefined || disposed) return;
        const running = countReads.get(surfaceId);
        if (running !== undefined) {
            running.again = true;
            return;
        }
        const entry = { again: false };
        countReads.set(surfaceId, entry);
        void deps.client
            .listTodos(surfaceId, { scope: "active", signal: reads.signal })
            .then(
                (response) => {
                    if (countReads.get(surfaceId) !== entry) return;
                    if (!countable(snapshot.joined).has(surfaceId)) return;
                    const count = response.todos.filter((todo) => todo.status === "active").length;
                    if (snapshot.activeTodoCounts.get(surfaceId) === count) return;
                    publish({
                        activeTodoCounts: new Map(snapshot.activeTodoCounts).set(surfaceId, count),
                    });
                },
                () => {
                    // An uncounted list shows no count; the next hint or
                    // reconciliation reads it again.
                },
            )
            .finally(() => {
                if (countReads.get(surfaceId) !== entry) return;
                countReads.delete(surfaceId);
                if (entry.again) countRead(surfaceId);
            });
    };

    /** Reads every joined todo list's count again, as a reconciliation does. */
    const countsRefresh = (): void => {
        for (const surfaceId of countable(snapshot.joined)) countRead(surfaceId);
    };

    /** A todo event is a hint that its list's count may have moved. */
    const todoHint = (raw: Parameters<typeof happyAgentTodoEventProject>[0]): boolean => {
        const event = happyAgentTodoEventProject(raw);
        if (event === undefined) return false;
        const surfaceId = event.type === "created" ? event.todo.surfaceId : event.surfaceId;
        // A rename or a move leaves the count where it was.
        const counts =
            event.type === "created" ||
            event.changes.status !== undefined ||
            event.changes.deletedAt !== undefined;
        if (counts && countable(snapshot.joined).has(surfaceId)) countRead(surfaceId);
        return true;
    };

    const republish = (next: Partial<HappyAgentSurfaceCatalogSnapshot> = {}): void => {
        snapshot = { ...snapshot, ...next };
        const projected = project();
        // Counts follow the reader's sidebar: a list left drops its count, and
        // one joined or just made is counted.
        const counted = countable(projected.joined);
        let counts = snapshot.activeTodoCounts;
        if ([...counts.keys()].some((surfaceId) => !counted.has(surfaceId)))
            counts = new Map([...counts].filter(([surfaceId]) => counted.has(surfaceId)));
        publish({ ...projected, activeTodoCounts: counts });
        for (const surfaceId of counted) if (!counts.has(surfaceId)) countRead(surfaceId);
    };

    /** Replaces one Surface with a later version of it, or adds it. */
    const surfaceAdopt = (surface: HappyAgentSurface): boolean => {
        const index = authoritative.findIndex((entry) => entry.id === surface.id);
        if (index === -1) {
            authoritative = [...authoritative, surface].sort((left, right) =>
                stringCompare(left.id, right.id),
            );
            return true;
        }
        const current = authoritative[index]!;
        if (!happyAgentVersionNewer(surface.version, current.version)) return false;
        const next = [...authoritative];
        next[index] = surface;
        authoritative = next;
        return true;
    };

    /** Applies one event; answers whether the catalog must be read again. */
    const eventApply = (event: HappyAgentSurfaceEvent): { changed: boolean; gap: boolean } => {
        if (event.type === "created") {
            const changed = surfaceAdopt(event.surface);
            if (changed) usersRequest([event.surface]);
            return { changed, gap: false };
        }
        const index = authoritative.findIndex((entry) => entry.id === event.surfaceId);
        if (index === -1) return { changed: false, gap: true };
        const current = authoritative[index]!;
        if (!happyAgentVersionNewer(event.version, current.version))
            return { changed: false, gap: false };
        if (current.version !== event.previousVersion) return { changed: false, gap: true };
        const next = [...authoritative];
        const surface = {
            ...current,
            members: event.members,
            updatedAt: event.updatedAt,
            version: event.version,
        };
        next[index] = surface;
        authoritative = next;
        usersRequest([surface]);
        return { changed: true, gap: false };
    };

    /** The catalog and the reader read again together, replacing what is held. */
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
                    const [catalog, profile] = await Promise.all([
                        deps.client.listSurfaces({ signal }),
                        deps.client.getProfile({ signal }),
                    ]);
                    return { catalog, profile: profile.profile };
                } catch (error) {
                    if (unsupported(error)) return undefined;
                    throw error;
                }
            },
            (error) => {
                if (signal.aborted) return;
                failed = true;
                publish({ error: happyAgentUserError(error) });
            },
        )
            .then((response) => {
                if (signal.aborted || token !== readLatest) return;
                failed = false;
                if (response === undefined) {
                    authoritative = [];
                    const { error: _error, ...rest } = snapshot;
                    snapshot = rest;
                    republish({ availability: "unsupported" });
                    return;
                }
                catalogAdopt(
                    response.catalog.surfaces.map((surface) =>
                        happyAgentSurfaceProject(endpoint, surface),
                    ),
                    profileAdopt(response.profile),
                    mark,
                );
            })
            .catch(() => undefined)
            .finally(end);
    };

    /** Replaces the catalog with an authoritative one, replaying what arrived meanwhile. */
    const catalogAdopt = (
        surfaces: readonly HappyAgentSurface[],
        reader: Partial<HappyAgentSurfaceCatalogSnapshot>,
        mark: number,
    ): void => {
        authoritative = [...surfaces].sort((left, right) => stringCompare(left.id, right.id));
        let gap = false;
        for (const event of journal.slice(mark)) gap = eventApply(event).gap || gap;
        const { error: _error, ...rest } = snapshot;
        snapshot = rest;
        usersRequest(authoritative);
        republish({ ...reader, availability: "available" });
        countsRefresh();
        if (gap) reload();
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [
                    ...HAPPY_AGENT_SURFACE_EVENT_TYPES,
                    ...HAPPY_AGENT_TODO_EVENT_TYPES,
                    "profile.updated",
                ],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (input.kind === "bootstrap") {
                    const surfaces = input.bootstrap.surfaces;
                    // A daemon from before Surfaces leaves the field out, and
                    // its catalog route answers 404, which the read reports.
                    if (surfaces === undefined) reload();
                    else
                        catalogAdopt(
                            surfaces.map((surface) => happyAgentSurfaceProject(endpoint, surface)),
                            profileAdopt(input.bootstrap.profile),
                            journal.length,
                        );
                    continue;
                }
                if (
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    reload();
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const raw = input.update.event;
                if (raw.type === "profile.updated") {
                    if (raw.payload.profile !== undefined)
                        republish(profileAdopt(raw.payload.profile));
                    else if (raw.payload.userId !== undefined) usersRequest([], raw.payload.userId);
                    continue;
                }
                if (todoHint(raw)) continue;
                const event = happyAgentSurfaceEventProject(endpoint, raw);
                if (event === undefined) continue;
                if (readsInFlight > 0) journal.push(event);
                if (snapshot.availability !== "available") continue;
                const applied = eventApply(event);
                if (applied.changed) republish();
                if (applied.gap) reload();
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
        countReads.clear();
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    /** Sends the queued acts one at a time, in the order they were asked for. */
    const queueRun = async (): Promise<void> => {
        if (queueRunning) return;
        queueRunning = true;
        try {
            let delay = 1_000;
            while (!disposed && ops.length > 0) {
                const op = ops[0]!;
                // An act on a list still being made goes once the list exists;
                // one that was refused makes the act a refusal of its own.
                const making = creates.find((create) => create.surfaceId === op.surfaceId);
                if (making !== undefined) {
                    await making.created.catch(() => undefined);
                    continue;
                }
                op.sent = true;
                const intent = op.intent;
                let afterId: HappyAgentSurfaceId | null = null;
                if (intent.kind === "reorder") {
                    const joined = project().joined;
                    const index = joined.findIndex((surface) => surface.id === op.surfaceId);
                    if (index === -1) {
                        ops = ops.filter((entry) => entry !== op);
                        republish();
                        continue;
                    }
                    afterId = joined[index - 1]?.id ?? null;
                }
                try {
                    const options = { mutationId: op.mutationId, signal: life.signal };
                    const response =
                        intent.kind === "join"
                            ? await deps.client.joinSurface(op.surfaceId, options)
                            : intent.kind === "leave"
                              ? await deps.client.leaveSurface(op.surfaceId, options)
                              : await deps.client.reorderSurface(
                                    op.surfaceId,
                                    { afterId, mutationId: op.mutationId },
                                    { signal: life.signal },
                                );
                    if (disposed) return;
                    delay = 1_000;
                    surfaceAdopt(happyAgentSurfaceProject(endpoint, response.surface));
                    ops = ops.filter((entry) => entry !== op);
                    republish();
                } catch (error) {
                    if (disposed || life.signal.aborted) return;
                    if (refused(error)) {
                        ops = ops.filter((entry) => entry !== op);
                        republish({
                            failure: {
                                surfaceId: op.surfaceId,
                                action: intent.kind,
                                error: happyAgentUserError(error),
                            },
                        });
                        reload();
                        continue;
                    }
                    // Never arrived, or the daemon failed: the same act, under
                    // the same mutation ID, once it can be heard again.
                    op.sent = false;
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            queueRunning = false;
        }
    };

    /** Queues one act, replacing an earlier one on the same Surface that has not gone yet. */
    const enqueue = (surfaceId: HappyAgentSurfaceId, intent: MembershipIntent): void => {
        const { failure: _failure, ...rest } = snapshot;
        snapshot = rest;
        const waiting = ops.find((op) => op.surfaceId === surfaceId && !op.sent);
        if (waiting) waiting.intent = intent;
        else ops = [...ops, { surfaceId, mutationId: idCreate(), intent, sent: false }];
        republish();
        void queueRun();
    };

    /** The key after the last Surface in the reader's sidebar, as the daemon appends one. */
    const keyAppended = (): string => {
        const viewer = snapshot.viewer;
        const last = snapshot.joined.at(-1);
        const key = last?.members.find((member) => member.userId === viewer?.userId)?.orderKey;
        return orderKeyDecimalBetween(key ?? null, null);
    };

    const memberOf = (
        surface: HappyAgentSurface | undefined,
    ): HappyAgentSurfaceMember | undefined =>
        snapshot.viewer === undefined
            ? undefined
            : surface?.members.find((member) => member.userId === snapshot.viewer?.userId);

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
        surfaceJoin(surfaceId) {
            if (disposed || snapshot.viewer === undefined) return;
            const surface = snapshot.surfaces.find((entry) => entry.id === surfaceId);
            if (surface === undefined || memberOf(surface) !== undefined) return;
            enqueue(surfaceId, { kind: "join", orderKey: keyAppended(), joinedAt: now() });
        },
        surfaceLeave(surfaceId) {
            if (disposed) return;
            const surface = snapshot.surfaces.find((entry) => entry.id === surfaceId);
            if (memberOf(surface) === undefined) return;
            enqueue(surfaceId, { kind: "leave" });
        },
        surfaceReorder(surfaceId, afterId) {
            if (disposed || afterId === surfaceId) return;
            const joined = snapshot.joined;
            const viewer = snapshot.viewer;
            if (!joined.some((surface) => surface.id === surfaceId)) return;
            const remaining = joined.filter((surface) => surface.id !== surfaceId);
            const index = afterId === null ? 0 : remaining.findIndex((s) => s.id === afterId) + 1;
            if (index === 0 && afterId !== null) return;
            const keyOf = (surface: HappyAgentSurface | undefined): string | null =>
                surface?.members.find((member) => member.userId === viewer?.userId)?.orderKey ??
                null;
            const before = keyOf(remaining[index - 1]);
            const after = keyOf(remaining[index]);
            if (joined.findIndex((surface) => surface.id === surfaceId) === index) return;
            enqueue(surfaceId, {
                kind: "reorder",
                orderKey: orderKeyDecimalBetween(before, after),
            });
        },
        createOpen() {
            if (disposed || snapshot.create.phase === "open") return;
            publish({ create: CREATE_OPEN });
        },
        createClose() {
            if (disposed || snapshot.create.phase === "closed") return;
            publish({ create: CREATE_CLOSED });
        },
        surfaceCreate(input) {
            const name = input.name.replace(NAME_FORBIDDEN, " ").trim().slice(0, NAME_LIMIT);
            if (disposed || name.length === 0) return undefined;
            const surfaceId = idCreate() as HappyAgentSurfaceId;
            const mutationId = idCreate();
            let settle!: { resolve: () => void; reject: (error: unknown) => void };
            const created = new Promise<void>((resolve, reject) => {
                settle = { resolve, reject };
            });
            // Nobody may be waiting; a refusal is still an answer, not a crash.
            created.catch(() => undefined);
            creates = [
                ...creates,
                {
                    surfaceId,
                    mutationId,
                    name,
                    ...(input.image === undefined ? {} : { image: input.image }),
                    orderKey: keyAppended(),
                    at: now(),
                    created,
                },
            ];
            deps.surfaceCreating?.(surfaceId, created);
            republish({ create: CREATE_CLOSED });
            void (async () => {
                let image: { data: string } | undefined;
                // A picture that cannot be read leaves the list without one.
                if (input.image !== undefined)
                    image = await base64Of(input.image).then(
                        (data) => ({ data }),
                        () => undefined,
                    );
                let delay = 1_000;
                for (;;) {
                    if (disposed || life.signal.aborted) return;
                    try {
                        const response = await deps.client.createSurface(
                            {
                                id: surfaceId,
                                type: "todo",
                                name,
                                mutationId,
                                ...(image === undefined ? {} : { image }),
                            },
                            { signal: life.signal },
                        );
                        if (disposed) return;
                        surfaceAdopt(happyAgentSurfaceProject(endpoint, response.surface));
                        creates = creates.filter((create) => create.surfaceId !== surfaceId);
                        republish();
                        settle.resolve();
                        return;
                    } catch (error) {
                        if (disposed || life.signal.aborted) return;
                        if (refused(error)) {
                            creates = creates.filter((create) => create.surfaceId !== surfaceId);
                            republish();
                            settle.reject(error);
                            return;
                        }
                        // The ID names the list, so asking again can only ever
                        // make it once: a repeat answers with the list made.
                        await waitFor(delay, life.signal);
                        delay = Math.min(delay * 2, 10_000);
                    }
                }
            })();
            return surfaceId;
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            life.abort();
            listeners.clear();
            ops = [];
            creates = [];
        },
    };
}
