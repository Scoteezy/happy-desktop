import {
    HAPPY_AGENT_CHANGE_TIERS_MAX,
    type HappyAgentChangeTier,
    type HappyAgentChangeTierId,
} from "./happyAgentChangeTiers.js";
import type { HappyAgentGroupId, HappyAgentProjectId } from "./happyAgentTypes.js";
import type { HappyAgentFileLayout, HappyAgentFileScope } from "./happyAgentWorkspaceStore.js";

/**
 * How one project or worktree is being looked at, as opposed to what it holds.
 *
 * Every field here is a decision about the view rather than about the work, so
 * none of it is ever read back from a Happy Agent: two people opening the same checkout
 * arrange it differently, and a machine has no opinion about how wide someone
 * wants their panel.
 *
 * Each field is optional because a record is written the moment any one of them
 * is chosen. A checkout whose panel has been widened but whose file listing was
 * never touched has said nothing about the listing, and must keep taking the
 * product's default rather than being pinned to whatever the default happened to
 * be on the day the panel moved.
 */
export interface HappyAgentGroupViewPreferences {
    readonly fileScope?: HappyAgentFileScope;
    readonly fileLayout?: HappyAgentFileLayout;
    /** Right panel width in CSS pixels, as the reader last left it. */
    readonly panelWidth?: number;
    /**
     * Directories the reader opened in this checkout's listing, by full path,
     * and the ones they closed. Two lists rather than one, because the listing
     * opens part way on its own: "absent" has to mean "nothing was said about
     * it" so that a folder somebody deliberately shut does not reopen the next
     * time the panel is drawn.
     *
     * A path only means something inside the checkout it was read from, which
     * is exactly why these live per group rather than per window.
     */
    readonly fileTreeOpened?: readonly string[];
    readonly fileTreeClosed?: readonly string[];
}

/**
 * How a whole project is looked at, whichever of its checkouts is open.
 *
 * Kept apart from the per-checkout record because these describe the
 * repository rather than one working tree of it: the files a reader counts as
 * secondary are named the same way in every worktree.
 */
export interface HappyAgentProjectViewPreferences {
    /** Sections the Changes listing splits secondary files into, in match order. */
    readonly changeTiers?: readonly HappyAgentChangeTier[];
}

/**
 * Every checkout this window remembers the arrangement of, by group id, and
 * every project, by project id.
 *
 * Keyed per group because that is the thing being arranged: a wide panel suits
 * the checkout whose diffs are wide, and forcing that width onto every other
 * project would make it a setting rather than a memory of what someone did here.
 */
export interface HappyAgentViewPreferencesDocument {
    readonly groups: Readonly<Record<string, HappyAgentGroupViewPreferences>>;
    readonly projects: Readonly<Record<string, HappyAgentProjectViewPreferences>>;
}

/**
 * Where those arrangements are kept. The state package never names a storage
 * medium: the host supplies one, and omitting it keeps the arrangements alive
 * for this window's lifetime only.
 */
export interface HappyAgentViewPreferencesPersistence {
    read(): HappyAgentViewPreferencesDocument | undefined;
    write(document: HappyAgentViewPreferencesDocument): void;
}

/** Wider than the widest panel and narrower than the narrowest; anything else is not a width. */
const PANEL_WIDTH_MIN = 120;
const PANEL_WIDTH_MAX = 8000;

/**
 * How many checkouts one window will remember the arrangement of. Far past the
 * number anybody has open, and small enough that a record nobody prunes stays a
 * record rather than a heap.
 */
const GROUP_MAX = 256;

/**
 * How many directory decisions one checkout keeps. Far more folders than anyone
 * opens by hand in a sitting, and bounded so a listing walked end to end leaves
 * a record rather than a transcript. The newest decisions are the ones kept:
 * they are the arrangement the reader is actually looking at.
 */
const FILE_TREE_PATH_MAX = 512;

/** How many projects one window keeps tiers for; see `GROUP_MAX`. */
const PROJECT_MAX = 256;

/** Bounds on one stored tier, so a record read back stays a record. */
const TIER_PATTERNS_MAX = 128;
const TIER_TEXT_MAX = 512;

