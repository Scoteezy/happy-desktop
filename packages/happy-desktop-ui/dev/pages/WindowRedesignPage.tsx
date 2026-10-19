import { useState } from "react";
import type { HappyAgentTodoListSnapshot, HappyAgentSurfaceTodoId } from "happy-desktop-state";
import { AppShell, APP_SHELL_SIDEBAR_DEFAULT_WIDTH } from "../../src/AppShell";
import { Button } from "../../src/Button";
import { CodeBlock } from "../../src/CodeBlock";
import { CommandPalette } from "../../src/CommandPalette";
import { CommandPaletteResults } from "../../src/CommandPaletteResults";
import { ConnectionShell } from "../../src/ConnectionShell";
import { MakeStuffView } from "../../src/MakeStuffView";
import { MarkdownDocument } from "../../src/MarkdownDocument";
import { ModalOverlay } from "../../src/ModalOverlay";
import { ScrollArea } from "../../src/Scrollbar";
import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { TabbedPane } from "../../src/TabbedPane";
import type { TabItem } from "../../src/Tabs";
import { ThemeScope } from "../../src/ThemeScope";
import { WorkFloaty, type WorkFloatyItem } from "../../src/WorkFloaty";
import { WorkTranscript, type WorkTranscriptRow } from "../../src/WorkTranscript";
import { HappyAgentTodoSurfacePage } from "../../src/pages/surfaces/HappyAgentTodoSurfacePage";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { TidyStoryWindow } from "./TidyStoryWindow";
import {
    redesignActive,
    redesignCode,
    redesignComposer,
    redesignConnections,
    redesignDraft,
    redesignHistory,
    redesignLeased,
    redesignMarks,
    redesignMorning,
    redesignMovies,
    redesignNative,
    redesignPrimary,
    redesignRelease,
    redesignReplaced,
    redesignSearch,
    redesignSections,
    redesignTabs,
    redesignWorking,
} from "./windowRedesignFixtures";

export const componentNumber = "P-021";
const noop = () => undefined;
const composeShortcut = { aria: "Meta+N Meta+T", caps: "⌘N" };
const desktopWindows = [
    { width: 1440, height: 900 },
    { width: 1100, height: 760 },
] as const;

type Scene =
    | "morning"
    | "request"
    | "context"
    | "landed"
    | "icon-assigned"
    | "section-plus"
    | "working"
    | "replaced"
    | "leased"
    | "movie-request"
    | "movies"
    | "release"
    | "history"
    | "search";
type StoryFrame = {
    id: string;
    label: string;
    scene: Scene;
    iconsOff?: boolean;
    dark?: boolean;
    floaty?: boolean;
    collapsed?: boolean;
    windowed?: boolean;
};

const frames: readonly StoryFrame[] = [
    { id: "01a-morning-icons-on", label: "Morning · generated icons", scene: "morning" },
    {
        id: "01b-morning-icons-off",
        label: "Morning · no entity icon lanes",
        scene: "morning",
        iconsOff: true,
    },
    { id: "02a-make-stuff-request", label: "Make Stuff · one request", scene: "request" },
    {
        id: "02b-make-stuff-context",
        label: "Context · related and conflicting work",
        scene: "context",
    },
    { id: "02c-task-landed", label: "A task lands in Desktop workflow", scene: "landed" },
    { id: "02d-icon-assigned", label: "Happy gives the new item its icon", scene: "icon-assigned" },
    {
        id: "02e-section-plus",
        label: "A new item starts under Release readiness",
        scene: "section-plus",
    },
    {
        id: "03-task-working",
        label: "Work · summarized transcript and active floaty",
        scene: "working",
        floaty: true,
    },
    {
        id: "04-helper-replaced",
        label: "A crashed helper is replaced",
        scene: "replaced",
        floaty: true,
    },
    {
        id: "05-leased-research",
        label: "A researcher replies directly",
        scene: "leased",
        floaty: true,
    },
    { id: "06a-make-movie-list", label: "The same input · a list request", scene: "movie-request" },
    { id: "06b-movie-list-open", label: "The list opens from the chat", scene: "movies" },
    {
        id: "07-release-day",
        label: "Crew coordinate · one question for you",
        scene: "release",
        floaty: true,
    },
    {
        id: "08-floaty-history",
        label: "History keeps the temporary work",
        scene: "history",
        floaty: true,
    },
    {
        id: "09-collapsed-search",
        label: "Search · windowed and collapsed",
        scene: "search",
        collapsed: true,
        windowed: true,
    },
    {
        id: "10-working-dark",
        label: "The same work · dark appearance",
        scene: "working",
        floaty: true,
        dark: true,
    },
];

