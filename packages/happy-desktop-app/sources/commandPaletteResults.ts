import type {
    HappyAgentBot,
    HappyAgentBotSubtask,
    HappyAgentFileTabKind,
    HappyAgentProjectGroup,
    HappyAgentSessionSummary,
    HappyAgentTask,
    HappyAgentWorktreeGroup,
    HappyAgentLinkOpenPlacement,
    ScrollbarVisibility,
    ThemeMode,
} from "happy-desktop-state";
import { happyAgentSessionGroupIdOf } from "happy-desktop-state";
import type { CommandPaletteRowEmphasis, CommandShortcut, IconName } from "happy-desktop-ui";
import { APP_SHORTCUTS } from "./appShortcuts";

/**
 * What the command palette offers, derived from the snapshots the window is
 * already reading.
 *
 * Nothing here is stored. The palette holds a query and a highlight; every row
 * under them is recomputed from live state at render time, so a session that
 * finishes, a checkout that appears, or a setting changed from the row itself
 * is reflected without the palette asking anyone for fresh data.
 *
 * The transform is deliberately a plain function over explicit inputs rather
 * than a hook: the same action rows fill the palette's answers and the
 * held-Command preview, and neither of those two surfaces should be able to
 * offer an act the other does not.
 */

/**
 * The leading mark on a row: a chosen glyph, the thing's own picture, or the
 * product's own mark for the kind of news the row is.
 *
 * One lane with one occupant, decided here rather than by whichever of several
 * optional fields happened to be set. An update wears the orange arrow because
 * it is an update, not because a row somewhere named that glyph.
 */
export type CommandPaletteGlyph =
    | { readonly kind: "icon"; readonly name: IconName }
    | { readonly kind: "avatar"; readonly initials: string; readonly imageUrl?: string }
    | { readonly kind: "emphasis"; readonly emphasis: CommandPaletteRowEmphasis };

/**
 * What committing a row does. It is data rather than a callback because the
 * surface that owns navigation, the workspace stores, and the update is the one
 * that must perform it; this module decides what is offered, not what happens.
 */
export type CommandPaletteCommand =
    | {
          readonly kind: "chatOpen";
          readonly happyAgentId: string;
          readonly groupId: string;
          readonly chatId: string;
          /** A closed session has to be restored before it can be addressed. */
          readonly archived: boolean;
      }
    | { readonly kind: "workspaceOpen"; readonly happyAgentId: string; readonly groupId: string }
    | {
          readonly kind: "fileOpen";
          readonly happyAgentId: string;
          readonly groupId: string;
          readonly path: string;
          readonly fileKind: HappyAgentFileTabKind;
      }
    | { readonly kind: "sessionCreate" }
    | { readonly kind: "workspaceCreate" }
    | { readonly kind: "taskCreate" }
    | { readonly kind: "settingsOpen" }
    | { readonly kind: "settingsSectionOpen"; readonly section: string }
    | { readonly kind: "updateApply" }
    /** Folds the window's sidebar away or brings it back, to the state the row names. */
    | { readonly kind: "sidebarHiddenUpdate"; readonly hidden: boolean }
    | { readonly kind: "panelToggle" };

/** A row that goes somewhere or does something, and then closes the palette. */
export interface CommandPaletteCommandRow {
    readonly kind: "command";
    readonly id: string;
    readonly title: string;
    /** The quiet second line: where a chat lives, what a file's path is. */
    readonly meta?: string;
    readonly glyph: CommandPaletteGlyph;
    /** The chord that does the same thing outside the palette, shown as a cap. */
    readonly shortcut?: CommandShortcut;
    readonly command: CommandPaletteCommand;
}

/**
 * A setting the reader can change without leaving the palette. The row carries
 * the setting's current value and the value committing it would move to, so the
 * surface renders the real control and dispatches one typed action rather than
 * deciding what "next" means for each kind of control.
 */
export type CommandPaletteSettingRow =
    | (CommandPaletteSettingRowBase & {
          readonly setting: "themeMode";
          readonly control: {
              readonly kind: "segmented";
              readonly value: ThemeMode;
              readonly segments: readonly { readonly value: ThemeMode; readonly label: string }[];
              readonly next: ThemeMode;
          };
      })
    | (CommandPaletteSettingRowBase & {
          readonly setting: "scrollbarVisibility";
          readonly control: {
              readonly kind: "segmented";
              readonly value: ScrollbarVisibility;
              readonly segments: readonly {
                  readonly value: ScrollbarVisibility;
                  readonly label: string;
              }[];
              readonly next: ScrollbarVisibility;
          };
      })
    | (CommandPaletteSettingRowBase & {
          readonly setting: "linkOpenPlacement";
          readonly control: {
              readonly kind: "segmented";
              readonly value: HappyAgentLinkOpenPlacement;
              readonly segments: readonly {
                  readonly value: HappyAgentLinkOpenPlacement;
                  readonly label: string;
              }[];
              readonly next: HappyAgentLinkOpenPlacement;
          };
      })
    | (CommandPaletteSettingRowBase & {
          readonly setting: "titleShimmer";
          readonly control: {
              readonly kind: "switch";
              readonly checked: boolean;
              readonly next: boolean;
          };
      });

