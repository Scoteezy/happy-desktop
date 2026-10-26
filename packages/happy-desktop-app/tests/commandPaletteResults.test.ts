import { expect, it } from "vitest";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentGroupId,
    HappyAgentProjectGroup,
    HappyAgentProjectId,
    HappyAgentRecentTabMemory,
    HappyAgentSessionId,
    HappyAgentTask,
    HappyAgentTaskId,
    HappyAgentWorktreeGroup,
    HappyAgentWorktreeId,
} from "happy-desktop-state";
import { APP_SHORTCUTS } from "../sources/appShortcuts";
import { commandPaletteResults, type CommandPaletteInput } from "../sources/commandPaletteResults";
import { happyAgentSettingsCategoryExists } from "../sources/views/AppHappyAgentSettingsView";

const NOW = 1_764_000_000_000;
const MINUTE = 60_000;
const PHOTO = "data:image/png;base64,iVBORw0KGgo=";

const conversation = (id: string, title: string, minutesAgo: number) => ({
    id,
    title,
    subtitle: "",
    updatedAt: NOW - minutesAgo * MINUTE,
    activity: "idle" as const,
    participants: [],
});

const task = (
    id: string,
    name: string,
    minutesAgo: number,
    options: { subtasks?: HappyAgentTask["subtasks"]; archived?: boolean } = {},
): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name,
    conversation: conversation(`ses_${id}`, name, minutesAgo),
    subtasks: options.subtasks ?? [],
    owner: null,
    path: `/Users/happy/Tasks/${id}`,
    displayPath: `~/Tasks/${id}`,
    createdAt: 1,
    archived: options.archived === true,
    canArchive: true,
    membership: { orderKey: id },
});

const NOTES = {
    workspaceId: "ws_release" as HappyAgentWorktreeId,
    path: "/Users/happy/Tasks/release",
    // The subtask changed last of everything here.
    conversation: conversation("ses_notes", "Write the changelog", 1),
    subtasks: [],
};

const TASKS: readonly HappyAgentTask[] = [
    task("cmdk", "Fix Cmd K search", 5),
    task("release", "Release desktop", 40, { subtasks: [NOTES] }),
];

// Archived, never joined: found by name, listed under the sidebar's work.
const OLD_TASK = task("search_old", "Old search experiment", 2, { archived: true });

const BOTS: readonly HappyAgentBot[] = [
    {
        id: "bot_happy" as HappyAgentBotId,
        workspaceId: "ws_happy" as HappyAgentWorktreeId,
        conversation: conversation("ses_happy", "Happy", 120),
        name: "Happy",
        username: "happy",
        orderKey: "a",
        path: "/Users/happy/Bots/happy",
        displayPath: "~/Bots/happy",
        avatar: { url: PHOTO, thumbhash: "h" },
        subtasks: [],
    },
];

// A project whose folder name contains "search", holding a chat whose title does not.
const PROJECTS = [
    {
        id: "prj_infra" as HappyAgentProjectId,
        path: "/Users/happy/search-infra",
        displayPath: "~/search-infra",
        name: "search-infra",
        orderKey: "a",
        kind: "regular",
        lifecycle: { phase: "ready" },
        activity: "idle",
        updatedAt: NOW - 10 * MINUTE,
        avatar: { url: PHOTO },
        conversations: [conversation("ses_index", "Index rebuild", 10)],
        worktrees: [] as HappyAgentWorktreeGroup[],
    },
] as unknown as readonly HappyAgentProjectGroup[];

const visit = (groupId: string, sessionId: string): HappyAgentRecentTabMemory => ({
    type: "session",
    groupId: groupId as HappyAgentGroupId,
    sessionId: sessionId as HappyAgentSessionId,
});

const input = (overrides: Partial<CommandPaletteInput> = {}): CommandPaletteInput => ({
    happyAgentId: "local",
    projects: PROJECTS,
    bots: BOTS,
    tasks: TASKS,
    taskDirectory: [...TASKS, OLD_TASK],
    sidebarMode: { kind: "classic", botsHidden: new Set(), projectsHidden: false },
    visits: [],
    archivedSessions: [],
    tabs: [],
    sessionCreateAvailable: false,
    workspaceCreateAvailable: false,
    taskCreateAvailable: false,
    query: "",
    themeMode: "system",
    scrollbarVisibility: "automatic",
    linkOpenPlacement: "panel",
    titleShimmerEnabled: false,
    ...overrides,
});

const ids = (result: ReturnType<typeof commandPaletteResults>) => result.rows.map((row) => row.id);

it("opens on the sidebar's work, last opened first, then other work; never a subtask", () => {
    const result = commandPaletteResults(
        input({
            chatId: "ses_cmdk",
            // The reader went to Happy, then to the project, then back to the task.
            visits: [
                visit("ws_cmdk", "ses_cmdk"),
                visit("prj_infra", "ses_index"),
                visit("ws_happy", "ses_happy"),
            ],
        }),
    );
    expect(result.sections.map((section) => section.id)).toEqual(["recent"]);
    expect(ids(result)).toEqual([
        // The sidebar's rows: the task on screen is left out, the visited ones
        // lead in the order they were visited, the rest follow by last change.
        "workspace:prj_infra",
        "bot:bot_happy",
        "task:release",
        // Other work: the project chat the reader opened, then a task they
        // never joined.
        "chat:ses_index",
        "task:search_old",
    ]);
    expect(ids(result)).not.toContain("chat:ses_notes");
});

