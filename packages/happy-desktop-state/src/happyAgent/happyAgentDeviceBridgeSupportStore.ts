import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";

/** Whether a Happy Agent serves local bridges at all. */
export interface HappyAgentDeviceBridgeSupportSnapshot {
    readonly status: "checking" | "supported" | "unsupported";
}

export interface HappyAgentDeviceBridgeSupportStore {
    get(): HappyAgentDeviceBridgeSupportSnapshot;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

export interface HappyAgentDeviceBridgeSupportDeps {
    readonly client: Pick<HappyAgentClient, "getHealth">;
    readonly sync: HappyAgentSync;
}

const CHECKING: HappyAgentDeviceBridgeSupportSnapshot = { status: "checking" };
const SUPPORTED: HappyAgentDeviceBridgeSupportSnapshot = { status: "supported" };
const UNSUPPORTED: HappyAgentDeviceBridgeSupportSnapshot = { status: "unsupported" };
const RETRY_MS = 5_000;

/**
 * One connection's answer to whether it serves local bridges, read from its
 * health and read again whenever the connection is re-established, since that
 * is when a different daemon may be answering.
 *
 * It exists apart from the bridges themselves because the two live for
 * different lengths of time: whether to offer Devices matters wherever the
 * side panel is shown, while the devices plugged into this computer matter
 * only while someone looks at them, and following those starts work in the
 * desktop host.
 */
export function happyAgentDeviceBridgeSupportStoreCreate(
    deps: HappyAgentDeviceBridgeSupportDeps,
): HappyAgentDeviceBridgeSupportStore {
    const listeners = new Set<() => void>();
    let snapshot = CHECKING;
    let controller: AbortController | undefined;
    let pending: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const set = (next: HappyAgentDeviceBridgeSupportSnapshot): void => {
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
                set(health.capabilities?.workspaceBridges === true ? SUPPORTED : UNSUPPORTED);
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

/** For a connection this computer cannot bridge to: never supported, and nothing to follow. */
export const happyAgentDeviceBridgeSupportStoreNone: HappyAgentDeviceBridgeSupportStore = {
    get: () => UNSUPPORTED,
    subscribe: () => () => undefined,
    [Symbol.dispose]: () => undefined,
};