/** Fixture-only OS decoration, outside the renderer's native-control safe area. */
function TrafficLights() {
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: 6,
                position: "absolute",
                left: 14,
                top: 13,
                pointerEvents: "none",
                zIndex: 10,
            }}
        >
            {["--status-error", "--box-warning-border", "--success"].map((token) => (
                <span
                    key={token}
                    style={{
                        display: "flex",
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: `var(${token})`,
                    }}
                />
            ))}
        </span>
    );
}

function MovieList() {
    const [list, setList] = useState(redesignMovies);
    const update = (next: Partial<HappyAgentTodoListSnapshot>) => setList({ ...list, ...next });
    return (
        <HappyAgentTodoSurfacePage
            surface={{ name: "Downloaded movies", type: { kind: "todo" }, members: [] }}
            list={list}
            focusOnType={false}
            onDraftChange={(draft) => update({ draft })}
            onDraftSubmit={() => {
                if (!list.draft.trim()) return;
                const first = redesignMovies.active[0]!;
                update({
                    draft: "",
                    active: [
                        ...list.active,
                        {
                            ...first,
                            id: `movie-new-${list.active.length}` as HappyAgentSurfaceTodoId,
                            text: list.draft,
                            orderKey: String(list.active.length),
                        },
                    ],
                });
            }}
            onTodoCompletedChange={(id, completed) => {
                if (completed) {
                    const todo = list.active.find((entry) => entry.id === id);
                    if (todo)
                        update({
                            active: list.active.filter((entry) => entry.id !== id),
                            completed: [
                                ...list.completed,
                                {
                                    ...todo,
                                    status: "completed",
                                    completedAt: 1_790_000_000_000,
                                    orderKey: null,
                                },
                            ],
                        });
                } else {
                    const todo = list.completed.find((entry) => entry.id === id);
                    if (todo)
                        update({
                            completed: list.completed.filter((entry) => entry.id !== id),
                            active: [
                                ...list.active,
                                {
                                    ...todo,
                                    status: "active",
                                    completedAt: null,
                                    orderKey: String(list.active.length),
                                },
                            ],
                        });
                }
            }}
            onTodoMove={(id, index) => {
                const todo = list.active.find((entry) => entry.id === id);
                if (!todo) return;
                const active = list.active.filter((entry) => entry.id !== id);
                active.splice(index, 0, todo);
                update({ active });
            }}
            onTodoDelete={(id) =>
                update({
                    active: list.active.filter((entry) => entry.id !== id),
                    completed: list.completed.filter((entry) => entry.id !== id),
                })
            }
            onTodoEditStart={(id) => {
                const todo = list.active.find((entry) => entry.id === id);
                if (todo) update({ editing: { todoId: id, text: todo.text } });
            }}
            onTodoEditTextChange={(text) => {
                if (list.editing) update({ editing: { ...list.editing, text } });
            }}
            onTodoEditCommit={() =>
                update({
                    active: list.active.map((todo) =>
                        todo.id === list.editing?.todoId
                            ? { ...todo, text: list.editing.text }
                            : todo,
                    ),
                    editing: undefined,
                })
            }
            onTodoEditCancel={() => update({ editing: undefined })}
            onCompletedShownChange={(completedShown) => update({ completedShown })}
        />
    );
}