export interface CommandPaletteSettingRowBase {
    readonly kind: "setting";
    readonly id: string;
    /** The settings surface's own wording, so the palette row is that row. */
    readonly label: string;
    /** The glyph in the row's leading lane, beside every other row's. */
    readonly icon: IconName;
    readonly description: string;
    /** The control's DOM id, which the row's label points at. */
    readonly controlId: string;
}

export type CommandPaletteRow = CommandPaletteCommandRow | CommandPaletteSettingRow;

/** The sections the palette offers, in the fixed order it lists them. */
export type CommandPaletteSectionId =
    | "update"
    | "recent"
    | "chats"
    | "workspaces"
    | "tabs"
    | "actions"
    | "settings";

export interface CommandPaletteSection {
    readonly id: CommandPaletteSectionId;
    /** The caption over the rows; absent for a section that is one piece of news. */
    readonly label?: string;
    readonly rows: readonly CommandPaletteRow[];
}

export interface CommandPaletteResults {
    readonly sections: readonly CommandPaletteSection[];
    /**
     * Every offered row, in the order the sections show them. This is the index
     * space the palette's highlight addresses: the reader arrows through one
     * list, not through sections.
     */
    readonly rows: readonly CommandPaletteRow[];
}

/** One tab of the open workspace, as the surface that owns the strip states it. */
export type CommandPaletteTab =
    | { readonly kind: "session"; readonly id: string; readonly title: string }
    | {
          readonly kind: "file";
          readonly id: string;
          readonly path: string;
          readonly fileKind: HappyAgentFileTabKind;
          /** The glyph the strip gave this file, derived from its type. */
          readonly icon: IconName;
      };

/**
 * Where the reader is and what they could do from there.
 *
 * It is stated apart from the query and the settings values because the
 * held-Command preview offers the same actions without either: it is not a
 * search, and it changes nothing, so it must not have to read the theme to say
 * what a reader could do next.
 */
export interface CommandPaletteContext {
    /** The machine whose work the palette lists: the one the address names. */
    readonly happyAgentId: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    /**
     * The bots and tasks the sidebar lists. Their conversations are chats like
     * any project's — the ones a reader is usually working in — so they are
     * searched and suggested by their own names.
     */
    readonly bots: readonly HappyAgentBot[];
    readonly tasks: readonly HappyAgentTask[];
    /** The addressed project or worktree, when the address names one. */
    readonly groupId?: string;
    /**
     * The chat on screen. It is the one chat a reader never needs offered back
     * to them, so the empty palette leaves it out of what was worked on last.
     */
    readonly chatId?: string;
    /** Sessions the host still holds after taking them out of their strips. */
    readonly archivedSessions: readonly HappyAgentSessionSummary[];
    /** The open workspace's tabs, in the order its strip shows them. */
    readonly tabs: readonly CommandPaletteTab[];
    /**
     * The update this window can apply right now. Supplied only once it is
     * downloaded and there is something to apply it with, because a row that
     * offers to update and then does nothing is worse than no row.
     */
    readonly updateReady?: { readonly action: "refresh" | "restart"; readonly version?: string };
    /** Whether a new chat can be started where the reader currently is. */
    readonly sessionCreateAvailable: boolean;
    /** Whether a new workspace can be made in the addressed project. */
    readonly workspaceCreateAvailable: boolean;
    /** Whether a new task can be made on the addressed Happy Agent. */
    readonly taskCreateAvailable: boolean;
    /**
     * The window's fold of its left side, when this window owns one. Absent,
     * nothing outside the shell can fold it, so no row offers to.
     */
    readonly sidebar?: { readonly hidden: boolean };
    /**
     * The open workspace's secondary pane, when it has one to show: a checkout
     * still being prepared has nothing to put in it.
     */
    readonly panel?: { readonly open: boolean };
}

export interface CommandPaletteInput extends CommandPaletteContext {
    readonly query: string;
    readonly themeMode: ThemeMode;
    readonly themeModes?: readonly ThemeMode[];
    readonly scrollbarVisibility: ScrollbarVisibility;
    readonly linkOpenPlacement: HappyAgentLinkOpenPlacement;
    readonly titleShimmerEnabled: boolean;
}

/** How many rows a typed query's section shows before it stops. */
const SECTION_LIMIT = 6;
/** How many recent chats the empty palette suggests. */
const RECENT_LIMIT = 8;
/** How many actions the held-Command preview shows. */
export const COMMAND_PALETTE_PREVIEW_LIMIT = 6;

const THEME_SEGMENTS: readonly { readonly value: ThemeMode; readonly label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "midnight", label: "Midnight" },
    { value: "custom", label: "Custom" },
];

const SCROLLBAR_SEGMENTS: readonly {
    readonly value: ScrollbarVisibility;
    readonly label: string;
}[] = [
    { value: "automatic", label: "Automatic" },
    { value: "always", label: "Always visible" },
];

