import {
    happyAgentSpacesIn,
    happyAgentSpacesOlder,
    sidebarDocumentEdit,
    sidebarDocumentFold,
    sidebarDocumentKey,
    sidebarDocumentMove,
    sidebarDocumentView,
    type SidebarDocumentClassic,
    type SidebarDocumentItem,
    type SidebarDocumentSession,
    type SidebarDocumentView,
    type HappyAgentBot,
    type HappyAgentSpace,
    type HappyAgentSpaceBatch,
    type HappyAgentSpaceIcon,
    type HappyAgentSpaceId,
    type HappyAgentSpaceTarget,
    type HappyAgentSpacesSnapshot,
    type HappyAgentSpacesStore,
    type HappyAgentTask,
    type ConversationNote,
} from "happy-desktop-state";
import {
    clayIconMark,
    clayIconSlugIs,
    happyIconMark,
    MakeStuffIntro,
    Sidebar,
    type KeyboardShortcut,
    type MakeStuffOption,
    type MenuItem,
    type SidebarItem,
    type TabItem,
} from "happy-desktop-ui";
import { useMemo, type ReactNode } from "react";

/** The places a space can open, as the window addresses them. */
export interface HappyAgentSpacesNavigation {
    onChatSelect(groupId: string, chatId: string): void;
    onSurfaceOpen?(surfaceId: string): void;
}

/** The parts of one Happy Agent a space resolves against. */
export interface HappyAgentSpacesPlaces {
    readonly bots: readonly HappyAgentBot[];
    readonly tasks: readonly HappyAgentTask[];
    /** The workspace one of the reader's project chats runs in. */
    readonly chatGroupOf: (agentId: string) => string | undefined;
}

/** What the window is showing, so the matching row is the selected one. */
export interface HappyAgentSpacesFocus {
    readonly chatId?: string;
    /** The workspace on screen, which selects a worktree row drawn under a node. */
    readonly groupId?: string;
    readonly surfaceId?: string;
    readonly artifactId?: string;
}

/** A row nested under a space: a session the document names, or a worktree the window draws. */
export type HappyAgentSpacesChild =
    | { readonly kind: "session"; readonly agentId: string }
    | { readonly kind: "worktree"; readonly worktreeId: string };

/** A conversation anywhere in a subtask tree that answers `match`. */
function subtaskWhere(
    owners: readonly { readonly subtasks: HappyAgentTask["subtasks"] }[],
    match: (subtask: HappyAgentTask["subtasks"][number]) => boolean,
): HappyAgentTask["subtasks"][number] | undefined {
    for (const owner of owners)
        for (const subtask of owner.subtasks) {
            if (match(subtask)) return subtask;
            const nested = subtaskWhere([subtask], match);
            if (nested) return nested;
        }
    return undefined;
}

/**
 * Where a nested row opens: the workspace and the session in it. A session
 * opens in the workspace it runs in, at any depth. A worktree opens where it
 * was last left, or on its newest chat; a worktree whose only conversation is a
 * task's or subtask's — which the project list does not file under it — opens
 * on that conversation, never on the bare workspace.
 */
export function happyAgentSpacesChildDestination(
    child: HappyAgentSpacesChild,
    places: HappyAgentSpacesPlaces,
    worktrees: readonly {
        readonly id: string;
        readonly conversations: readonly { readonly id: string }[];
    }[],
    resume: (worktreeId: string) => string | undefined,
): { readonly groupId: string; readonly chatId: string } | undefined {
    const owners = [...places.tasks, ...places.bots];
    if (child.kind === "session") {
        const id = child.agentId;
        const found =
            subtaskWhere(owners, (subtask) => subtask.conversation.id === id) ??
            owners.find((owner) => owner.conversation.id === id);
        if (found) return { groupId: found.workspaceId, chatId: id };
        const groupId = places.chatGroupOf(id);
        return groupId === undefined ? undefined : { groupId, chatId: id };
    }
    const id = child.worktreeId;
    const chatId =
        resume(id) ??
        worktrees.find((worktree) => worktree.id === id)?.conversations[0]?.id ??
        subtaskWhere(owners, (subtask) => subtask.workspaceId === id)?.conversation.id ??
        owners.find((owner) => owner.workspaceId === id)?.conversation.id;
    return chatId === undefined ? undefined : { groupId: id, chatId };
}

