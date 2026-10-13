import type { HappyAgentBotId } from "./happyAgentTypes.js";

/**
 * How much of each connection's news is allowed to reach the person at this
 * window: whether a finished conversation plays the completion chime, and
 * which bots are kept quiet or kept out of the sidebar altogether.
 *
 * Every choice here is the person's, about this device, so it is kept by the
 * host's storage rather than by any machine the window connects to. It is
 * addressed by connection and then by bot, and it outlives both: a machine
 * that goes offline and comes back, or a bot that is not listed for a while,
 * finds the choice where it was left.
 *
 * The constructor opens nothing: it reads the host's record once, and writes
 * back only when the person changes something.
 */

/**
 * When a connection plays the completion chime for a finished top-level
 * conversation: every time, only while that connection is the one on screen in
 * a focused window, or never.
 */
export type HappyAgentCompletionSound = "always" | "focused" | "never";

/**
 * What a bot's news does beyond its own conversation. A `muted` bot is still
 * listed and still reads as unread on its row, but it is not counted anywhere
 * else and does not chime. A `hidden` bot is also left out of the sidebar.
 * Hidden outranks muted, so a bot that is both reads as hidden.
 */
export type HappyAgentBotAttention = "normal" | "muted" | "hidden";

export interface HappyAgentAttentionConnection {
    readonly completionSound: HappyAgentCompletionSound;
    readonly mutedBots: ReadonlySet<HappyAgentBotId>;
    readonly hiddenBots: ReadonlySet<HappyAgentBotId>;
}

export interface HappyAgentAttentionSnapshot {
    /** Only connections the person has changed something on; the rest read the default. */
    readonly connections: ReadonlyMap<string, HappyAgentAttentionConnection>;
}

export interface HappyAgentAttentionConnectionDocument {
    readonly completionSound: HappyAgentCompletionSound;
    readonly mutedBots: readonly string[];
    readonly hiddenBots: readonly string[];
}

export interface HappyAgentAttentionDocument {
    readonly connections: Readonly<Record<string, HappyAgentAttentionConnectionDocument>>;
}

/**
 * Where the record is kept. The state package never names a storage medium:
 * the host supplies one, and omitting it keeps the choices for this window's
 * lifetime only.
 */
export interface HappyAgentAttentionPersistence {
    read(): HappyAgentAttentionDocument | undefined;
    write(document: HappyAgentAttentionDocument): void;
}

export interface HappyAgentAttentionStore {
    get(): HappyAgentAttentionSnapshot;
    subscribe(listener: () => void): () => void;
    completionSoundUpdate(connectionId: string, sound: HappyAgentCompletionSound): void;
    botMutedUpdate(connectionId: string, botId: HappyAgentBotId, muted: boolean): void;
    botHiddenUpdate(connectionId: string, botId: HappyAgentBotId, hidden: boolean): void;
}

const NO_BOTS: ReadonlySet<HappyAgentBotId> = new Set();

const CONNECTION_DEFAULT: HappyAgentAttentionConnection = {
    completionSound: "always",
    mutedBots: NO_BOTS,
    hiddenBots: NO_BOTS,
};

const EMPTY_SNAPSHOT: HappyAgentAttentionSnapshot = { connections: new Map() };

/** One connection's choices, or the default for a connection nobody has changed. */
export function happyAgentAttentionConnection(
    snapshot: HappyAgentAttentionSnapshot,
    connectionId: string,
): HappyAgentAttentionConnection {
    return snapshot.connections.get(connectionId) ?? CONNECTION_DEFAULT;
}

/** What one bot's news does, read from its connection's choices. */
export function happyAgentBotAttention(
    snapshot: HappyAgentAttentionSnapshot,
    connectionId: string,
    botId: HappyAgentBotId,
): HappyAgentBotAttention {
    const connection = snapshot.connections.get(connectionId);
    if (!connection) return "normal";
    if (connection.hiddenBots.has(botId)) return "hidden";
    if (connection.mutedBots.has(botId)) return "muted";
    return "normal";
}

function completionSoundParse(value: unknown): HappyAgentCompletionSound | undefined {
    return value === "always" || value === "focused" || value === "never" ? value : undefined;
}

function botIdsParse(value: unknown): ReadonlySet<HappyAgentBotId> {
    if (!Array.isArray(value)) return NO_BOTS;
    const ids = new Set<HappyAgentBotId>();
    // Stored by this store from branded ids; the brand is restored here at the
    // one boundary where they come back.
    for (const id of value)
        if (typeof id === "string" && id.length > 0) ids.add(id as HappyAgentBotId);
    return ids.size === 0 ? NO_BOTS : ids;
}

