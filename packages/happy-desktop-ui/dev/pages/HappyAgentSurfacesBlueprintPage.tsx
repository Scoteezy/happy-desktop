import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
    happyAgentTodoHeading,
    type HappyAgentSurfaceActiveTodo,
    type HappyAgentSurfaceCompletedTodo,
    type HappyAgentSurfaceDocumentSnapshot,
    type HappyAgentSurfaceId,
    type HappyAgentSurfacePerson,
    type HappyAgentSurfaceTodoId,
    type HappyAgentTodoListSnapshot,
} from "happy-desktop-state";
import { AppShell } from "../../src/AppShell";
import { EmptyState } from "../../src/EmptyState";
import type { MenuItem } from "../../src/Menu";
import { Sidebar, type SidebarItem, type SidebarReorder } from "../../src/Sidebar";
import { HappyAgentDocumentSurfacePage } from "../../src/pages/surfaces/HappyAgentDocumentSurfacePage";
import { HappyAgentSurfaceCreateDialog } from "../../src/pages/surfaces/HappyAgentSurfaceCreateDialog";
import { HappyAgentSurfaceHeader } from "../../src/pages/surfaces/HappyAgentSurfaceHeader";
import {
    HappyAgentSurfaceReferencePage,
    type HappyAgentSurfaceReferenceView,
} from "../../src/pages/surfaces/HappyAgentSurfaceReferencePage";
import { HappyAgentSurfaceUnsupportedPage } from "../../src/pages/surfaces/HappyAgentSurfaceUnsupportedPage";
import { HappyAgentTodoSurfacePage } from "../../src/pages/surfaces/HappyAgentTodoSurfacePage";
import {
    surfaceTypeIcon,
    type HappyAgentSurfaceView,
} from "../../src/pages/surfaces/surfacePresentation";
import type { HappyAgentSurfaceCreateKind } from "../../src/pages/surfaces/HappyAgentSurfaceCreateDialog";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-019";

const SURFACE_ID = "surface-groceries" as HappyAgentSurfaceId;

function picture(from: string, to: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="32" r="14" fill="white" fill-opacity="0.5"/></svg>`,
    )}`;
}

const TEAL = { url: picture("#2baccc", "#1f6f8b"), thumbhash: "4bYFRwx0d4d/iIh4h4iHeHiICJeHcHQH" };
const AMBER = { url: picture("#ff9500", "#c2410c"), thumbhash: "5FsCTwpwd4dwiId3iHh3eHiHePd4eo8I" };

const MEMBERS = [
    { key: "u1", name: "Steve Korshakov", photo: TEAL },
    { key: "u2", name: "Ada Park" },
    { key: "u3", name: "Grace Lin", photo: AMBER },
    { key: "u4", name: "Linus Moe" },
] as const;

/** The people the todos name as their authors, as the list's store reads them. */
const AUTHORS: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map([
    ["u1", { name: "Steve Korshakov", photo: TEAL }],
    ["u2", { name: "Ada Park", photo: null }],
    ["u3", { name: "Grace Lin", photo: AMBER }],
]);

const GROCERIES: HappyAgentSurfaceView = {
    name: "Groceries",
    image: TEAL,
    type: { kind: "todo" },
    creator: { name: "Steve Korshakov", photo: TEAL },
    members: MEMBERS,
};

const KANBAN: HappyAgentSurfaceView = {
    name: "Launch board",
    image: AMBER,
    type: { kind: "unsupported", type: "kanban" },
    members: MEMBERS.slice(0, 2),
};

const noop = () => undefined;

/** A task kept among the Surfaces by Ada, as its page's header shows it. */
const REFERENCE: HappyAgentSurfaceView = {
    name: "Rewrite onboarding guide",
    type: { kind: "task" },
    creator: { name: "Ada Park" },
    members: MEMBERS.slice(0, 2),
};

const HOUSE: HappyAgentSurfaceView = {
    name: "House rules",
    type: { kind: "document" },
    creator: { name: "Ada Park" },
    members: MEMBERS.slice(0, 3),
};

const HOUSE_TEXT = `# House rules

Everyone in the flat edits this page. Keep it short; the history keeps the rest.

## Kitchen

- Dishes are washed **the same evening**, not the next morning.
- The fridge shelf with your name is yours. The top shelf is shared.
- Bins go out on *Tuesday* and *Friday* nights.

## Guests

1. Say so in the chat the day before.
2. Overnight guests: at most two nights a week.
3. Quiet after 22:00 on weeknights.

## Cleaning rota

| Week | Kitchen | Bathroom | Hall |
| ---- | ------- | -------- | ---- |
| 1 | Steve | Ada | Grace |
| 2 | Ada | Grace | Steve |
| 3 | Grace | Steve | Ada |

## Before you leave for a trip

- [x] Water the plants, or ask someone to
- [ ] Take your food out of the shared shelf
- [ ] Tell the others in the chat

> The Wi-Fi password is on the router. Please don't post it here.

Questions go to [the flat's chat](https://example.com/flat-chat).
`;