/** The system key of Happy's own bot. */
const HAPPY_BOT_KEY = "chief_of_staff";
const MENU_OPEN = "open";
const MENU_TIDY = "tidy";
const MENU_LEAVE = "leave";
const MENU_ARCHIVE = "archive";
const MENU_SIDEBAR = "sidebar";
const MENU_ASIDE = "aside";
const MENU_DISCARD = "discard";
/** The one list every item stands in: the sidebar has no sections of its own. */
const LIST = "spaces";
/** Rows the window draws under a node, which the document does not name. */
const WORKTREE_PREFIX = "worktree:";

/** The conversation a space opens, when it has one. */
function spaceAgentId(space: HappyAgentSpace): string | undefined {
    return space.target.agentId ?? undefined;
}

/** The workspace a conversation runs in, from the lists that name it. */
function agentGroupOf(
    agentId: string,
    places: HappyAgentSpacesPlaces,
    snapshot: HappyAgentSpacesSnapshot,
): string | undefined {
    return (
        places.tasks.find((task) => task.conversation.id === agentId)?.workspaceId ??
        places.bots.find((bot) => bot.conversation.id === agentId)?.workspaceId ??
        places.chatGroupOf(agentId) ??
        snapshot.agentWorkspaces.get(agentId)
    );
}

function targetTask(target: HappyAgentSpaceTarget, places: HappyAgentSpacesPlaces) {
    return target.kind === "task" ? places.tasks.find((task) => task.id === target.id) : undefined;
}

function targetBot(target: HappyAgentSpaceTarget, places: HappyAgentSpacesPlaces) {
    return target.kind === "bot" ? places.bots.find((bot) => bot.id === target.id) : undefined;
}

/** Opens what a space holds where it always opens. */
export function happyAgentSpaceOpen(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    snapshot: HappyAgentSpacesSnapshot,
    navigation: HappyAgentSpacesNavigation,
): void {
    if (space.target.kind === "surface") {
        navigation.onSurfaceOpen?.(space.target.id);
        return;
    }
    const agentId = spaceAgentId(space);
    if (agentId === undefined) return;
    const groupId = space.target.workspaceId ?? agentGroupOf(agentId, places, snapshot);
    if (groupId !== undefined) navigation.onChatSelect(groupId, agentId);
}

/** The space the window is showing, if a row stands for it. */
export function happyAgentSpaceFocused(
    snapshot: HappyAgentSpacesSnapshot,
    focus: HappyAgentSpacesFocus,
): HappyAgentSpace | undefined {
    for (const space of snapshot.spaces.values()) {
        if (focus.surfaceId !== undefined) {
            if (space.target.kind === "surface" && space.target.id === focus.surfaceId)
                return space;
            continue;
        }
        if (focus.artifactId !== undefined) continue;
        if (focus.chatId !== undefined && spaceAgentId(space) === focus.chatId) return space;
    }
    return undefined;
}

/** Whether a space is Happy's own row: the one whose target is Happy's bot. */
export function happyAgentSpaceHappyIs(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
): boolean {
    return targetBot(space.target, places)?.systemKey === HAPPY_BOT_KEY;
}

/** A picture Prioritizing chose, as a row or a tab wears it. */
function iconMark(
    icon: HappyAgentSpaceIcon | null | undefined,
): Pick<SidebarItem & TabItem, "imageMark"> | undefined {
    if (icon?.type === "library" && clayIconSlugIs(icon.slug))
        return { imageMark: clayIconMark(icon.slug) };
    if (icon?.type === "image") return { imageMark: { src: icon.url, alt: "" } };
    return undefined;
}

/**
 * The identity a space wears in a row or a tab. Work that has no picture yet
 * is still taking shape, so it wears the stem cell until it is given one.
 */