/**
 * A stored record read back as this window's own value. It comes from a
 * previous version of this app and from a place a person can edit by hand, so
 * it is parsed rather than trusted; anything unreadable is no choice at all.
 */
function snapshotParse(value: unknown): HappyAgentAttentionSnapshot {
    if (typeof value !== "object" || value === null) return EMPTY_SNAPSHOT;
    const connections = (value as { connections?: unknown }).connections;
    if (typeof connections !== "object" || connections === null) return EMPTY_SNAPSHOT;
    const parsed = new Map<string, HappyAgentAttentionConnection>();
    for (const [id, entry] of Object.entries(connections)) {
        if (id.length === 0 || typeof entry !== "object" || entry === null) continue;
        const record = entry as Record<string, unknown>;
        parsed.set(id, {
            completionSound: completionSoundParse(record.completionSound) ?? "always",
            mutedBots: botIdsParse(record.mutedBots),
            hiddenBots: botIdsParse(record.hiddenBots),
        });
    }
    return parsed.size === 0 ? EMPTY_SNAPSHOT : { connections: parsed };
}

function documentOf(snapshot: HappyAgentAttentionSnapshot): HappyAgentAttentionDocument {
    const connections: Record<string, HappyAgentAttentionConnectionDocument> = {};
    for (const [id, connection] of snapshot.connections)
        connections[id] = {
            completionSound: connection.completionSound,
            mutedBots: [...connection.mutedBots],
            hiddenBots: [...connection.hiddenBots],
        };
    return { connections };
}

function botIdsWith(
    ids: ReadonlySet<HappyAgentBotId>,
    botId: HappyAgentBotId,
    included: boolean,
): ReadonlySet<HappyAgentBotId> {
    if (ids.has(botId) === included) return ids;
    const next = new Set(ids);
    if (included) next.add(botId);
    else next.delete(botId);
    return next;
}

/** Creates the window-lifetime store, hydrated from the host's storage when it has one. */
export function happyAgentAttentionStoreCreate(
    persistence?: HappyAgentAttentionPersistence,
): HappyAgentAttentionStore {
    let snapshot: HappyAgentAttentionSnapshot = (() => {
        try {
            return snapshotParse(persistence?.read());
        } catch {
            // Storage the host refused is a window with no record.
            return EMPTY_SNAPSHOT;
        }
    })();
    const listeners = new Set<() => void>();
    const connectionSet = (connectionId: string, next: HappyAgentAttentionConnection): void => {
        if (connectionId.length === 0) return;
        const current = happyAgentAttentionConnection(snapshot, connectionId);
        if (
            current.completionSound === next.completionSound &&
            current.mutedBots === next.mutedBots &&
            current.hiddenBots === next.hiddenBots
        )
            return;
        const connections = new Map(snapshot.connections);
        connections.set(connectionId, next);
        snapshot = { connections };
        try {
            persistence?.write(documentOf(snapshot));
        } catch {
            // Storage the host refused still keeps this window's choices for as
            // long as it stays open.
        }
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        completionSoundUpdate(connectionId, sound) {
            const current = happyAgentAttentionConnection(snapshot, connectionId);
            connectionSet(connectionId, { ...current, completionSound: sound });
        },
        botMutedUpdate(connectionId, botId, muted) {
            const current = happyAgentAttentionConnection(snapshot, connectionId);
            connectionSet(connectionId, {
                ...current,
                mutedBots: botIdsWith(current.mutedBots, botId, muted),
            });
        },
        botHiddenUpdate(connectionId, botId, hidden) {
            const current = happyAgentAttentionConnection(snapshot, connectionId);
            connectionSet(connectionId, {
                ...current,
                hiddenBots: botIdsWith(current.hiddenBots, botId, hidden),
            });
        },
    };
}

/**
 * The record a host that keeps none stands in: every connection chimes, no bot
 * is quiet, and nothing can be changed into a choice the next launch would
 * forget.
 */
export const happyAgentAttentionStoreNoop: HappyAgentAttentionStore = {
    get: () => EMPTY_SNAPSHOT,
    subscribe: () => () => undefined,
    completionSoundUpdate: () => undefined,
    botMutedUpdate: () => undefined,
    botHiddenUpdate: () => undefined,
};