const DOCUMENT: HappyAgentSurfaceDocumentSnapshot = {
    surfaceId: "surface-house" as HappyAgentSurfaceId,
    status: "ready",
    text: HOUSE_TEXT,
    editing: false,
    saving: false,
};

const documentHandlers = {
    onConflictDismiss: noop,
    onEditEnd: noop,
    onEditStart: noop,
    onTextChange: noop,
};

/**
 * The page against a document held here, so reading, clicking into the text,
 * and writing can be tried in the workbench. Typing is "saved" a second
 * after it rests, as the store saves it.
 */
function LiveDocumentPage(props: {
    readonly surface?: HappyAgentSurfaceView;
    readonly initial?: HappyAgentSurfaceDocumentSnapshot;
}) {
    const [document, setDocument] = useState(props.initial ?? DOCUMENT);
    const typed = useRef(0);
    return (
        <HappyAgentDocumentSurfacePage
            document={document}
            onConflictDismiss={() => setDocument({ ...document, conflict: undefined })}
            onEditEnd={() => setDocument({ ...document, editing: false, saving: false })}
            onEditStart={() => setDocument({ ...document, editing: true })}
            onTextChange={(text) => {
                typed.current += 1;
                const at = typed.current;
                setDocument({ ...document, text, saving: true });
                setTimeout(() => {
                    if (typed.current === at)
                        setDocument((current) => ({ ...current, saving: false }));
                }, 1_000);
            }}
            surface={props.surface ?? HOUSE}
        />
    );
}

function active(
    id: string,
    text: string,
    index: number,
    authorUserId: string | null = null,
): HappyAgentSurfaceActiveTodo {
    return {
        id: id as HappyAgentSurfaceTodoId,
        surfaceId: SURFACE_ID,
        text,
        authorUserId,
        createdAt: 1_760_000_000_000 + index,
        updatedAt: 1_760_000_000_000 + index,
        version: `v-${id}`,
        status: "active",
        orderKey: String(index + 1),
        completedAt: null,
        deletedAt: null,
    };
}

function completed(todo: HappyAgentSurfaceActiveTodo, at: number): HappyAgentSurfaceCompletedTodo {
    return { ...todo, status: "completed", orderKey: null, completedAt: at };
}

// Written by three people, by nobody credited (an agent's, say), and by
// someone whose name has not been read yet — the last two show no face. The
// "# " todos head sections of the list.
const ACTIVE: readonly HappyAgentSurfaceActiveTodo[] = [
    active("h1", "# Breakfast", 0, "u1"),
    active("t1", "Oat milk", 1, "u1"),
    active("t2", "Sourdough loaf", 2, "u2"),
    active("t3", "Two lemons and a bunch of coriander for Thursday", 3, "u3"),
    active("t4", "Coffee beans", 4, null),
    active("h2", "# Household", 5, null),
    active("t5", "Dish soap", 6, "u9"),
];

// A heading an agent ticked off is history: muted, and still no checkbox.
const DONE: readonly HappyAgentSurfaceCompletedTodo[] = [
    completed(active("t6", "Eggs", 7, "u2"), 1_760_000_100_000),
    completed(active("h3", "# Last week", 8, null), 1_760_000_075_000),
    completed(active("t7", "Butter", 9, null), 1_760_000_050_000),
];

/** Open todos, as the sidebar counts them: headings are not something to do. */
function openCount(todos: readonly HappyAgentSurfaceActiveTodo[]): number {
    return todos.filter((todo) => happyAgentTodoHeading(todo.text) === undefined).length;
}

const LIST: HappyAgentTodoListSnapshot = {
    surfaceId: SURFACE_ID,
    status: "ready",
    active: ACTIVE,
    completed: DONE,
    completedShown: false,
    authors: AUTHORS,
    draft: "",
};

/**
 * A list that credits nobody: what a standalone installation shows, and what
 * a daemon that leaves the fields out shows, since a missing author reads as
 * none.
 */
const UNCREDITED: HappyAgentTodoListSnapshot = {
    ...LIST,
    active: ACTIVE.map((todo) => ({ ...todo, authorUserId: null })),
    completed: DONE.map((todo) => ({ ...todo, authorUserId: null })),
    authors: new Map(),
};