const LINK_OPEN_SEGMENTS: readonly {
    readonly value: HappyAgentLinkOpenPlacement;
    readonly label: string;
}[] = [
    { value: "panel", label: "Side panel" },
    { value: "browser", label: "Browser" },
];

/**
 * The settings destinations the palette can only send the reader to.
 *
 * The four switchable settings above are absent here: they are answered in the
 * palette itself. These are the ones whose control needs a catalog, an account,
 * or a whole page behind it, so the honest offer is the page. Their section ids
 * are the ones `HAPPY_AGENT_SETTINGS_CATEGORIES` addresses.
 */
const SETTINGS_JUMPS: readonly {
    readonly id: string;
    readonly title: string;
    readonly section: string;
    /** The category as the settings window names it, so it can be searched for. */
    readonly sectionLabel: string;
    readonly icon: IconName;
    /** Extra words this row answers to, beyond its own title. */
    readonly keywords: string;
}[] = [
    {
        id: "settings:general",
        title: "Settings › General",
        section: "general",
        sectionLabel: "General",
        icon: "settings",
        keywords: "appearance theme scrollbars new sessions",
    },
    {
        id: "settings:sharing",
        title: "Settings › Sharing",
        section: "sharing",
        sectionLabel: "Sharing",
        icon: "files",
        keywords: "join tasks shared docs todo lists calendars autojoin",
    },
    {
        id: "settings:account",
        title: "Settings › Account",
        section: "account",
        sectionLabel: "Account",
        icon: "users",
        keywords: "profile name email photo happy account connect disconnect workos",
    },
    {
        id: "settings:experimental",
        title: "Settings › Experimental",
        section: "experimental",
        sectionLabel: "Experimental",
        icon: "zap",
        keywords: "spaces sidebar stem cells batch notes inbox",
    },
    {
        id: "settings:file-tiers",
        title: "Settings › File tiers",
        section: "file-tiers",
        sectionLabel: "File tiers",
        icon: "file-diff",
        keywords: "changes tiers tests glob patterns secondary files groups",
    },
    {
        id: "settings:instructions",
        title: "Settings › Instructions",
        section: "instructions",
        sectionLabel: "Instructions",
        icon: "doc",
        keywords: "agents.md security.md",
    },
    {
        id: "settings:secrets",
        title: "Settings › Secrets",
        section: "secrets",
        sectionLabel: "Secrets",
        icon: "lock",
        keywords: "environment variables credentials tokens api keys",
    },
    {
        id: "settings:providers",
        title: "Settings › Providers",
        section: "providers",
        sectionLabel: "Providers",
        icon: "globe",
        keywords: "models accounts keys",
    },
    {
        id: "settings:usage",
        title: "Settings › Usage",
        section: "usage",
        sectionLabel: "Usage",
        icon: "zap",
        keywords: "spend limits plan",
    },
    {
        id: "settings:mobile-access",
        title: "Settings › Mobile access",
        section: "mobile-access",
        sectionLabel: "Mobile access",
        icon: "mobile",
        keywords: "phone pairing happy mobile",
    },
    {
        id: "settings:debug",
        title: "Settings › Dev tools",
        section: "debug",
        sectionLabel: "Dev tools",
        icon: "code",
        keywords: "inspector profiler debug log",
    },
    {
        id: "settings:voice",
        title: "Settings › Voice",
        section: "voice",
        sectionLabel: "Voice",
        icon: "call",
        keywords: "voice gpt-live call controller model prompt",
    },
    {
        id: "settings:default-model",
        title: "Default model",
        section: "general",
        sectionLabel: "General",
        icon: "settings",
        keywords:
            "chosen from the models the enabled providers offer new sessions reasoning effort thinking",
    },
    {
        id: "settings:permission-mode",
        title: "Default access mode",
        section: "general",
        sectionLabel: "General",
        icon: "settings",
        keywords: "how much of the machine a new session may touch without asking permissions",
    },
];

/** The second line under a chat: the workspace it belongs to. */
function groupMeta(project: HappyAgentProjectGroup, worktree?: HappyAgentWorktreeGroup): string {
    return worktree ? `${project.name} / ${worktree.name}` : project.name;
}

/**
 * The project a group id belongs to, and the worktree when the id is one.
 *
 * The window has the same lookup for its sidebar; this module keeps its own so
 * it stays a plain transform of its inputs and can be read on its own.
 */
function groupFind(
    projects: readonly HappyAgentProjectGroup[],
    groupId: string | undefined,
):
    | { readonly project: HappyAgentProjectGroup; readonly worktree?: HappyAgentWorktreeGroup }
    | undefined {
    if (groupId === undefined) return undefined;
    for (const project of projects) {
        if (project.id === groupId) return { project };
        for (const worktree of project.worktrees)
            if (worktree.id === groupId) return { project, worktree };
    }
    return undefined;
}

