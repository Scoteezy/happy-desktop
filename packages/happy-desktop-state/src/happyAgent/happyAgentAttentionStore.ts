import {
    HappyAgentApiError,
    type HappyAgentClient,
    type StoredUserSetting,
    type UserSetting,
    type UserSettingValue,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import type { UserError } from "../types.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import type { HappyAgentBotId } from "./happyAgentTypes.js";

/**
 * How much of each connection's news is allowed to reach the person: whether a
 * finished conversation plays the completion chime, and which bots are kept
 * quiet or kept out of the sidebar altogether.
 *
 * Every choice is the person's, about one connection, so it is kept by that
 * connection's own Happy Agent as the person's user settings: a teammate on
 * the same server has their own, and the person finds theirs on every device.
 * Each daemon is a separate owner, so the choices are per connection without
 * anything here having to say so.
 *
 * The window still keeps a record of its own, addressed by connection: the
 * last confirmed settings, so a machine that is offline or reconnecting keeps
 * showing and accepting the choices; the changes not yet confirmed, so they
 * are sent when it answers again; and the device's own choices, which are what
 * a Happy Agent too old to keep user settings uses instead. The first time a
 * Happy Agent is found keeping them, the device's choices are moved into it
 * for every setting it does not already hold, and the device record is
 * emptied: from then on the account's copy is the only one.
 *
 * The constructor opens nothing: it reads the host's record once. Following a
 * connection is the owner's explicit call, for that connection's lifetime.
 */

/**
 * When a connection plays the completion chime for a finished top-level
 * conversation: every time, only while that connection is the one on screen in
 * a focused window, or never. Whether it is on screen is the window's own fact
 * at the moment the chime would play; only the choice is kept by the daemon.
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
    /**
     * Why the Happy Agent refused the person's last change here. The change is
     * undone, and the next one clears this.
     */
    readonly saveError?: UserError;
}

export interface HappyAgentAttentionSnapshot {
    /** Only connections with something to say; the rest read the default. */
    readonly connections: ReadonlyMap<string, HappyAgentAttentionConnection>;
}

/** One confirmed user setting, exactly as the daemon answered it. */
export interface HappyAgentAttentionSettingDocument {
    readonly key: string;
    readonly value: UserSettingValue;
    readonly updatedAt: number;
    readonly version: string;
}

/** One change the daemon has not confirmed yet, with what every retry sends again. */
export interface HappyAgentAttentionWriteDocument {
    readonly key: string;
    readonly value: UserSettingValue;
    readonly updatedAt: number;
    readonly mutationId: string;
}

export interface HappyAgentAttentionConnectionDocument {
    /** The device's own choices, used where the daemon keeps no user settings. */
    readonly completionSound: HappyAgentCompletionSound;
    readonly mutedBots: readonly string[];
    readonly hiddenBots: readonly string[];
    /** Whether this connection's daemon keeps user settings, once it has said. */
    readonly userSettings?: "supported" | "unsupported";
    /** Whose settings `settings` and `writes` are: a member's id, or `null` standalone. */
    readonly owner?: string | null;
    readonly settings?: readonly HappyAgentAttentionSettingDocument[];
    readonly writes?: readonly HappyAgentAttentionWriteDocument[];
}

export interface HappyAgentAttentionDocument {
    readonly connections: Readonly<Record<string, HappyAgentAttentionConnectionDocument>>;
}

/**
 * Where the window's record is kept. The state package never names a storage
 * medium: the host supplies one, and omitting it keeps the record for this
 * window's lifetime only.
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

/** What one connection's user settings are read and written through. */
export interface HappyAgentAttentionSource {
    readonly client: Pick<HappyAgentClient, "getUserSettings" | "saveUserSetting">;
    readonly sync: HappyAgentSync;
}

export interface HappyAgentAttentionStoreOptions {
    readonly persistence?: HappyAgentAttentionPersistence;
    /** The time a change is made at; last-write-wins compares it. */
    readonly now?: () => number;
}

