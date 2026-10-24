import {
    HappyAgentApiError,
    type HappyAgentClient,
    type HappyAgentEvent,
    type Sticker,
    type StickerPack,
    type StickerPackKind,
    type StickerRef,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { deepEqual } from "../happyAgent/happyAgentSupport.js";
import { cuid2Create } from "../utils/cuid2Create.js";

/** A search the picker shows in place of its packs while its field holds text. */
export interface HappyAgentStickerSearch {
    readonly query: string;
    readonly kind: StickerPackKind;
    readonly status: "loading" | "ready";
    readonly results: readonly Sticker[];
}

export interface HappyAgentStickersSnapshot {
    /** `unavailable` when the daemon has no stickers or the person has Stories off. */
    readonly status: "loading" | "unavailable" | "ready";
    /** Every pack, in catalog order. */
    readonly packs: readonly StickerPack[];
    /** Each pack's stickers, in pack order, once read. */
    readonly stickers: ReadonlyMap<string, readonly Sticker[]>;
    /** The person's recently used stickers, most recent first. */
    readonly recents: readonly StickerRef[];
    readonly search?: HappyAgentStickerSearch;
}

/**
 * The daemon's sticker catalog and the person's recents, for the story editor's
 * picker and for drawing sticker overlays. Packs are read when something
 * subscribes; a pack's stickers when a surface asks for them.
 */
export interface HappyAgentStickersStore {
    get(): HappyAgentStickersSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: packs whose stickers a surface draws. Never publishes in this call. */
    packsRequest(packIds: readonly string[]): void;
    /** The picker's search field; an empty query ends the search. */
    searchUpdate(query: string, kind: StickerPackKind): void;
    /** A sticker landed on a frame: it moves to the front of the recents. */
    stickerUse(sticker: StickerRef): void;
    /** The ✕ beside Recently used. */
    recentsClear(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentStickersDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "listStickerPacks"
        | "getStickerPack"
        | "searchStickers"
        | "getStickerRecents"
        | "useSticker"
        | "clearStickerRecents"
    >;
    readonly sync: HappyAgentSync;
    readonly now?: () => number;
}

const STICKER_EVENT_TYPES = [
    "sticker_recents.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

/** Emoji alone, so a search for one matches by tag rather than by pack title. */
const EMOJI_ONLY = /^\p{Extended_Pictographic}[\p{Extended_Pictographic}\p{M}\u200d\ufe0f]*$/u;

export function happyAgentStickersStoreCreate(
    deps: HappyAgentStickersDeps,
): HappyAgentStickersStore {
    const idCreate = cuid2Create(deps.now ?? Date.now);
    const listeners = new Set<() => void>();
    const wanted = new Set<string>();
    const reading = new Set<string>();
    let snapshot: HappyAgentStickersSnapshot = {
        status: "loading",
        packs: [],
        stickers: new Map(),
        recents: [],
    };
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let searching: AbortController | undefined;
    let disposed = false;

    const publish = (next: HappyAgentStickersSnapshot): void => {
        snapshot = next;
        for (const listener of [...listeners]) listener();
    };
    const recentsSet = (recents: readonly StickerRef[]): void => {
        if (!deepEqual(recents, snapshot.recents)) publish({ ...snapshot, recents });
    };

    const packRead = (packId: string, signal: AbortSignal): void => {
        if (reading.has(packId)) return;
        reading.add(packId);
        void deps.client
            .getStickerPack(packId, { signal })
            .then((answer) => {
                if (disposed || signal.aborted) return;
                const held = snapshot.stickers.get(packId);
                if (held && deepEqual(held, answer.stickers)) return;
                const stickers = new Map(snapshot.stickers);
                stickers.set(packId, answer.stickers);
                publish({ ...snapshot, stickers });
            })
            .catch((error: unknown) => {
                // A pack gone from the catalog stays gone; a passing failure is
                // read again shortly, as a reconnect would.
                if (error instanceof HappyAgentApiError && error.status === 404) return;
                setTimeout(() => {
                    if (!disposed && !signal.aborted && !snapshot.stickers.has(packId))
                        packRead(packId, signal);
                }, 3_000);
            })
            .finally(() => reading.delete(packId));
    };
    const catalogRead = (signal: AbortSignal): void => {
        void Promise.all([
            deps.client.listStickerPacks({ signal }),
            deps.client.getStickerRecents({ signal }),
        ])
            .then(([packs, recents]) => {
                if (disposed || signal.aborted) return;
                publish({
                    ...snapshot,
                    status: "ready",
                    packs: deepEqual(packs.packs, snapshot.packs) ? snapshot.packs : packs.packs,
                    recents: deepEqual(recents.recents, snapshot.recents)
                        ? snapshot.recents
                        : recents.recents,
                });
                for (const packId of wanted) packRead(packId, signal);
            })
            .catch((error: unknown) => {
                if (disposed || signal.aborted) return;
                if (error instanceof HappyAgentApiError && error.status === 404)
                    publish({ ...snapshot, status: "unavailable" });
            });
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        let failed = false;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...STICKER_EVENT_TYPES],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    failed = false;
                    catalogRead(active.signal);
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                const event = input.update.event;
                if (event.type === "sticker_recents.updated") recentsSet(event.payload.recents);
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        following?.abort();
        following = undefined;
        searching?.abort();
        searching = undefined;
        reading.clear();
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        packsRequest(packIds) {
            if (disposed) return;
            for (const packId of packIds) {
                if (wanted.has(packId)) continue;
                wanted.add(packId);
                const active = following;
                if (active && snapshot.status === "ready")
                    queueMicrotask(() => packRead(packId, active.signal));
            }
        },
        searchUpdate(query, kind) {
            if (disposed) return;
            searching?.abort();
            searching = undefined;
            const text = query.trim();
            if (text === "") {
                if (snapshot.search) {
                    const { search: _search, ...rest } = snapshot;
                    publish(rest);
                }
                return;
            }
            const active = new AbortController();
            searching = active;
            publish({
                ...snapshot,
                search: {
                    query,
                    kind,
                    status: "loading",
                    results: snapshot.search?.results ?? [],
                },
            });
            const emoji = EMOJI_ONLY.test(text);
            void deps.client
                .searchStickers(
                    { ...(emoji ? { emoji: text } : { q: text.slice(0, 64) }), kind, limit: 200 },
                    { signal: active.signal },
                )
                .then((answer) => {
                    if (disposed || active.signal.aborted) return;
                    publish({
                        ...snapshot,
                        search: { query, kind, status: "ready", results: answer.stickers },
                    });
                })
                .catch(() => {
                    if (disposed || active.signal.aborted) return;
                    publish({ ...snapshot, search: { query, kind, status: "ready", results: [] } });
                });
        },
        stickerUse(sticker) {
            if (disposed) return;
            // The person's own act: the sticker leads Recently used at once.
            recentsSet(
                [
                    sticker,
                    ...snapshot.recents.filter(
                        (recent) =>
                            recent.packId !== sticker.packId ||
                            recent.stickerId !== sticker.stickerId,
                    ),
                ].slice(0, 20),
            );
            void deps.client
                .useSticker({ ...sticker, mutationId: idCreate() })
                .then((answer) => recentsSet(answer.recents))
                .catch(() => undefined);
        },
        recentsClear() {
            if (disposed) return;
            recentsSet([]);
            void deps.client
                .clearStickerRecents({ mutationId: idCreate() })
                .then((answer) => recentsSet(answer.recents))
                .catch(() => undefined);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