/**
 * How well a piece of text answers the query, lower being better, `undefined`
 * being not at all.
 *
 * Three ranks and no scoring library: a title that starts with what was typed,
 * a word inside it that does, and finally the text merely containing it. That
 * ordering is the whole of what a reader expects from a palette, and anything
 * cleverer would have to explain itself every time it was wrong.
 */
function textRank(text: string, query: string): number | undefined {
    const haystack = text.toLowerCase();
    if (haystack.startsWith(query)) return 0;
    let index = haystack.indexOf(query);
    while (index > 0) {
        if (!/[a-z0-9]/.test(haystack[index - 1])) return 1;
        index = haystack.indexOf(query, index + 1);
    }
    return haystack.includes(query) ? 2 : undefined;
}

/**
 * How well text answers a query of several words typed in any order: each word
 * has to be found in it, and the text ranks as its weakest word does — never as
 * a prefix, which only the whole query in its own order can be.
 */
function wordsRank(text: string, words: readonly string[]): number | undefined {
    if (words.length < 2) return undefined;
    let worst = 1;
    for (const word of words) {
        const rank = textRank(text, word);
        if (rank === undefined) return undefined;
        worst = Math.max(worst, rank);
    }
    return worst;
}

/**
 * A row's rank over its title and its supporting text. Anything that is not the
 * title is demoted below every title match, so a chat whose name contains the
 * query is never pushed under one whose folder happens to.
 */
const SECONDARY_PENALTY = 3;

function rowRank(
    query: string,
    title: string,
    ...secondary: (string | undefined)[]
): number | undefined {
    const words = query.split(/\s+/u).filter((word) => word.length > 0);
    const primary = textRank(title, query) ?? wordsRank(title, words);
    if (primary === 0) return 0;
    let best = primary;
    const demote = (rank: number | undefined) => {
        if (rank === undefined) return;
        const demoted = rank + SECONDARY_PENALTY;
        if (best === undefined || demoted < best) best = demoted;
    };
    const supporting = secondary.filter((text): text is string => text !== undefined);
    for (const text of supporting) demote(textRank(text, query));
    // The words of one query may be split between the title and what the row
    // answers to: "fold sidebar" is one keyword of Hide sidebar and one word of
    // its title.
    if (supporting.length > 0) demote(wordsRank([title, ...supporting].join(" "), words));
    return best;
}

/** A row offered by a match, carried with what orders it against its peers. */
interface Ranked {
    readonly row: CommandPaletteRow;
    readonly rank: number;
    /** Epoch milliseconds of last activity, for the entities that have one. */
    readonly updatedAt: number;
}

/**
 * Ranked rows in the order the palette lists them: best match first, most
 * recently active first among equals, and otherwise exactly the order they were
 * offered in — `sort` is stable, so nothing shuffles between keystrokes.
 */
function ranked(rows: readonly Ranked[], limit: number): CommandPaletteRow[] {
    return [...rows]
        .sort((left, right) => left.rank - right.rank || right.updatedAt - left.updatedAt)
        .slice(0, limit)
        .map((entry) => entry.row);
}

/** Up to two initials from a name, the way the sidebar marks a face without a picture. */
function initialsOf(name: string): string {
    return name
        .trim()
        .split(/\s+/u)
        .filter((word) => word.length > 0)
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join("");
}

/** A task's face, as its sidebar row wears it: the owner's, or the tasks glyph. */
function taskGlyph(task: HappyAgentTask): CommandPaletteGlyph {
    const owner = task.owner;
    const initials = owner?.name === undefined ? "" : initialsOf(owner.name);
    if (owner === null || (initials === "" && owner.avatar === undefined))
        return { kind: "icon", name: "tasks" };
    return {
        kind: "avatar",
        initials,
        ...(owner.avatar ? { imageUrl: owner.avatar.url } : {}),
    };
}

/**
 * One chat the palette can open, wherever it is listed, with the moment it last
 * changed. Closed sessions are marked: they are found by name, but the reader
 * closed them, so they are never suggested.
 */
interface ChatOffer {
    readonly row: CommandPaletteCommandRow;
    readonly updatedAt: number;
    readonly archived: boolean;
}

/**
 * Every chat on this machine, as the sidebar lists them: each bot's one
 * conversation, each task's, every subtask under either, the projects' and
 * their worktrees' chats, and then the sessions the host still holds after
 * they were closed. A chat is offered once, under the first of those it is
 * found in.
 *
 * Recency is the conversation's own `updatedAt`: the newest content in the
 * session, as the host reports it. Happy Agent states no separate moment for
 * the reader's own last message, so this is the closest signal there is. It
 * also moves when an agent replies, which is when a chat needs looking at again.
 */