export function happyAgentSpaceMark(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
): Pick<SidebarItem & TabItem, "imageMark" | "stemCell"> {
    if (happyAgentSpaceHappyIs(space, places)) return { imageMark: happyIconMark() };
    const icon = space.icon;
    if (icon?.type === "stem_cell") return { stemCell: { id: space.id } };
    const chosen = iconMark(icon);
    if (chosen) return chosen;
    const avatar = targetBot(space.target, places)?.avatar;
    if (avatar) return { imageMark: { src: avatar.url, alt: "" } };
    return { stemCell: { id: space.id } };
}

/** The picture Prioritizing chose for a session, for its row and its tab. */
export function happyAgentSessionMark(
    snapshot: HappyAgentSpacesSnapshot,
    agentId: string,
): Pick<SidebarItem & TabItem, "imageMark"> | undefined {
    return iconMark(snapshot.sidebar?.agentIcons.get(agentId));
}

/** The name a space goes by, the same in its row and in its tab. */
export function happyAgentSpaceLabel(space: HappyAgentSpace): string {
    // Work is "New" until it has a name; it does not announce what it will be.
    return space.title ?? "New";
}

/**
 * A space as its row: a task's row as the current sidebar draws one, with the
 * waiting and question marks, unread dot, and title shimmer. Running work
 * shimmers its title and spins only in its tab.
 */
function spaceRow(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    titleShimmerEnabled: boolean,
): SidebarItem {
    const conversation = (targetTask(space.target, places) ?? targetBot(space.target, places))
        ?.conversation;
    const activity = conversation?.activity;
    return {
        id: `space:${space.id}`,
        kind: "project",
        label: happyAgentSpaceLabel(space),
        labelShimmer: titleShimmerEnabled,
        workingIndicator: "none",
        ...happyAgentSpaceMark(space, places),
        ...(activity === "awaitingInput"
            ? { status: "awaitingInput" as const }
            : activity === "running" || space.working
              ? { status: "working" as const }
              : activity === "waiting"
                ? { status: "waiting" as const }
                : {}),
        ...(conversation?.unread ? { unread: true } : {}),
    };
}

/** What a row's menu offers, by what the row holds. */
function spaceMenu(space: HappyAgentSpace, places: HappyAgentSpacesPlaces): MenuItem[] {
    const open: MenuItem = { kind: "item", id: MENU_OPEN, label: "Open", icon: "open-external" };
    if (happyAgentSpaceHappyIs(space, places))
        return [
            open,
            { kind: "separator" },
            { kind: "item", id: MENU_TIDY, label: "Tidy sidebar now", icon: "list" },
        ];
    switch (space.target.kind) {
        case "task": {
            const task = targetTask(space.target, places);
            // New work nobody named yet closes from here and only from here.
            if (space.title === null && space.icon?.type === "stem_cell")
                return [
                    open,
                    { kind: "separator" },
                    { kind: "item", id: MENU_DISCARD, label: "Close new work", icon: "close" },
                ];
            return [
                open,
                { kind: "separator" },
                { kind: "item", id: MENU_LEAVE, label: "Leave task", icon: "close" },
                ...(task?.canArchive
                    ? [
                          {
                              kind: "item" as const,
                              id: MENU_ARCHIVE,
                              label: "Archive task",
                              icon: "archive" as const,
                          },
                      ]
                    : []),
            ];
        }
        case "bot":
            return [
                { ...open, label: "Open bot" },
                { kind: "separator" },
                { kind: "item", id: MENU_ARCHIVE, label: "Archive bot", icon: "archive" },
            ];
        case "surface":
            return [
                open,
                { kind: "separator" },
                { kind: "item", id: MENU_LEAVE, label: "Leave", icon: "close" },
            ];
    }
}

/** The acts a row's menu reaches beyond opening it. */
export interface HappyAgentSpacesActions {
    taskLeave(taskId: string): void;
    taskArchive(taskId: string): void;
    botArchive(botId: string): void;
    surfaceLeave(surfaceId: string): void;
}

