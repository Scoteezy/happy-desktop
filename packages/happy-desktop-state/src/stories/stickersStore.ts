import {
    HappyAgentApiError,
    type HappyAgentClient,
    type Sticker,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { deepEqual } from "../happyAgent/happyAgentSupport.js";

export interface HappyAgentStickersSnapshot {
    /** `unavailable` when the daemon has no stickers or the person has Stories off. */
    readonly status: "loading" | "unavailable" | "ready";
    /** Each requested pack's stickers, in pack order, once read. */
    readonly stickers: ReadonlyMap<string, readonly Sticker[]>;
}

/**
 * The daemon's sticker catalog, for drawing sticker overlays. The catalog is
 * read when something subscribes; a pack's stickers when a surface asks for
 * them.
 */
export interface HappyAgentStickersStore {
    get(): HappyAgentStickersSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: packs whose stickers a surface draws. Never publishes in this call. */
    packsRequest(packIds: readonly string[]): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentStickersDeps {
    readonly client: Pick<HappyAgentClient, "listStickerPacks" | "getStickerPack">;
    readonly sync: HappyAgentSync;
}

export function happyAgentStickersStoreCreate(
    deps: HappyAgentStickersDeps,
): HappyAgentStickersStore {
    const listeners = new Set<() => void>();
    const wanted = new Set<string>();
    const reading = new Set<string>();
    let snapshot: HappyAgentStickersSnapshot = {
        status: "loading",
        stickers: new Map(),
    };
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const publish = (next: HappyAgentStickersSnapshot): void => {
        snapshot = next;
        for (const listener of [...listeners]) listener();
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
        void deps.client
            .listStickerPacks({ signal })
            .then(() => {
                if (disposed || signal.aborted) return;
                if (snapshot.status !== "ready") publish({ ...snapshot, status: "ready" });
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
            for await (const input of deps.sync.follow({ signal: active.signal, events: [] })) {
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
                }
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
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };
}