function chatOffers(context: CommandPaletteContext): ChatOffer[] {
    const offers: ChatOffer[] = [];
    const offered = new Set<string>();
    const push = (offer: {
        readonly chatId: string;
        readonly groupId: string;
        readonly title: string;
        readonly meta: string;
        readonly glyph: CommandPaletteGlyph;
        readonly updatedAt: number;
        readonly archived?: boolean;
    }) => {
        if (offered.has(offer.chatId)) return;
        offered.add(offer.chatId);
        const archived = offer.archived === true;
        offers.push({
            archived,
            updatedAt: offer.updatedAt,
            row: {
                kind: "command",
                id: `chat:${offer.chatId}`,
                title: offer.title,
                meta: offer.meta,
                glyph: offer.glyph,
                command: {
                    kind: "chatOpen",
                    happyAgentId: context.happyAgentId,
                    groupId: offer.groupId,
                    chatId: offer.chatId,
                    archived,
                },
            },
        });
    };
    // A subtask names the work it was split from, the way it nests under it.
    const subtasksPush = (subtasks: readonly HappyAgentBotSubtask[], parent: string) => {
        for (const subtask of subtasks) {
            push({
                chatId: subtask.conversation.id,
                groupId: subtask.workspaceId,
                title: subtask.conversation.title,
                meta: parent,
                glyph: { kind: "icon", name: "chat" },
                updatedAt: subtask.conversation.updatedAt,
            });
            subtasksPush(subtask.subtasks, subtask.conversation.title);
        }
    };
    for (const bot of context.bots) {
        push({
            chatId: bot.conversation.id,
            groupId: bot.workspaceId,
            title: bot.name,
            meta: "Bot",
            glyph: {
                kind: "avatar",
                initials: initialsOf(bot.name),
                ...(bot.avatar ? { imageUrl: bot.avatar.url } : {}),
            },
            updatedAt: bot.conversation.updatedAt,
        });
        subtasksPush(bot.subtasks, bot.name);
    }
    for (const task of context.tasks) {
        push({
            chatId: task.conversation.id,
            groupId: task.workspaceId,
            title: task.name,
            meta: task.owner?.name ? `Task · ${task.owner.name}` : "Task",
            glyph: taskGlyph(task),
            updatedAt: task.conversation.updatedAt,
        });
        subtasksPush(task.subtasks, task.name);
    }
    for (const project of context.projects) {
        for (const summary of project.conversations)
            push({
                chatId: summary.id,
                groupId: project.id,
                title: summary.title,
                meta: groupMeta(project),
                glyph: { kind: "icon", name: "chat" },
                updatedAt: summary.updatedAt,
            });
        for (const worktree of project.worktrees)
            for (const summary of worktree.conversations)
                push({
                    chatId: summary.id,
                    groupId: worktree.id,
                    title: summary.title,
                    meta: groupMeta(project, worktree),
                    glyph: { kind: "icon", name: "chat" },
                    updatedAt: summary.updatedAt,
                });
    }
    for (const session of context.archivedSessions) {
        // A delegated chat has no row of its own anywhere else in the product;
        // it is opened by the session that runs it, so it is not offered here.
        if (session.parentSessionId !== undefined) continue;
        const groupId = happyAgentSessionGroupIdOf(session);
        const owner = groupFind(context.projects, groupId);
        if (!owner) continue;
        push({
            chatId: session.id,
            groupId,
            title: session.title?.trim() || `Session ${session.id.slice(0, 8)}`,
            meta: groupMeta(owner.project, owner.worktree),
            // Closed sessions wear the recents glyph, exactly as the
            // workspace's own history menu marks them.
            glyph: { kind: "icon", name: "history" },
            updatedAt: session.lastMessageAt ?? session.updatedAt,
            archived: true,
        });
    }
    return offers;
}

/**
 * Every chat whose name answers the query. Only the name is searched: where a
 * chat lives is a workspace, and the workspace answers for itself in its own
 * section, so a folder's name never fills this one with every chat inside it.
 */
function chatRows(input: CommandPaletteInput, offers: readonly ChatOffer[]): Ranked[] {
    const query = input.query.trim().toLowerCase();
    return offers.flatMap((offer) => {
        const rank = rowRank(query, offer.row.title);
        return rank === undefined ? [] : [{ rank, updatedAt: offer.updatedAt, row: offer.row }];
    });
}

/** Every project and worktree, named the way the sidebar names them. */
function workspaceRows(input: CommandPaletteInput): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const rows: Ranked[] = [];
    for (const project of input.projects) {
        const rank = rowRank(query, project.name);
        if (rank !== undefined)
            rows.push({
                rank,
                updatedAt: project.updatedAt,
                row: {
                    kind: "command",
                    id: `workspace:${project.id}`,
                    title: project.name,
                    meta: project.displayPath,
                    glyph:
                        // The catch-all project has no remote to draw a picture
                        // from and an "H" plaque would read as one more
                        // repository, so it wears a house — as in the sidebar.
                        project.kind === "home"
                            ? { kind: "icon", name: "home" }
                            : {
                                  kind: "avatar",
                                  initials: project.name.slice(0, 1).toUpperCase(),
                                  ...(project.avatar ? { imageUrl: project.avatar.url } : {}),
                              },
                    command: {
                        kind: "workspaceOpen",
                        happyAgentId: input.happyAgentId,
                        groupId: project.id,
                    },
                },
            });
        for (const worktree of project.worktrees) {
            const worktreeRank = rowRank(query, worktree.name, project.name);
            if (worktreeRank === undefined) continue;
            rows.push({
                rank: worktreeRank,
                updatedAt: worktree.updatedAt,
                row: {
                    kind: "command",
                    id: `workspace:${worktree.id}`,
                    title: worktree.name,
                    meta: project.name,
                    glyph: { kind: "icon", name: "branch" },
                    command: {
                        kind: "workspaceOpen",
                        happyAgentId: input.happyAgentId,
                        groupId: worktree.id,
                    },
                },
            });
        }
    }
    return rows;
}

