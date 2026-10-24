import {
    happyAgentSpacesIn,
    happyAgentSpacesOlder,
    sidebarDocumentEdit,
    sidebarDocumentFold,
    sidebarDocumentKey,
    sidebarDocumentMove,
    sidebarDocumentPlace,
    sidebarDocumentSessionsHide,
    sidebarDocumentSessionsReveal,
    sidebarDocumentView,
    type SidebarDocumentClassic,
    type SidebarDocumentItem,
    type SidebarDocumentSession,
    type SidebarDocumentSessionTree,
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
    clayIconMarkLarge,
    clayIconSlugIs,
    happyIconMark,
    makeStuffIntroHeader,
    Sidebar,
    type ConversationLeadingHeader,
    type IconName,
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
    /** The glyph of what a Surface is, from the catalog that lists it; absent until it does. */
    readonly surfaceIcon?: (surfaceId: string) => IconName | undefined;
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
const MENU_RENAME = "rename";
const MENU_SUBTASKS_SHOW = "subtasks-show";
const MENU_SUBTASKS_HIDE = "subtasks-hide";
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

/**
 * A picture Prioritizing chose, as a row or a tab wears it. A clay icon is
 * shaped art and stands as drawn; any other picture is somebody's face and is
 * drawn as one, by the same Avatar the classic sidebar uses.
 */
function iconMark(
    icon: HappyAgentSpaceIcon | null | undefined,
): Pick<SidebarItem & TabItem, "imageMark" | "imageUrl"> | undefined {
    if (icon?.type === "library" && clayIconSlugIs(icon.slug))
        return { imageMark: clayIconMark(icon.slug) };
    if (icon?.type === "image") return { imageUrl: icon.url };
    return undefined;
}

/**
 * The identity a space wears in a row or a tab.
 *
 * The row's own icon comes first: the stem cell while the work is still taking
 * shape, then the clay icon or picture chosen for it. Only a row with no icon
 * at all reaches for a face — its bot's avatar or its task owner's, uploaded or
 * not — drawn round as its classic row draws it. Without either, new work is the
 * stem cell and named work wears the plain glyph of what it is.
 */
export function happyAgentSpaceMark(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    stemCellAnimation: boolean,
): Pick<SidebarItem & TabItem, "icon" | "imageMark" | "imageUrl" | "stemCell"> {
    if (happyAgentSpaceHappyIs(space, places)) return { imageMark: happyIconMark() };
    const icon = space.icon;
    if (icon?.type === "stem_cell") return { stemCell: { id: space.id } };
    // A clay icon is what a stem cell becomes; unless the reader turned it
    // off, a row or tab that sees the change on screen grows the cell into it.
    if (icon?.type === "library" && clayIconSlugIs(icon.slug) && stemCellAnimation)
        return { imageMark: { ...clayIconMark(icon.slug), growsFromStemCell: true } };
    const chosen = iconMark(icon);
    if (chosen) return chosen;
    const face =
        targetBot(space.target, places)?.avatar ?? targetTask(space.target, places)?.owner?.avatar;
    if (face) return { imageUrl: face.url };
    if (space.title === null) return { stemCell: { id: space.id } };
    if (space.target.kind === "surface")
        return { icon: places.surfaceIcon?.(space.target.id) ?? "doc" };
    return { icon: space.target.kind === "task" ? "tasks" : "agents" };
}

/** The picture Prioritizing chose for a session, for its row and its tab. */
export function happyAgentSessionMark(
    snapshot: HappyAgentSpacesSnapshot,
    agentId: string,
): Pick<SidebarItem & TabItem, "imageMark" | "imageUrl"> | undefined {
    return iconMark(snapshot.sidebar?.agentIcons.get(agentId));
}

/** The name a space goes by, the same in its row and in its tab. */
export function happyAgentSpaceLabel(space: HappyAgentSpace): string {
    // Work is "New" until it has a name; it does not announce what it will be.
    return space.title ?? "New";
}

/**
 * Whether Prioritizing's row says its proposal waits for an answer. Where the
 * window holds Prioritizing's conversation, its unread state decides, and
 * opening the chat reads it. Where it does not — Prioritizing is a hidden
 * subtask of Happy's bot — the proposal waits until the person has opened
 * the chat on this device at or after its latest version.
 */
export function happyAgentSpaceProposalWaits(
    space: HappyAgentSpace,
    snapshot: HappyAgentSpacesSnapshot,
    places: HappyAgentSpacesPlaces,
): boolean {
    if (space.target.kind !== "agent" || snapshot.proposal === null) return false;
    const agentId = spaceAgentId(space);
    const conversation =
        agentId === undefined
            ? undefined
            : (subtaskWhere(
                  [...places.tasks, ...places.bots],
                  (subtask) => subtask.conversation.id === agentId,
              )?.conversation ??
              places.tasks.find((task) => task.conversation.id === agentId)?.conversation);
    return conversation ? conversation.unread === true : !snapshot.proposalSeen;
}

/**
 * A space as its row: a task's row as the current sidebar draws one, with the
 * waiting and question marks, unread dot, and title shimmer. Running work
 * shimmers its title and spins only in its tab.
 */
function spaceRow(
    space: HappyAgentSpace,
    snapshot: HappyAgentSpacesSnapshot,
    places: HappyAgentSpacesPlaces,
    titleShimmerEnabled: boolean,
    stemCellAnimation: boolean,
): SidebarItem {
    const conversation = (targetTask(space.target, places) ?? targetBot(space.target, places))
        ?.conversation;
    // The conversation the window holds is live: its agent's own events end
    // its work the moment a turn settles or is stopped. The space's `working`
    // is the daemon's reading at the row's last change and is not sent again
    // when the run ends, so it is only for a row whose conversation the
    // window does not hold.
    const activity = conversation
        ? conversation.activity
        : space.working
          ? ("running" as const)
          : undefined;
    return {
        id: `space:${space.id}`,
        kind: "project",
        label: happyAgentSpaceLabel(space),
        labelShimmer: titleShimmerEnabled,
        workingIndicator: "none",
        ...happyAgentSpaceMark(space, places, stemCellAnimation),
        ...(activity === "awaitingInput"
            ? { status: "awaitingInput" as const }
            : activity === "running"
              ? { status: "working" as const }
              : activity === "waiting"
                ? { status: "waiting" as const }
                : {}),
        ...(conversation?.unread || happyAgentSpaceProposalWaits(space, snapshot, places)
            ? { unread: true }
            : {}),
    };
}

/** What a row's menu offers, by what the row holds. */
function spaceMenu(
    space: HappyAgentSpace,
    places: HappyAgentSpacesPlaces,
    actions: HappyAgentSpacesActions,
): MenuItem[] {
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
            // Renamed by hand from here or with Enter, as the classic sidebar did.
            const rename: MenuItem[] = actions.taskRename
                ? [{ kind: "item", id: MENU_RENAME, label: "Rename task", icon: "edit" }]
                : [];
            // New work nobody named yet closes from here and only from here.
            if (space.title === null && space.icon?.type === "stem_cell")
                return [
                    open,
                    ...rename,
                    { kind: "separator" },
                    { kind: "item", id: MENU_DISCARD, label: "Close new work", icon: "close" },
                ];
            return [
                open,
                ...rename,
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
                ...(actions.botRename
                    ? [
                          {
                              kind: "item" as const,
                              id: MENU_RENAME,
                              label: "Rename bot",
                              icon: "edit" as const,
                          },
                      ]
                    : []),
                { kind: "separator" },
                { kind: "item", id: MENU_ARCHIVE, label: "Archive bot", icon: "archive" },
            ];
        case "surface":
            return [
                open,
                { kind: "separator" },
                { kind: "item", id: MENU_LEAVE, label: "Leave", icon: "close" },
            ];
        // Prioritizing's own conversation is the window's to keep.
        case "agent":
            return [open];
    }
}

