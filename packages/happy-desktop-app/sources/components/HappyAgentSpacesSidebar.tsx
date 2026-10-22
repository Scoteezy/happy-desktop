import {
    happyAgentSpacesIn,
    happyAgentSpacesOlder,
    sidebarDocumentMove,
    sidebarDocumentSectionFold,
    sidebarDocumentSpaceFold,
    sidebarDocumentView,
    type SidebarDocumentEntry,
    type SidebarDocumentView,
    type HappyAgentBot,
    type HappyAgentSpace,
    type HappyAgentSpaceBatch,
    type HappyAgentSpaceId,
    type HappyAgentSpaceTarget,
    type HappyAgentSpaceSectionId,
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
    type MenuItem,
    type SidebarItem,
    type SidebarProps,
    type SidebarSection,
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
    readonly surfaceId?: string;
    readonly artifactId?: string;
}

const OLDER_SECTION = "spaces:older";
/** The system key of Happy's own bot. */
const HAPPY_BOT_KEY = "chief_of_staff";
const MENU_OPEN = "open";
const MENU_TIDY = "tidy";
const MENU_LEAVE = "leave";
const MENU_ARCHIVE = "archive";
const MENU_SIDEBAR = "sidebar";
const MENU_ASIDE = "aside";
/** The document's own section for work nobody has looked at in a while; it takes no new work. */
const DOCUMENT_OLDER = "older";

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
    if (icon?.type === "library" && clayIconSlugIs(icon.slug))
        return { imageMark: clayIconMark(icon.slug) };
    const avatar = targetBot(space.target, places)?.avatar;
    if (avatar) return { imageMark: { src: avatar.url, alt: "" } };
    return { stemCell: { id: space.id } };
}

/** The name a space goes by, the same in its row and in its tab. */
export function happyAgentSpaceLabel(space: HappyAgentSpace): string {
    // Work is "New" until it has a name; it does not announce what it will be.
    return space.title ?? "New";
}

/**
 * A space as its row: a task's row as the current sidebar draws one, with the
 * same spinner, waiting and question marks, unread dot, and title shimmer.
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
        id: space.id,
        kind: "project",
        label: happyAgentSpaceLabel(space),
        labelShimmer: titleShimmerEnabled,
        ...happyAgentSpaceMark(space, places),
        ...(activity === "awaitingInput"
            ? { status: "awaitingInput" as const }
            : activity === "running" || space.working
              ? { status: "working" as const }
              : activity === "waiting"
                ? { status: "waiting" as const }
                : {}),
        ...(conversation?.unread ? { unread: true } : {}),
        // New work stays where it was made until the manager places it.
        ...(space.sectionId === null ? { reorderable: false } : {}),
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

export interface HappyAgentSpacesSidebarProps {
    readonly store: HappyAgentSpacesStore;
    readonly snapshot: HappyAgentSpacesSnapshot;
    readonly places: HappyAgentSpacesPlaces;
    readonly focus: HappyAgentSpacesFocus;
    readonly navigation: HappyAgentSpacesNavigation;
    readonly actions: HappyAgentSpacesActions;
    /** The first row opens the window's search. */
    readonly searchRow?: SidebarProps["searchRow"];
    /** Makes new work at the top of one section. */
    readonly onSectionCreate?: (sectionId: HappyAgentSpaceSectionId) => void;
    readonly now: number;
    readonly visible?: boolean;
    /** Whether a working row shimmers its title, as the reader set it. */
    readonly titleShimmerEnabled: boolean;
    readonly brand: boolean;
    readonly footer: ReactNode;
    readonly headerAccessory?: ReactNode;
    /** The rows nested under a space's own: its task tree, from the window's lists. */
    readonly rowChildren: (space: HappyAgentSpace) => readonly SidebarItem[];
    /** Opens a nested row, which is a conversation rather than a space. */
    readonly onChildSelect: (id: string) => void;
    /** The rows whose trees this window has folded shut. */
    readonly rowCollapsed: ReadonlySet<string>;
    readonly onRowCollapseToggle?: (id: string) => void;
    /** Opens the sidebar document itself, from Happy's row. */
    readonly onSidebarOpen?: (artifactId: string) => void;
    /** Opens a space's conversation beside the one on screen. */
    readonly onChatAside?: (agentId: string, label: string) => void;
}

/** The document as rows, or nothing when there is none or it is not one the window will draw. */
function documentViewOf(html: string | undefined): SidebarDocumentView | undefined {
    if (html === undefined) return undefined;
    try {
        return sidebarDocumentView(html);
    } catch {
        return undefined;
    }
}

/**
 * The spaces sidebar: Search, Happy, the manager's flat sections with
 * their partial tails, and Older as the last of them. Every row is a space;
 * a click opens what it holds, and a drag reorders it inside its section.
 */
