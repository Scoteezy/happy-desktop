import {
    type Agent,
    applySpaceSidebarOperations,
    diffSpaceSidebar,
    formatSpaceSidebar,
    HappyAgentApiError,
    parseSpaceSidebar,
    type SpaceSidebarDocument,
    type SpaceSidebarOperation,
    type CreateStemCellResponse,
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
import { UserError } from "../types.js";
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
    "space.sidebar.changed",
    "artifact.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

type SpaceEvent = Extract<HappyAgentEvent, { type: (typeof SPACE_EVENT_TYPES)[number] }>;

function spaceEventIs(event: HappyAgentEvent): event is SpaceEvent {
    return (SPACE_EVENT_TYPES as readonly string[]).includes(event.type);
}

/** The daemon's IDs, branded at the one place they enter the store. */
/**
 * A row as this window reads it. The daemon names a picture by its path on the
 * daemon (`/v0/bots/:id/avatar`), which is only an address once it is put
 * behind the endpoint this connection talks to — the same base every other
 * avatar this connection renders is put behind. Left as a bare path, the
 * window resolved it against its own origin and drew a broken image.
 */
function spaceOf(space: Space, endpoint: string): HappyAgentSpace {
    const icon =
        space.icon?.type === "image" && space.icon.url.startsWith("/")
            ? { type: "image" as const, url: `${endpoint.replace(/\/$/u, "")}${space.icon.url}` }
            : space.icon;
    return {
        ...space,
        icon,
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

/** New work: its row, and the conversation behind it. */
export interface HappyAgentStemCell {
    readonly space: HappyAgentSpace;
    /** The conversation the first message goes to, and the workspace it runs in. */
    readonly agentId: string;
    readonly workspaceId: string;
}

/** New work being made. */
export interface HappyAgentStemCellCreation {
    /**
     * The row and its conversation, already in the sidebar, when this window
     * named them itself; absent on a daemon that names them, where the row
     * appears once `created` settles.
     */
    readonly cell?: HappyAgentStemCell;
    /** Settles once the daemon has made it; on a refusal the row is gone again. */
    readonly created: Promise<HappyAgentStemCell>;
}

/** The task, workspace and conversation this window names for new work. */
export interface HappyAgentStemCellIdentity {
    readonly taskId: string;
    readonly workspaceId: string;
    readonly agentId: string;
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
    /**
     * Whether a row may hold another of the person's spaces nested under it.
     * Without it the daemon refuses such a write, so none is offered.
     */
    readonly attachments: boolean;
}

function sidebarOf(
    answer: SpaceSidebarResponse,
    attachments: boolean,
): HappyAgentSpacesSidebarDocument {
    return {
        artifactId: answer.artifactId,
        version: answer.version,
        html: answer.html,
        agentIcons: new Map(Object.entries(answer.agentIcons ?? {})),
        seed: answer.seed === true,
        attachments,
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
    /** Why the last new work could not be made, until the reader dismisses it or makes more. */
    readonly stemCellError?: UserError;
}

/** Whether the reader is mid-gesture in the sidebar, or calm enough for it to change. */
export type HappyAgentSpacesAttention = "interacting" | "calm";

export interface HappyAgentSpacesStore {
    get(): HappyAgentSpacesSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Makes new work right after a section or separator, or for `null` right
     * after Happy's row (`happySpaceId`, which the window knows by its bot).
     * On a daemon that takes this window's names for it, the row and its
     * conversation exist here at once and the daemon is told after; otherwise
     * they exist once the daemon has made them.
     */
    stemCellCreate(
        sectionId: string | null,
        happySpaceId: string | null,
    ): HappyAgentStemCellCreation;
    /** Puts away the note that new work could not be made. */
    stemCellErrorDismiss(): void;
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
     * Shows the name the person just gave a row's task or bot, whose rename is
     * on its way: the row and its tab wear it at once and keep it through any
     * read or event that does not carry it yet, until one does.
     */
    spaceTitleUpdate(spaceId: HappyAgentSpaceId, title: string): void;
    /** Takes back a name the host refused, if it is still the one shown. */
    spaceTitleWithdraw(spaceId: HappyAgentSpaceId, title: string): void;
    /**
     * Writes the sidebar document this window edited, against the version it
     * edited. It shows at once; a stale base reads the daemon's version back
     * and reports the refusal, without merging.
     */
    sidebarWrite(html: string, force?: boolean): void;
    /**
     * Writes the document with a row's sessions revealed under it, opening the
     * row as the person's own choice: the batch sets `expanded` on the row
     * even when it was already open, so the daemon records the person as the
     * author of its fold. `rowId` is the row's node ID in the document.
     */
    sidebarSessionsRevealWrite(html: string, rowId: string): void;
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
    /**
     * Lists the task behind new work this window named, before the daemon has
     * made it, so its chat opens and takes a first message at once; the
     * message waits for `created`, and a refusal takes the task back out.
     */
    readonly stemCellTaskBegin?: (
        identity: HappyAgentStemCellIdentity,
        created: Promise<{ readonly agent: Agent }>,
    ) => void;
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
    const spaceRead = (space: Space): HappyAgentSpace => spaceOf(space, deps.client.endpoint);
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

    /**
     * Names given here whose rename no read has carried yet, by space, with
     * the title the daemon last said, which a refusal puts back.
     */
    const titleIntents = new Map<
        HappyAgentSpaceId,
        { readonly title: string; base: string | null }
    >();
    const titled = (space: HappyAgentSpace): HappyAgentSpace => {
        const intent = titleIntents.get(space.id);
        if (intent === undefined) return space;
        if (space.title === intent.title) {
            titleIntents.delete(space.id);
            return space;
        }
        intent.base = space.title;
        return { ...space, title: intent.title };
    };
    const spaceTitleShow = (spaceId: HappyAgentSpaceId, title: string | null): void => {
        const current = snapshot.spaces.get(spaceId);
        if (current === undefined || current.title === title) return;
        const spaces = new Map(snapshot.spaces);
        spaces.set(spaceId, { ...current, title });
        publish({ spaces });
    };
    const spaceAdopt = (
        spaces: Map<HappyAgentSpaceId, HappyAgentSpace>,
        space: HappyAgentSpace,
    ): boolean => {
        const current = spaces.get(space.id);
        if (current !== undefined && current.version > space.version) return false;
        spaces.set(space.id, titled(space));
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
    /** The document the daemon was last heard to hold, whatever is on screen over it. */
    let sidebarHeld: { readonly version: number; readonly html: string } | undefined;
    /**
     * The reader's own edits the daemon has not confirmed yet, oldest first,
     * each as the operations it made against the document then on screen. The
     * screen is always the held document with these applied on top, by the
     * same function the daemon applies them with, so a confirmation draws
     * exactly what was already drawn and nothing moves.
     */
    let sidebarBatches: readonly {
        readonly mutationId: string;
        readonly operations: readonly SpaceSidebarOperation[];
        readonly base: SpaceSidebarDocument;
    }[] = [];
    /** A daemon that takes edits as operations by node ID and announces each version. */
    const sidebarOperational = (): boolean =>
        deps.sync.health()?.capabilities?.sidebarOperations === true;
    /** A daemon whose rows may hold the person's other spaces. */
    const sidebarAttaching = (): boolean =>
        deps.sync.health()?.capabilities?.sidebarAttachments === true;
    /** The held document with every unconfirmed edit and new work still being made on top. */
    const sidebarShown = (): string | undefined => {
        if (sidebarHeld === undefined) return undefined;
        let html = sidebarHeld.html;
        if (sidebarBatches.length > 0) {
            let document: SpaceSidebarDocument;
            try {
                document = parseSpaceSidebar(html);
            } catch {
                return html;
            }
            for (const batch of sidebarBatches) {
                try {
                    document = applySpaceSidebarOperations(document, batch.operations, {
                        base: batch.base,
                    }).document;
                } catch {
                    // Already in the held document, or no longer possible: the
                    // daemon's answer for it decides, and it draws nothing now.
                }
            }
            html = formatSpaceSidebar(document);
        }
        for (const [spaceId, placement] of creating)
            html = insert(html, spaceId, placement) ?? html;
        return html;
    };
    /** Puts the held document and the edits on top of it on screen. */
    const sidebarShow = (): void => {
        const current = snapshot.sidebar;
        const html = sidebarShown();
        if (current === undefined || sidebarHeld === undefined || html === undefined) return;
        if (current.html === html && current.version === sidebarHeld.version) return;
        publish({ sidebar: { ...current, version: sidebarHeld.version, html } });
    };
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
            .getSpaceSidebar({
                signal: life.signal,
                ...(sidebarOperational() ? { widgets: true } : {}),
            })
            .then((answer) => {
                if (disposed) return;
                if (sidebarWrites > 0 || sidebarDragging || creating.size > 0) {
                    sidebarStale = true;
                    return;
                }
                const current = snapshot.sidebar;
                if (current && current.version > answer.version) return;
                if (current?.version === answer.version && current.html === answer.html) return;
                sidebarHeld = { version: answer.version, html: answer.html };
                publish({
                    sidebar: {
                        ...sidebarOf(answer, sidebarAttaching()),
                        html: sidebarShown() ?? answer.html,
                    },
                });
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
                for (const space of response.spaces.map(spaceRead))
                    spaces.set(space.id, titled(space));
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
                if (spaceAdopt(spaces, spaceRead(event.payload.space))) next.spaces = spaces;
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
                if (
                    event.type === "space.created" &&
                    snapshot.sidebar !== undefined &&
                    !sidebarOperational()
                )
                    sidebarLoad();
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
                if (snapshot.sidebar !== undefined && !sidebarOperational()) sidebarLoad();
                break;
            }
            case "artifact.updated": {
                const sidebar = snapshot.sidebar;
                // A version this window already holds, its own write included, needs no read;
                // a daemon that announces each version says what changed in it instead.
                if (
                    !sidebarOperational() &&
                    event.payload.artifactId === sidebar?.artifactId &&
                    event.payload.changes.latestVersion > sidebar.version
                )
                    sidebarLoad();
                break;
            }
            case "space.batch.applied": {
                const batch = batchOf(event.payload.batch);
                // A batch is where the manager's queued document edits land.
                if (snapshot.sidebar !== undefined && !sidebarOperational()) sidebarLoad();
                if (!happyFocused() && !snapshot.batches.some((entry) => entry.id === batch.id))
                    next.noteUnread = true;
                next.batches = [
                    batch,
                    ...snapshot.batches.filter((entry) => entry.id !== batch.id),
                ].slice(0, BATCH_LIMIT);
                break;
            }
            case "space.sidebar.changed": {
                const payload = event.payload;
                const sidebar = snapshot.sidebar;
                if (sidebar === undefined || payload.artifactId !== sidebar.artifactId) break;
                if (sidebarHeld === undefined || payload.version <= sidebarHeld.version) break;
                // Nothing lands under a hand: the read after the release catches up.
                if (sidebarDragging || creating.size > 0) {
                    sidebarStale = true;
                    break;
                }
                // A version that follows the one held is replayed onto it; any
                // gap in between is read whole.
                if (payload.previousVersion !== sidebarHeld.version) {
                    sidebarLoad();
                    break;
                }
                let document: SpaceSidebarDocument;
                try {
                    document = applySpaceSidebarOperations(
                        parseSpaceSidebar(sidebarHeld.html),
                        payload.operations,
                    ).document;
                } catch {
                    sidebarLoad();
                    break;
                }
                sidebarHeld = { version: payload.version, html: formatSpaceSidebar(document) };
                // The reader's own edit, confirmed: it is already on screen.
                if (payload.mutationId !== undefined)
                    sidebarBatches = sidebarBatches.filter(
                        (batch) => batch.mutationId !== payload.mutationId,
                    );
                next.sidebar = {
                    ...sidebar,
                    version: sidebarHeld.version,
                    html: sidebarShown() ?? sidebarHeld.html,
                };
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
        if (spaceAdopt(spaces, spaceRead(space))) publish({ spaces });
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

    /**
     * One edit of the document, sent as the operations that make it. It is on
     * screen at once and stays exactly there when the daemon confirms it; a
     * refusal takes only this edit back off, so whatever it moved glides back
     * once from where it stands.
     */
    const sidebarOperationsSend = (
        current: HappyAgentSpacesSidebarDocument,
        html: string,
        /** Rows whose `expanded` the person sets in this batch whether or not it changes. */
        expandedClaims: readonly string[] = [],
    ): void => {
        let base: SpaceSidebarDocument;
        let proposed: SpaceSidebarDocument;
        try {
            base = parseSpaceSidebar(current.html);
            proposed = parseSpaceSidebar(html);
        } catch {
            return;
        }
        const operations = diffSpaceSidebar(base, proposed);
        if (operations.length === 0) return;
        for (const id of expandedClaims)
            if (
                !operations.some(
                    (operation) =>
                        operation.type === "set" &&
                        operation.id === id &&
                        operation.expanded !== undefined,
                )
            )
                operations.push({ type: "set", id, expanded: true });
        const batch = { mutationId: idCreate(), operations, base };
        sidebarBatches = [...sidebarBatches, batch];
        publish({
            sidebar: {
                ...current,
                html: sidebarShown() ?? formatSpaceSidebar(proposed),
                seed: false,
            },
        });
        sidebarWrites += 1;
        sidebarQueue = sidebarQueue.then(async () => {
            await attentionQueue;
            try {
                if (disposed) return;
                let answer: Awaited<ReturnType<HappyAgentClient["applySpaceSidebarOperations"]>>;
                for (let attempt = 0; ; attempt += 1) {
                    try {
                        // Made against what was on screen, sent against what the
                        // daemon last said; it rebases anything in between.
                        answer = await deps.client.applySpaceSidebarOperations(
                            {
                                mutationId: batch.mutationId,
                                baseVersion: sidebarHeld?.version ?? current.version,
                                operations: [...batch.operations],
                            },
                            { signal: life.signal },
                        );
                        break;
                    } catch (error) {
                        // Only a request that was not heard is sent again, under
                        // the same mutation ID; a refusal is final.
                        if (
                            attempt >= 2 ||
                            life.signal.aborted ||
                            (error instanceof HappyAgentApiError && error.status < 500)
                        )
                            throw error;
                        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
                    }
                }
                if (disposed) return;
                sidebarBatches = sidebarBatches.filter((entry) => entry !== batch);
                if (sidebarHeld === undefined || answer.version > sidebarHeld.version)
                    sidebarHeld = { version: answer.version, html: answer.html };
                sidebarShow();
            } catch (error) {
                sidebarBatches = sidebarBatches.filter((entry) => entry !== batch);
                failed(error);
                sidebarShow();
                // The daemon moved on from the document this window holds.
                sidebarStale = true;
            } finally {
                sidebarWrites -= 1;
                sidebarReleased();
            }
        });
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
        stemCellCreate(placeSectionId, happySpaceId) {
            const id = idCreate() as HappyAgentSpaceId;
            const mutationId = idCreate();
            const sectionId = placeSectionId as HappyAgentSpaceSectionId | null;
            const placement = { sectionId: placeSectionId, happySpaceId };
            // Names the daemon takes are names this window can use before it
            // answers; one that does not take them names everything itself.
            const identity: HappyAgentStemCellIdentity | undefined =
                deps.sync.health()?.capabilities?.stemCellIdentities === true
                    ? { taskId: idCreate(), workspaceId: idCreate(), agentId: idCreate() }
                    : undefined;
            creating.set(id, placement);
            // One request under one set of names, repeated until it is heard:
            // a repeat after a lost answer settles on the work already made.
            const request = happyAgentSyncRead(
                life.signal,
                async (): Promise<CreateStemCellResponse | { readonly refused: unknown }> => {
                    try {
                        return await deps.client.createStemCell(
                            { sectionId, id, mutationId, ...identity },
                            { signal: life.signal },
                        );
                    } catch (error) {
                        if (error instanceof HappyAgentApiError && error.status < 500)
                            return { refused: error };
                        throw error;
                    }
                },
                () => undefined,
            ).then((response) => {
                if ("refused" in response) throw response.refused;
                return response;
            });
            let cell: HappyAgentStemCell | undefined;
            if (identity !== undefined) {
                // The task is listed before the row, so the row never points
                // at a conversation the window cannot open.
                deps.stemCellTaskBegin?.(identity, request);
                const at = (deps.now ?? Date.now)();
                const peers = happyAgentSpacesIn(snapshot.spaces, sectionId);
                const after = peers.findIndex((peer) => peer.id === happySpaceId);
                let orderKey: string;
                try {
                    orderKey = orderKeyDecimalBetween(
                        peers[after]?.orderKey ?? null,
                        peers[after + 1]?.orderKey ?? null,
                    );
                } catch {
                    orderKey = peers[after]?.orderKey ?? "";
                }
                // Version 0 is older than anything the daemon says about it.
                const space: HappyAgentSpace = {
                    id,
                    createdAt: at,
                    updatedAt: at,
                    icon: { type: "stem_cell" },
                    orderKey,
                    placement: "pending",
                    sectionId,
                    target: {
                        kind: "task",
                        id: identity.taskId,
                        agentId: identity.agentId,
                        workspaceId: identity.workspaceId,
                    },
                    title: null,
                    version: 0,
                    visibility: "shown",
                    working: false,
                };
                const html = snapshot.sidebar && insert(snapshot.sidebar.html, id, placement);
                publish({
                    spaces: new Map(snapshot.spaces).set(id, space),
                    ...(html && snapshot.sidebar ? { sidebar: { ...snapshot.sidebar, html } } : {}),
                    agentWorkspaces: new Map(snapshot.agentWorkspaces).set(
                        identity.agentId,
                        identity.workspaceId,
                    ),
                    stemCellError: undefined,
                });
                cell = { space, agentId: identity.agentId, workspaceId: identity.workspaceId };
            } else if (snapshot.stemCellError !== undefined) publish({ stemCellError: undefined });
            const created = request
                .then(
                    (response): HappyAgentStemCell => {
                        const space = spaceRead(response.space);
                        if (disposed)
                            return {
                                space,
                                agentId: response.agent.id,
                                workspaceId: response.agent.workspaceId,
                            };
                        const spaces = new Map(snapshot.spaces);
                        spaceAdopt(spaces, space);
                        const html =
                            snapshot.sidebar && insert(snapshot.sidebar.html, space.id, placement);
                        publish({
                            spaces,
                            ...(html && snapshot.sidebar
                                ? { sidebar: { ...snapshot.sidebar, html } }
                                : {}),
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
                    },
                    (error: unknown) => {
                        const failure = happyAgentUserError(error);
                        if (!disposed && !life.signal.aborted) {
                            // The row this window showed goes, and the
                            // document is read back without it.
                            const spaces = new Map(snapshot.spaces);
                            if (spaces.get(id)?.version === 0) spaces.delete(id);
                            sidebarStale = true;
                            publish({
                                spaces,
                                stemCellError: new UserError(
                                    `New work could not be made. ${failure.message}`,
                                    failure.code,
                                    failure,
                                ),
                            });
                        }
                        throw failure;
                    },
                )
                .finally(() => {
                    creating.delete(id);
                    if (creating.size === 0 && sidebarStale) {
                        sidebarStale = false;
                        sidebarLoad();
                    }
                });
            return { ...(cell === undefined ? {} : { cell }), created };
        },
        stemCellErrorDismiss() {
            if (snapshot.stemCellError !== undefined) publish({ stemCellError: undefined });
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
        sidebarSessionsRevealWrite(html, rowId) {
            const current = snapshot.sidebar;
            if (current === undefined || current.html === html) return;
            if (creating.size === 0 && sidebarHeld !== undefined && sidebarOperational()) {
                sidebarOperationsSend(current, html, [rowId]);
                return;
            }
            store.sidebarWrite(html);
        },
        sidebarWrite(html, force = false) {
            const current = snapshot.sidebar;
            if (current === undefined || (current.html === html && !force)) return;
            // New work still being made names rows the daemon has not written
            // yet, and a seed is ended by a whole write: both go as one.
            if (
                !force &&
                creating.size === 0 &&
                sidebarHeld !== undefined &&
                sidebarOperational()
            ) {
                sidebarOperationsSend(current, html);
                return;
            }
            publish({ sidebar: { ...current, html, seed: false } });
            sidebarWrites += 1;
            sidebarQueue = sidebarQueue.then(async () => {
                await attentionQueue;
                const base = snapshot.sidebar;
                // One mutation across every attempt: a refused write records
                // nothing, and the same content under the same ID is a replay.
                const mutationId = idCreate();
                try {
                    if (disposed || base === undefined) return;
                    let baseVersion = base.version;
                    let answer: SpaceSidebarResponse | undefined;
                    for (let attempt = 0; answer === undefined; attempt += 1) {
                        try {
                            answer = await deps.client.updateSpaceSidebar(
                                { html, baseVersion, mutationId },
                                { signal: life.signal },
                            );
                        } catch (error) {
                            // Stale only by number: another author wrote the
                            // document back as it was — an echo, a calm batch
                            // that changed nothing — while this edit was being
                            // made. The edit still stands on exactly what it was
                            // made against, so it is written again on the new
                            // version rather than taken back off the screen.
                            if (
                                attempt >= 3 ||
                                !(error instanceof HappyAgentApiError) ||
                                error.status !== 409 ||
                                sidebarHeld?.version !== baseVersion
                            )
                                throw error;
                            const latest = await deps.client.getSpaceSidebar({
                                signal: life.signal,
                            });
                            if (latest.html !== sidebarHeld.html) throw error;
                            sidebarHeld = { version: latest.version, html: latest.html };
                            baseVersion = latest.version;
                        }
                    }
                    sidebarHeld = { version: answer.version, html: answer.html };
                    if (disposed) return;
                    const latest = snapshot.sidebar;
                    const written = sidebarOf(answer, sidebarAttaching());
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
        spaceTitleUpdate(spaceId, title) {
            const current = snapshot.spaces.get(spaceId);
            if (current === undefined) return;
            const prior = titleIntents.get(spaceId);
            const base = prior === undefined ? current.title : prior.base;
            if (base === title) titleIntents.delete(spaceId);
            else titleIntents.set(spaceId, { title, base });
            spaceTitleShow(spaceId, title);
        },
        spaceTitleWithdraw(spaceId, title) {
            const intent = titleIntents.get(spaceId);
            if (intent?.title !== title) return;
            titleIntents.delete(spaceId);
            spaceTitleShow(spaceId, intent.base);
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
    stemCellCreate: () => {
        const created = Promise.reject(new UserError("No Happy Agent is connected."));
        void created.catch(() => undefined);
        return { created };
    },
    stemCellErrorDismiss: () => undefined,
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
    spaceTitleUpdate: () => undefined,
    spaceTitleWithdraw: () => undefined,
    sidebarWrite: () => undefined,
    sidebarSessionsRevealWrite: () => undefined,
    sidebarDragUpdate: () => undefined,
    sidebarClassicUpdate: () => undefined,
    [Symbol.dispose]: () => undefined,
};
