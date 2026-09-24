/**
 * How the reader has filed each workspace in the sidebar: pinned above the
 * projects, snoozed out of the way until a time or until something happens in
 * it, or settled — done, kept, and folded onto a shelf at the bottom of the
 * machine's list. A workspace with no record is simply active.
 *
 * This is the window's record, kept beside the pinned-row order and the folded
 * rows and for the same reason: it says how this reader arranged this sidebar,
 * and no machine coming or going may rearrange it. Every key names the machine
 * as well as the group, so two machines with a workspace of the same id do not
 * share a filing.
 *
 * Settling is deliberately not archiving. Archiving throws a checkout away and
 * is asked of the host; settling is a filing decision that keeps the work
 * exactly where it is and can be undone from here in one step.
 */
export interface HappyAgentWorkspaceTriageDocument {
    readonly pinned: readonly { readonly key: string; readonly at: number }[];
    readonly snoozed: readonly {
        readonly key: string;
        readonly at: number;
        readonly until: number;
    }[];
    readonly settled: readonly { readonly key: string; readonly at: number }[];
    /**
     * Workspaces the reader took back off the shelf. The moment is what stops
     * the idle rule from settling it again the same second: the rule counts
     * idleness from the reopen, not from the workspace's last message.
     */
    readonly reopened: readonly { readonly key: string; readonly at: number }[];
}

export interface HappyAgentWorkspaceTriagePersistence {
    read(): HappyAgentWorkspaceTriageDocument | undefined;
    write(document: HappyAgentWorkspaceTriageDocument): void;
}

export interface HappyAgentWorkspacePinned {
    readonly at: number;
}

export interface HappyAgentWorkspaceSnoozed {
    readonly at: number;
    /** When the snooze lifts on its own, epoch milliseconds. */
    readonly until: number;
}

export interface HappyAgentWorkspaceSettled {
    readonly at: number;
}

/** What one filing change did, said so it can be offered back as one undo. */
export type HappyAgentWorkspaceTriageChange =
    | { readonly kind: "pinned"; readonly key: string }
    | { readonly kind: "unpinned"; readonly key: string }
    | { readonly kind: "snoozed"; readonly key: string; readonly until: number }
    | { readonly kind: "woken"; readonly key: string }
    | { readonly kind: "settled"; readonly key: string }
    | { readonly kind: "reopened"; readonly key: string };

/**
 * The last filing change, offered back for a few seconds. It carries the whole
 * previous filing of the key rather than an inverse action, so undoing a settle
 * that came off a pin puts the pin back rather than merely un-settling.
 */
export interface HappyAgentWorkspaceTriageUndo {
    readonly change: HappyAgentWorkspaceTriageChange;
    /** What the key was filed as before the change; absent when it was active. */
    readonly before?: HappyAgentWorkspaceFiling;
    readonly at: number;
}

export type HappyAgentWorkspaceFiling =
    | { readonly kind: "pinned"; readonly value: HappyAgentWorkspacePinned }
    | { readonly kind: "snoozed"; readonly value: HappyAgentWorkspaceSnoozed }
    | { readonly kind: "settled"; readonly value: HappyAgentWorkspaceSettled };

export interface HappyAgentWorkspaceTriageSnapshot {
    readonly pinned: ReadonlyMap<string, HappyAgentWorkspacePinned>;
    readonly snoozed: ReadonlyMap<string, HappyAgentWorkspaceSnoozed>;
    readonly settled: ReadonlyMap<string, HappyAgentWorkspaceSettled>;
    readonly reopened: ReadonlyMap<string, { readonly at: number }>;
    /** The change that can still be taken back, while the offer stands. */
    readonly undo?: HappyAgentWorkspaceTriageUndo;
}

export interface HappyAgentWorkspaceTriageStore {
    get(): HappyAgentWorkspaceTriageSnapshot;
    subscribe(listener: () => void): () => void;
    workspacePin(key: string): void;
    workspaceUnpin(key: string): void;
    /** Files the workspace away until `until`, or until new activity wakes it. */
    workspaceSnooze(key: string, until: number): void;
    workspaceWake(key: string): void;
    workspaceSettle(key: string): void;
    workspaceReopen(key: string): void;
    /** Takes the last change back, if the offer still stands. */
    undo(): void;
    /** Withdraws the offer without taking anything back. */
    undoDismiss(): void;
}

export interface HappyAgentWorkspaceTriageStoreOptions {
    readonly persistence?: HappyAgentWorkspaceTriagePersistence;
    readonly now?: () => number;
    /** How long an undo is offered, milliseconds. Defaults to five seconds. */
    readonly undoMs?: number;
    readonly setTimeout?: (handler: () => void, milliseconds: number) => unknown;
    readonly clearTimeout?: (handle: unknown) => void;
}

/** The key one machine's group is filed under. */
export function happyAgentWorkspaceTriageKey(happyAgentId: string, groupId: string): string {
    return `${happyAgentId}/${groupId}`;
}

const UNDO_MS = 5_000;
/** How many filings of one kind a window remembers before the oldest goes. */
const FILINGS_MAX = 512;