export function HappyAgentSpacesSidebar(props: HappyAgentSpacesSidebarProps) {
    const { snapshot, places } = props;
    const sidebarDoc = snapshot.sidebar;
    const view = useMemo(() => documentViewOf(sidebarDoc?.html), [sidebarDoc?.html]);
    const unplaced = happyAgentSpacesIn(snapshot.spaces, null);
    const older = happyAgentSpacesOlder(snapshot.spaces);
    const focused = happyAgentSpaceFocused(snapshot, props.focus);
    /** The space each tree row belongs to. */
    const parentOf = new Map<string, HappyAgentSpaceId>();
    // Each row with the tree the window already keeps under it: a task's
    // subtasks and the checkouts they work in, or Happy's own helpers.
    const rowsOf = (spaces: readonly HappyAgentSpace[]): SidebarItem[] =>
        spaces.flatMap((space) => {
            const children = props.rowChildren(space).map((child) => {
                parentOf.set(child.id, space.id);
                return { ...child, reorderable: false };
            });
            const row = spaceRow(space, places, props.titleShimmerEnabled);
            return [
                {
                    ...row,
                    // A tidy's note lands in Happy, which says so until it is read.
                    ...(snapshot.noteUnread && happyAgentSpaceHappyIs(space, places)
                        ? { unread: true }
                        : {}),
                    ...(children.length > 0 && props.rowCollapsed.has(space.id)
                        ? { collapsed: true }
                        : {}),
                },
                ...children,
            ];
        });
    // The document's entries as rows: each space with its tree when it asks for
    // one, folded when it says so. A ref to a space this window does not know
    // yet draws nothing until it does.
    const entryRows = (entries: readonly SidebarDocumentEntry[], placed: boolean): SidebarItem[] =>
        entries.flatMap((entry) => {
            if (entry.kind !== "space") return [];
            const space = snapshot.spaces.get(entry.ref as HappyAgentSpaceId);
            if (space === undefined) return [];
            const [first, ...children] = rowsOf([space]);
            // The document says what is folded, not the window, and where a row
            // is placed: one in a section can be carried, wherever the store's
            // own record says it sits.
            const { collapsed: _, reorderable: __, ...rest } = first!;
            const row: SidebarItem = placed ? rest : { ...rest, reorderable: false };
            if (!entry.tree) return [row];
            return [
                { ...row, ...(children.length > 0 && entry.collapsed ? { collapsed: true } : {}) },
                ...children,
            ];
        });
    const documentSections: SidebarSection[] | undefined = view?.sections.map((section) => ({
        id: section.id,
        label: section.label,
        headingDisclosure: true,
        collapsed: section.collapsed,
        ...(section.id === DOCUMENT_OLDER || !props.onSectionCreate
            ? {}
            : {
                  action: {
                      icon: "plus" as const,
                      label: `New in ${section.label}`,
                      reveal: "hover" as const,
                  },
              }),
        items: entryRows(section.entries, true),
    }));
    // Work the window knows that the document does not name yet stands right after
    // Happy, where the daemon writes it, until the document read catches up.
    const documented = new Set(
        view
            ? [
                  ...view.top,
                  ...view.sections.flatMap((section) => section.entries),
                  ...view.bottom,
              ].flatMap((entry) => (entry.kind === "space" ? [entry.ref] : []))
            : [],
    );
    const undocumented = view
        ? [...snapshot.spaces.values()]
              .filter((space) => space.visibility !== "hidden" && !documented.has(space.id))
              .sort((left, right) => right.createdAt - left.createdAt)
        : [];
    const documentNotes = view
        ? [...view.top, ...view.bottom].filter((entry) => entry.kind === "html")
        : [];
    const documentEdit = (edited: string | undefined) => {
        if (edited !== undefined) props.store.sidebarWrite(edited);
    };
    const sections: SidebarSection[] = snapshot.sections.map((section) => ({
        id: section.id,
        label: section.name,
        // The name and its chevron are one disclosure; an own section says
        // nothing about itself beyond its name, its rows already do.
        headingDisclosure: true,
        collapsed: section.collapsed,
        ...(section.visibleCount === null
            ? {}
            : { tail: { visibleCount: section.visibleCount, expanded: section.tailExpanded } }),
        ...(props.onSectionCreate
            ? {
                  action: {
                      icon: "plus" as const,
                      label: `New in ${section.name}`,
                      reveal: "hover" as const,
                  },
              }
            : {}),
        items: rowsOf(happyAgentSpacesIn(snapshot.spaces, section.id)),
    }));
    const spaceOf = (id: string) => snapshot.spaces.get(id as HappyAgentSpaceId);
    const open = (id: string) => {
        const space = spaceOf(id);
        if (space === undefined) {
            props.onChildSelect(id);
            props.store.attentionUpdate("calm");
            return;
        }
        props.store.happyFocusUpdate(happyAgentSpaceHappyIs(space, places));
        happyAgentSpaceOpen(space, places, snapshot, props.navigation);
        // A finished navigation is the moment queued changes may land.
        props.store.attentionUpdate("calm");
    };
    return (
        <Sidebar
            activeItemId={focused?.id ?? ""}
            actions={
                view
                    ? [
                          ...entryRows(view.top.slice(0, 1), false),
                          ...rowsOf(undocumented),
                          ...entryRows(view.top.slice(1), false),
                      ]
                    : rowsOf(unplaced)
            }
            {...(documentNotes.length > 0
                ? {
                      bodyAccessory: (
                          <div
                              className="happy-sidebar-document-notes"
                              // Validated on arrival: only plain tags with a class.
                              dangerouslySetInnerHTML={{
                                  __html: documentNotes
                                      .map((entry) => (entry.kind === "html" ? entry.html : ""))
                                      .join(""),
                              }}
                          />
                      ),
                  }
                : {})}
            actionsDivider
            brand={props.brand}
            {...(props.searchRow ? { searchRow: props.searchRow } : {})}
            // Rows never move under the pointer: queued changes wait while it
            // is over the sidebar — hovering, dragging, or in a row's menu.
            interactionEnabled={props.visible !== false}
            onInteractionChange={(interacting) =>
                props.store.attentionUpdate(interacting ? "interacting" : "calm")
            }
            onDragChange={props.store.sidebarDragUpdate}
            footer={props.footer}
            headerAccessory={props.headerAccessory}
            foldControlPlacement="trailing"
            foldControlReveal="hover"
            onItemSelect={open}
            onItemCollapseToggle={
                view && sidebarDoc
                    ? (id) => documentEdit(sidebarDocumentSpaceFold(sidebarDoc.html, id))
                    : props.onRowCollapseToggle
            }
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
                const space = spaceOf(item.id);
                if (space === undefined) return;
                const target = space.target;
                if (actionId === MENU_OPEN) open(space.id);
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
                else if (actionId === MENU_ARCHIVE && target.kind === "task")
                    props.actions.taskArchive(target.id);
                else if (actionId === MENU_ARCHIVE && target.kind === "bot")
                    props.actions.botArchive(target.id);
            }}
            // A space can be carried into any section but Older; its tree goes with it.
            itemDragAcrossSections
            onItemReorder={(sectionId, move) => {
                if (view && sidebarDoc) {
                    // A move is an edit of the document: the space's node, after
                    // another space's node or first, never inside one.
                    const afterId =
                        move.afterId === null ? null : (parentOf.get(move.afterId) ?? move.afterId);
                    documentEdit(sidebarDocumentMove(sidebarDoc.html, move.id, sectionId, afterId));
                    return;
                }
                if (sectionId === OLDER_SECTION) return;
                // A row moves with its tree, and lands after another row's
                // whole tree rather than inside it.
                const afterId =
                    move.afterId === null ? null : (parentOf.get(move.afterId) ?? move.afterId);
                props.store.spaceMove(
                    move.id as HappyAgentSpaceId,
                    sectionId as HappyAgentSpaceSectionId,
                    afterId as HappyAgentSpaceId | null,
                );
            }}
            onSectionAction={(sectionId, source) => {
                if (source === "heading")
                    props.onSectionCreate?.(sectionId as HappyAgentSpaceSectionId);
            }}
            onSectionCollapseToggle={(sectionId) => {
                if (view && sidebarDoc) {
                    documentEdit(sidebarDocumentSectionFold(sidebarDoc.html, sectionId));
                    return;
                }
                if (sectionId === OLDER_SECTION) {
                    props.store.olderExpandedUpdate(!snapshot.olderExpanded);
                    return;
                }
                const section = snapshot.sections.find((entry) => entry.id === sectionId);
                if (section) props.store.sectionCollapsedUpdate(section.id, !section.collapsed);
            }}
            onSectionTailToggle={(sectionId) => {
                const section = snapshot.sections.find((entry) => entry.id === sectionId);
                if (section)
                    props.store.sectionTailExpandedUpdate(section.id, !section.tailExpanded);
            }}
            // Older is the list's last section, inline and scrolling with the
            // rest, not a panel held at the bottom.
            sections={
                documentSections ??
                (older.length > 0
                    ? [
                          ...sections,
                          {
                              id: OLDER_SECTION,
                              label: "Older",
                              acceptsDrops: false,
                              headingDisclosure: true,
                              collapsed: !snapshot.olderExpanded,
                              items: rowsOf(older),
                          },
                      ]
                    : sections)
            }
        />
    );
}

/** Where a row stood, in words, for one side of a batch's diff. */
function positionLabel(position: HappyAgentSpaceBatch["changes"][number]["from"]): string {
    if (position.visibility === "folded") return "Older";
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

/** New work before its first message: its stem cell, centred above the composer. */
export function happyAgentSpacesStemCellIntro(space: HappyAgentSpace | undefined): ReactNode {
    if (space === undefined || space.icon?.type !== "stem_cell") return undefined;
    return <MakeStuffIntro id={space.id} />;
}