const handlers = {
    onDraftChange: noop,
    onDraftSubmit: noop,
    onTodoCompletedChange: noop,
    onTodoMove: noop,
    onTodoDelete: noop,
    onTodoEditStart: noop,
    onTodoEditTextChange: noop,
    onTodoEditCommit: noop,
    onTodoEditCancel: noop,
    onCompletedShownChange: noop,
};

/**
 * The page against a list held here, so the drag, the checkbox, editing, and
 * the completed section can be tried in the workbench. The application holds
 * the same snapshot in its store.
 */
function LiveTodoPage(props: {
    readonly initial?: HappyAgentTodoListSnapshot;
    readonly focusOnType?: boolean;
    /** Told how many todos are open after each change, as the sidebar's count is. */
    readonly onActiveCount?: (count: number) => void;
}) {
    const [list, setList] = useState(props.initial ?? LIST);
    const [next, setNext] = useState(10);
    const set = (patch: Partial<HappyAgentTodoListSnapshot>) => {
        const next = { ...list, ...patch };
        setList(next);
        props.onActiveCount?.(openCount(next.active));
    };
    const textSet = (id: HappyAgentSurfaceTodoId, text: string) =>
        set({
            active: list.active.map((todo) => (todo.id === id ? { ...todo, text } : todo)),
            completed: list.completed.map((todo) => (todo.id === id ? { ...todo, text } : todo)),
            editing: undefined,
        });
    return (
        <HappyAgentTodoSurfacePage
            {...handlers}
            {...(props.focusOnType ? { focusOnType: true } : {})}
            list={list}
            onCompletedShownChange={(shown) => set({ completedShown: shown })}
            onDraftChange={(draft) => set({ draft })}
            onDraftSubmit={() => {
                const text = list.draft.trim();
                if (text.length === 0) return;
                setNext(next + 1);
                // At the top, as the daemon puts it; not credited until it answers.
                set({
                    active: [active(`n${String(next)}`, text, next), ...list.active],
                    draft: "",
                });
            }}
            onTodoCompletedChange={(id, done) => {
                if (done) {
                    const todo = list.active.find((entry) => entry.id === id);
                    if (!todo) return;
                    set({
                        active: list.active.filter((entry) => entry !== todo),
                        completed: [completed(todo, 1_760_000_200_000 + next), ...list.completed],
                    });
                    setNext(next + 1);
                } else {
                    const todo = list.completed.find((entry) => entry.id === id);
                    if (!todo) return;
                    set({
                        active: [
                            ...list.active,
                            active(todo.id, todo.text, next, todo.authorUserId),
                        ],
                        completed: list.completed.filter((entry) => entry !== todo),
                    });
                    setNext(next + 1);
                }
            }}
            onTodoDelete={(id) =>
                set({
                    active: list.active.filter((todo) => todo.id !== id),
                    completed: list.completed.filter((todo) => todo.id !== id),
                })
            }
            onTodoEditCancel={() => set({ editing: undefined })}
            onTodoEditCommit={() => {
                if (list.editing) textSet(list.editing.todoId, list.editing.text);
            }}
            onTodoEditStart={(id) => {
                const todo = [...list.active, ...list.completed].find((entry) => entry.id === id);
                if (todo) set({ editing: { todoId: id, text: todo.text } });
            }}
            onTodoEditTextChange={(text) => {
                if (list.editing) set({ editing: { todoId: list.editing.todoId, text } });
            }}
            onTodoMove={(id, toIndex) => {
                const from = list.active.findIndex((todo) => todo.id === id);
                if (from < 0 || from === toIndex) return;
                const moved = [...list.active];
                const [todo] = moved.splice(from, 1);
                moved.splice(toIndex, 0, todo!);
                set({ active: moved });
            }}
            surface={GROCERIES}
        />
    );
}

/** Fixture-only stand-in for the native macOS traffic lights: 14px at x 14…68, y 13. */
function TrafficLights() {
    const dot = (background: string): CSSProperties => ({
        background,
        borderRadius: "50%",
        height: "14px",
        width: "14px",
    });
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: "6px",
                left: "14px",
                pointerEvents: "none",
                position: "absolute",
                top: "13px",
                zIndex: 10,
            }}
        >
            <i style={dot("#ff5f57")} />
            <i style={dot("#febc2e")} />
            <i style={dot("#28c840")} />
        </span>
    );
}

interface MockSurface {
    readonly id: string;
    readonly joined: boolean;
    readonly view: HappyAgentSurfaceView;
    /** Open todos, for a todo list. */
    readonly count?: number;
    /** An artifact, bot, or task kept among the Surfaces: what it points at. */
    readonly reference?: MockReference;
}

