import {
    HAPPY_AGENT_CHANGE_TIERS_MAX,
    type HappyAgentChangeTier,
    type HappyAgentChangeTierId,
} from "./happyAgentChangeTiers.js";

/**
 * The change tiers every Changes listing is split by.
 *
 * One list for every project, node, and folder rather than one per project:
 * which files count as secondary is a habit of the reader's — snapshots and
 * fixtures are named the same way wherever they work — and a tier whose
 * patterns match nothing in a listing is simply not shown there.
 */
export interface HappyAgentChangeTiersSnapshot {
    /** The tiers in match order: a changed file goes to the first one that matches it. */
    readonly tiers: readonly HappyAgentChangeTier[];
}

/** Which way a tier moves in the match order. */
export type HappyAgentChangeTierMoveDirection = "earlier" | "later";

/** What the store tells its owner: the tiers as they now stand, to be kept. */
export type HappyAgentChangeTiersOutput = {
    readonly type: "tiersUpdated";
    readonly tiers: readonly HappyAgentChangeTier[];
};

export interface HappyAgentChangeTiersStore {
    get(): HappyAgentChangeTiersSnapshot;
    subscribe(listener: () => void): () => void;
    /** Appends a new, unnamed tier with no patterns, which therefore claims nothing yet. */
    tierAdd(): void;
    tierRemove(tierId: HappyAgentChangeTierId): void;
    tierNameUpdate(tierId: HappyAgentChangeTierId, name: string): void;
    tierPatternsUpdate(tierId: HappyAgentChangeTierId, patterns: readonly string[]): void;
    /** Moves a tier one place in the match order; the first tier that matches a file wins. */
    tierMove(tierId: HappyAgentChangeTierId, direction: HappyAgentChangeTierMoveDirection): void;
    /** Folds a tier's section shut in every listing, or opens it. */
    tierCollapsedUpdate(tierId: HappyAgentChangeTierId, collapsed: boolean): void;
}

export interface HappyAgentChangeTiersStoreInput {
    /** What the owner remembered from an earlier run. */
    readonly initial?: readonly HappyAgentChangeTier[];
    readonly output?: (event: HappyAgentChangeTiersOutput) => void;
}

/** Tier ids only need to be unique within this window's record. */
function tierIdCreate(): HappyAgentChangeTierId {
    return `tier_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}` as HappyAgentChangeTierId;
}

/**
 * Creates the change tiers store. It opens nothing: what was remembered is
 * handed in, and every change to the tiers is handed back out through `output`
 * for the owner to keep.
 */
export function happyAgentChangeTiersStoreCreate(
    input: HappyAgentChangeTiersStoreInput = {},
): HappyAgentChangeTiersStore {
    const listeners = new Set<() => void>();
    const output = input.output ?? (() => undefined);
    let snapshot: HappyAgentChangeTiersSnapshot = { tiers: input.initial ?? [] };

    const tiersWrite = (tiers: readonly HappyAgentChangeTier[]): void => {
        snapshot = { tiers };
        for (const listener of listeners) listener();
        output({ type: "tiersUpdated", tiers });
    };

    /** Replaces one tier, publishing nothing when the change changes nothing. */
    const tierChange = (
        tierId: HappyAgentChangeTierId,
        change: (tier: HappyAgentChangeTier) => HappyAgentChangeTier,
    ): void => {
        const tiers = snapshot.tiers;
        const index = tiers.findIndex((tier) => tier.id === tierId);
        if (index === -1) return;
        const next = change(tiers[index]!);
        if (next === tiers[index]) return;
        tiersWrite(tiers.map((tier, position) => (position === index ? next : tier)));
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        tierAdd() {
            const tiers = snapshot.tiers;
            if (tiers.length >= HAPPY_AGENT_CHANGE_TIERS_MAX) return;
            tiersWrite([
                ...tiers,
                { id: tierIdCreate(), name: "", patterns: [], collapsed: false },
            ]);
        },
        tierRemove(tierId) {
            const tiers = snapshot.tiers;
            const remaining = tiers.filter((tier) => tier.id !== tierId);
            if (remaining.length === tiers.length) return;
            tiersWrite(remaining);
        },
        tierNameUpdate(tierId, name) {
            tierChange(tierId, (tier) => (tier.name === name ? tier : { ...tier, name }));
        },
        tierPatternsUpdate(tierId, patterns) {
            tierChange(tierId, (tier) =>
                tier.patterns.length === patterns.length &&
                tier.patterns.every((pattern, index) => pattern === patterns[index])
                    ? tier
                    : { ...tier, patterns: [...patterns] },
            );
        },
        tierMove(tierId, direction) {
            const tiers = snapshot.tiers;
            const index = tiers.findIndex((tier) => tier.id === tierId);
            const target = direction === "earlier" ? index - 1 : index + 1;
            if (index === -1 || target < 0 || target >= tiers.length) return;
            const next = [...tiers];
            next[index] = tiers[target]!;
            next[target] = tiers[index]!;
            tiersWrite(next);
        },
        tierCollapsedUpdate(tierId, collapsed) {
            tierChange(tierId, (tier) =>
                tier.collapsed === collapsed ? tier : { ...tier, collapsed },
            );
        },
    };
}