/** The window's two commands, which stand in the list like any item. */
export interface HappyAgentSpacesCommand {
    readonly label: string;
    readonly shortcut?: KeyboardShortcut;
    readonly onOpen: () => void;
    /**
     * What else the item can make, behind a › at its trailing edge (hover or
     * focus; ArrowRight opens it too). The item itself still does `onOpen`.
     */
    readonly menu?: {
        readonly label: string;
        readonly items: readonly MenuItem[];
        readonly onSelect: (id: string) => void;
    };
}

export interface HappyAgentSpacesSidebarProps {
    readonly store: HappyAgentSpacesStore;
    readonly snapshot: HappyAgentSpacesSnapshot;
    readonly places: HappyAgentSpacesPlaces;
    readonly focus: HappyAgentSpacesFocus;
    readonly navigation: HappyAgentSpacesNavigation;
    readonly actions: HappyAgentSpacesActions;
    /** Opens the window's search, from its item. */
    readonly search?: HappyAgentSpacesCommand;
    /** Makes new work, from its item. */
    readonly create?: HappyAgentSpacesCommand;
    readonly now: number;
    readonly visible?: boolean;
    /** Whether a working row shimmers its title, as the reader set it. */
    readonly titleShimmerEnabled: boolean;
    readonly brand: boolean;
    readonly footer: ReactNode;
    readonly headerAccessory?: ReactNode;
    /**
     * What the reader had folded and hidden in the classic sidebar. The
     * daemon's first document mirrors that sidebar without knowing these, so
     * the store writes them into it once it arrives.
     */
    readonly classic?: SidebarDocumentClassic;
    /** A session's row, by its agent, from the window's lists; absent until they know it. */
    readonly sessionRow: (agentId: string) => SidebarItem | undefined;
    /** The worktrees an agent made, as rows; the window draws them under that agent's node. */
    readonly worktreeRows: (agentId: string) => readonly SidebarItem[];
    /** Opens a session or a worktree, which is a conversation rather than a space. */
    readonly onChildSelect: (child: HappyAgentSpacesChild) => void;
    /** Opens the sidebar document itself, from Happy's row. */
    readonly onSidebarOpen?: (artifactId: string) => void;
    /** Opens a space's conversation beside the one on screen. */
    readonly onChatAside?: (agentId: string, label: string) => void;
}

/** The document as items, or nothing when there is none or it is not one the window will draw. */
function documentViewOf(html: string | undefined): SidebarDocumentView | undefined {
    if (html === undefined) return undefined;
    try {
        return sidebarDocumentView(html);
    } catch {
        return undefined;
    }
}

/**
 * The sidebar a daemon without the document keeps, read as one: Search and
 * Create, Happy and new work, each section behind its heading, and
 * folded work behind a bare, folded one. Nothing in it can be written back.
 */
function legacyViewOf(snapshot: HappyAgentSpacesSnapshot): SidebarDocumentView {
    const space = (entry: HappyAgentSpace): SidebarDocumentItem => ({
        kind: "space",
        id: entry.id,
        expanded: true,
        children: [],
    });
    const older = happyAgentSpacesOlder(snapshot.spaces);
    return {
        items: [
            { kind: "search" },
            { kind: "create" },
            ...happyAgentSpacesIn(snapshot.spaces, null).map(space),
            ...snapshot.sections.flatMap((section) => [
                {
                    kind: "section" as const,
                    id: section.id,
                    label: section.name,
                    collapsed: section.collapsed,
                },
                ...happyAgentSpacesIn(snapshot.spaces, section.id).map(space),
            ]),
            ...(older.length > 0
                ? [{ kind: "separator" as const, id: "older" }, ...older.map(space)]
                : []),
        ],
    };
}

/**
 * The spaces sidebar: the person's document drawn as it stands. Search,
 * Create, sections, separators and spaces are items of one list, and any of them can be
 * carried anywhere in it; a session moves among its own siblings. A click opens
 * what a row holds, and a section folds the run after it.
 */