/**
 * What an artifact, bot, or task Surface points at here: the row it opens
 * when it can be opened, and the face that row wears.
 */
interface MockReference {
    readonly view: HappyAgentSurfaceReferenceView;
    readonly face: Pick<SidebarItem, "archived" | "avatarId" | "icon" | "imageUrl" | "initials">;
    /** The row in Artifacts, Bots, or Tasks it opens; absent when it cannot be opened. */
    readonly opens?: string;
}

function reference(
    id: string,
    name: string,
    kind: "artifact" | "bot" | "task",
    mock: MockReference,
): MockSurface {
    return {
        id,
        joined: true,
        reference: mock,
        view: { name, type: { kind }, members: MEMBERS.slice(0, 2) },
    };
}

function separator(id: string, name: string): MockSurface {
    return { id, joined: true, view: { name, type: { kind: "separator" }, members: MEMBERS } };
}

const SURFACES: readonly MockSurface[] = [
    separator("home", "Home"),
    { id: "groceries", joined: true, view: GROCERIES, count: openCount(ACTIVE) },
    {
        id: "reading",
        joined: true,
        count: 3,
        view: { name: "Reading list", type: { kind: "todo" }, members: MEMBERS.slice(0, 1) },
    },
    { id: "house", joined: true, view: HOUSE },
    reference("ref-chief", "Chief of Staff", "bot", {
        face: { avatarId: "chief-of-staff" },
        opens: "chief",
        view: { phase: "available", kind: "bot", name: "Chief of Staff", action: "open" },
    }),
    separator("work", "Work"),
    { id: "launch", joined: true, view: KANBAN },
    reference("ref-spec", "Launch spec", "artifact", {
        face: { icon: "package" },
        opens: "artifacts",
        view: { phase: "available", kind: "artifact", name: "Launch spec", action: "open" },
    }),
    reference("ref-onboarding", "Rewrite onboarding guide", "task", {
        face: { icon: "tasks" },
        opens: "task-docs",
        view: {
            phase: "available",
            kind: "task",
            name: "Rewrite onboarding guide",
            action: "open",
        },
    }),
    // Deleted since it was kept: its label and the artifact glyph, dimmed, and a quiet page.
    reference("ref-pricing", "Old pricing page", "artifact", {
        face: { icon: "package", archived: true },
        view: { phase: "unavailable", kind: "artifact" },
    }),
    {
        id: "release",
        joined: true,
        count: 12,
        view: {
            name: "October release checklist",
            image: AMBER,
            type: { kind: "todo" },
            members: MEMBERS,
        },
    },
    // Not joined, so found only by searching.
    {
        id: "errands",
        joined: false,
        view: { name: "Errands", type: { kind: "todo" }, members: MEMBERS.slice(1, 3) },
    },
    {
        id: "retro",
        joined: false,
        view: { name: "Retro notes", type: { kind: "unsupported", type: "board" }, members: [] },
    },
];

/** A Surface's row, as the app lists it: a joined separator heads the rows after it. */
function surfaceItem(surface: MockSurface, fixed: boolean): SidebarItem {
    const heading = !fixed && surface.view.type.kind === "separator";
    return {
        id: surface.id,
        kind: heading ? "heading" : "project",
        label: surface.view.name,
        ...(heading
            ? {}
            : surface.reference
              ? surface.reference.face
              : surface.view.image
                ? { imageUrl: surface.view.image.url }
                : { icon: surfaceTypeIcon(surface.view.type) }),
        ...(surface.joined && surface.count ? { count: surface.count } : {}),
        ...(fixed ? { reorderable: false } : {}),
        action: surface.joined
            ? {
                  icon: "close" as const,
                  label: `Leave ${surface.view.name}`,
                  reveal: "hover" as const,
              }
            : { icon: "plus" as const, label: `Join ${surface.view.name}` },
    };
}

const CREATE_OFFERS = [
    "todo",
    "document",
    "separator",
] as const satisfies readonly HappyAgentSurfaceCreateKind[];

const CREATE_MENU: MenuItem[] = [
    { kind: "item", id: "todo", icon: "tasks", label: "New todo list" },
    { kind: "item", id: "document", icon: "doc", label: "New document" },
    { kind: "item", id: "separator", icon: "hash", label: "New separator" },
];

const ARTIFACTS: SidebarItem = {
    icon: "package",
    id: "artifacts",
    kind: "project",
    label: "Artifacts",
    reorderable: false,
};