/**
 * The open workspace's own strip, so a file already open is one keystroke away.
 * A chat tab is already offered under Chats by its name, and offering the same
 * chat twice would only push the files down.
 */
function tabRows(input: CommandPaletteInput, chats: ReadonlySet<string>): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const groupId = input.groupId;
    if (groupId === undefined) return [];
    const rows: Ranked[] = [];
    for (const tab of input.tabs) {
        if (tab.kind === "session") {
            if (chats.has(`chat:${tab.id}`)) continue;
            const rank = rowRank(query, tab.title);
            if (rank === undefined) continue;
            rows.push({
                rank,
                updatedAt: 0,
                row: {
                    kind: "command",
                    id: `tab:${tab.id}`,
                    title: tab.title,
                    meta: "Open tab",
                    glyph: { kind: "icon", name: "chat" },
                    command: {
                        kind: "chatOpen",
                        happyAgentId: input.happyAgentId,
                        groupId,
                        chatId: tab.id,
                        archived: false,
                    },
                },
            });
            continue;
        }
        const name = tab.path.split("/").at(-1) ?? tab.path;
        const rank = rowRank(query, name, tab.path);
        if (rank === undefined) continue;
        rows.push({
            rank,
            updatedAt: 0,
            row: {
                kind: "command",
                id: `tab:${tab.id}`,
                title: name,
                meta: tab.path,
                glyph: { kind: "icon", name: tab.icon },
                command: {
                    kind: "fileOpen",
                    happyAgentId: input.happyAgentId,
                    groupId,
                    path: tab.path,
                    fileKind: tab.fileKind,
                },
            },
        });
    }
    return rows;
}

/** The four settings the palette answers in place, as their own settings rows. */
function settingRows(input: CommandPaletteInput): CommandPaletteSettingRow[] {
    const themeSegments = THEME_SEGMENTS.filter(
        (segment) => input.themeModes?.includes(segment.value) ?? true,
    );
    const themeIndex = themeSegments.findIndex((segment) => segment.value === input.themeMode);
    const scrollbarIndex = SCROLLBAR_SEGMENTS.findIndex(
        (segment) => segment.value === input.scrollbarVisibility,
    );
    const linkOpenIndex = LINK_OPEN_SEGMENTS.findIndex(
        (segment) => segment.value === input.linkOpenPlacement,
    );
    return [
        {
            kind: "setting",
            setting: "themeMode",
            id: "setting:theme",
            icon: "sun",
            label: "Theme",
            description: "Applies to this window immediately",
            controlId: "happy-agent-palette-theme",
            control: {
                kind: "segmented",
                value: input.themeMode,
                segments: themeSegments,
                next: themeSegments[(themeIndex + 1) % themeSegments.length].value,
            },
        },
        {
            kind: "setting",
            setting: "scrollbarVisibility",
            id: "setting:scrollbars",
            icon: "settings",
            label: "Scrollbars",
            description: "Automatic hides two seconds after user scrolling stops",
            controlId: "happy-agent-palette-scrollbars",
            control: {
                kind: "segmented",
                value: input.scrollbarVisibility,
                segments: SCROLLBAR_SEGMENTS,
                next: SCROLLBAR_SEGMENTS[(scrollbarIndex + 1) % SCROLLBAR_SEGMENTS.length].value,
            },
        },
        {
            kind: "setting",
            setting: "linkOpenPlacement",
            id: "setting:link-open",
            icon: "globe",
            label: "Open links in",
            description:
                "Side panel keeps the page beside the conversation; Browser hands it to the machine's own",
            controlId: "happy-agent-palette-link-open",
            control: {
                kind: "segmented",
                value: input.linkOpenPlacement,
                segments: LINK_OPEN_SEGMENTS,
                next: LINK_OPEN_SEGMENTS[(linkOpenIndex + 1) % LINK_OPEN_SEGMENTS.length].value,
            },
        },
        {
            kind: "setting",
            setting: "titleShimmer",
            id: "setting:title-shimmer",
            icon: "zap",
            label: "Shimmer active titles",
            description: "Animates running session, project, and workspace names",
            controlId: "happy-agent-palette-title-shimmer",
            control: {
                kind: "switch",
                checked: input.titleShimmerEnabled,
                next: !input.titleShimmerEnabled,
            },
        },
    ];
}

/**
 * Where in the settings window each of the four answerable settings is found.
 *
 * A reader looking for the theme may well type the section they remember it
 * being under rather than its name, so every settings row answers to its own
 * section as well — behind its label and description, which is why the words
 * are stated here rather than folded into either.
 */