/** The completion chime's choice. Cleared, it is `always`. */
const COMPLETION_SOUND_KEY = "happy-desktop.completionSound";
/** One bot's choices, as `{ muted, hidden }`, by bot id. Cleared, it is neither. */
const BOT_KEY_PREFIX = "happy-desktop.bot.";

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

type Choices = Omit<HappyAgentAttentionConnection, "saveError">;

interface ConnectionRecord {
    /** `unknown` until this connection's daemon has said, here or in an earlier run. */
    support: "unknown" | "supported" | "unsupported";
    owner?: string | null;
    device: Choices;
    /** The daemon's confirmed entries for this store's keys, by key. */
    settings: Map<string, StoredUserSetting>;
    /** Changes not confirmed yet, by key; a newer change to a key replaces its older one. */
    writes: Map<string, HappyAgentAttentionWriteDocument>;
    saveError?: UserError;
}

interface Follower {
    readonly source: HappyAgentAttentionSource;
    readonly signal: AbortSignal;
    readonly stop: () => void;
    online: boolean;
    flushing: boolean;
    readFailed: boolean;
}

function attentionKey(key: string): boolean {
    return (
        key === COMPLETION_SOUND_KEY ||
        (key.startsWith(BOT_KEY_PREFIX) && key.length > BOT_KEY_PREFIX.length)
    );
}

function botKey(botId: HappyAgentBotId): string {
    return `${BOT_KEY_PREFIX}${botId}`;
}

function completionSoundParse(value: unknown): HappyAgentCompletionSound | undefined {
    return value === "always" || value === "focused" || value === "never" ? value : undefined;
}

function completionSoundValue(sound: HappyAgentCompletionSound): UserSettingValue {
    return sound === "always" ? null : sound;
}

function botValue(muted: boolean, hidden: boolean): UserSettingValue {
    return muted || hidden ? { muted, hidden } : null;
}

/**
 * A bot's stored choices. Written by this store as `{ muted, hidden }`; any
 * other value, including one a newer app wrote in a shape this one does not
 * know, is read as neither.
 */
function botValueParse(value: UserSettingValue): { muted: boolean; hidden: boolean } {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return { muted: false, hidden: false };
    return { muted: value["muted"] === true, hidden: value["hidden"] === true };
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

function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
    if (left === right) return true;
    if (left.size !== right.size) return false;
    for (const value of left) if (!right.has(value)) return false;
    return true;
}

function choicesEqual(left: Choices, right: Choices): boolean {
    return (
        left.completionSound === right.completionSound &&
        setsEqual(left.mutedBots, right.mutedBots) &&
        setsEqual(left.hiddenBots, right.hiddenBots)
    );
}

function choicesDefault(choices: Choices): boolean {
    return choicesEqual(choices, CONNECTION_DEFAULT);
}

/** What one connection shows: the daemon's copy with this window's unconfirmed changes over it. */
function choicesOf(record: ConnectionRecord): Choices {
    if (record.support !== "supported") return record.device;
    const values = new Map<string, UserSettingValue>();
    for (const [key, setting] of record.settings) values.set(key, setting.value);
    for (const [key, write] of record.writes) values.set(key, write.value);
    let completionSound: HappyAgentCompletionSound = "always";
    const mutedBots = new Set<HappyAgentBotId>();
    const hiddenBots = new Set<HappyAgentBotId>();
    for (const [key, value] of values) {
        if (key === COMPLETION_SOUND_KEY) {
            completionSound = completionSoundParse(value) ?? "always";
            continue;
        }
        // Keys are this store's own, written from branded bot ids.
        const botId = key.slice(BOT_KEY_PREFIX.length) as HappyAgentBotId;
        const bot = botValueParse(value);
        if (bot.muted) mutedBots.add(botId);
        if (bot.hidden) hiddenBots.add(botId);
    }
    return {
        completionSound,
        mutedBots: mutedBots.size === 0 ? NO_BOTS : mutedBots,
        hiddenBots: hiddenBots.size === 0 ? NO_BOTS : hiddenBots,
    };
}

function recordEmpty(): ConnectionRecord {
    return {
        support: "unknown",
        device: CONNECTION_DEFAULT,
        settings: new Map(),
        writes: new Map(),
    };
}