export function HappyAgentSpacesSidebar(props: HappyAgentSpacesSidebarProps) {
    const { snapshot, places } = props;
    const sidebarDoc = snapshot.sidebar;
    const documentView = useMemo(() => documentViewOf(sidebarDoc?.html), [sidebarDoc?.html]);
    const view = documentView ?? legacyViewOf(snapshot);
    const editable = documentView !== undefined && sidebarDoc !== undefined;
    const visible = props.visible !== false;
    const focused = happyAgentSpaceFocused(snapshot, props.focus);
    const foldReveal = (own: "hover" | "always" | undefined) =>
        (own ?? view.foldRibbon) === "always" ? { foldReveal: "always" as const } : {};
    /** The document node each drawn row stands for, or the one a worktree follows. */
    const anchorOf = new Map<string, string | null>();
    // A node's own row, then — open or shut, the fold decides what shows —
    // its sessions and the worktrees its agent made.
    const nested = (
        agentId: string | undefined,
        sessions: readonly SidebarDocumentSession[],
        depth: number,
    ): SidebarItem[] => {
        const rows: SidebarItem[] = [];
        let last: string | null = null;
        for (const session of sessions) {
            const row = props.sessionRow(session.id);
            if (row === undefined) continue;
            const key = sidebarDocumentKey(session);
            anchorOf.set(key, key);
            last = key;
            const children = nested(session.id, session.children, depth + 1);
            rows.push(
                {
                    ...row,
                    ...happyAgentSessionMark(snapshot, session.id),
                    id: key,
                    depth,
                    workingIndicator: "none",
                    ...foldReveal(session.foldRibbon),
                    ...(children.length > 0 ? { collapsed: !session.expanded } : {}),
                },
                ...children,
            );
        }
        if (agentId !== undefined)
            for (const worktree of props.worktreeRows(agentId)) {
                const id = `${WORKTREE_PREFIX}${worktree.id}`;
                anchorOf.set(id, last);
                rows.push({
                    ...worktree,
                    id,
                    depth,
                    reorderable: false,
                    workingIndicator: "none",
                });
            }
        return rows;
    };
    const items: SidebarItem[] = view.items.flatMap((item): SidebarItem[] => {
        const key = sidebarDocumentKey(item);
        anchorOf.set(key, key);
        switch (item.kind) {
            case "search":
            case "create": {
                const command = item.kind === "search" ? props.search : props.create;
                if (!command) return [];
                return [
                    {
                        id: key,
                        kind: "action",
                        icon: item.kind === "search" ? "search" : "compose",
                        label: command.label,
                        ...(command.shortcut ? { shortcut: command.shortcut } : {}),
                        ...(command.menu && command.menu.items.length > 0
                            ? {
                                  action: {
                                      icon: "chevron-right" as const,
                                      label: command.menu.label,
                                      reveal: "hover" as const,
                                      menu: [...command.menu.items],
                                  },
                              }
                            : {}),
                        ...(editable ? {} : { reorderable: false }),
                    },
                ];
            }
            case "section":
                return [
                    {
                        id: key,
                        kind: "section",
                        label: item.label,
                        collapsed: item.collapsed,
                        ...(editable ? {} : { reorderable: false }),
                    },
                ];
            case "separator":
                return [
                    {
                        id: key,
                        kind: "separator",
                        label: "",
                        ...(editable ? {} : { reorderable: false }),
                    },
                ];
            case "space": {
                const space = snapshot.spaces.get(item.id as HappyAgentSpaceId);
                // A space this window does not know yet draws nothing until it does.
                if (space === undefined) return [];
                const children = nested(spaceAgentId(space), item.children, 1);
                return [
                    {
                        ...spaceRow(space, places, props.titleShimmerEnabled),
                        // A tidy's note lands in Happy, which says so until it is read.
                        ...(snapshot.noteUnread && happyAgentSpaceHappyIs(space, places)
                            ? { unread: true }
                            : {}),
                        ...foldReveal(item.foldRibbon),
                        ...(children.length > 0 ? { collapsed: !item.expanded } : {}),
                        ...(editable ? {} : { reorderable: false }),
                    },
                    ...children,
                ];
            }
        }
    });
    const documentEdit = (
        change: (view: SidebarDocumentView) => SidebarDocumentView | undefined,
    ) => {
        if (!editable) return;
        const html = sidebarDocumentEdit(sidebarDoc.html, change);
        if (html !== undefined) props.store.sidebarWrite(html);
    };
    const spaceOf = (id: string) =>
        id.startsWith("space:")
            ? snapshot.spaces.get(id.slice("space:".length) as HappyAgentSpaceId)
            : undefined;
    const open = (id: string) => {
        if (id === "search") return props.search?.onOpen();
        if (id === "create") return props.create?.onOpen();
        const space = spaceOf(id);
        if (space === undefined) {
            if (id.startsWith("session:"))
                props.onChildSelect({ kind: "session", agentId: id.slice("session:".length) });
            else if (id.startsWith(WORKTREE_PREFIX))
                props.onChildSelect({
                    kind: "worktree",
                    worktreeId: id.slice(WORKTREE_PREFIX.length),
                });
            return;
        }
        props.store.happyFocusUpdate(happyAgentSpaceHappyIs(space, places));
        // Opening a row lets nothing land: queued changes wait until the
        // pointer has left the sidebar, so no click moves or folds a row away.
        happyAgentSpaceOpen(space, places, snapshot, props.navigation);
    };
    // The row for what is on screen, most specific first: the session itself
    // at whatever depth it is drawn, then the worktree it runs in, then the
    // space it opens from.
    const activeItemId =
        props.focus.chatId !== undefined && anchorOf.has(`session:${props.focus.chatId}`)
            ? `session:${props.focus.chatId}`
            : focused
              ? `space:${focused.id}`
              : props.focus.groupId !== undefined &&
                  anchorOf.has(`${WORKTREE_PREFIX}${props.focus.groupId}`)
                ? `${WORKTREE_PREFIX}${props.focus.groupId}`
                : "";
    return (
        <Sidebar
            activeItemId={activeItemId}
            brand={props.brand}
            // Rows never move under the pointer: queued changes wait while it
            // is over the sidebar — hovering, dragging, or in a row's menu.
            interactionEnabled={props.visible !== false}
            onInteractionChange={props.store.attentionInteractingUpdate}
            onDragChange={props.store.sidebarDragUpdate}
            footer={
                <>
                    {props.footer}
                    {/* Queued changes land after five minutes without input, or
                        at once when the window or this sidebar goes out of
                        sight; nothing the person clicks lets them land. */}
                    <span
                        hidden
                        ref={(node) => {
                            const view = node?.ownerDocument.defaultView;
                            if (!node || !view) return;
                            const store = props.store;
                            const document = node.ownerDocument;
                            const report = () =>
                                store.attentionVisibleUpdate(
                                    visible && document.visibilityState === "visible",
                                );
                            const input = () => store.attentionInput();
                            const kinds = ["keydown", "pointerdown", "pointermove", "wheel"];
                            for (const kind of kinds)
                                view.addEventListener(kind, input, {
                                    capture: true,
                                    passive: true,
                                });
                            document.addEventListener("visibilitychange", report);
                            report();
                            return () => {
                                for (const kind of kinds)
                                    view.removeEventListener(kind, input, { capture: true });
                                document.removeEventListener("visibilitychange", report);
                            };
                        }}
                    />
                    {props.classic ? (
                        // Mounted with the sidebar and replaced when the folds
                        // change, so the store always holds the current ones.
                        <span
                            hidden
                            ref={(node) => {
                                if (node && props.classic)
                                    props.store.sidebarClassicUpdate(props.classic);
                            }}
                        />
                    ) : null}
                </>
            }
            headerAccessory={props.headerAccessory}
            foldControlPlacement="trailing"
            foldControlReveal="hover"
            onItemSelect={open}
            onItemCollapseToggle={(id) => {
                const key = anchorOf.get(id);
                if (key) documentEdit((current) => sidebarDocumentFold(current, key));
            }}
            itemMenuItems={(item) => {
                const space = spaceOf(item.id);
                if (space === undefined) return [];
                const agentId = spaceAgentId(space);
                const menu: MenuItem[] =
                    agentId !== undefined && props.onChatAside
                        ? [
                              ...spaceMenu(space, places).slice(0, 1),
                              {
                                  kind: "item",
                                  id: MENU_ASIDE,
                                  label: "Open in side panel",
                                  icon: "panel-expand",
                              },
                              ...spaceMenu(space, places).slice(1),
                          ]
                        : spaceMenu(space, places);
                // The sidebar document is Happy's to show, from Happy's row.
                return sidebarDoc && props.onSidebarOpen && happyAgentSpaceHappyIs(space, places)
                    ? [
                          ...menu,
                          {
                              kind: "item" as const,
                              id: MENU_SIDEBAR,
                              label: "Open sidebar document",
                              icon: "doc" as const,
                          },
                      ]
                    : menu;
            }}
            onItemMenuSelect={(item, actionId) => {
                if (item.id === "create") {
                    props.create?.menu?.onSelect(actionId);
                    return;
                }
                const space = spaceOf(item.id);
                if (space === undefined) return;
                const target = space.target;
                if (actionId === MENU_OPEN) open(item.id);
                else if (actionId === MENU_TIDY) props.store.tidyRequest();
                else if (actionId === MENU_ASIDE) {
                    const agentId = spaceAgentId(space);
                    if (agentId !== undefined)
                        props.onChatAside?.(agentId, happyAgentSpaceLabel(space));
                } else if (actionId === MENU_SIDEBAR && sidebarDoc)
                    props.onSidebarOpen?.(sidebarDoc.artifactId);
                else if (actionId === MENU_LEAVE && target.kind === "task")
                    props.actions.taskLeave(target.id);
                else if (actionId === MENU_LEAVE && target.kind === "surface")
                    props.actions.surfaceLeave(target.id);
                else if (actionId === MENU_DISCARD) props.store.stemCellDiscard(space.id);
                else if (actionId === MENU_ARCHIVE && target.kind === "task")
                    props.actions.taskArchive(target.id);
                else if (actionId === MENU_ARCHIVE && target.kind === "bot")
                    props.actions.botArchive(target.id);
            }}
            // A move is an edit of the document: a node after one of its own
            // siblings, or first among them. A worktree is the window's, so a
            // node landing after one lands after the session it follows.
            {...(editable
                ? {
                      onItemReorder: (
                          _list: string,
                          move: { id: string; afterId: string | null },
                      ) =>
                          documentEdit((current) =>
                              sidebarDocumentMove(
                                  current,
                                  move.id,
                                  move.afterId === null
                                      ? null
                                      : (anchorOf.get(move.afterId) ?? null),
                              ),
                          ),
                  }
                : {})}
            sections={[{ id: LIST, items }]}
        />
    );
}