const SETTINGS_INLINE_SECTIONS: Record<CommandPaletteSettingRow["setting"], string> = {
    linkOpenPlacement: "Settings General Links",
    scrollbarVisibility: "Settings General Appearance",
    themeMode: "Settings General Appearance",
    titleShimmer: "Settings General Appearance",
};

/** Settings the palette can change in place, then the pages it can only open. */
function settingsSectionRows(input: CommandPaletteInput): Ranked[] {
    const query = input.query.trim().toLowerCase();
    const rows: Ranked[] = [];
    for (const row of settingRows(input)) {
        const rank = rowRank(
            query,
            row.label,
            row.description,
            SETTINGS_INLINE_SECTIONS[row.setting],
        );
        if (rank === undefined) continue;
        rows.push({ rank, updatedAt: 0, row });
    }
    for (const jump of SETTINGS_JUMPS) {
        // The section the row leads to is searchable too: "general" has to
        // reach the rows that live under General, not only the page itself.
        const rank = rowRank(query, jump.title, jump.sectionLabel, jump.keywords);
        if (rank === undefined) continue;
        rows.push({
            rank,
            updatedAt: 0,
            row: {
                kind: "command",
                id: jump.id,
                title: jump.title,
                glyph: { kind: "icon", name: jump.icon },
                command: { kind: "settingsSectionOpen", section: jump.section },
            },
        });
    }
    return rows;
}

/** The row that applies a downloaded update, offered only when one is waiting. */
function updateRow(context: CommandPaletteContext): CommandPaletteCommandRow | undefined {
    const update = context.updateReady;
    if (!update) return undefined;
    return {
        kind: "command",
        id: "action:update",
        title: "Update Happy",
        meta: update.version
            ? `Version ${update.version}`
            : update.action === "restart"
              ? "Restart to finish"
              : "Reload to finish",
        // The same mark the sidebar footer gives a waiting update, so the news
        // reads the same wherever this window offers it.
        glyph: { kind: "emphasis", emphasis: "update" },
        command: { kind: "updateApply" },
    };
}

/** One thing the window can do, with the words it answers to beyond its title. */
interface ActionOffer {
    readonly row: CommandPaletteCommandRow;
    /** What a reader might call the act instead: "fold" for hiding the sidebar. */
    readonly keywords?: string;
}

/**
 * The things the window can do from anywhere, each with the chord that does
 * the same outside the palette. They are found by typing rather than listed on
 * an empty palette: the palette is a search, and its actions are answers to it.
 * The update joins them only under a typed query or on the held-Command card:
 * the empty palette already gives it the top row, and offering it twice would
 * be the palette shouting.
 */
function actionOffers(
    context: CommandPaletteContext,
    update?: CommandPaletteCommandRow,
): ActionOffer[] {
    const offers: ActionOffer[] = [];
    if (context.sessionCreateAvailable)
        offers.push({
            row: {
                kind: "command",
                id: "action:session-create",
                title: "New chat",
                glyph: { kind: "icon", name: "plus" },
                shortcut: APP_SHORTCUTS.sessionCreate,
                command: { kind: "sessionCreate" },
            },
            keywords: "session conversation start",
        });
    if (context.taskCreateAvailable)
        offers.push({
            row: {
                kind: "command",
                id: "action:task-create",
                title: "New task",
                glyph: { kind: "icon", name: "tasks" },
                shortcut: APP_SHORTCUTS.taskCreate,
                command: { kind: "taskCreate" },
            },
            keywords: "create start work",
        });
    if (context.workspaceCreateAvailable)
        offers.push({
            row: {
                kind: "command",
                id: "action:workspace-create",
                title: "New workspace",
                glyph: { kind: "icon", name: "branch" },
                command: { kind: "workspaceCreate" },
            },
            keywords: "worktree branch checkout",
        });
    // The shell's own words for its toggles, so the row reads as the button.
    const sidebar = context.sidebar;
    if (sidebar)
        offers.push({
            row: {
                kind: "command",
                id: "action:sidebar-toggle",
                title: sidebar.hidden ? "Show sidebar" : "Hide sidebar",
                glyph: {
                    kind: "icon",
                    name: sidebar.hidden ? "sidebar-expand" : "sidebar-collapse",
                },
                shortcut: APP_SHORTCUTS.sidebarToggle,
                command: { kind: "sidebarHiddenUpdate", hidden: !sidebar.hidden },
            },
            keywords: "fold unfold collapse expand toggle navigation left",
        });
    const panel = context.panel;
    if (panel)
        offers.push({
            row: {
                kind: "command",
                id: "action:panel-toggle",
                title: panel.open ? "Hide secondary pane" : "Show secondary pane",
                glyph: { kind: "icon", name: panel.open ? "panel-collapse" : "panel-expand" },
                shortcut: APP_SHORTCUTS.panelToggle,
                command: { kind: "panelToggle" },
            },
            keywords: "fold unfold collapse expand toggle side panel right files terminal changes",
        });
    offers.push({
        row: {
            kind: "command",
            id: "action:settings",
            title: "Open settings",
            glyph: { kind: "icon", name: "settings" },
            command: { kind: "settingsOpen" },
        },
        keywords: "preferences",
    });
    if (update) offers.push({ row: update, keywords: "upgrade restart reload version" });
    return offers;
}

