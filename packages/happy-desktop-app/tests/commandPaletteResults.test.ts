import { expect, it } from "vitest";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentProjectGroup,
    HappyAgentProjectId,
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
    subtasks: HappyAgentTask["subtasks"] = [],
): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name,
    conversation: conversation(`ses_${id}`, name, minutesAgo),
    subtasks,
    owner: null,
    path: `/Users/happy/Tasks/${id}`,
    displayPath: `~/Tasks/${id}`,
    createdAt: 1,
    archived: false,
    canArchive: true,
    membership: { orderKey: id },
});

const TASKS: readonly HappyAgentTask[] = [
    task("cmdk", "Fix Cmd K search", 5),
    task("release", "Release desktop", 40, [
        {
            workspaceId: "ws_release" as HappyAgentWorktreeId,
            path: "/Users/happy/Tasks/release",
            conversation: conversation("ses_notes", "Write the release notes", 20),
            subtasks: [],
        },
    ]),
];

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
        subtasks: [],
    },
];

// A project and a worktree whose folder names contain "search", holding chats
// whose own titles do not.
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
        updatedAt: NOW,
        conversations: [conversation("ses_index", "Index rebuild", 10)],
        worktrees: [
            {
                id: "wt_rows" as HappyAgentWorktreeId,
                name: "search-results",
                conversations: [conversation("ses_rows", "Palette rows", 60 * 24)],
            } as unknown as HappyAgentWorktreeGroup,
        ],
    },
] as unknown as readonly HappyAgentProjectGroup[];

const input = (overrides: Partial<CommandPaletteInput> = {}): CommandPaletteInput => ({
    happyAgentId: "local",
    projects: PROJECTS,
    bots: BOTS,
    tasks: TASKS,
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

it("opens on the chats worked in last, newest first, across tasks, bots, and projects", () => {
    const result = commandPaletteResults(input({ chatId: "ses_cmdk" }));
    expect(result.sections.map((section) => section.id)).toEqual(["recent"]);
    // The chat on screen is left out; the rest are in order of their last change.
    expect(result.rows.map((row) => row.kind === "command" && row.title)).toEqual([
        "Index rebuild",
        "Write the release notes",
        "Release desktop",
        "Happy",
        "Palette rows",
    ]);
    expect(result.rows[1]).toMatchObject({
        meta: "Release desktop",
        command: {
            kind: "chatOpen",
            groupId: "ws_release",
            chatId: "ses_notes",
            archived: false,
        },
    });
});

it("finds tasks by their titles, and never a chat only because of its folder", () => {
    const result = commandPaletteResults(input({ query: "search" }));
    const chats = result.sections.find((section) => section.id === "chats");
    expect(chats?.rows.map((row) => row.id)).toEqual(["chat:ses_cmdk"]);
    expect(chats?.rows[0]).toMatchObject({
        title: "Fix Cmd K search",
        meta: "Task",
        command: { kind: "chatOpen", groupId: "ws_cmdk", chatId: "ses_cmdk" },
    });
    // The folders themselves still answer, as workspaces.
    expect(
        result.sections.find((section) => section.id === "workspaces")?.rows.map((row) => row.id),
    ).toEqual(["workspace:prj_infra", "workspace:wt_rows"]);
});

it("matches the words of a title in any order", () => {
    const result = commandPaletteResults(input({ query: "notes release" }));
    expect(result.rows[0]).toMatchObject({ id: "chat:ses_notes" });
});

it("answers “fold sidebar” with the sidebar's own action and chord", () => {
    const result = commandPaletteResults(
        input({ query: "fold sidebar", sidebar: { hidden: false }, panel: { open: false } }),
    );
    expect(result.rows.map((row) => row.id)).toEqual(["action:sidebar-toggle"]);
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
    },
);