function scopeParse(value: unknown): HappyAgentFileScope | undefined {
    return value === "changed" || value === "all" ? value : undefined;
}

function layoutParse(value: unknown): HappyAgentFileLayout | undefined {
    return value === "flat" || value === "tree" ? value : undefined;
}

/**
 * A stored run of directory paths, trimmed to the ones this version will use.
 *
 * An empty run says nothing and is dropped, so a reader who reopens everything
 * they closed stops carrying a record of having closed it.
 */
function pathsParse(value: unknown): readonly string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return pathsBound(
        value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    );
}

/** The newest decisions that fit, or nothing when there are none left to keep. */
function pathsBound(paths: readonly string[] | undefined): readonly string[] | undefined {
    if (paths === undefined || paths.length === 0) return undefined;
    return paths.length > FILE_TREE_PATH_MAX ? paths.slice(-FILE_TREE_PATH_MAX) : paths;
}

function panelWidthParse(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    const width = Math.round(value);
    return width >= PANEL_WIDTH_MIN && width <= PANEL_WIDTH_MAX ? width : undefined;
}

/**
 * One stored record read back as arrangements this version understands.
 *
 * Anything unrecognised is dropped field by field rather than record by record,
 * because these fields are independent decisions that were never written as a
 * set: a panel width this version cannot use says nothing about whether the file
 * scope beside it is still good. Dropping a field means the product's default,
 * which is always a safe thing to be wrong about.
 */
function groupParse(value: unknown): HappyAgentGroupViewPreferences | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const raw = value as Record<string, unknown>;
    const fileScope = scopeParse(raw.fileScope);
    const fileLayout = layoutParse(raw.fileLayout);
    const panelWidth = panelWidthParse(raw.panelWidth);
    const fileTreeOpened = pathsParse(raw.fileTreeOpened);
    const fileTreeClosed = pathsParse(raw.fileTreeClosed);
    const group: HappyAgentGroupViewPreferences = {
        ...(fileScope === undefined ? {} : { fileScope }),
        ...(fileLayout === undefined ? {} : { fileLayout }),
        ...(panelWidth === undefined ? {} : { panelWidth }),
        ...(fileTreeOpened === undefined ? {} : { fileTreeOpened }),
        ...(fileTreeClosed === undefined ? {} : { fileTreeClosed }),
    };
    return groupSaysSomething(group) ? group : undefined;
}

/** Whether a record still holds a decision, or has become an empty entry to drop. */
function groupSaysSomething(group: HappyAgentGroupViewPreferences): boolean {
    return (
        group.fileScope !== undefined ||
        group.fileLayout !== undefined ||
        group.panelWidth !== undefined ||
        group.fileTreeOpened !== undefined ||
        group.fileTreeClosed !== undefined
    );
}

/**
 * One stored tier, or nothing when it is not one. Unlike the arrangement
 * fields, a tier's parts are read as a set: a tier without an id cannot be
 * edited, and one without its patterns would claim nothing.
 */
function tierParse(value: unknown): HappyAgentChangeTier | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const raw = value as Record<string, unknown>;
    if (typeof raw.id !== "string" || raw.id.length === 0 || raw.id.length > TIER_TEXT_MAX)
        return undefined;
    if (typeof raw.name !== "string" || !Array.isArray(raw.patterns)) return undefined;
    return {
        id: raw.id as HappyAgentChangeTierId,
        name: raw.name.slice(0, TIER_TEXT_MAX),
        patterns: raw.patterns
            .filter((pattern): pattern is string => typeof pattern === "string")
            .slice(0, TIER_PATTERNS_MAX)
            .map((pattern) => pattern.slice(0, TIER_TEXT_MAX)),
        collapsed: raw.collapsed === true,
    };
}

function projectParse(value: unknown): HappyAgentProjectViewPreferences | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const raw = value as Record<string, unknown>;
    if (!Array.isArray(raw.changeTiers)) return undefined;
    const seen = new Set<string>();
    const changeTiers = raw.changeTiers.flatMap((entry) => {
        const tier = tierParse(entry);
        if (tier === undefined || seen.has(tier.id)) return [];
        seen.add(tier.id);
        return [tier];
    });
    return changeTiers.length === 0
        ? undefined
        : { changeTiers: changeTiers.slice(0, HAPPY_AGENT_CHANGE_TIERS_MAX) };
}