function entriesParse<T extends { readonly key: string; readonly at: number }>(
    value: unknown,
    parse: (record: Record<string, unknown>) => T | undefined,
): Map<string, T> {
    const result = new Map<string, T>();
    if (!Array.isArray(value)) return result;
    for (const entry of value) {
        if (typeof entry !== "object" || entry === null) continue;
        const record = entry as Record<string, unknown>;
        if (typeof record.key !== "string" || record.key.length === 0) continue;
        if (typeof record.at !== "number" || !Number.isFinite(record.at)) continue;
        const parsed = parse(record);
        if (parsed) result.set(parsed.key, parsed);
    }
    return result;
}

function documentParse(value: unknown): HappyAgentWorkspaceTriageSnapshot | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    const at = (entry: Record<string, unknown>) => ({
        key: entry.key as string,
        at: entry.at as number,
    });
    const pinned = entriesParse(record.pinned, at);
    const snoozed = entriesParse(record.snoozed, (entry) =>
        typeof entry.until === "number" && Number.isFinite(entry.until)
            ? { ...at(entry), until: entry.until }
            : undefined,
    );
    const settled = entriesParse(record.settled, at);
    const reopened = entriesParse(record.reopened, at);
    return {
        pinned: new Map([...pinned].map(([key, entry]) => [key, { at: entry.at }])),
        snoozed: new Map(
            [...snoozed].map(([key, entry]) => [key, { at: entry.at, until: entry.until }]),
        ),
        settled: new Map([...settled].map(([key, entry]) => [key, { at: entry.at }])),
        reopened: new Map([...reopened].map(([key, entry]) => [key, { at: entry.at }])),
    };
}

const EMPTY_SNAPSHOT: HappyAgentWorkspaceTriageSnapshot = {
    pinned: new Map(),
    snoozed: new Map(),
    settled: new Map(),
    reopened: new Map(),
};

function filingOf(
    snapshot: HappyAgentWorkspaceTriageSnapshot,
    key: string,
): HappyAgentWorkspaceFiling | undefined {
    const pinned = snapshot.pinned.get(key);
    if (pinned) return { kind: "pinned", value: pinned };
    const snoozed = snapshot.snoozed.get(key);
    if (snoozed) return { kind: "snoozed", value: snoozed };
    const settled = snapshot.settled.get(key);
    if (settled) return { kind: "settled", value: settled };
    return undefined;
}

function bounded<T extends { readonly at: number }>(map: Map<string, T>): Map<string, T> {
    if (map.size <= FILINGS_MAX) return map;
    const kept = [...map].sort((left, right) => left[1].at - right[1].at).slice(-FILINGS_MAX);
    return new Map(kept);
}

/**
 * The window's workspace filings, hydrated from the host's storage when it has
 * one. A filing is one key in exactly one of three lists, so filing a key one
 * way takes it out of the others; the reopen list is separate because a
 * reopened workspace is active, and only the idle rule needs to know when.
 */
