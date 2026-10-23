import {
    HappyAgentApiError,
    type HappyAgentClient,
    type HappyAgentEvent,
    type Space,
    type SpaceBatch,
    type SpaceBatchPosition,
    type SpaceSection,
    type SpaceSidebarResponse,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import {
    sidebarDocumentClassicApply,
    sidebarDocumentEdit,
    sidebarDocumentInsert,
    type SidebarDocumentClassic,
} from "./spacesSidebarDocument.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { orderKeyDecimalBetween, stringCompare } from "../utils/orderKeyDecimal.js";
import type {
    HappyAgentSpace,
    HappyAgentSpaceBatch,
    HappyAgentSpaceIcon,
    HappyAgentSpaceId,
    HappyAgentSpacePosition,
    HappyAgentSpaceSection,
    HappyAgentSpaceSectionId,
} from "./spaceTypes.js";

/** The journal events that change the sidebar. */
const SPACE_EVENT_TYPES = [
    "space.created",
    "space.updated",
    "space.removed",
    "space.section.created",
    "space.section.updated",
    "space.section.removed",
    "space.batch.applied",
    "artifact.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

type SpaceEvent = Extract<HappyAgentEvent, { type: (typeof SPACE_EVENT_TYPES)[number] }>;

function spaceEventIs(event: HappyAgentEvent): event is SpaceEvent {
    return (SPACE_EVENT_TYPES as readonly string[]).includes(event.type);
}

/** The daemon's IDs, branded at the one place they enter the store. */
function spaceOf(space: Space): HappyAgentSpace {
    return {
        ...space,
        id: space.id as HappyAgentSpaceId,
        sectionId: space.sectionId as HappyAgentSpaceSectionId | null,
    };
}

function sectionOf(section: SpaceSection): HappyAgentSpaceSection {
    return { ...section, id: section.id as HappyAgentSpaceSectionId };
}

function positionOf(position: SpaceBatchPosition): HappyAgentSpacePosition {
    return { ...position, sectionId: position.sectionId as HappyAgentSpaceSectionId | null };
}

function batchOf(batch: SpaceBatch): HappyAgentSpaceBatch {
    return {
        ...batch,
        changes: batch.changes.map((change) => ({
            ...change,
            spaceId: change.spaceId as HappyAgentSpaceId,
            from: positionOf(change.from),
            to: positionOf(change.to),
        })),
    };
}

/** What the daemon answers when it makes new work. */
export interface HappyAgentStemCell {
    readonly space: HappyAgentSpace;
    /** The conversation the first message goes to, and the workspace it runs in. */
    readonly agentId: string;
    readonly workspaceId: string;
}

/**
 * The person's sidebar document: the HTML the manager and this window edit, at
 * the version this window last saw or wrote. Absent on a daemon without it.
 */
export interface HappyAgentSpacesSidebarDocument {
    readonly artifactId: string;
    readonly version: number;
    readonly html: string;
    /** The icons Prioritizing chose for sessions, by agent ID. */
    readonly agentIcons: ReadonlyMap<string, HappyAgentSpaceIcon>;
    /** The daemon's untouched mirror of the classic sidebar, before any write. */
    readonly seed: boolean;
}

function sidebarOf(answer: SpaceSidebarResponse): HappyAgentSpacesSidebarDocument {
    return {
        artifactId: answer.artifactId,
        version: answer.version,
        html: answer.html,
        agentIcons: new Map(Object.entries(answer.agentIcons ?? {})),
        seed: answer.seed === true,
    };
}

export interface HappyAgentSpacesSnapshot {
    /** `unsupported` for a daemon from before spaces, which answers 404. */
    readonly availability: "loading" | "available" | "unsupported";
    /** Every space, with this window's own moves applied until the daemon confirms them. */
    readonly spaces: ReadonlyMap<HappyAgentSpaceId, HappyAgentSpace>;
    /** Sections in their order. */
    readonly sections: readonly HappyAgentSpaceSection[];
    /** Applied batches, newest first. */
    readonly batches: readonly HappyAgentSpaceBatch[];
    /**
     * A batch applied while this window was open whose note the reader has not
     * looked at in Happy yet. Batches from before the window opened are read.
     */
    readonly noteUnread: boolean;
    /** The workspace each conversation this window made runs in, before any list names it. */
    readonly agentWorkspaces: ReadonlyMap<string, string>;
    /** Whether the reader opened the Older fold. A window's own choice. */
    readonly olderExpanded: boolean;
    /** When the sidebar was last read, which picks the day's Make Stuff phrase. */
    readonly readAt: number;
    /** The sidebar document, which arranges the rows when present. */
    readonly sidebar?: HappyAgentSpacesSidebarDocument;
    /** The last act the daemon refused. */
    readonly error?: UserError;
}

/** Whether the reader is mid-gesture in the sidebar, or calm enough for it to change. */
export type HappyAgentSpacesAttention = "interacting" | "calm";

export interface HappyAgentSpacesStore {
    get(): HappyAgentSpacesSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Makes new work right after a section or separator, or for `null` right
     * after Happy's row (`happySpaceId`, which the window knows by its bot), and
     * resolves with the conversation to open once the daemon has made it.
     */
    stemCellCreate(
        sectionId: string | null,
        happySpaceId: string | null,
    ): Promise<HappyAgentStemCell>;
    /** Moves a row after another in a section, or first for `null`. */
    spaceMove(
        spaceId: HappyAgentSpaceId,
        sectionId: HappyAgentSpaceSectionId | null,
        afterId: HappyAgentSpaceId | null,
    ): void;
    sectionCollapsedUpdate(sectionId: HappyAgentSpaceSectionId, collapsed: boolean): void;
    sectionTailExpandedUpdate(sectionId: HappyAgentSpaceSectionId, expanded: boolean): void;
    olderExpandedUpdate(expanded: boolean): void;
    /** Whether Happy's chat is on screen; opening it reads its note. */
    happyFocusUpdate(focused: boolean): void;
    /**
     * Whether the reader is in the sidebar: hovering it, dragging in it, or in
     * one of its menus. Being in it holds queued changes back; leaving it is
     * only more input, never permission for them to land.
     */
    attentionInteractingUpdate(interacting: boolean): void;
    /**
     * The person did something in the window. Queued changes wait for
     * ATTENTION_CALM_MS without any of this, so no click, navigation or
     * selection ever lets them land.
     */
    attentionInput(): void;
    /**
     * Whether the window and its sidebar are on screen. Hiding or minimising
     * the window, or collapsing the sidebar, lets queued changes land at once.
     */
    attentionVisibleUpdate(visible: boolean): void;
    /** Asks the manager to tidy now; its batch applies as soon as it is done. */
    tidyRequest(): void;
    /**
     * Closes new work nobody started, when the person asks to: the daemon
     * removes the row and its empty chat, and refuses once the chat has any
     * message, which leaves it alone. Nothing but an explicit close calls this;
     * opening, leaving or selecting a row never does.
     */
    stemCellDiscard(spaceId: HappyAgentSpaceId): void;
    /**
     * Writes the sidebar document this window edited, against the version it
     * edited. It shows at once; a stale base reads the daemon's version back
     * and reports the refusal, without merging.
     */
    sidebarWrite(html: string, force?: boolean): void;
    /** Holds the document and daemon edits through the gesture and its saved drop. */
    sidebarDragUpdate(active: boolean): void;
    /**
     * What the reader had folded and hidden in the sidebar they kept before
     * Spaces. The daemon's first document mirrors that sidebar; once it is read,
     * these folds are written into it once, and nothing else changes.
     */
    sidebarClassicUpdate(classic: SidebarDocumentClassic): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSpacesDeps {
    readonly client: HappyAgentClient;
    readonly sync: HappyAgentSync;
    readonly now?: () => number;
}

const EMPTY: HappyAgentSpacesSnapshot = {
    availability: "loading",
    spaces: new Map(),
    sections: [],
    batches: [],
    noteUnread: false,
    agentWorkspaces: new Map(),
    olderExpanded: false,
    readAt: 0,
};

/**
 * How many applied batches the store keeps: the daemon's most, so every note
 * Happy's chat is likely to show reads as its batch.
 */
const BATCH_LIMIT = 100;
/** Comfortably inside the daemon's ten-minute hold on an "interacting" report. */
const ATTENTION_RENEW_MS = 60_000;
/** How long the person goes without any input before queued changes may land. */
const ATTENTION_CALM_MS = 5 * 60_000;

function sectionsOrdered(
    sections: Iterable<HappyAgentSpaceSection>,
): readonly HappyAgentSpaceSection[] {
    return [...sections].sort(
        (left, right) =>
            stringCompare(left.orderKey, right.orderKey) || stringCompare(left.id, right.id),
    );
}

/**
 * The rows shown in one place, in order: under Happy for `null`, or in one
 * section. Shared by the store's optimistic moves and the window's projection,
 * so both agree on what "after" means.
 */
export function happyAgentSpacesIn(
    spaces: ReadonlyMap<HappyAgentSpaceId, HappyAgentSpace>,
    sectionId: HappyAgentSpaceSectionId | null,
): readonly HappyAgentSpace[] {
    return [...spaces.values()]
        .filter((space) => space.visibility === "shown" && space.sectionId === sectionId)
        .sort(
            (left, right) =>
                stringCompare(left.orderKey, right.orderKey) || stringCompare(left.id, right.id),
        );
}

/** The Older fold: everything folded away, most recently changed first. */
export function happyAgentSpacesOlder(
    spaces: ReadonlyMap<HappyAgentSpaceId, HappyAgentSpace>,
): readonly HappyAgentSpace[] {
    return [...spaces.values()]
        .filter((space) => space.visibility === "folded")
        .sort((left, right) => right.updatedAt - left.updatedAt);
}

/**
 * One person's sidebar on one Happy Agent: Happy, the flat sections the
 * manager keeps, and the batches it applied. It reads the sidebar once
 * something subscribes and follows the journal from then on; every entity
 * carries its version, and a gap in delivery reads it again.
 */
export function happyAgentSpacesStoreCreate(deps: HappyAgentSpacesDeps): HappyAgentSpacesStore {
    const idCreate = cuid2Create(deps.now ?? Date.now);
    const listeners = new Set<() => void>();
    let snapshot = EMPTY;
    let disposed = false;
    let following: AbortController | undefined;
    let reading: AbortController | undefined;
    let loading: Promise<void> | undefined;
    /** Events that arrived while the authoritative read was in flight. */
    let held: SpaceEvent[] | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const life = new AbortController();
    // Authored document sections need not have a legacy SpaceSection row.
    // Keep the requested placement until both the creation event and reply agree.
    const creating = new Map<
        string,
        { readonly sectionId: string | null; readonly happySpaceId: string | null }
    >();
    const insert = (
        html: string,
        spaceId: string,
        placement: { readonly sectionId: string | null; readonly happySpaceId: string | null },
    ) =>
        sidebarDocumentEdit(html, (view) =>
            sidebarDocumentInsert(view, spaceId, placement.sectionId, placement.happySpaceId),
        );

    const publish = (next: Partial<HappyAgentSpacesSnapshot>): void => {
        snapshot = { ...snapshot, ...next };
        for (const listener of listeners) listener();
    };

    const failed = (error: unknown): void => {
        if (disposed) return;
        publish({ error: happyAgentUserError(error) });
    };

    const spaceAdopt = (
        spaces: Map<HappyAgentSpaceId, HappyAgentSpace>,
        space: HappyAgentSpace,
    ): boolean => {
        const current = spaces.get(space.id);
        if (current !== undefined && current.version > space.version) return false;
        spaces.set(space.id, space);
        return true;
    };

    let happyOnScreen = false;
    const happyFocused = (): boolean => happyOnScreen;

    /** Whether the batches were read once; the first read is history, not news. */
    let batchesRead = false;
    const batchesLoad = (signal: AbortSignal): void => {
        void deps.client
            .listSpaceBatches({ limit: BATCH_LIMIT, signal })
            .then((response) => {
                if (disposed || signal.aborted) return;
                const batches = response.batches.map(batchOf);
                // A read after a gap can be the first word of a batch whose
                // event was skipped, so it is news here too.
                const known = snapshot.batches[0]?.id;
                publish({
                    batches,
                    ...(batchesRead &&
                    batches[0] !== undefined &&
                    batches[0].id !== known &&
                    !happyFocused()
                        ? { noteUnread: true }
                        : {}),
                });
                batchesRead = true;
            })
            .catch(() => undefined);
    };

    /** Writes in flight; while any is, a read could only show an older document. */
    let sidebarWrites = 0;
    let sidebarDragging = false;
    let sidebarStale = false;
    let classic: SidebarDocumentClassic | undefined;
    /** Writes the reader's classic folds into the daemon's seed, once per seed. */
    const seedAdopt = (): void => {
        const current = snapshot.sidebar;
        if (!current?.seed || classic === undefined || sidebarWrites > 0) return;
        const folds = classic;
        const html = sidebarDocumentEdit(current.html, (view) =>
            sidebarDocumentClassicApply(view, folds),
        );
        // Written even when it changes nothing: the write is what ends the seed.
        store.sidebarWrite(html ?? current.html, true);
    };
    const sidebarLoad = (): void => {
        if (sidebarWrites > 0 || sidebarDragging || creating.size > 0) {
            sidebarStale = true;
            return;
        }
        void deps.client
            .getSpaceSidebar({ signal: life.signal })
            .then((answer) => {
                if (disposed) return;
                if (sidebarWrites > 0 || sidebarDragging || creating.size > 0) {
                    sidebarStale = true;
                    return;
                }
                const current = snapshot.sidebar;
                if (current && current.version > answer.version) return;
                if (current?.version === answer.version && current.html === answer.html) return;
                publish({ sidebar: sidebarOf(answer) });
                seedAdopt();
            })
            .catch(() => undefined);
    };
    /** One write at a time, each against the version the last one produced. */
    let sidebarQueue: Promise<void> = Promise.resolve();

    const load = (): Promise<void> => {
        const active = reading;
        if (!active || active.signal.aborted) return Promise.resolve();
        if (loading) return loading;
        held = [];
        const task = happyAgentSyncRead(
            active.signal,
            () => deps.client.listSpaces({ signal: active.signal }),
            (error) => {
                if (error instanceof HappyAgentApiError && error.status === 404) {
                    publish({ availability: "unsupported" });
                    throw error;
                }
            },
        )
            .then((response) => {
                if (disposed || active.signal.aborted) return;
                const spaces = new Map<HappyAgentSpaceId, HappyAgentSpace>();
                for (const space of response.spaces.map(spaceOf)) spaces.set(space.id, space);
                const pending = held ?? [];
                held = undefined;
                snapshot = {
                    ...snapshot,
                    availability: "available",
                    readAt: (deps.now ?? Date.now)(),
                    spaces,
                    sections: sectionsOrdered(response.sections.map(sectionOf)),
                };
                for (const event of pending) eventApply(event, false);
                publish({});
                batchesLoad(active.signal);
                sidebarLoad();
            })
            .catch(() => {
                if (reading === active) held = undefined;
            })
            .finally(() => {
                if (loading === task) loading = undefined;
            });
        loading = task;
        return task;
    };

    /** Applies one journal event; an older version than the one held is stale. */
    const eventApply = (event: SpaceEvent, announce: boolean): void => {
        if (held !== undefined) {
            held.push(event);
            return;
        }
        const next: Partial<{
            -readonly [Key in keyof HappyAgentSpacesSnapshot]: HappyAgentSpacesSnapshot[Key];
        }> = {};
        switch (event.type) {
            case "space.created":
            case "space.updated": {
                const spaces = new Map(snapshot.spaces);
                if (spaceAdopt(spaces, spaceOf(event.payload.space))) next.spaces = spaces;
                if (
                    event.type === "space.created" &&
                    snapshot.sidebar &&
                    creating.has(event.payload.space.id)
                ) {
                    const space = event.payload.space;
                    const html = insert(
                        snapshot.sidebar.html,
                        space.id,
                        creating.get(space.id) ?? { sectionId: null, happySpaceId: null },
                    );
                    if (html !== undefined) next.sidebar = { ...snapshot.sidebar, html };
                }
                // New work is written into the document where it was made.
                if (event.type === "space.created" && snapshot.sidebar !== undefined) sidebarLoad();
                break;
            }
            case "space.section.created":
            case "space.section.updated": {
                const section = sectionOf(event.payload.section);
                const current = snapshot.sections.find((entry) => entry.id === section.id);
                if (current !== undefined && current.version > section.version) break;
                next.sections = sectionsOrdered([
                    ...snapshot.sections.filter((entry) => entry.id !== section.id),
                    section,
                ]);
                break;
            }
            case "space.section.removed":
                next.sections = snapshot.sections.filter(
                    (entry) => entry.id !== event.payload.sectionId,
                );
                break;
            case "space.removed": {
                const spaceId = event.payload.spaceId as HappyAgentSpaceId;
                if (snapshot.spaces.has(spaceId)) {
                    const spaces = new Map(snapshot.spaces);
                    spaces.delete(spaceId);
                    next.spaces = spaces;
                }
                // The daemon takes it out of the document too, as a new version.
                if (snapshot.sidebar !== undefined) sidebarLoad();
                break;
            }
            case "artifact.updated": {
                const sidebar = snapshot.sidebar;
                // A version this window already holds, its own write included, needs no read.
                if (
                    event.payload.artifactId === sidebar?.artifactId &&
                    event.payload.changes.latestVersion > sidebar.version
                )
                    sidebarLoad();
                break;
            }
            case "space.batch.applied": {
                const batch = batchOf(event.payload.batch);
                // A batch is where the manager's queued document edits land.
                if (snapshot.sidebar !== undefined) sidebarLoad();
                if (!happyFocused() && !snapshot.batches.some((entry) => entry.id === batch.id))
                    next.noteUnread = true;
                next.batches = [
                    batch,
                    ...snapshot.batches.filter((entry) => entry.id !== batch.id),
                ].slice(0, BATCH_LIMIT);
                break;
            }
        }
        if (announce) publish(next);
        else snapshot = { ...snapshot, ...next };
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        reading ??= new AbortController();
        const active = new AbortController();
        following = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: SPACE_EVENT_TYPES,
            })) {
                if (input.kind === "error") continue;
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected")
                ) {
                    void load();
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const event = input.update.event;
                if (spaceEventIs(event)) eventApply(event, true);
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
        reading?.abort();
        reading = undefined;
        loading = undefined;
        held = undefined;
        following?.abort();
        following = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    /** Sends one act under one mutation ID, retrying until it is heard or refused. */
    const send = <Answer>(
        act: (mutationId: string) => Promise<Answer>,
        heard: (answer: Answer) => void,
    ): void => {
        const mutationId = idCreate();
        void happyAgentSyncRead(
            life.signal,
            async (): Promise<{ readonly answer: Answer } | undefined> => {
                try {
                    return { answer: await act(mutationId) };
                } catch (error) {
                    // A refusal is final; only a request that was not heard is retried.
                    if (error instanceof HappyAgentApiError && error.status < 500) {
                        failed(error);
                        void load();
                        return undefined;
                    }
                    throw error;
                }
            },
            () => undefined,
        )
            .then((answered) => {
                if (disposed || answered === undefined) return;
                heard(answered.answer);
            })
            .catch(() => undefined);
    };

    const spaceHeard = ({ space }: { readonly space: Space }): void => {
        const spaces = new Map(snapshot.spaces);
        if (spaceAdopt(spaces, spaceOf(space))) publish({ spaces });
    };

    const sectionHeard = ({ section: answered }: { readonly section: SpaceSection }): void => {
        const section = sectionOf(answered);
        const current = snapshot.sections.find((entry) => entry.id === section.id);
        if (current === undefined || current.version <= section.version)
            publish({
                sections: sectionsOrdered([
                    ...snapshot.sections.filter((entry) => entry.id !== section.id),
                    section,
                ]),
            });
    };

    const sectionPatch = (
        sectionId: HappyAgentSpaceSectionId,
        patch: Partial<Pick<HappyAgentSpaceSection, "collapsed" | "tailExpanded">>,
    ): void => {
        publish({
            sections: snapshot.sections.map((section) =>
                section.id === sectionId ? { ...section, ...patch } : section,
            ),
        });
        send(
            (mutationId) =>
                deps.client.updateSpaceSection(
                    sectionId,
                    { ...patch, mutationId },
                    { signal: life.signal },
                ),
            sectionHeard,
        );
    };

    let attention: { state: HappyAgentSpacesAttention; at: number } | undefined;
    let attentionQueue: Promise<void> = Promise.resolve();
    const attentionSend = (state: HappyAgentSpacesAttention): void => {
        if (snapshot.availability !== "available") return;
        if (state === "calm" && (sidebarDragging || sidebarWrites > 0)) return;
        const at = (deps.now ?? Date.now)();
        if (
            attention?.state === state &&
            (state === "calm" || at - attention.at < ATTENTION_RENEW_MS)
        )
            return;
        attention = { state, at };
        attentionQueue = attentionQueue.then(async () => {
            await deps.client
                .reportSpaceAttention({ state }, { signal: life.signal })
                .catch(() => undefined);
        });
    };
    let attentionVisible = true;
    let attentionIdle: ReturnType<typeof setTimeout> | undefined;
    /** Starts the quiet period over: calm only once it passes without input. */
    const attentionIdleRestart = (): void => {
        if (attentionIdle) clearTimeout(attentionIdle);
        attentionIdle = undefined;
        if (disposed || !attentionVisible) return;
        attentionIdle = setTimeout(() => {
            attentionIdle = undefined;
            attentionSend("calm");
        }, ATTENTION_CALM_MS);
    };
    const sidebarReleased = (): void => {
        if (sidebarDragging || sidebarWrites > 0) return;
        // A drop is input like any other; a hidden window was already calm.
        if (attentionVisible) attentionIdleRestart();
        else attentionSend("calm");
        if (sidebarStale) {
            sidebarStale = false;
            sidebarLoad();
        }
    };

    const store: HappyAgentSpacesStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        async stemCellCreate(placeSectionId, happySpaceId) {
            const id = idCreate();
            const mutationId = idCreate();
            const sectionId = placeSectionId as HappyAgentSpaceSectionId | null;
            const placement = { sectionId: placeSectionId, happySpaceId };
            creating.set(id, placement);
            try {
                const response = await happyAgentSyncRead(
                    life.signal,
                    async () => {
                        try {
                            return await deps.client.createStemCell(
                                { sectionId, id, mutationId },
                                { signal: life.signal },
                            );
                        } catch (error) {
                            if (error instanceof HappyAgentApiError && error.status < 500)
                                return { refused: error };
                            throw error;
                        }
                    },
                    () => undefined,
                );
                if ("refused" in response) throw response.refused;
                const space = spaceOf(response.space);
                const spaces = new Map(snapshot.spaces);
                spaceAdopt(spaces, space);
                const html = snapshot.sidebar && insert(snapshot.sidebar.html, space.id, placement);
                publish({
                    spaces,
                    ...(html && snapshot.sidebar ? { sidebar: { ...snapshot.sidebar, html } } : {}),
                    agentWorkspaces: new Map(snapshot.agentWorkspaces).set(
                        response.agent.id,
                        response.agent.workspaceId,
                    ),
                });
                return {
                    space,
                    agentId: response.agent.id,
                    workspaceId: response.agent.workspaceId,
                };
            } catch (error) {
                throw happyAgentUserError(error);
            } finally {
                creating.delete(id);
                if (creating.size === 0 && sidebarStale) sidebarLoad();
            }
        },
        spaceMove(spaceId, sectionId, afterId) {
            const space = snapshot.spaces.get(spaceId);
            if (space === undefined) return;
            const peers = happyAgentSpacesIn(snapshot.spaces, sectionId).filter(
                (peer) => peer.id !== spaceId,
            );
            const afterIndex =
                afterId === null ? -1 : peers.findIndex((peer) => peer.id === afterId);
            if (afterId !== null && afterIndex === -1) return;
            const before = afterIndex === -1 ? null : peers[afterIndex]!.orderKey;
            const after = peers[afterIndex + 1]?.orderKey ?? null;
            let orderKey: string;
            try {
                orderKey = orderKeyDecimalBetween(before, after);
            } catch {
                // Two peers share a key; the daemon's answer settles the order.
                orderKey = space.orderKey;
            }
            const spaces = new Map(snapshot.spaces);
            spaces.set(spaceId, {
                ...space,
                sectionId,
                orderKey,
                visibility: "shown",
                placement: "settled",
            });
            publish({ spaces });
            send(
                (mutationId) =>
                    deps.client.updateSpace(
                        spaceId,
                        { sectionId, afterId, mutationId },
                        { signal: life.signal },
                    ),
                spaceHeard,
            );
        },
        sectionCollapsedUpdate(sectionId, collapsed) {
            sectionPatch(sectionId, { collapsed });
        },
        sectionTailExpandedUpdate(sectionId, expanded) {
            sectionPatch(sectionId, { tailExpanded: expanded });
        },
        olderExpandedUpdate(expanded) {
            if (snapshot.olderExpanded === expanded) return;
            publish({ olderExpanded: expanded });
        },
        happyFocusUpdate(focused) {
            happyOnScreen = focused;
            if (focused && snapshot.noteUnread) publish({ noteUnread: false });
        },
        attentionInteractingUpdate(interacting) {
            if (!attentionVisible) return;
            if (interacting) attentionSend("interacting");
            attentionIdleRestart();
        },
        attentionInput() {
            if (!attentionVisible) return;
            attentionSend("interacting");
            attentionIdleRestart();
        },
        attentionVisibleUpdate(visible) {
            if (attentionVisible === visible) return;
            attentionVisible = visible;
            if (visible) {
                store.attentionInput();
                return;
            }
            attentionIdleRestart();
            attentionSend("calm");
        },
        sidebarDragUpdate(active) {
            sidebarDragging = active;
            if (active) attentionSend("interacting");
            else queueMicrotask(sidebarReleased);
        },
        tidyRequest() {
            send(
                (mutationId) => deps.client.tidySpaces({ mutationId, signal: life.signal }),
                () => undefined,
            );
        },
        sidebarWrite(html, force = false) {
            const current = snapshot.sidebar;
            if (current === undefined || (current.html === html && !force)) return;
            publish({ sidebar: { ...current, html, seed: false } });
            sidebarWrites += 1;
            sidebarQueue = sidebarQueue.then(async () => {
                await attentionQueue;
                const base = snapshot.sidebar;
                try {
                    if (disposed || base === undefined) return;
                    const answer = await deps.client.updateSpaceSidebar(
                        { html, baseVersion: base.version, mutationId: idCreate() },
                        { signal: life.signal },
                    );
                    if (disposed) return;
                    const latest = snapshot.sidebar;
                    const written = sidebarOf(answer);
                    publish({
                        sidebar: {
                            ...written,
                            // A later edit already on screen stays there until it is written.
                            html:
                                latest !== undefined && latest.html !== html
                                    ? latest.html
                                    : answer.html,
                        },
                    });
                } catch (error) {
                    // Stale or refused: the daemon's document stands and the reader is told.
                    failed(error);
                    sidebarStale = true;
                    if (snapshot.sidebar)
                        publish({ sidebar: { ...snapshot.sidebar, version: -1 } });
                } finally {
                    sidebarWrites -= 1;
                    sidebarReleased();
                }
            });
        },
        stemCellDiscard(spaceId) {
            const mutationId = idCreate();
            void happyAgentSyncRead(
                life.signal,
                async () => {
                    try {
                        await deps.client.removeSpace(spaceId, {
                            mutationId,
                            signal: life.signal,
                        });
                        return undefined;
                    } catch (error) {
                        // A chat that has a message is real work and stays.
                        if (error instanceof HappyAgentApiError && error.status < 500)
                            return undefined;
                        throw error;
                    }
                },
                () => undefined,
            ).catch(() => undefined);
        },
        sidebarClassicUpdate(next) {
            classic = next;
            seedAdopt();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            if (attentionIdle) clearTimeout(attentionIdle);
            stop();
            life.abort();
            listeners.clear();
        },
    };
    return store;
}

const UNSUPPORTED: HappyAgentSpacesSnapshot = { ...EMPTY, availability: "unsupported" };

/** The sidebar of a window with no Happy Agent behind it: nothing, and nothing to do. */
export const happyAgentSpacesStoreNoop: HappyAgentSpacesStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    stemCellCreate: () => Promise.reject(new Error("No Happy Agent is connected.")),
    spaceMove: () => undefined,
    sectionCollapsedUpdate: () => undefined,
    sectionTailExpandedUpdate: () => undefined,
    olderExpandedUpdate: () => undefined,
    happyFocusUpdate: () => undefined,
    attentionInteractingUpdate: () => undefined,
    attentionInput: () => undefined,
    attentionVisibleUpdate: () => undefined,
    tidyRequest: () => undefined,
    stemCellDiscard: () => undefined,
    sidebarWrite: () => undefined,
    sidebarDragUpdate: () => undefined,
    sidebarClassicUpdate: () => undefined,
    [Symbol.dispose]: () => undefined,
};