const BOTS: readonly SidebarItem[] = [
    { avatarId: "chief-of-staff", id: "chief", kind: "agent", label: "Chief of Staff" },
    { avatarId: "release-notes", id: "notes", kind: "agent", label: "Release notes" },
];

const TASKS: readonly SidebarItem[] = [
    { id: "task-docs", initials: "AP", kind: "project", label: "Rewrite onboarding guide" },
];

const PROJECTS: readonly SidebarItem[] = [
    { id: "desktop", initials: "H", kind: "project", label: "happy-desktop" },
    {
        depth: 1,
        id: "desktop-sidebar",
        kind: "workspace",
        label: "sidebar-search",
        meta: "happy-desktop",
    },
    { id: "agent", initials: "H", kind: "project", label: "happy-agent" },
];

const CHATS: readonly SidebarItem[] = [
    {
        icon: "chat",
        id: "chat-1",
        kind: "channel",
        label: "Review the release plan",
        meta: "happy-desktop",
    },
    {
        icon: "chat",
        id: "chat-2",
        kind: "channel",
        label: "Fix flaky sidebar test",
        meta: "sidebar-search",
    },
    {
        icon: "chat",
        id: "chat-3",
        kind: "channel",
        label: "Refactor surface store",
        meta: "happy-agent",
    },
];

/** Where the app would open the artifact viewer or a bot's or task's chat. */
function MockTarget(props: { readonly item: SidebarItem }) {
    return (
        <div style={{ alignItems: "center", display: "flex", flex: "1 1 0%" }}>
            <EmptyState
                description="The app opens it here, as from its own row."
                icon={props.item.id === "artifacts" ? "package" : "chat"}
                size="panel"
                title={props.item.label}
            />
        </div>
    );
}

/**
 * The window as the app composes it: Artifacts heads the sidebar's first,
 * unheaded group and never moves; the reader's Surfaces follow and are
 * dragged among themselves. The + beside the collapse control makes a todo
 * list. Typing in the search replaces the sidebar with what matches —
 * Surfaces joined or not, bots, tasks, projects, and chats — under headings.
 * An artifact, bot, or task kept among the Surfaces opens what it points at.
 */