export function happyAgentViewPreferencesParse(
    value: unknown,
): HappyAgentViewPreferencesDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const groups = (value as { groups?: unknown }).groups;
    if (typeof groups !== "object" || groups === null) return undefined;
    const parsed: Record<string, HappyAgentGroupViewPreferences> = {};
    for (const [id, entry] of Object.entries(groups as Record<string, unknown>)) {
        const group = groupParse(entry);
        if (group) parsed[id] = group;
    }
    // Absent in a record written before projects were remembered at all, which
    // is the same as no project having said anything.
    const projects = (value as { projects?: unknown }).projects;
    const parsedProjects: Record<string, HappyAgentProjectViewPreferences> = {};
    if (typeof projects === "object" && projects !== null)
        for (const [id, entry] of Object.entries(projects as Record<string, unknown>)) {
            const project = projectParse(entry);
            if (project) parsedProjects[id] = project;
        }
    return { groups: parsed, projects: parsedProjects };
}

/**
 * The remembered arrangements with one group's changed.
 *
 * A group that now says nothing is dropped rather than kept as an empty record,
 * so a reader who puts everything back the way it started leaves no trace — and
 * the cap trims the least recently written arrangements rather than refusing to
 * record a new one, because the newest arrangement is the one somebody just made.
 */
export function happyAgentViewPreferencesUpdate(
    document: HappyAgentViewPreferencesDocument,
    groupId: HappyAgentGroupId,
    change: HappyAgentGroupViewPreferences,
): HappyAgentViewPreferencesDocument {
    const current = document.groups[groupId] ?? {};
    const merged: HappyAgentGroupViewPreferences = { ...current, ...change };
    // The directory decisions are bounded on the way in as well as on the way
    // out: a listing walked end to end would otherwise hand storage a record
    // the size of the checkout, and only trimming it on the next read.
    const opened = pathsBound(merged.fileTreeOpened);
    const closed = pathsBound(merged.fileTreeClosed);
    const next: HappyAgentGroupViewPreferences = {
        ...(merged.fileScope === undefined ? {} : { fileScope: merged.fileScope }),
        ...(merged.fileLayout === undefined ? {} : { fileLayout: merged.fileLayout }),
        ...(merged.panelWidth === undefined ? {} : { panelWidth: merged.panelWidth }),
        ...(opened === undefined ? {} : { fileTreeOpened: opened }),
        ...(closed === undefined ? {} : { fileTreeClosed: closed }),
    };
    const groups: Record<string, HappyAgentGroupViewPreferences> = { ...document.groups };
    if (!groupSaysSomething(next)) delete groups[groupId];
    else groups[groupId] = next;
    const ids = Object.keys(groups);
    if (ids.length > GROUP_MAX)
        for (const id of ids.slice(0, ids.length - GROUP_MAX)) delete groups[id];
    return { groups, projects: document.projects };
}

/**
 * The remembered arrangements with one project's tiers replaced. A project left
 * with no tiers is dropped, and the cap lets go of the least recently written
 * project first, exactly as it does for checkouts.
 */
export function happyAgentViewPreferencesProjectTiersUpdate(
    document: HappyAgentViewPreferencesDocument,
    projectId: HappyAgentProjectId,
    changeTiers: readonly HappyAgentChangeTier[],
): HappyAgentViewPreferencesDocument {
    const projects: Record<string, HappyAgentProjectViewPreferences> = { ...document.projects };
    // Deleted first so a rewritten project moves to the newest end of the record.
    delete projects[projectId];
    if (changeTiers.length > 0) projects[projectId] = { changeTiers };
    const ids = Object.keys(projects);
    if (ids.length > PROJECT_MAX)
        for (const id of ids.slice(0, ids.length - PROJECT_MAX)) delete projects[id];
    return { groups: document.groups, projects };
}

export const HAPPY_AGENT_VIEW_PREFERENCES_EMPTY: HappyAgentViewPreferencesDocument = {
    groups: {},
    projects: {},
};