export function happyAgentWorkspaceTriageStoreCreate(
    options: HappyAgentWorkspaceTriageStoreOptions = {},
): HappyAgentWorkspaceTriageStore {
    const persistence = options.persistence;
    const now = options.now ?? Date.now;
    const undoMs = options.undoMs ?? UNDO_MS;
    const startTimer =
        options.setTimeout ?? ((handler, milliseconds) => setTimeout(handler, milliseconds));
    const stopTimer =
        options.clearTimeout ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    let snapshot: HappyAgentWorkspaceTriageSnapshot = (() => {
        try {
            return documentParse(persistence?.read()) ?? EMPTY_SNAPSHOT;
        } catch {
            return EMPTY_SNAPSHOT;
        }
    })();
    const listeners = new Set<() => void>();
    let undoTimer: unknown;

    const publish = (next: HappyAgentWorkspaceTriageSnapshot): void => {
        snapshot = next;
        try {
            persistence?.write({
                pinned: [...next.pinned].map(([key, entry]) => ({ key, at: entry.at })),
                snoozed: [...next.snoozed].map(([key, entry]) => ({
                    key,
                    at: entry.at,
                    until: entry.until,
                })),
                settled: [...next.settled].map(([key, entry]) => ({ key, at: entry.at })),
                reopened: [...next.reopened].map(([key, entry]) => ({ key, at: entry.at })),
            });
        } catch {
            // Storage the host refused still keeps this window's filings for
            // as long as it stays open.
        }
        for (const listener of listeners) listener();
    };

    const undoClear = (): void => {
        if (undoTimer !== undefined) stopTimer(undoTimer);
        undoTimer = undefined;
    };

    /** Refiles one key, offering the change back for a while. */
    const file = (
        key: string,
        filing: HappyAgentWorkspaceFiling | undefined,
        change: HappyAgentWorkspaceTriageChange | undefined,
        reopenedAt?: number,
    ): void => {
        if (key.length === 0) return;
        const before = filingOf(snapshot, key);
        const pinned = new Map(snapshot.pinned);
        const snoozed = new Map(snapshot.snoozed);
        const settled = new Map(snapshot.settled);
        const reopened = new Map(snapshot.reopened);
        pinned.delete(key);
        snoozed.delete(key);
        settled.delete(key);
        if (filing?.kind === "pinned") pinned.set(key, filing.value);
        if (filing?.kind === "snoozed") snoozed.set(key, filing.value);
        if (filing?.kind === "settled") settled.set(key, filing.value);
        if (reopenedAt !== undefined) reopened.set(key, { at: reopenedAt });
        else if (filing !== undefined) reopened.delete(key);
        undoClear();
        const at = now();
        const undo: HappyAgentWorkspaceTriageUndo | undefined = change
            ? { change, ...(before ? { before } : {}), at }
            : undefined;
        publish({
            pinned: bounded(pinned),
            snoozed: bounded(snoozed),
            settled: bounded(settled),
            reopened: bounded(reopened),
            ...(undo ? { undo } : {}),
        });
        if (undo)
            undoTimer = startTimer(() => {
                undoTimer = undefined;
                if (snapshot.undo !== undo) return;
                const { undo: _expired, ...rest } = snapshot;
                publish(rest);
            }, undoMs);
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        workspacePin(key) {
            if (snapshot.pinned.has(key)) return;
            file(key, { kind: "pinned", value: { at: now() } }, { kind: "pinned", key });
        },
        workspaceUnpin(key) {
            if (!snapshot.pinned.has(key)) return;
            file(key, undefined, { kind: "unpinned", key });
        },
        workspaceSnooze(key, until) {
            file(
                key,
                { kind: "snoozed", value: { at: now(), until } },
                { kind: "snoozed", key, until },
            );
        },
        workspaceWake(key) {
            if (!snapshot.snoozed.has(key)) return;
            file(key, undefined, { kind: "woken", key });
        },
        workspaceSettle(key) {
            if (snapshot.settled.has(key)) return;
            file(key, { kind: "settled", value: { at: now() } }, { kind: "settled", key });
        },
        workspaceReopen(key) {
            // Reopening is also how an automatically settled workspace is taken
            // back, so it records the moment even for a key that was never
            // filed here.
            file(key, undefined, { kind: "reopened", key }, now());
        },
        undo() {
            const undo = snapshot.undo;
            if (!undo) return;
            const key = undo.change.key;
            const reopenedAt =
                undo.change.kind === "reopened" ? undefined : snapshot.reopened.get(key)?.at;
            file(key, undo.before, undefined, reopenedAt);
        },
        undoDismiss() {
            if (!snapshot.undo) return;
            undoClear();
            const { undo: _dismissed, ...rest } = snapshot;
            publish(rest);
        },
    };
}

/** A filing record for a window that keeps none: everything stays active. */
export const happyAgentWorkspaceTriageStoreNoop: HappyAgentWorkspaceTriageStore = {
    get: () => EMPTY_SNAPSHOT,
    subscribe: () => () => undefined,
    workspacePin: () => undefined,
    workspaceUnpin: () => undefined,
    workspaceSnooze: () => undefined,
    workspaceWake: () => undefined,
    workspaceSettle: () => undefined,
    workspaceReopen: () => undefined,
    undo: () => undefined,
    undoDismiss: () => undefined,
};

/** How long a workspace has to sit idle before the shelf takes it on its own. */
export const HAPPY_AGENT_WORKSPACE_AUTO_SETTLE_MS = 3 * 24 * 60 * 60 * 1_000;

/**
 * How one workspace is shown in the sidebar right now, from its filing and
 * what is happening in it. Filing is what the reader said; this is what the
 * sidebar does about it at this moment:
 *
 * - a snooze lifts on its own once its time has passed or once anything new
 *   has happened in the workspace, because a snooze is "not now", not "never";
 * - a workspace that is idle long enough settles itself, unless it is pinned,
 *   waiting on the reader, or was reopened since — a settled row is never one
 *   somebody is blocked on;
 * - a pin outranks everything: a pinned workspace is where the reader is
 *   working, whatever the timers say.
 */
export function happyAgentWorkspaceTriageStateOf(
    snapshot: HappyAgentWorkspaceTriageSnapshot,
    key: string,
    facts: {
        readonly now: number;
        /** Epoch milliseconds of the newest content anywhere in the workspace. */
        readonly updatedAt: number;
        /** Anything running, waiting on the reader, or unread inside it. */
        readonly live: boolean;
    },
): "pinned" | "active" | "snoozed" | "settled" {
    if (snapshot.pinned.has(key)) return "pinned";
    const snoozed = snapshot.snoozed.get(key);
    if (snoozed && snoozed.until > facts.now && facts.updatedAt <= snoozed.at) return "snoozed";
    if (snapshot.settled.has(key)) return "settled";
    if (facts.live) return "active";
    const reopenedAt = snapshot.reopened.get(key)?.at ?? 0;
    const idleSince = Math.max(facts.updatedAt, reopenedAt);
    return facts.now - idleSince >= HAPPY_AGENT_WORKSPACE_AUTO_SETTLE_MS ? "settled" : "active";
}