/**
 * A stored record read back as this window's own value. It comes from a
 * previous version of this app and from a place a person can edit by hand, so
 * it is parsed rather than trusted; anything unreadable is no choice at all.
 */
function recordsParse(value: unknown): Map<string, ConnectionRecord> {
    const records = new Map<string, ConnectionRecord>();
    if (typeof value !== "object" || value === null) return records;
    const connections = (value as { connections?: unknown }).connections;
    if (typeof connections !== "object" || connections === null) return records;
    for (const [id, entry] of Object.entries(connections)) {
        if (id.length === 0 || typeof entry !== "object" || entry === null) continue;
        const stored = entry as Record<string, unknown>;
        const record = recordEmpty();
        record.device = {
            completionSound: completionSoundParse(stored["completionSound"]) ?? "always",
            mutedBots: botIdsParse(stored["mutedBots"]),
            hiddenBots: botIdsParse(stored["hiddenBots"]),
        };
        const support = stored["userSettings"];
        if (support === "supported" || support === "unsupported") record.support = support;
        const owner = stored["owner"];
        if (typeof owner === "string" || owner === null) record.owner = owner;
        if (record.support === "supported") {
            for (const setting of arrayOf(stored["settings"])) {
                const key = setting["key"];
                const updatedAt = setting["updatedAt"];
                const version = setting["version"];
                if (
                    typeof key === "string" &&
                    attentionKey(key) &&
                    typeof updatedAt === "number" &&
                    typeof version === "string"
                )
                    record.settings.set(key, {
                        key,
                        value: (setting["value"] ?? null) as UserSettingValue,
                        updatedAt,
                        version,
                    });
            }
        }
        if (record.support !== "unsupported") {
            for (const write of arrayOf(stored["writes"])) {
                const key = write["key"];
                const updatedAt = write["updatedAt"];
                const mutationId = write["mutationId"];
                if (
                    typeof key === "string" &&
                    attentionKey(key) &&
                    typeof updatedAt === "number" &&
                    typeof mutationId === "string"
                )
                    record.writes.set(key, {
                        key,
                        value: (write["value"] ?? null) as UserSettingValue,
                        updatedAt,
                        mutationId,
                    });
            }
        }
        records.set(id, record);
    }
    return records;
}

function arrayOf(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
    );
}

function documentOf(records: ReadonlyMap<string, ConnectionRecord>): HappyAgentAttentionDocument {
    const connections: Record<string, HappyAgentAttentionConnectionDocument> = {};
    for (const [id, record] of records)
        connections[id] = {
            completionSound: record.device.completionSound,
            mutedBots: [...record.device.mutedBots],
            hiddenBots: [...record.device.hiddenBots],
            ...(record.support === "unknown" ? {} : { userSettings: record.support }),
            ...(record.owner === undefined ? {} : { owner: record.owner }),
            ...(record.settings.size > 0 ? { settings: [...record.settings.values()] } : {}),
            ...(record.writes.size > 0 ? { writes: [...record.writes.values()] } : {}),
        };
    return { connections };
}

/** How a failed write ends: the daemon has no user settings, try again, or give it up. */
function writeFailureOf(error: unknown): "unsupported" | "retry" | "refused" {
    for (let current = error; current instanceof Error; current = current.cause) {
        if (current instanceof HappyAgentApiError) {
            if (current.status === 404) return "unsupported";
            return current.status >= 500 || current.status === 408 || current.status === 429
                ? "retry"
                : "refused";
        }
        // A request the browser could not deliver at all, by `fetch`'s own contract.
        if (current instanceof TypeError) return "retry";
    }
    return "refused";
}

function settingsUnsupported(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status === 404;
}

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const finish = (): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
        };
        const timer = setTimeout(finish, milliseconds);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
    });
}

/**
 * The window-lifetime store together with its owner-only capability to follow
 * a connection. Only the owner that opens connections may attach one; the
 * store's public face stays the reader's choices and actions alone.
 */