function MockWindow(props: {
    readonly focusOnType?: boolean;
    readonly initialSearch?: string;
    readonly initialList?: HappyAgentTodoListSnapshot;
}) {
    const [surfaces, setSurfaces] = useState(SURFACES);
    const [search, setSearch] = useState(props.initialSearch ?? "");
    const [selected, setSelected] = useState("groceries");
    const [creating, setCreating] = useState<HappyAgentSurfaceCreateKind>();
    const query = search.trim().toLocaleLowerCase();
    const searching = query.length > 0;
    const found = (items: readonly SidebarItem[]): SidebarItem[] =>
        items
            .filter((item) => item.label.toLocaleLowerCase().includes(query))
            .map((item) => ({ ...item, depth: 0, reorderable: false }));
    const joined = surfaces.filter((surface) => surface.joined);
    const open = surfaces.find((surface) => surface.id === selected);
    const target = [ARTIFACTS, ...BOTS, ...TASKS].find((item) => item.id === selected);
    const reorder = (_section: string, move: SidebarReorder) => {
        const moved = surfaces.find((surface) => surface.id === move.id);
        if (!moved) return;
        const rest = surfaces.filter((surface) => surface !== moved);
        const at =
            move.afterId === null
                ? 0
                : rest.findIndex((surface) => surface.id === move.afterId) + 1;
        setSurfaces([...rest.slice(0, at), moved, ...rest.slice(at)]);
    };
    const results = [
        {
            id: "search-surfaces",
            label: "Surfaces",
            items: [
                ...found([ARTIFACTS]),
                ...found(joined.map((surface) => surfaceItem(surface, true))),
                ...found(
                    surfaces
                        .filter((surface) => !surface.joined)
                        .map((surface) => surfaceItem(surface, true)),
                ),
            ],
        },
        { id: "search-bots", label: "Bots", items: found(BOTS) },
        { id: "search-tasks", label: "Tasks", items: found(TASKS) },
        { id: "search-projects", label: "Projects", items: found(PROJECTS) },
        { id: "search-chats", label: "Chats", items: found(CHATS) },
    ].filter((section) => section.items.length > 0);
    return (
        <div style={{ display: "flex", height: "100%", position: "relative", width: "100%" }}>
            <AppShell
                sidebar={
                    <Sidebar
                        activeItemId={selected}
                        headerAction={{ icon: "plus", label: "New Surface", menu: CREATE_MENU }}
                        onHeaderMenuSelect={(id) => {
                            const offer = CREATE_OFFERS.find((entry) => entry === id);
                            if (offer) setCreating(offer);
                        }}
                        onItemAction={noop}
                        onItemReorder={reorder}
                        onItemSelect={(id) => {
                            // A separator has nothing to open; a kept artifact,
                            // bot, or task opens what it points at.
                            const surface = surfaces.find((entry) => entry.id === id);
                            if (surface?.view.type.kind === "separator") return;
                            setSelected(surface?.reference?.opens ?? id);
                        }}
                        onSectionAction={noop}
                        search={{ onValueChange: setSearch, placeholder: "Search", value: search }}
                        sections={
                            searching
                                ? results.length > 0
                                    ? results
                                    : [
                                          {
                                              empty: {
                                                  description: `Nothing matches “${search.trim()}”.`,
                                              },
                                              id: "search-none",
                                              items: [],
                                          },
                                      ]
                                : [
                                      {
                                          id: "top",
                                          items: [
                                              ARTIFACTS,
                                              ...joined.map((surface) =>
                                                  surfaceItem(surface, false),
                                              ),
                                          ],
                                      },
                                      {
                                          action: {
                                              icon: "plus",
                                              label: "New bot",
                                              reveal: "always",
                                          },
                                          id: "bots",
                                          label: "Bots",
                                          items: [...BOTS],
                                      },
                                      {
                                          action: {
                                              icon: "plus",
                                              label: "New task",
                                              reveal: "always",
                                          },
                                          id: "tasks",
                                          label: "Tasks",
                                          items: [...TASKS],
                                      },
                                      {
                                          action: {
                                              icon: "plus",
                                              label: "Add project",
                                              reveal: "always",
                                          },
                                          id: "projects",
                                          label: "Projects",
                                          items: PROJECTS.map(({ meta: _meta, ...item }) => item),
                                      },
                                  ]
                        }
                    />
                }
                sidebarCollapsible
                windowControls
            >
                {open?.view.type.kind === "todo" && open.id === "groceries" ? (
                    <LiveTodoPage
                        {...(props.focusOnType ? { focusOnType: true } : {})}
                        {...(props.initialList ? { initial: props.initialList } : {})}
                        onActiveCount={(count) =>
                            setSurfaces(
                                surfaces.map((surface) =>
                                    surface.id === "groceries" ? { ...surface, count } : surface,
                                ),
                            )
                        }
                    />
                ) : open?.view.type.kind === "document" ? (
                    <LiveDocumentPage
                        {...(open.id === "house"
                            ? {}
                            : { initial: { ...DOCUMENT, text: "", editing: true } })}
                        key={open.id}
                        surface={open.view}
                    />
                ) : open?.reference ? (
                    <HappyAgentSurfaceReferencePage
                        onOpen={noop}
                        reference={open.reference.view}
                        surface={open.view}
                    />
                ) : open ? (
                    open.view.type.kind === "todo" ? (
                        <HappyAgentTodoSurfacePage
                            {...handlers}
                            list={{ ...LIST, active: [], completed: [] }}
                            surface={open.view}
                        />
                    ) : (
                        <HappyAgentSurfaceUnsupportedPage surface={open.view} />
                    )
                ) : target ? (
                    <MockTarget item={target} />
                ) : null}
            </AppShell>
            <TrafficLights />
            {creating ? (
                <HappyAgentSurfaceCreateDialog
                    kind={creating}
                    onClose={() => setCreating(undefined)}
                    onSubmit={(input) => {
                        const id = `made-${String(surfaces.length)}`;
                        setSurfaces([
                            ...surfaces,
                            input.kind === "separator"
                                ? separator(id, input.name)
                                : {
                                      id,
                                      joined: true,
                                      view: {
                                          name: input.name,
                                          type: { kind: input.kind },
                                          members: MEMBERS.slice(0, 1),
                                      },
                                  },
                        ]);
                        setCreating(undefined);
                        if (input.kind !== "separator") setSelected(id);
                    }}
                />
            ) : null}
        </div>
    );
}

/** The header with and without a creator, with long names, and too narrow for the creator. */
const HEADERS: readonly {
    readonly key: string;
    readonly width: number;
    readonly surface: HappyAgentSurfaceView;
}[] = [
    { key: "creator", width: 760, surface: GROCERIES },
    { key: "nobody", width: 760, surface: { ...GROCERIES, creator: undefined } },
    {
        key: "long",
        width: 560,
        surface: {
            ...GROCERIES,
            name: "October release checklist for the desktop app",
            creator: { name: "Maximilian Alexander Featherstonehaugh" },
        },
    },
    { key: "narrow", width: 440, surface: GROCERIES },
];