function StoryWindow(props: StoryFrame) {
    const [scene, setScene] = useState(props.scene);
    const [collapsed, setCollapsed] = useState(props.collapsed ?? false);
    const [floatyOpen, setFloatyOpen] = useState(props.floaty ?? false);
    const [historyExpanded, setHistoryExpanded] = useState(props.scene === "history");
    const [panelOpen, setPanelOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(props.scene === "search");
    const [query, setQuery] = useState("");
    const [searchIndex, setSearchIndex] = useState(0);
    const [sections, setSections] = useState(
        props.scene === "section-plus"
            ? redesignSections.map((section) =>
                  section.id === "release-readiness" ? { ...section, collapsed: false } : section,
              )
            : redesignSections,
    );
    const [moviesCreated, setMoviesCreated] = useState(props.scene === "movies");
    const [creationSection, setCreationSection] = useState<
        "desktop-workflow" | "release-readiness"
    >(props.scene === "section-plus" ? "release-readiness" : "desktop-workflow");
    const [releaseItemCreated, setReleaseItemCreated] = useState(props.scene === "section-plus");
    const [draft, setDraft] = useState(
        props.scene === "section-plus"
            ? ""
            : props.scene === "movie-request"
              ? "Make a list of movies I have downloaded."
              : "Refine the sidebar search and tabs.",
    );
    const [reply, setReply] = useState("");
    const [releaseAnswer, setReleaseAnswer] = useState<string>();
    const [openedContent, setOpenedContent] = useState<string>();
    const taskLanded = [
        "landed",
        "icon-assigned",
        "working",
        "replaced",
        "leased",
        "history",
    ].includes(scene);
    const newItemId =
        scene === "movie-request"
            ? "movies"
            : creationSection === "release-readiness"
              ? "new-release-item"
              : "window-navigation";
    const newItemLabel = creationSection === "release-readiness" ? "New" : "Window navigation";
    const itemUnderHappy = scene === "request" || scene === "movie-request";
    const itemInContext = scene === "context";
    const itemBeingShaped = itemUnderHappy || itemInContext || scene === "section-plus";
    const primaryRows = itemUnderHappy
        ? redesignPrimary.flatMap((item): SidebarItem[] =>
              item.id === "happy"
                  ? [
                        item,
                        {
                            id: newItemId,
                            label: "New",
                            kind: "view",
                            depth: 1,
                            stemCell: { id: newItemId },
                        },
                    ]
                  : [item],
          )
        : redesignPrimary;
    const newItemMark =
        scene === "request" || scene === "context" || scene === "landed" || scene === "section-plus"
            ? { stemCell: { id: newItemId } }
            : creationSection === "release-readiness"
              ? redesignMarks.release
              : redesignMarks.redesign;
    const activeTaskId = taskLanded ? newItemId : "redesign";
    const [closedTabs, setClosedTabs] = useState<readonly string[]>([]);
    const mainId =
        openedContent ??
        (scene === "movies"
            ? "movies"
            : itemBeingShaped
              ? newItemId
              : scene === "morning" || scene === "search"
                ? "happy"
                : scene === "release"
                  ? "release-coordinator"
                  : activeTaskId);
    const creationShown = itemBeingShaped && mainId === newItemId;

    const open = (id: string) => {
        if (id === "muse-research" || id === "finished-research") {
            setScene("leased");
            setOpenedContent(undefined);
            return;
        }
        if (id === "blueprints" || id === "previous-blueprints" || id === "round-three") {
            setScene("replaced");
            setOpenedContent(undefined);
            return;
        }
        setOpenedContent(id);
        setClosedTabs(closedTabs.filter((closed) => closed !== id));
        setSearchOpen(false);
    };
    const begin = () => {
        setCreationSection("desktop-workflow");
        setScene("request");
        setOpenedContent(undefined);
        setDraft("");
        setFloatyOpen(false);
    };

    const taskTab: TabItem = {
        id: activeTaskId,
        label: taskLanded ? newItemLabel : "Desktop redesign",
        ...(taskLanded ? newItemMark : redesignMarks.redesign),
    };
    const titleTabs: TabItem[] = creationShown
        ? [
              taskTab,
              {
                  id: newItemId,
                  label: "New",
                  stemCell: { id: newItemId },
              },
          ]
        : scene === "movies"
          ? [
                { id: "happy", label: "Happy", ...redesignMarks.happy },
                { id: "movies", label: "Downloaded movies", ...redesignMarks.movies },
            ]
          : scene === "morning" || scene === "search"
            ? [{ id: "happy", label: "Happy", ...redesignMarks.happy }, taskTab]
            : scene === "release"
              ? [
                    {
                        id: "release-coordinator",
                        label: "Release Coordinator",
                        ...redesignMarks.release,
                    },
                    {
                        id: "integration-gates",
                        label: "Current integration gates",
                        ...redesignMarks.document,
                    },
                ]
              : [taskTab, ...redesignTabs.filter((tab) => tab.id !== "redesign")];
    if (openedContent && !titleTabs.some((tab) => tab.id === openedContent)) {
        const existing = [
            ...redesignTabs,
            ...primaryRows,
            ...redesignSections.flatMap((section) => section.items),
        ].find((item) => item.id === openedContent);
        titleTabs.push({
            id: openedContent,
            label: existing?.label ?? "Keyboard drag audit",
            icon: existing?.icon ?? "doc",
            imageMark: existing?.imageMark,
            stemCell: existing?.stemCell,
        });
    }
    const tabs = titleTabs
        .filter((tab) => !closedTabs.includes(tab.id))
        .map((tab) => (props.iconsOff ? { id: tab.id, label: tab.label } : tab));
    const activeItems: readonly WorkFloatyItem[] =
        scene === "release"
            ? [
                  {
                      id: "analytics-watcher",
                      kind: "helper",
                      status: "running",
                      label: "Analytics Watcher",
                      detail: "Watching the preview",
                      ...redesignMarks.analytics,
                  },
                  {
                      id: "qa-tester",
                      kind: "helper",
                      status: "waiting",
                      label: "QA Tester",
                      detail: "Waiting for team budget",
                      ...redesignMarks.qa,
                  },
                  {
                      id: "integration-gates",
                      kind: "artifact",
                      label: "Current integration gates",
                      ...redesignMarks.document,
                  },
              ]
            : redesignActive
                  .filter((item) => !(scene === "history" && item.id === "muse-research"))
                  .map((item) =>
                      scene === "replaced" && item.id === "blueprints"
                          ? {
                                ...item,
                                label: "Blueprint replacement",
                                detail: "Resumed from round 3",
                            }
                          : scene === "leased" && item.id === "muse-research"
                            ? { ...item, detail: "Replying in this conversation" }
                            : item,
                  );
    const floating = floatyOpen ? (
        <WorkFloaty
            open
            activeItems={activeItems}
            historyItems={redesignHistory.filter(
                (item) => item.id !== "finished-research" || scene === "history",
            )}
            historyExpanded={historyExpanded}
            onHistoryExpandedChange={setHistoryExpanded}
            onItemOpen={open}
        />
    ) : undefined;
    const movieRows: readonly WorkTranscriptRow[] = [
        {
            id: "movies-request",
            kind: "message",
            author: "Kirill",
            own: true,
            text: "Make a list of movies I have downloaded.",
        },
        {
            id: "movies-answer",
            kind: "message",
            author: "Happy",
            imageMark: redesignMarks.happy.imageMark,
            text: "I’ve made the list. You can add to it and check off what you’ve watched.",
        },
        {
            id: "movies-open",
            kind: "artifact",
            label: "Downloaded movies",
            onOpen: () => {
                setMoviesCreated(true);
                setScene("movies");
                setOpenedContent(undefined);
            },
        },
    ];
    const landedRows: readonly WorkTranscriptRow[] = [
        {
            id: "landed-request",
            kind: "message",
            author: "Kirill",
            own: true,
            text:
                creationSection === "release-readiness"
                    ? draft
                    : "Refine the sidebar search and tabs.",
        },
        {
            id: "landed-context",
            kind: "summary",
            label:
                creationSection === "release-readiness"
                    ? "Connected Happy Desktop · added under Release readiness"
                    : "Connected Happy Desktop · added under Desktop workflow",
            details:
                creationSection === "release-readiness"
                    ? ["The new item stays under Release readiness."]
                    : [
                          "Related work: Desktop redesign and Shared chat sync.",
                          "Window navigation is scoped under Desktop redesign; the blueprint continuation stays with its existing helper.",
                      ],
        },
        {
            id: "landed-answer",
            kind: "message",
            author: newItemLabel,
            ...newItemMark,
            text:
                creationSection === "release-readiness"
                    ? "I’ll shape this work with the release context and keep it in Release readiness."
                    : "I’ll keep the sidebar toggle and search in place, then bring the tabs into one shared band. The related redesign work stays linked here.",
        },
    ];
    const contextRows: readonly WorkTranscriptRow[] = [
        { id: "context-request", kind: "message", author: "Kirill", own: true, text: draft },
        {
            id: "context-summary",
            kind: "summary",
            label:
                creationSection === "release-readiness"
                    ? "Connected Happy Desktop · related: Current integration gates"
                    : "Connected Happy Desktop · related: Desktop redesign, Shared chat sync",
            details: [
                creationSection === "release-readiness"
                    ? "The new item stays under Release readiness."
                    : "The new item is placed under Desktop workflow beside the related redesign work.",
            ],
        },
        ...(creationSection === "desktop-workflow"
            ? [
                  {
                      id: "context-conflict",
                      kind: "conflict" as const,
                      label: "Redesign blueprints",
                      onOpen: () => {
                          setScene("working");
                          setOpenedContent(undefined);
                          setFloatyOpen(true);
                      },
                  },
              ]
            : []),
        {
            id: "context-placed",
            kind: "message",
            author: "Happy",
            imageMark: redesignMarks.happy.imageMark,
            text:
                creationSection === "release-readiness"
                    ? "Moved it under Release readiness."
                    : "Moved it under Desktop workflow.",
        },
    ];
    let rows =
        scene === "morning" || scene === "search"
            ? redesignMorning
            : scene === "replaced"
              ? redesignReplaced
              : scene === "leased"
                ? redesignLeased
                : scene === "landed" || scene === "icon-assigned"
                  ? landedRows
                  : scene === "release"
                    ? redesignRelease
                    : redesignWorking;
    if (openedContent === "native-integration") rows = redesignNative;
    if (openedContent === "feedback") rows = redesignMorning;
    if (openedContent === "movies-chat") rows = movieRows;
    if (scene === "movies") rows = movieRows;
    if (scene === "release")
        rows = rows.map((row) =>
            row.kind === "question"
                ? releaseAnswer
                    ? {
                          id: "answered",
                          kind: "message",
                          author: "Kirill",
                          own: true,
                          text: releaseAnswer,
                      }
                    : {
                          ...row,
                          onAnswer: (_id, answers) => setReleaseAnswer(answers.window?.join(", ")),
                      }
                : row,
        );

    const chatComposer = {
        composer: { ...redesignComposer, text: reply },
        onComposerSend: () => setReply(""),
        onComposerValueChange: setReply,
        composerPlaceholder: `Message ${titleTabs.find((tab) => tab.id === mainId)?.label ?? "Window navigation"}…`,
        composerFocusOnType: false,
    };
    const conversation = () => (
        <WorkTranscript rows={rows} floating={floating} composer={chatComposer} />
    );
    const content = creationShown ? (
        <MakeStuffView
            stage={
                scene === "context"
                    ? {
                          kind: "context",
                          rows: contextRows,
                          composer: chatComposer,
                      }
                    : {
                          kind: "request",
                          id: scene === "movie-request" ? "movies" : newItemId,
                          placement:
                              creationSection === "release-readiness" ? "section" : "automatic",
                          composer: {
                              composer: { ...redesignComposer, text: draft },
                              composerPlaceholder: "Say what this is…",
                              composerFocusOnType: false,
                              onComposerValueChange: setDraft,
                              onComposerSend: () => {
                                  if (scene === "movie-request") setMoviesCreated(true);
                                  setScene(scene === "movie-request" ? "movies" : "context");
                                  setOpenedContent(undefined);
                              },
                          },
                      }
            }
        />
    ) : mainId === "movies" ? (
        <MovieList />
    ) : mainId === "draft" || mainId === "integration-gates" || mainId === "keyboard-audit" ? (
        <ScrollArea>
            <MarkdownDocument
                text={
                    mainId === "draft"
                        ? redesignDraft
                        : "# Current integration gates\n\nNative iOS f010601a: 208 pass, five fail; hosted compilation blocked.\n\nThe current gate report stays with Native iOS integration. Finished audit reports remain in History."
                }
            />
        </ScrollArea>
    ) : mainId === "sidebar-file" ? (
        <ScrollArea>
            <CodeBlock name="Sidebar.tsx" text={redesignCode} lineNumbers />
        </ScrollArea>
    ) : (
        conversation()
    );

    const searchSections = redesignSearch.map((section) => ({
        ...section,
        rows: section.rows.filter(
            (row) =>
                row.kind === "command" &&
                `${row.title} ${row.meta ?? ""}`.toLowerCase().includes(query.toLowerCase()),
        ),
    }));
    const searchRows = searchSections.flatMap((section) => section.rows);
    return (
        <ThemeScope mode={props.dark ? "dark" : "light"}>
            <div
                onKeyDown={(event) => {
                    if (!event.metaKey || event.altKey || event.shiftKey) return;
                    if (event.key.toLowerCase() === "n" || event.key.toLowerCase() === "t") {
                        event.preventDefault();
                        begin();
                    } else if (event.key.toLowerCase() === "k") {
                        event.preventDefault();
                        setSearchOpen(!searchOpen);
                    }
                }}
                style={{
                    display: "flex",
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    contain: "layout paint",
                }}
            >
                <ConnectionShell
                    items={redesignConnections}
                    onSelect={noop}
                    selectedId="kirill-mac"
                    windowControls
                    windowFullScreen={!props.windowed}
                >
                    <AppShell
                        connectionRail
                        embedded
                        navigationChrome="integrated"
                        windowControls
                        windowFullScreen={!props.windowed}
                        sidebarCollapsible
                        sidebarCollapsedLayout="overlay"
                        sidebarCollapsed={collapsed}
                        onSidebarCollapsedChange={setCollapsed}
                        sidebarDefaultWidth={APP_SHELL_SIDEBAR_DEFAULT_WIDTH}
                        sidebarSearchAction={{
                            label: "Search work",
                            onClick: () => setSearchOpen(true),
                        }}
                        sidebarCollapsedAction={{ label: "Make Stuff (⌘N or ⌘T)", onClick: begin }}
                        sidebar={
                            <Sidebar
                                activeItemId={mainId}
                                actions={primaryRows}
                                actionsDivider
                                composeLabel="Make Stuff"
                                composeShortcut={composeShortcut}
                                composeTooltip="New item (⌘N or ⌘T)"
                                onCompose={begin}
                                itemMarkPresentation={props.iconsOff ? "none" : "default"}
                                treeConnectors={false}
                                foldControlPlacement="trailing"
                                foldControlReveal="hover"
                                onSectionAction={(id) => {
                                    if (id !== "release-readiness") return;
                                    setCreationSection("release-readiness");
                                    setReleaseItemCreated(true);
                                    setSections(
                                        sections.map((section) =>
                                            section.id === "release-readiness"
                                                ? { ...section, collapsed: false }
                                                : section,
                                        ),
                                    );
                                    setScene("section-plus");
                                    setOpenedContent(undefined);
                                    setDraft("");
                                    setFloatyOpen(false);
                                }}
                                onItemSelect={open}
                                onSectionCollapseToggle={(id) =>
                                    setSections(
                                        sections.map((section) =>
                                            section.id === id
                                                ? { ...section, collapsed: !section.collapsed }
                                                : section,
                                        ),
                                    )
                                }
                                onItemCollapseToggle={(id) =>
                                    setSections(
                                        sections.map((section) => ({
                                            ...section,
                                            items: section.items.map((item) =>
                                                item.id === id
                                                    ? { ...item, collapsed: !item.collapsed }
                                                    : item,
                                            ),
                                        })),
                                    )
                                }
                                sections={sections.map((section) =>
                                    section.id === "desktop-workflow" &&
                                    (taskLanded || itemInContext) &&
                                    creationSection === "desktop-workflow"
                                        ? {
                                              ...section,
                                              items: [
                                                  section.items[0]!,
                                                  {
                                                      id: "window-navigation",
                                                      label: itemInContext
                                                          ? "New"
                                                          : "Window navigation",
                                                      kind: "view",
                                                      depth: 1,
                                                      ...newItemMark,
                                                  },
                                                  ...section.items.slice(1),
                                              ],
                                          }
                                        : section.id === "release-readiness" && releaseItemCreated
                                          ? {
                                                ...section,
                                                items: [
                                                    {
                                                        id: "new-release-item",
                                                        label: "New",
                                                        kind: "view",
                                                        ...(creationSection ===
                                                            "release-readiness" && taskLanded
                                                            ? newItemMark
                                                            : {
                                                                  stemCell: {
                                                                      id: "new-release-item",
                                                                  },
                                                              }),
                                                    },
                                                    ...section.items,
                                                ],
                                            }
                                          : section.id === "today" && moviesCreated
                                            ? {
                                                  ...section,
                                                  collapsed: false,
                                                  items: [
                                                      {
                                                          id: "movies",
                                                          label: "Downloaded movies",
                                                          kind: "view",
                                                          ...redesignMarks.movies,
                                                      },
                                                      ...section.items,
                                                  ],
                                              }
                                            : section,
                                )}
                            />
                        }
                        panel={
                            panelOpen ? (
                                <TabbedPane
                                    activeId="sidebar-file"
                                    tabs={redesignTabs.filter((tab) => tab.id === "sidebar-file")}
                                    onSelect={noop}
                                    tabSizing="content"
                                    overflowFade
                                    size="medium"
                                >
                                    <ScrollArea>
                                        <CodeBlock
                                            name="Sidebar.tsx"
                                            text={redesignCode}
                                            lineNumbers
                                        />
                                    </ScrollArea>
                                </TabbedPane>
                            ) : undefined
                        }
                    >
                        <TabbedPane
                            activeId={mainId}
                            tabs={tabs}
                            tabSizing="content"
                            overflowFade
                            closePresentation="overlay"
                            size="medium"
                            onSelect={open}
                            onClose={(id) => {
                                setClosedTabs([...closedTabs, id]);
                                if (mainId === id)
                                    setOpenedContent(tabs.find((tab) => tab.id !== id)?.id);
                            }}
                            trailing={
                                <>
                                    <Button
                                        aria-label={
                                            floatyOpen ? "Hide task activity" : "Show task activity"
                                        }
                                        aria-expanded={floatyOpen}
                                        icon="list"
                                        iconOnly
                                        size="small"
                                        variant="ghost"
                                        onClick={() => setFloatyOpen(!floatyOpen)}
                                    />
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            display: "flex",
                                            width: 1,
                                            height: 16,
                                            background: "var(--divider)",
                                        }}
                                    />
                                    <Button
                                        aria-label={
                                            panelOpen
                                                ? "Hide secondary pane"
                                                : "Show secondary pane"
                                        }
                                        icon={panelOpen ? "panel-collapse" : "panel-expand"}
                                        iconOnly
                                        size="small"
                                        variant="ghost"
                                        onClick={() => setPanelOpen(!panelOpen)}
                                    />
                                </>
                            }
                        >
                            {content}
                        </TabbedPane>
                    </AppShell>
                </ConnectionShell>
                {props.windowed ? <TrafficLights /> : null}
                {searchOpen ? (
                    <ModalOverlay placement="top" onDismiss={() => setSearchOpen(false)}>
                        <CommandPalette
                            query={query}
                            onQueryChange={(next) => {
                                setQuery(next);
                                setSearchIndex(0);
                            }}
                            onClose={() => setSearchOpen(false)}
                            autoFocus={false}
                            onSelectionMove={(direction) =>
                                setSearchIndex(
                                    Math.max(
                                        0,
                                        Math.min(searchRows.length - 1, searchIndex + direction),
                                    ),
                                )
                            }
                            onSelectionCommit={() => {
                                const selected = searchRows[searchIndex];
                                if (selected) open(selected.id);
                            }}
                        >
                            <CommandPaletteResults
                                sections={searchSections}
                                activeIndex={searchIndex}
                                onActiveIndexChange={setSearchIndex}
                                onSelect={open}
                            />
                        </CommandPalette>
                    </ModalOverlay>
                ) : null}
            </div>
        </ThemeScope>
    );
}