export function happyAgentAttentionStoreOwnedCreate(
    options: HappyAgentAttentionStoreOptions = {},
): {
    readonly store: HappyAgentAttentionStore;
    /**
     * Keeps one connection's choices in its daemon's user settings until the
     * returned function is called: adopts its bootstrap and events, and sends
     * the changes it has not confirmed whenever it answers.
     */
    readonly connectionFollow: (
        connectionId: string,
        source: HappyAgentAttentionSource,
    ) => () => void;
} {
    const now = options.now ?? Date.now;
    const records: Map<string, ConnectionRecord> = (() => {
        try {
            return recordsParse(options.persistence?.read());
        } catch {
            // Storage the host refused is a window with no record.
            return new Map<string, ConnectionRecord>();
        }
    })();
    const followers = new Map<string, Follower>();
    const listeners = new Set<() => void>();

    const projectionOf = (record: ConnectionRecord): HappyAgentAttentionConnection | undefined => {
        const choices = choicesOf(record);
        if (record.saveError) return { ...choices, saveError: record.saveError };
        return choicesDefault(choices) ? undefined : choices;
    };

    let snapshot: HappyAgentAttentionSnapshot = (() => {
        const connections = new Map<string, HappyAgentAttentionConnection>();
        for (const [id, record] of records) {
            const projection = projectionOf(record);
            if (projection) connections.set(id, projection);
        }
        return connections.size === 0 ? EMPTY_SNAPSHOT : { connections };
    })();

    const persist = (): void => {
        try {
            options.persistence?.write(documentOf(records));
        } catch {
            // Storage the host refused still keeps the choices for as long as
            // the window stays open.
        }
    };

    /** Records a change to one connection, and tells readers only if what it shows changed. */
    const commit = (connectionId: string): void => {
        persist();
        const record = records.get(connectionId);
        const previous = snapshot.connections.get(connectionId);
        const next = record ? projectionOf(record) : undefined;
        if (
            previous === next ||
            (previous !== undefined &&
                next !== undefined &&
                previous.saveError === next.saveError &&
                choicesEqual(previous, next))
        )
            return;
        const connections = new Map(snapshot.connections);
        if (next) connections.set(connectionId, next);
        else connections.delete(connectionId);
        snapshot = connections.size === 0 ? EMPTY_SNAPSHOT : { connections };
        for (const listener of listeners) listener();
    };

    const recordEnsure = (connectionId: string): ConnectionRecord => {
        let record = records.get(connectionId);
        if (!record) {
            record = recordEmpty();
            records.set(connectionId, record);
        }
        return record;
    };

    const writeQueue = (record: ConnectionRecord, key: string, value: UserSettingValue): void => {
        record.writes.set(key, {
            key,
            value,
            updatedAt: now(),
            mutationId: globalThis.crypto.randomUUID(),
        });
    };

    /** Takes one entry the daemon answered with, unless a newer one is already held. */
    const settingTake = (record: ConnectionRecord, setting: UserSetting): void => {
        if (!attentionKey(setting.key)) return;
        if (setting.version === null) {
            record.settings.delete(setting.key);
            return;
        }
        const current = record.settings.get(setting.key);
        if (current && current.version >= setting.version) return;
        record.settings.set(setting.key, setting);
    };

    /**
     * The daemon keeps user settings after all, or for the first time. The
     * device's choices go to it for every setting it holds nothing for, once,
     * at the time of the move; a setting another device already made wins.
     */
    const deviceImport = (record: ConnectionRecord): void => {
        const device = record.device;
        const vacant = (key: string): boolean =>
            !record.settings.has(key) && !record.writes.has(key);
        if (device.completionSound !== "always" && vacant(COMPLETION_SOUND_KEY))
            writeQueue(record, COMPLETION_SOUND_KEY, completionSoundValue(device.completionSound));
        for (const botId of new Set([...device.mutedBots, ...device.hiddenBots])) {
            const key = botKey(botId);
            if (vacant(key))
                writeQueue(
                    record,
                    key,
                    botValue(device.mutedBots.has(botId), device.hiddenBots.has(botId)),
                );
        }
        record.device = CONNECTION_DEFAULT;
    };

    /** The daemon keeps no user settings: what was showing becomes the device's own. */
    const supportLose = (record: ConnectionRecord): void => {
        if (record.support === "supported") record.device = choicesOf(record);
        record.support = "unsupported";
        record.settings.clear();
        record.writes.clear();
    };

    /**
     * A complete copy of the person's settings — the bootstrap's or a fresh
     * read's — replaces what was held. `undefined` is a daemon that has none.
     */
    const settingsReplace = (
        connectionId: string,
        settings: readonly StoredUserSetting[] | undefined,
        owner: string | null | undefined,
    ): void => {
        const record = recordEnsure(connectionId);
        if (settings === undefined) {
            supportLose(record);
            commit(connectionId);
            return;
        }
        // A copy held for someone else is not this person's, nor are their changes.
        if (owner !== undefined) {
            if (record.owner !== undefined && record.owner !== owner) record.writes.clear();
            record.owner = owner;
        }
        const wasSupported = record.support === "supported";
        record.support = "supported";
        record.settings.clear();
        for (const setting of settings) settingTake(record, setting);
        if (!wasSupported) deviceImport(record);
        commit(connectionId);
    };

    /** One entry the daemon confirmed, from an event or a write's answer. */
    const settingAdopt = (
        connectionId: string,
        setting: UserSetting,
        mutationId: string | undefined,
    ): void => {
        const record = records.get(connectionId);
        if (!record || record.support !== "supported") return;
        settingTake(record, setting);
        // The daemon has applied, or refused as stale, exactly this change.
        if (mutationId !== undefined && record.writes.get(setting.key)?.mutationId === mutationId)
            record.writes.delete(setting.key);
        commit(connectionId);
    };

    const flushStart = (connectionId: string): void => {
        const follower = followers.get(connectionId);
        if (!follower || follower.flushing || !follower.online) return;
        follower.flushing = true;
        void flush(connectionId, follower).finally(() => {
            follower.flushing = false;
        });
    };

    /**
     * Sends this connection's unconfirmed changes one at a time, each with the
     * time it was made and the same mutation id on every attempt, so a late or
     * repeated delivery can only lose to a newer change. Stops while the
     * connection is offline; reconnecting starts it again.
     */
    const flush = async (connectionId: string, follower: Follower): Promise<void> => {
        let delay = 1_000;
        while (
            !follower.signal.aborted &&
            follower.online &&
            followers.get(connectionId) === follower
        ) {
            const record = records.get(connectionId);
            if (!record || record.support !== "supported") return;
            const write = record.writes.values().next().value;
            if (!write) return;
            try {
                const response = await follower.source.client.saveUserSetting(
                    write.key,
                    {
                        value: write.value,
                        updatedAt: write.updatedAt,
                        mutationId: write.mutationId,
                    },
                    { signal: follower.signal },
                );
                if (follower.signal.aborted) return;
                delay = 1_000;
                settingAdopt(connectionId, response.setting, write.mutationId);
            } catch (error) {
                if (follower.signal.aborted) return;
                const failure = writeFailureOf(error);
                if (failure === "unsupported") {
                    supportLose(record);
                    commit(connectionId);
                    return;
                }
                if (failure === "refused") {
                    // The change is given up and the daemon's copy shows again.
                    if (record.writes.get(write.key)?.mutationId === write.mutationId) {
                        record.writes.delete(write.key);
                        record.saveError = happyAgentUserError(error);
                        commit(connectionId);
                    }
                    continue;
                }
                await pause(delay, follower.signal);
                delay = Math.min(delay * 2, 10_000);
            }
        }
    };

    /** Reads the person's settings again, after a gap or for a follower that joined late. */
    const settingsRead = async (connectionId: string, follower: Follower): Promise<void> => {
        const response = await happyAgentSyncRead(
            follower.signal,
            async () => {
                try {
                    return await follower.source.client.getUserSettings({
                        signal: follower.signal,
                    });
                } catch (error) {
                    if (settingsUnsupported(error)) return undefined;
                    throw error;
                }
            },
            () => {
                follower.readFailed = true;
            },
        );
        if (follower.signal.aborted) return;
        follower.readFailed = false;
        follower.online = true;
        settingsReplace(connectionId, response?.settings, undefined);
        flushStart(connectionId);
    };

    const follow = async (connectionId: string, follower: Follower): Promise<void> => {
        for await (const input of follower.source.sync.follow({
            signal: follower.signal,
            events: ["user_settings.updated"],
        })) {
            if (input.kind === "error") {
                follower.online = false;
                follower.readFailed = true;
                continue;
            }
            if (input.kind === "bootstrap") {
                follower.online = true;
                follower.readFailed = false;
                settingsReplace(
                    connectionId,
                    input.bootstrap.userSettings,
                    input.bootstrap.profile.userId,
                );
                flushStart(connectionId);
                continue;
            }
            if (input.kind === "reconcile") {
                await settingsRead(connectionId, follower);
                continue;
            }
            const update = input.update;
            if (update.kind === "connected") {
                follower.online = true;
                if (follower.readFailed) await settingsRead(connectionId, follower);
                else flushStart(connectionId);
            } else if (update.kind === "disconnected") follower.online = false;
            else if (update.kind === "event" && update.event.type === "user_settings.updated")
                settingAdopt(
                    connectionId,
                    update.event.payload.setting,
                    update.event.payload.mutationId,
                );
        }
    };

    /** Applies one change the person made, and sends it if the daemon keeps user settings. */
    const choose = (
        connectionId: string,
        next: (current: Choices) => Choices,
        key: string,
        value: (next: Choices) => UserSettingValue,
    ): void => {
        if (connectionId.length === 0) return;
        const record = recordEnsure(connectionId);
        const current = choicesOf(record);
        const chosen = next(current);
        if (choicesEqual(current, chosen) && !record.saveError) return;
        delete record.saveError;
        // Until the daemon has said whether it keeps user settings, the change
        // is both the device's and queued for the daemon: whichever it turns
        // out to be keeps it.
        if (record.support !== "supported") record.device = chosen;
        if (record.support !== "unsupported" && !choicesEqual(current, chosen))
            writeQueue(record, key, value(chosen));
        commit(connectionId);
        flushStart(connectionId);
    };

    const store: HappyAgentAttentionStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        completionSoundUpdate(connectionId, sound) {
            choose(
                connectionId,
                (current) => ({ ...current, completionSound: sound }),
                COMPLETION_SOUND_KEY,
                (chosen) => completionSoundValue(chosen.completionSound),
            );
        },
        botMutedUpdate(connectionId, botId, muted) {
            choose(
                connectionId,
                (current) => ({
                    ...current,
                    mutedBots: botIdsWith(current.mutedBots, botId, muted),
                }),
                botKey(botId),
                (chosen) => botValue(chosen.mutedBots.has(botId), chosen.hiddenBots.has(botId)),
            );
        },
        botHiddenUpdate(connectionId, botId, hidden) {
            choose(
                connectionId,
                (current) => ({
                    ...current,
                    hiddenBots: botIdsWith(current.hiddenBots, botId, hidden),
                }),
                botKey(botId),
                (chosen) => botValue(chosen.mutedBots.has(botId), chosen.hiddenBots.has(botId)),
            );
        },
    };

    return {
        store,
        connectionFollow(connectionId, source) {
            // One connection is followed through one source at a time.
            followers.get(connectionId)?.stop();
            const active = new AbortController();
            const follower: Follower = {
                source,
                signal: active.signal,
                stop: () => {
                    active.abort();
                    if (followers.get(connectionId) === follower) followers.delete(connectionId);
                },
                online: false,
                flushing: false,
                readFailed: false,
            };
            followers.set(connectionId, follower);
            void follow(connectionId, follower).catch(() => {
                // Only an aborted follow ends; nothing else is thrown out of it.
            });
            return follower.stop;
        },
    };
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
    return next.size === 0 ? NO_BOTS : next;
}

/**
 * A store that keeps the choices for as long as it lives and follows no
 * connection: for Blueprint, tests, and a host with nowhere to send them.
 */
export function happyAgentAttentionStoreCreate(
    options?: HappyAgentAttentionStoreOptions,
): HappyAgentAttentionStore {
    return happyAgentAttentionStoreOwnedCreate(options).store;
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