/**
 * What the empty palette offers: the update if one is waiting, then the chats
 * this machine was last working in, newest first, wherever they are listed —
 * tasks and bots as much as projects. The chat on screen is left out: it is
 * already where the reader is, and the row Enter would run should go somewhere.
 *
 * A machine with nothing worked on yet would leave the palette blank, so it
 * offers the window's actions instead.
 */
export function commandPaletteSuggestionSections(
    context: CommandPaletteContext,
): CommandPaletteSection[] {
    const recent = chatOffers(context)
        .filter((offer) => !offer.archived && offer.row.id !== `chat:${context.chatId}`)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, RECENT_LIMIT)
        .map((offer) => offer.row);
    const update = updateRow(context);
    return [
        ...(update ? [{ id: "update" as const, rows: [update] }] : []),
        recent.length > 0
            ? { id: "recent" as const, label: "Recent", rows: recent }
            : {
                  id: "actions" as const,
                  label: "Actions",
                  rows: actionOffers(context).map((offer) => offer.row),
              },
    ];
}

/**
 * What holding Command shows: the waiting update and the window's actions,
 * each wearing the chord that runs it. Discovering chords is that card's whole
 * purpose, so it offers the same acts a typed query finds, in the same words,
 * and none of the chats, which have no chord to teach.
 */
export function commandPaletteQuickActionRows(
    context: CommandPaletteContext,
): CommandPaletteCommandRow[] {
    const update = updateRow(context);
    return [...(update ? [update] : []), ...actionOffers(context).map((offer) => offer.row)];
}

/**
 * Everything the palette is currently offering, as the flat list its highlight
 * addresses and as the sections it draws.
 *
 * An empty query answers with what was worked on last; anything typed searches
 * the whole machine, because the moment a reader types they are looking for
 * something they know the name of rather than something near where they are
 * standing.
 */
export function commandPaletteResults(input: CommandPaletteInput): CommandPaletteResults {
    const query = input.query.trim().toLowerCase();
    const sections: CommandPaletteSection[] = [];
    if (query.length === 0) {
        for (const section of commandPaletteSuggestionSections(input))
            if (section.rows.length > 0) sections.push(section);
    } else {
        const chats = chatOffers(input);
        const offered: readonly {
            readonly id: CommandPaletteSectionId;
            readonly label: string;
            readonly rows: readonly CommandPaletteRow[];
        }[] = [
            { id: "chats", label: "Chats", rows: ranked(chatRows(input, chats), SECTION_LIMIT) },
            {
                id: "workspaces",
                label: "Workspaces",
                rows: ranked(workspaceRows(input), SECTION_LIMIT),
            },
            {
                id: "tabs",
                label: "Tabs",
                rows: ranked(
                    tabRows(input, new Set(chats.map((offer) => offer.row.id))),
                    SECTION_LIMIT,
                ),
            },
            // Actions come before settings because they are few and each one is
            // something a reader meant to do, while settings are the long tail:
            // typing "new" is someone asking for a new chat, not for the page
            // where the model a new session starts with is chosen.
            {
                id: "actions",
                label: "Actions",
                rows: ranked(
                    actionOffers(input, updateRow(input)).flatMap((offer) => {
                        const rank = rowRank(
                            query,
                            offer.row.title,
                            offer.row.meta,
                            offer.keywords,
                        );
                        return rank === undefined ? [] : [{ rank, updatedAt: 0, row: offer.row }];
                    }),
                    SECTION_LIMIT,
                ),
            },
            {
                id: "settings",
                label: "Settings",
                rows: ranked(settingsSectionRows(input), SECTION_LIMIT),
            },
        ];
        for (const section of offered)
            if (section.rows.length > 0)
                sections.push({ id: section.id, label: section.label, rows: section.rows });
    }
    return { sections, rows: sections.flatMap((section) => section.rows) };
}

/**
 * Where the highlight lands after an arrow key. It wraps, because a list this
 * short is a ring: pressing Down at the bottom is a reader asking for the top.
 */
export function commandPaletteIndexMove(
    current: number,
    direction: 1 | -1,
    length: number,
): number {
    if (length === 0) return 0;
    const clamped = Math.min(Math.max(current, 0), length - 1);
    return (clamped + direction + length) % length;
}

/**
 * The row a highlight names. The index is clamped rather than trusted, because
 * the list narrows under it as the query is typed.
 */
export function commandPaletteRowAt(
    results: CommandPaletteResults,
    index: number,
): CommandPaletteRow | undefined {
    if (results.rows.length === 0) return undefined;
    return results.rows[Math.min(Math.max(index, 0), results.rows.length - 1)];
}