export function WindowRedesignPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            title="Window redesign · a day of work"
            width={1536}
            summary="Real work and shortened conversation excerpts, organized into a proposed end-to-end workflow. Crew roles, future creation/release steps and movie content are storyboard fixtures."
        >
            {frames.flatMap((frame) =>
                [
                    ...desktopWindows,
                    ...(frame.scene === "search" ? [{ width: 720, height: 640 }] : []),
                ].map((windowSize) => (
                    <FullScreenSpecimen
                        key={`${frame.id}-${windowSize.width}`}
                        number={frame.id.split("-")[0]!}
                        label={frame.label}
                        detail={`${windowSize.width} × ${windowSize.height} · one space · right-side disclosure · ${frame.iconsOff ? "no icon lanes" : "entity marks"}`}
                        screen={`${frame.id}-${windowSize.width}x${windowSize.height}`}
                        window={windowSize}
                    >
                        <StoryWindow {...frame} />
                    </FullScreenSpecimen>
                )),
            )}
            {(
                [
                    {
                        id: "11a-tidy-before",
                        scene: "before",
                        label: "Before tidy · 109 real rows",
                    },
                    {
                        id: "11b-tidy-after",
                        scene: "after",
                        label: "After tidy · grouped by topic",
                    },
                    { id: "11c-tidy-diff", scene: "diff", label: "Tidy diff · every changed row" },
                ] as const
            ).map((frame) => (
                <FullScreenSpecimen
                    key={frame.id}
                    number={frame.id.split("-")[0]!}
                    label={frame.label}
                    detail="1440 × 900 · real supplied snapshot · flat topic sections"
                    screen={`${frame.id}-1440x900`}
                    window={{ width: 1440, height: 900 }}
                >
                    <TidyStoryWindow scene={frame.scene} />
                </FullScreenSpecimen>
            ))}
        </ComponentPage>
    );
}