it("puts the sidebar first: a hidden bot or a project left out of the sidebar sinks", () => {
    const result = commandPaletteResults(
        input({
            sidebarMode: {
                kind: "classic",
                botsHidden: new Set(["bot_happy"]),
                projectsHidden: true,
            },
            visits: [visit("ws_happy", "ses_happy"), visit("prj_infra", "ses_index")],
        }),
    );
    expect(ids(result).slice(0, 2)).toEqual(["task:cmdk", "task:release"]);
    expect(result.rows.find((row) => row.id === "bot:bot_happy")).toMatchObject({
        meta: "Hidden bot",
    });
});

it("wears the sidebar's marks: pictures in rounded tiles, the tasks glyph in its tile", () => {
    const rows = commandPaletteResults(input()).rows;
    expect(rows.find((row) => row.id === "bot:bot_happy")).toMatchObject({
        glyph: { kind: "avatar", initials: "H", imageUrl: PHOTO },
    });
    expect(rows.find((row) => row.id === "workspace:prj_infra")).toMatchObject({
        glyph: { kind: "avatar", initials: "S", imageUrl: PHOTO },
    });
    expect(rows.find((row) => row.id === "task:cmdk")).toMatchObject({
        glyph: { kind: "avatar", icon: "tasks" },
    });
});

it("searches titles only, sidebar work first, and lets a subtask's title find its parent", () => {
    const result = commandPaletteResults(input({ query: "search" }));
    expect(result.sections.map((section) => section.id)).toEqual(["work"]);
    expect(ids(result)).toEqual([
        "workspace:prj_infra",
        "task:cmdk",
        // Archived and never joined, so below the sidebar's own work.
        "task:search_old",
    ]);
    // The project's chat lives in a "search" folder but is not called that.
    expect(ids(result)).not.toContain("chat:ses_index");

    const parent = commandPaletteResults(input({ query: "changelog" }));
    expect(ids(parent)).toEqual(["task:release"]);
});

it("ranks a recently opened match above an older one of the same quality", () => {
    const result = commandPaletteResults(
        input({ query: "e", visits: [visit("ws_release", "ses_notes")] }),
    );
    expect(ids(result)[0]).toBe("task:release");
});

it("lists the spaces sidebar's rows first, under their names and marks", () => {
    const result = commandPaletteResults(
        input({
            sidebarMode: {
                kind: "spaces",
                spaces: [
                    {
                        id: "spc_release",
                        title: "Ship 0.4.90",
                        glyph: { kind: "mark", imageMark: { src: "rocket.png" } },
                        target: { kind: "task", id: "release" },
                        destination: { kind: "chat", groupId: "ws_release", chatId: "ses_release" },
                    },
                    {
                        id: "spc_list",
                        title: "Movies",
                        glyph: { kind: "icon", name: "doc" },
                        target: { kind: "surface" },
                        destination: { kind: "surface", surfaceId: "srf_movies" },
                    },
                ],
            },
        }),
    );
    expect(ids(result).slice(0, 2)).toEqual(["task:release", "space:spc_list"]);
    expect(result.rows[0]).toMatchObject({
        title: "Ship 0.4.90",
        glyph: { kind: "mark", imageMark: { src: "rocket.png" } },
    });
    expect(result.rows[1]).toMatchObject({
        command: { kind: "surfaceOpen", surfaceId: "srf_movies" },
    });
});

it("answers “fold sidebar” with the sidebar's own action and chord", () => {
    const result = commandPaletteResults(
        input({ query: "fold sidebar", sidebar: { hidden: false }, panel: { open: false } }),
    );
    expect(ids(result)).toEqual(["action:sidebar-toggle"]);
    expect(result.rows[0]).toMatchObject({
        title: "Hide sidebar",
        shortcut: { caps: APP_SHORTCUTS.sidebarToggle.caps },
        command: { kind: "sidebarHiddenUpdate", hidden: true },
    });
    const shown = commandPaletteResults(input({ query: "sidebar", sidebar: { hidden: true } }));
    expect(shown.rows[0]).toMatchObject({
        title: "Show sidebar",
        command: { kind: "sidebarHiddenUpdate", hidden: false },
    });
    // A window that keeps no fold of its own offers none.
    expect(commandPaletteResults(input({ query: "fold sidebar" })).rows).toEqual([]);
});

it("lists a section with a better answer first", () => {
    // "Hide sidebar" starts with what was typed; the task only contains it.
    const result = commandPaletteResults(
        input({
            query: "hide",
            tasks: [...TASKS, task("hidden", "Why tasks hide on reload", 1)],
            sidebar: { hidden: false },
        }),
    );
    expect(result.sections.map((section) => section.id)).toEqual(["actions", "work", "settings"]);
});

it.each([false, true])(
    "searching voice opens the Voice settings route (experimental opt-in: %s)",
    (experimentalFeaturesEnabled) => {
        const result = commandPaletteResults(input({ projects: [], query: "voice" }));
        const voice = result.rows.find(
            (row) => row.kind === "command" && row.id === "settings:voice",
        );
        expect(voice).toMatchObject({
            title: "Settings › Voice",
            glyph: { kind: "icon", name: "call" },
            command: { kind: "settingsSectionOpen", section: "voice" },
        });
        expect(happyAgentSettingsCategoryExists("voice")).toBe(true);
        expect(
            result.rows.some((row) => row.kind === "command" && row.id === "settings:experimental"),
        ).toBe(false);
        void experimentalFeaturesEnabled;
    },
);
