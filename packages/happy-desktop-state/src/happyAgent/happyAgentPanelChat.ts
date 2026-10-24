import type {
    HappyAgentChatSnapshot,
    HappyAgentChatStore,
    HappyAgentTraceViewer,
} from "./happyAgentChatStore.js";
import type { HappyAgentChatHandle } from "./happyAgentClient.js";

/** One chat read beside another: loading until its transcript store arrives. */
export type HappyAgentPanelChatSnapshot =
    | { readonly type: "loading" }
    | { readonly type: "ready"; readonly chat: HappyAgentChatSnapshot }
    | { readonly type: "error"; readonly message: string };

/**
 * A chat shown in a panel tab rather than as the open conversation. It only
 * reads: the reader writes to a chat by opening it.
 */
export interface HappyAgentPanelChatStore {
    get(): HappyAgentPanelChatSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens or closes one finished turn's intermediate steps. */
    turnTraceToggle(turnId: string): void;
    turnTracesSeen(viewer: HappyAgentTraceViewer, turnIds: ReadonlySet<string>): void;
}

/** The panel owns a chat tab's store for as long as the tab is open. */
export interface HappyAgentPanelChatHandle extends HappyAgentPanelChatStore, Disposable {}

const LOADING: HappyAgentPanelChatSnapshot = { type: "loading" };

/**
 * Acquires one chat's shared transcript store and follows it until disposed.
 * The acquisition is the client's reference-counted one, so a chat that is
 * also open elsewhere is read from the same store, and a handle that arrives
 * after the tab has closed is released at once.
 */
export function happyAgentPanelChatOpen(
    acquire: () => Promise<HappyAgentChatHandle>,
): HappyAgentPanelChatHandle {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentPanelChatSnapshot = LOADING;
    let store: HappyAgentChatStore | undefined;
    let release: (() => void) | undefined;
    let disposed = false;
    const notify = () => {
        for (const listener of listeners) listener();
    };
    void acquire().then(
        (handle) => {
            if (disposed) {
                handle[Symbol.dispose]();
                return;
            }
            store = handle.store;
            const follow = () => {
                const chat = handle.store.get();
                if (snapshot.type === "ready" && snapshot.chat === chat) return;
                snapshot = { type: "ready", chat };
                notify();
            };
            const unsubscribe = handle.store.subscribe(follow);
            release = () => {
                unsubscribe();
                handle[Symbol.dispose]();
            };
            follow();
        },
        (error: unknown) => {
            if (disposed) return;
            snapshot = {
                type: "error",
                message: error instanceof Error ? error.message : "This chat could not be opened.",
            };
            notify();
        },
    );
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        turnTraceToggle(turnId) {
            store?.turnTraceToggle(turnId);
        },
        turnTracesSeen(viewer, turnIds) {
            store?.turnTracesSeen(viewer, turnIds);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            release?.();
            release = undefined;
            store = undefined;
            listeners.clear();
        },
    };
}
