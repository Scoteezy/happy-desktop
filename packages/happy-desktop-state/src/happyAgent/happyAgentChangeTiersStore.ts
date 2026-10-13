import {
    HAPPY_AGENT_CHANGE_TIERS_MAX,
    type HappyAgentChangeTier,
    type HappyAgentChangeTierId,
} from "./happyAgentChangeTiers.js";
import type { HappyAgentProjectId } from "./happyAgentTypes.js";

/**
 * Every project's change tiers, and the project whose tiers are being edited.
 *
 * Tiers belong to a project rather than to one checkout: which files count as
 * secondary is a fact about how the repository is laid out — its tests are
 * named the same way in every worktree — so every worktree of a project lists
 * its changes with the same tiers.
 */
export interface HappyAgentChangeTiersSnapshot {
    /** Each project's tiers in match order. A project absent here has none. */
    readonly projects: ReadonlyMap<HappyAgentProjectId, readonly HappyAgentChangeTier[]>;
    /** The project whose tiers the editor is open on, if it is open. */
    readonly editingProjectId?: HappyAgentProjectId;
}

/** Which way a tier moves in the match order. */
export type HappyAgentChangeTierMoveDirection = "earlier" | "later";

/**
 * What the store tells its owner. Only a project's tiers changing is reported:
 * that is what is worth keeping, while opening and closing the editor is not.
 */
export type HappyAgentChangeTiersOutput = {
    readonly type: "tiersUpdated";
    readonly projectId: HappyAgentProjectId;
    readonly tiers: readonly HappyAgentChangeTier[];
};

export interface HappyAgentChangeTiersStore {
    get(): HappyAgentChangeTiersSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens the tier editor on one project, replacing any other it was open on. */
    editorOpen(projectId: HappyAgentProjectId): void;
    editorClose(): void;
    /** Appends a new, unnamed tier with no patterns, which therefore claims nothing yet. */
    tierAdd(projectId: HappyAgentProjectId): void;
    tierRemove(projectId: HappyAgentProjectId, tierId: HappyAgentChangeTierId): void;
    tierNameUpdate(
        projectId: HappyAgentProjectId,
        tierId: HappyAgentChangeTierId,
        name: string,
    ): void;
    tierPatternsUpdate(
        projectId: HappyAgentProjectId,
        tierId: HappyAgentChangeTierId,
        patterns: readonly string[],
    ): void;
    /** Moves a tier one place in the match order; the first tier that matches a file wins. */
    tierMove(
        projectId: HappyAgentProjectId,
        tierId: HappyAgentChangeTierId,
        direction: HappyAgentChangeTierMoveDirection,
    ): void;
    /** Folds a tier's section shut in the listing, or opens it. */
    tierCollapsedUpdate(
        projectId: HappyAgentProjectId,
        tierId: HappyAgentChangeTierId,
        collapsed: boolean,
    ): void;
}

export interface HappyAgentChangeTiersStoreInput {
    /** What the owner remembered from an earlier run. */
    readonly initial?: ReadonlyMap<HappyAgentProjectId, readonly HappyAgentChangeTier[]>;
    readonly output?: (event: HappyAgentChangeTiersOutput) => void;
}

/** Tier ids only need to be unique within this window's record. */
function tierIdCreate(): HappyAgentChangeTierId {
    return `tier_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` as HappyAgentChangeTierId;
}

const TIERS_NONE: readonly HappyAgentChangeTier[] = [];

/**
 * Creates the change tiers store. It opens nothing: what was remembered is
 * handed in, and every change to a project's tiers is handed back out through
 * `output` for the owner to keep.
 */
export function happyAgentChangeTiersStoreCreate(
    input: HappyAgentChangeTiersStoreInput = {},
): HappyAgentChangeTiersStore {
    const listeners = new Set<() => void>();
    const output = input.output ?? (() => undefined);
    let snapshot: HappyAgentChangeTiersSnapshot = { projects: input.initial ?? new Map() };

    const publish = (next: HappyAgentChangeTiersSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const tiersOf = (projectId: HappyAgentProjectId): readonly HappyAgentChangeTier[] =>
        snapshot.projects.get(projectId) ?? TIERS_NONE;

    const tiersWrite = (
        projectId: HappyAgentProjectId,
        tiers: readonly HappyAgentChangeTier[],
    ): void => {
        const projects = new Map(snapshot.projects);
        if (tiers.length === 0) projects.delete(projectId);
        else projects.set(projectId, tiers);
        publish({ ...snapshot, projects });
        output({ type: "tiersUpdated", projectId, tiers });
    };

    /** Replaces one tier, publishing nothing when the change changes nothing. */
    const tierChange = (
        projectId: HappyAgentProjectId,
        tierId: HappyAgentChangeTierId,
        change: (tier: HappyAgentChangeTier) => HappyAgentChangeTier,
    ): void => {
        const tiers = tiersOf(projectId);
        const index = tiers.findIndex((tier) => tier.id === tierId);
        if (index === -1) return;
        const next = change(tiers[index]!);
        if (next === tiers[index]) return;
        tiersWrite(
            projectId,
            tiers.map((tier, position) => (position === index ? next : tier)),
        );
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        editorOpen(projectId) {
            if (snapshot.editingProjectId === projectId) return;
            publish({ ...snapshot, editingProjectId: projectId });
        },
        editorClose() {
            if (snapshot.editingProjectId === undefined) return;
            publish({ projects: snapshot.projects });
        },
        tierAdd(projectId) {
            const tiers = tiersOf(projectId);
            if (tiers.length >= HAPPY_AGENT_CHANGE_TIERS_MAX) return;
            tiersWrite(projectId, [
                ...tiers,
                { id: tierIdCreate(), name: "", patterns: [], collapsed: false },
            ]);
        },
        tierRemove(projectId, tierId) {
            const tiers = tiersOf(projectId);
            const remaining = tiers.filter((tier) => tier.id !== tierId);
            if (remaining.length === tiers.length) return;
            tiersWrite(projectId, remaining);
        },
        tierNameUpdate(projectId, tierId, name) {
            tierChange(projectId, tierId, (tier) =>
                tier.name === name ? tier : { ...tier, name },
            );
        },
        tierPatternsUpdate(projectId, tierId, patterns) {
            tierChange(projectId, tierId, (tier) =>
                tier.patterns.length === patterns.length &&
                tier.patterns.every((pattern, index) => pattern === patterns[index])
                    ? tier
                    : { ...tier, patterns: [...patterns] },
            );
        },
        tierMove(projectId, tierId, direction) {
            const tiers = tiersOf(projectId);
            const index = tiers.findIndex((tier) => tier.id === tierId);
            const target = direction === "earlier" ? index - 1 : index + 1;
            if (index === -1 || target < 0 || target >= tiers.length) return;
            const next = [...tiers];
            next[index] = tiers[target]!;
            next[target] = tiers[index]!;
            tiersWrite(projectId, next);
        },
        tierCollapsedUpdate(projectId, tierId, collapsed) {
            tierChange(projectId, tierId, (tier) =>
                tier.collapsed === collapsed ? tier : { ...tier, collapsed },
            );
        },
    };
}