/** A conversation's subtasks as the sessions the document may show under it. */
function sessionTreeOf(
    subtasks: HappyAgentTask["subtasks"],
): readonly SidebarDocumentSessionTree[] {
    return subtasks.map((subtask) => ({
        id: subtask.conversation.id,
        children: sessionTreeOf(subtask.subtasks),
    }));
}

/** The acts a row's menu reaches beyond opening it. */
export interface HappyAgentSpacesActions {
    taskLeave(taskId: string): void;
    taskArchive(taskId: string): void;
    botArchive(botId: string): void;
    surfaceLeave(surfaceId: string): void;
    /**
     * Renames a task by hand, resolving whether the host took the name;
     * absent for a Happy Agent that cannot.
     */
    taskRename?(taskId: string, name: string): Promise<boolean>;
    /** Renames a bot by hand, the same way. */
    botRename?(botId: string, name: string): Promise<boolean>;
}

/** The window's two commands, which stand in the list like any item. */
export interface HappyAgentSpacesCommand {
    readonly label: string;
    readonly shortcut?: KeyboardShortcut;
    readonly onOpen: () => void;
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
    /** Whether a working row shimmers its title, as the reader set it. */
    readonly titleShimmerEnabled: boolean;
    /** Whether a row that sees its stem cell get an icon grows it, as the reader set it. */
    readonly stemCellAnimation: boolean;
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

/** The document with one section's heading renamed; labels need not be unique. */
export function sidebarDocumentRelabel(
    view: SidebarDocumentView,
    key: string,
    label: string,
): SidebarDocumentView | undefined {
    if (!view.items.some((node) => sidebarDocumentKey(node) === key && node.kind === "section"))
        return undefined;
    return {
        ...view,
        items: view.items.map((node) =>
            sidebarDocumentKey(node) === key && node.kind === "section" ? { ...node, label } : node,
        ),
    };
}

/** What the document's rows are drawn from, beside the document itself. */
export interface HappyAgentSpacesItemsInput {
    readonly view: SidebarDocumentView;
    readonly snapshot: HappyAgentSpacesSnapshot;
    readonly places: HappyAgentSpacesPlaces;
    /** Whether rows may be carried; a read-only document holds them in place. */
    readonly editable: boolean;
    /** Whether spaces may be carried in and out of rows. */
    readonly attaching: boolean;
    readonly titleShimmerEnabled: boolean;
    readonly stemCellAnimation: boolean;
    readonly search?: HappyAgentSpacesCommand;
    readonly create?: HappyAgentSpacesCommand;
    readonly sessionRow: (agentId: string) => SidebarItem | undefined;
    readonly worktreeRows: (agentId: string) => readonly SidebarItem[];
}

/**
 * A sidebar document as the rows the Sidebar draws, and the document node each
 * drawn row stands for (or, for a worktree, the node it follows). The window's
 * own sidebar and a proposal of one are drawn by this one function.
 */
export function happyAgentSpacesItems(input: HappyAgentSpacesItemsInput): {
    readonly items: SidebarItem[];
    readonly anchorOf: ReadonlyMap<string, string | null>;
} {
    const { view, snapshot, places, editable, attaching } = input;
    const anchorOf = new Map<string, string | null>();
    const foldReveal = (own: "hover" | "always" | undefined) =>
        (own ?? view.foldRibbon) === "always" ? { foldReveal: "always" as const } : {};
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
            const space = snapshot.spaces.get(session.id as HappyAgentSpaceId);
            if (space !== undefined) {
                // An attachment: the space's own row, under the same ID it has
                // at the top level, so carrying it in or out keeps the row.
                const key = sidebarDocumentKey(session);
                const id = `space:${space.id}`;
                anchorOf.set(id, key);
                last = key;
                const children = nested(spaceAgentId(space), session.children, depth + 1);
                rows.push(
                    {
                        ...spaceRow(
                            space,
                            snapshot,
                            places,
                            input.titleShimmerEnabled,
                            input.stemCellAnimation,
                        ),
                        depth,
                        ...foldReveal(session.foldRibbon),
                        ...(children.length > 0 ? { collapsed: !session.expanded } : {}),
                        ...(attaching ? { attachable: true } : {}),
                    },
                    ...children,
                );
                continue;
            }
            const row = input.sessionRow(session.id);
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
            for (const worktree of input.worktreeRows(agentId)) {
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
                const command = item.kind === "search" ? input.search : input.create;
                if (!command) return [];
                return [
                    {
                        id: key,
                        kind: "action",
                        icon: item.kind === "search" ? "search" : "compose",
                        label: command.label,
                        ...(command.shortcut ? { shortcut: command.shortcut } : {}),
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
            // Prioritizing's own markup, drawn isolated where the document puts it.
            case "widget":
                return [
                    {
                        id: key,
                        kind: "widget",
                        label: "Prioritizing",
                        widgetHtml: item.html,
                        ...(editable ? {} : { reorderable: false }),
                    },
                ];
            case "space": {
                const space = snapshot.spaces.get(item.id as HappyAgentSpaceId);
                // A space this window does not know yet draws nothing until it does.
                if (space === undefined) return [];
                const children = nested(spaceAgentId(space), item.children, 1);
                const happy = happyAgentSpaceHappyIs(space, places);
                return [
                    {
                        ...spaceRow(
                            space,
                            snapshot,
                            places,
                            input.titleShimmerEnabled,
                            input.stemCellAnimation,
                        ),
                        // A tidy's note lands in Happy, which says so until it is read.
                        ...(snapshot.noteUnread && happy ? { unread: true } : {}),
                        ...foldReveal(item.foldRibbon),
                        ...(children.length > 0 ? { collapsed: !item.expanded } : {}),
                        ...(editable ? {} : { reorderable: false }),
                        // Happy's row stays the window's own: it neither goes
                        // under another row nor takes one under it.
                        ...(attaching && !happy ? { attachable: true } : {}),
                        ...(attaching &&
                        !happy &&
                        (space.target.kind === "task" || space.target.kind === "bot")
                            ? { attachTarget: true }
                            : {}),
                    },
                    ...children,
                ];
            }
        }
    });
    return { items, anchorOf };
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
    const focused = happyAgentSpaceFocused(snapshot, props.focus);
    // Rows carry other spaces in and out of rows only where the daemon keeps
    // them there; a session always stays under the conversation it belongs to.
    const attaching = editable && sidebarDoc.attachments;
    /** Whether a nested ID names one of the person's spaces rather than a session. */
    const attached = (id: string): boolean => snapshot.spaces.has(id as HappyAgentSpaceId);
    const { items, anchorOf } = happyAgentSpacesItems({
        view,
        snapshot,
        places,
        editable,
        attaching,
        titleShimmerEnabled: props.titleShimmerEnabled,
        stemCellAnimation: props.stemCellAnimation,
        ...(props.search ? { search: props.search } : {}),
        ...(props.create ? { create: props.create } : {}),
        sessionRow: props.sessionRow,
        worktreeRows: props.worktreeRows,
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
    /** The sessions a space's conversation has, as its subtasks nest. */
    const subtasksOf = (space: HappyAgentSpace): readonly SidebarDocumentSessionTree[] =>
        sessionTreeOf(
            (targetTask(space.target, places) ?? targetBot(space.target, places))?.subtasks ?? [],
        );
    /** Show subtasks where some are not drawn, Hide subtasks where some are. */
    const subtasksMenu = (id: string, space: HappyAgentSpace): MenuItem[] => {
        const key = anchorOf.get(id);
        if (!editable || !key) return [];
        return [
            ...(sidebarDocumentSessionsReveal(view, key, subtasksOf(space))
                ? [
                      {
                          kind: "item" as const,
                          id: MENU_SUBTASKS_SHOW,
                          label: "Show subtasks",
                          icon: "eye" as const,
                      },
                  ]
                : []),
            ...(sidebarDocumentSessionsHide(view, key, attached)
                ? [
                      {
                          kind: "item" as const,
                          id: MENU_SUBTASKS_HIDE,
                          label: "Hide subtasks",
                          icon: "eye-off" as const,
                      },
                  ]
                : []),
        ];
    };
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
            // Every item but a separator is walked with the arrows and opens
            // with Enter or Space.
            keyboardNavigation
            onDragChange={props.store.sidebarDragUpdate}
            footer={
                <>
                    {props.footer}
                    {focused?.target.kind === "agent" &&
                    snapshot.proposal !== null &&
                    !snapshot.proposalSeen ? (
                        // Prioritizing's chat is on screen with a proposal it
                        // has not shown here yet: the person sees it now.
                        <span
                            hidden
                            ref={(node) => {
                                if (node) props.store.proposalSeenRecord();
                            }}
                        />
                    ) : null}
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
                // A section's label is the person's to write, through the document.
                if (item.kind === "section" && editable)
                    return [
                        { kind: "item", id: MENU_RENAME, label: "Rename section", icon: "edit" },
                    ];
                const space = spaceOf(item.id);
                if (space === undefined) return [];
                const agentId = spaceAgentId(space);
                const own = spaceMenu(space, places, props.actions);
                // Opening comes first, then what the row shows under it.
                const menu: MenuItem[] = [
                    ...own.slice(0, 1),
                    ...(agentId !== undefined && props.onChatAside
                        ? [
                              {
                                  kind: "item" as const,
                                  id: MENU_ASIDE,
                                  label: "Open in side panel",
                                  icon: "panel-expand" as const,
                              },
                          ]
                        : []),
                    ...subtasksMenu(item.id, space),
                    ...own.slice(1),
                ];
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
            itemRename={{
                actionId: MENU_RENAME,
                onSubmit: (item, name) => {
                    const label = name.trim();
                    if (!label) return;
                    if (item.kind === "section") {
                        const key = anchorOf.get(item.id);
                        if (key)
                            documentEdit((current) => sidebarDocumentRelabel(current, key, label));
                        return;
                    }
                    const space = spaceOf(item.id);
                    const rename =
                        space?.target.kind === "task"
                            ? props.actions.taskRename
                            : space?.target.kind === "bot"
                              ? props.actions.botRename
                              : undefined;
                    if (space === undefined || rename === undefined) return;
                    // The row and its tab wear the name in the keystroke that
                    // saves it, not when the daemon's word comes back.
                    const store = props.store;
                    store.spaceTitleUpdate(space.id, label);
                    void rename(space.target.id, label).then((taken) => {
                        if (!taken) store.spaceTitleWithdraw(space.id, label);
                    });
                },
            }}
            onItemMenuSelect={(item, actionId) => {
                const space = spaceOf(item.id);
                if (space === undefined) return;
                const target = space.target;
                if (actionId === MENU_OPEN) open(item.id);
                else if (actionId === MENU_TIDY) props.store.tidyRequest();
                else if (actionId === MENU_SUBTASKS_SHOW) {
                    const key = anchorOf.get(item.id);
                    if (!editable || !key) return;
                    const html = sidebarDocumentEdit(sidebarDoc.html, (current) =>
                        sidebarDocumentSessionsReveal(current, key, subtasksOf(space)),
                    );
                    // The person opened the row to show them, so its fold is theirs.
                    if (html !== undefined) props.store.sidebarSessionsRevealWrite(html, space.id);
                } else if (actionId === MENU_SUBTASKS_HIDE) {
                    const key = anchorOf.get(item.id);
                    if (key)
                        documentEdit((current) =>
                            sidebarDocumentSessionsHide(current, key, attached),
                        );
                } else if (actionId === MENU_ASIDE) {
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
            // node landing after one lands after the session it follows. A
            // space may change parents — set down under a row, taken back out,
            // or moved to another row; a session never does.
            {...(editable
                ? {
                      onItemReorder: (
                          _list: string,
                          move: { id: string; afterId: string | null; parentId?: string },
                      ) => {
                          const key = anchorOf.get(move.id);
                          if (!key) return;
                          const afterKey =
                              move.afterId === null ? null : (anchorOf.get(move.afterId) ?? null);
                          const parentKey =
                              move.parentId === undefined
                                  ? null
                                  : (anchorOf.get(move.parentId) ?? undefined);
                          documentEdit((current) =>
                              attaching && spaceOf(move.id) !== undefined && parentKey !== undefined
                                  ? sidebarDocumentPlace(current, key, parentKey, afterKey)
                                  : sidebarDocumentMove(current, key, afterKey),
                          );
                      },
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
 * The block that opens a space's chat: its 64px mark — the stem cell while the
 * work is taking shape, then the clay icon it grows into — over the line that
 * introduces new work. Before the chat's first message the line and the kinds
 * of thing to make are shown; once it has begun they keep their place, hidden,
 * and the mark stays at the top of the chat. Spaces with any other picture,
 * or none, open their chat on its first message.
 */
export function happyAgentSpacesIntroHeader(
    space: HappyAgentSpace,
    intro: {
        readonly settled: boolean;
        readonly stemCellAnimation: boolean;
        readonly options?: readonly MakeStuffOption[];
        readonly onOptionSelect?: (id: string) => void;
    },
): ConversationLeadingHeader | undefined {
    const icon = space.icon;
    const imageMark =
        icon?.type === "library" && clayIconSlugIs(icon.slug)
            ? { ...clayIconMarkLarge(icon.slug), growsFromStemCell: intro.stemCellAnimation }
            : undefined;
    if (icon?.type !== "stem_cell" && imageMark === undefined) return undefined;
    return makeStuffIntroHeader({
        id: space.id,
        ...(imageMark ? { imageMark } : {}),
        settled: intro.settled,
        ...(intro.options ? { options: intro.options } : {}),
        ...(intro.onOptionSelect ? { onOptionSelect: intro.onOptionSelect } : {}),
    });
}
