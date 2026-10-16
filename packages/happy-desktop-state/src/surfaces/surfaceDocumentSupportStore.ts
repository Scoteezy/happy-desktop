import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";

/** Whether a Happy Agent serves collaborative documents, which can be made and written here. */
export interface HappyAgentSurfaceDocumentSupportSnapshot {
    readonly status: "checking" | "supported" | "unsupported";
}

export interface HappyAgentSurfaceDocumentSupportStore {
    get(): HappyAgentSurfaceDocumentSupportSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfaceDocumentSupportDeps {
    readonly client: Pick<HappyAgentClient, "getHealth">;
    readonly sync: HappyAgentSync;
}

const CHECKING: HappyAgentSurfaceDocumentSupportSnapshot = { status: "checking" };
const SUPPORTED: HappyAgentSurfaceDocumentSupportSnapshot = { status: "supported" };
const UNSUPPORTED: HappyAgentSurfaceDocumentSupportSnapshot = { status: "unsupported" };
const RETRY_MS = 5_000;

/**
 * One connection's answer to whether it serves collaborative documents, read
 * from its health and read again whenever the connection is re-established,
 * since that is when a different daemon may be answering. Offering a new
 * document waits on it: an older Happy Agent can show a document, but nobody
 * can write one here.
 */
export function happyAgentSurfaceDocumentSupportStoreCreate(
    deps: HappyAgentSurfaceDocumentSupportDeps,
): HappyAgentSurfaceDocumentSupportStore {
    const listeners = new Set<() => void>();
    let snapshot = CHECKING;
    let controller: AbortController | undefined;
    let pending: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const set = (next: HappyAgentSurfaceDocumentSupportSnapshot): void => {
        if (next === snapshot) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    const check = (parent: AbortSignal): void => {
        pending?.abort();
        if (retry) clearTimeout(retry);
        retry = undefined;
        const own = new AbortController();
        pending = own;
        const signal = AbortSignal.any([parent, own.signal]);
        void deps.client.getHealth({ signal }).then(
            (health) => {
                if (signal.aborted) return;
                set(health.capabilities?.collaborativeDocuments === true ? SUPPORTED : UNSUPPORTED);
            },
            () => {
                // Not knowing is not "unsupported": an offer already made stays
                // while the connection is asked again.
                if (signal.aborted) return;
                retry = setTimeout(() => check(parent), RETRY_MS);
            },
        );
    };

    const start = (): void => {
        if (controller) return;
        const active = new AbortController();
        controller = active;
        void (async () => {
            for await (const input of deps.sync.follow({ signal: active.signal, events: [] })) {
                if (input.kind === "bootstrap" || input.kind === "reconcile") check(active.signal);
                else if (input.kind === "update" && input.update.kind === "connected")
                    check(active.signal);
            }
        })().catch(() => undefined);
    };

    const stop = (): void => {
        pending?.abort();
        pending = undefined;
        controller?.abort();
        controller = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        [Symbol.dispose]() {
            stop();
            listeners.clear();
        },
    };
}

/** For a connection without Surfaces: never supported, and nothing to follow. */
export const happyAgentSurfaceDocumentSupportStoreNone: HappyAgentSurfaceDocumentSupportStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    [Symbol.dispose]: () => undefined,
};