/** Gives each fixed overlay a desktop-sized, clipping-safe specimen window. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: "560px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "760px",
            }}
        >
            {children}
        </div>
    );
}

export function HappyAgentSurfacesBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Shared Surfaces on a Happy Agent: the sidebar group they head with Artifacts, a todo list whose active todos are dragged into a shared order, a shared document, an artifact, bot, or task kept among them, the state for a type this build cannot show, and the dialog that makes one."
            title="HappyAgentSurfaces"
        >
            <FullScreenSpecimen
                detail="Live, in the window. Artifacts heads the first group and never moves; drag a Surface among the others, separators included — Home and Work are separators, which head the Surfaces after them and open nothing. Chief of Staff, Launch spec, and Rewrite onboarding guide are a bot, an artifact, and a task kept among the Surfaces, wearing their own faces and opening where they always open; Old pricing page was deleted since. + beside the collapse control offers a todo list or a separator; the search above everything replaces the sidebar with what matches. The list's add field has the caret, and typing anywhere no other control wants lands in it, as in a chat."
                label="Window"
                number="00"
                screen="00-window-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <MockWindow focusOnType />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Searching “re”: Surfaces (joined first, then the ones not joined yet, each offering Join), bots, tasks, projects, and chats that match, in place of the usual sidebar. Nothing found is dragged."
                label="Window, searching"
                number="00b"
                screen="00b-search-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <MockWindow initialSearch="re" />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The list with its completed todos shown, in the window."
                label="Window, completed shown"
                number="00c"
                screen="00c-completed-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <MockWindow initialList={{ ...LIST, completedShown: true }} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Live. A todo added here goes to the top of the list. Drag an active todo by its body — its author's face included; the checkbox, the delete control, and the field while editing never start a drag. Completed todos are below, newest first, and never move. Coffee beans credits nobody and Dish soap's author is not read yet, so neither shows a face; the header says who made the list."
                label="Todo list"
                number="01"
                screen="01-todo-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <LiveTodoPage />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Completed shown, with a heading an agent ticked off among them, and one todo being edited."
                label="Completed and editing"
                number="02"
                screen="02-completed-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentTodoSurfacePage
                    {...handlers}
                    list={{
                        ...LIST,
                        completedShown: true,
                        editing: { todoId: ACTIVE[2]!.id, text: "Sourdough loaf, sliced" },
                    }}
                    surface={GROCERIES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A heading being edited: the field holds its full text, “# ” included, so removing the prefix makes it a todo again."
                label="Editing a heading"
                number="02b"
                screen="02b-heading-edit-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentTodoSurfacePage
                    {...handlers}
                    list={{ ...LIST, editing: { todoId: ACTIVE[5]!.id, text: "# Household" } }}
                    surface={GROCERIES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Not read yet, as a list just made here is: the page is already usable, with a todo added before the first read."
                label="Not read yet"
                number="03"
                screen="03-loading-720x640"
            >
                <HappyAgentTodoSurfacePage
                    {...handlers}
                    list={{
                        ...LIST,
                        status: "loading",
                        active: [active("n1", "Paint the hallway", 0)],
                        completed: [],
                    }}
                    surface={{ ...GROCERIES, image: undefined, members: MEMBERS.slice(0, 1) }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Empty, with one member."
                label="Empty"
                number="04"
                screen="04-empty-720x640"
            >
                <HappyAgentTodoSurfacePage
                    {...handlers}
                    list={{ ...LIST, active: [], completed: [] }}
                    surface={{ ...GROCERIES, members: MEMBERS.slice(0, 1) }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Nobody credited: a standalone installation, a daemon that leaves the author and creator out, or a list from before they were recorded. No faces on the todos and no creator in the header."
                label="Nobody credited"
                number="04b"
                screen="04b-uncredited-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentTodoSurfacePage
                    {...handlers}
                    list={UNCREDITED}
                    surface={{ ...GROCERIES, creator: undefined }}
                />
            </FullScreenSpecimen>

            <Specimen
                detail="56px · one line: the name, who made it, and the faces of who is in it. Who made it is dropped below 480px, and long names truncate, the creator first."
                label="Header"
                number="06"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {HEADERS.map((entry) => (
                        <div
                            key={entry.key}
                            style={{
                                border: "1px solid var(--surface-pressed-overlay)",
                                display: "flex",
                                width: `${String(entry.width)}px`,
                            }}
                        >
                            <HappyAgentSurfaceHeader surface={entry.surface} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <FullScreenSpecimen
                detail="A “kanban” Surface: its name and members, and no guessed content."
                label="Unsupported type"
                number="05"
                screen="05-unsupported-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentSurfaceUnsupportedPage surface={KANBAN} />
            </FullScreenSpecimen>

            <Specimen
                detail="480px · name and an optional picture"
                label="Create"
                number="07"
                stage="app"
            >
                {frame(
                    <HappyAgentSurfaceCreateDialog kind="todo" onClose={noop} onSubmit={noop} />,
                )}
            </Specimen>

            <Specimen
                detail="480px · a document has a name and an optional picture, and starts empty"
                label="Create document"
                number="07c"
                stage="app"
            >
                {frame(
                    <HappyAgentSurfaceCreateDialog
                        kind="document"
                        onClose={noop}
                        onSubmit={noop}
                    />,
                )}
            </Specimen>

            <FullScreenSpecimen
                detail="Live. The shared Markdown rendered on the reading measure. Click any block to write: the text opens as Markdown in the same place, the caret at the start of that block and its line where the block was. A link or a selection does not open it. Escape, Cmd+Enter, or Done closes it; typing is saved as it rests."
                label="Document"
                number="08"
                screen="08-document-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <LiveDocumentPage />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Written in: the Markdown on the same measure, saving what was just typed."
                label="Document, writing"
                number="08b"
                screen="08b-document-writing-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentDocumentSurfacePage
                    {...documentHandlers}
                    document={{ ...DOCUMENT, editing: true, saving: true }}
                    surface={HOUSE}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Someone changed the same lines while the reader was writing: the reader's text was kept and saved over theirs, which stays among the versions."
                label="Document, both changed the same lines"
                number="08c"
                screen="08c-document-conflict-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentDocumentSurfacePage
                    {...documentHandlers}
                    document={{
                        ...DOCUMENT,
                        editing: true,
                        conflict: { lastEditorUserId: "u3", updatedAt: 1_760_000_000_000 },
                    }}
                    surface={HOUSE}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Nothing written yet: one quiet line that opens it for writing."
                label="Document, empty"
                number="08d"
                screen="08d-document-empty-720x640"
            >
                <HappyAgentDocumentSurfacePage
                    {...documentHandlers}
                    document={{ ...DOCUMENT, text: "" }}
                    surface={{ ...HOUSE, name: "Notes", creator: undefined }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The daemon has no such document."
                label="Document, missing"
                number="08e"
                screen="08e-document-missing-720x640"
            >
                <HappyAgentDocumentSurfacePage
                    {...documentHandlers}
                    document={{ ...DOCUMENT, status: "missing", text: "" }}
                    surface={HOUSE}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="An artifact kept among the Surfaces that has not been read for this reader yet: its header, and nothing guessed. Once read, its row opens the artifact viewer itself and this page is not seen."
                label="Reference, resolving"
                number="09"
                screen="09-reference-resolving-720x640"
            >
                <HappyAgentSurfaceReferencePage
                    onOpen={noop}
                    reference={{ phase: "resolving" }}
                    surface={{ ...REFERENCE, name: "Launch spec", type: { kind: "artifact" } }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A task someone kept among the Surfaces that the reader is not in: joining puts it in their Tasks and opens its chat."
                label="Reference, a task to join"
                number="09b"
                screen="09b-reference-join-720x640"
            >
                <HappyAgentSurfaceReferencePage
                    onOpen={noop}
                    reference={{
                        phase: "available",
                        kind: "task",
                        name: "Rewrite onboarding guide",
                        action: "join",
                    }}
                    surface={{ ...REFERENCE, name: "Rewrite onboarding guide" }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="What it pointed at was deleted, archived, or is not the reader's to see: said quietly under the label it was kept by. The row keeps its place."
                label="Reference, not available"
                number="09c"
                screen="09c-reference-unavailable-720x640"
            >
                <HappyAgentSurfaceReferencePage
                    onOpen={noop}
                    reference={{ phase: "unavailable", kind: "artifact" }}
                    surface={{ ...REFERENCE, name: "Old pricing page", type: { kind: "artifact" } }}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A bot that was archived."
                label="Reference, bot not available"
                number="09d"
                screen="09d-reference-bot-unavailable-720x640"
            >
                <HappyAgentSurfaceReferencePage
                    onOpen={noop}
                    reference={{ phase: "unavailable", kind: "bot" }}
                    surface={{ ...REFERENCE, name: "Release notes", type: { kind: "bot" } }}
                />
            </FullScreenSpecimen>

            <Specimen
                detail="480px · a separator is only a name"
                label="Create separator"
                number="07b"
                stage="app"
            >
                {frame(
                    <HappyAgentSurfaceCreateDialog
                        kind="separator"
                        onClose={noop}
                        onSubmit={noop}
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