/** Where a row stood, in words, for one side of a batch's diff. */
function positionLabel(position: HappyAgentSpaceBatch["changes"][number]["from"]): string {
    if (position.visibility === "folded") return "folded away";
    if (position.visibility === "hidden") return "hidden";
    return position.sectionName ?? "under Happy";
}

/** Each batch's note in Happy's chat, by its message, read as one row that opens onto its moves. */
export function happyAgentSpacesNotes(
    batches: readonly HappyAgentSpaceBatch[],
): ReadonlyMap<string, ConversationNote> {
    const notes = new Map<string, ConversationNote>();
    for (const batch of batches) {
        if (batch.noteMessageId === null) continue;
        notes.set(batch.noteMessageId, {
            label: batch.note,
            details: batch.changes.map((change) => {
                const from = positionLabel(change.from);
                const to = positionLabel(change.to);
                return from === to
                    ? `${change.title}: ${from}, row ${change.from.index + 1} → ${change.to.index + 1}`
                    : `${change.title}: ${from} → ${to}`;
            }),
        });
    }
    return notes;
}

/**
 * New work before its first message: its stem cell, centred above the
 * composer, with the kinds of thing that can be made from it straight away.
 */
export function happyAgentSpacesStemCellIntro(
    space: HappyAgentSpace | undefined,
    options?: readonly MakeStuffOption[],
    onOptionSelect?: (id: string) => void,
): ReactNode {
    if (space === undefined || space.icon?.type !== "stem_cell") return undefined;
    return (
        <MakeStuffIntro
            id={space.id}
            {...(options ? { options } : {})}
            {...(onOptionSelect ? { onOptionSelect } : {})}
        />
    );
}
