import type {
    AppHappyAgentDaemonInstall,
    AppHappyAgentDaemonSnapshot,
    AppHappyAgentDaemonStore,
} from "happy-desktop-app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopAgentUpdateStoreCreate } from "./desktopAgentUpdateStore";
import type {
    HappyAgentDirectoryEntry,
    HappyAgentDirectorySnapshot,
    HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";

// The directory store's module brings the whole application; its id is enough.
vi.mock("./happyAgentDirectoryStore", () => ({ LOCAL_HAPPY_AGENT_ID: "local" }));

const LOCAL_HAPPY_AGENT_ID = "local";

const DRAINING: AppHappyAgentDaemonInstall = {
    killable: false,
    phase: "draining",
    reason: "install",
    version: "1.2.0",
    waitingFor: [],
    waitingPeak: 0,
};
const STOPPING: AppHappyAgentDaemonInstall = {
    killed: false,
    phase: "stopping",
    reason: "install",
    version: "1.2.0",
};
const STARTING: AppHappyAgentDaemonInstall = {
    phase: "starting",
    reason: "install",
    version: "1.2.0",
};
const RECONNECTING: AppHappyAgentDaemonInstall = {
    phase: "reconnecting",
    reason: "install",
    version: "1.2.0",
};
const IDLE: AppHappyAgentDaemonInstall = { phase: "idle" };

function daemonCreate() {
    const listeners = new Set<() => void>();
    let snapshot: AppHappyAgentDaemonSnapshot = {
        install: IDLE,
        managed: true,
        operation: "idle",
        runtime: "ready",
        updateAvailable: false,
        versions: [],
    };
    const store: AppHappyAgentDaemonStore = {
        daemonCheck: () => undefined,
        daemonInstall: () => undefined,
        daemonInstallDismiss: () => undefined,
        daemonInstallKill: () => undefined,
        daemonRestart: () => undefined,
        daemonUpgrade: () => undefined,
        daemonVersionSelect: () => undefined,
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    return {
        store,
        report(install: AppHappyAgentDaemonInstall) {
            snapshot = { ...snapshot, install };
            for (const listener of listeners) listener();
        },
    };
}

function directoryCreate() {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentDirectorySnapshot = { happyAgents: [] };
    const store: HappyAgentDirectoryStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        happyAgentActivate: () => undefined,
        happyAgentReorder: () => undefined,
    };
    const local = (
        status: HappyAgentDirectoryEntry["status"],
        projectsStatus: HappyAgentDirectoryEntry["projectsStatus"],
    ) => {
        snapshot = {
            activeHappyAgentId: LOCAL_HAPPY_AGENT_ID,
            happyAgents: [
                {
                    bots: [],
                    botsCreating: [],
                    id: LOCAL_HAPPY_AGENT_ID,
                    label: "This Mac",
                    projectAdd: { pending: false },
                    projects: [],
                    projectsStatus,
                    status,
                    subtaskFailures: new Map(),
                    taskFailures: new Map(),
                    tasks: [],
                },
            ],
        };
        for (const listener of listeners) listener();
    };
    local("connected", "ready");
    return { local, store };
}

describe("desktop agent update store", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("finishes once the window is connected, though it was not watching when the connection dropped", () => {
        const daemon = daemonCreate();
        const directory = directoryCreate();
        const store = desktopAgentUpdateStoreCreate({
            daemon: daemon.store,
            happyAgents: directory.store,
        });

        // The sidebar card is on screen as the update begins.
        const unsubscribe = store.subscribe(() => undefined);
        daemon.report(DRAINING);
        expect(store.get()?.progress.kind).toBe("draining");

        // Settings replaces the sidebar, so nothing reads the store while the
        // old daemon stops and the window's connection drops and comes back.
        unsubscribe();
        daemon.report(STOPPING);
        directory.local("disconnected", "ready");
        daemon.report(STARTING);
        daemon.report(RECONNECTING);
        directory.local("connected", "ready");
        daemon.report(IDLE);

        // Back on the sidebar, the window is plainly connected again.
        store.subscribe(() => undefined);
        expect(store.get()?.progress.kind).toBe("done");
    });

    it("finishes in a window that first saw the update part-way through", () => {
        const daemon = daemonCreate();
        const directory = directoryCreate();
        const store = desktopAgentUpdateStoreCreate({
            daemon: daemon.store,
            happyAgents: directory.store,
        });
        // Opened after the old daemon had gone: this window's first connection
        // is already to the new one.
        daemon.report(RECONNECTING);
        store.subscribe(() => undefined);
        expect(store.get()?.progress.kind).toBe("reconnecting");

        daemon.report(IDLE);
        expect(store.get()?.progress).toEqual({ kind: "done" });
    });

    it("holds reconnecting until the window's own connection has read the catalog", () => {
        const daemon = daemonCreate();
        const directory = directoryCreate();
        const store = desktopAgentUpdateStoreCreate({
            daemon: daemon.store,
            happyAgents: directory.store,
        });
        const listener = vi.fn();
        store.subscribe(listener);
        daemon.report(DRAINING);
        daemon.report(STOPPING);
        directory.local("disconnected", "ready");
        daemon.report(STARTING);
        daemon.report(RECONNECTING);
        daemon.report(IDLE);

        expect(store.get()?.progress.kind).toBe("reconnecting");
        directory.local("connected", "loading");
        expect(store.get()?.progress.kind).toBe("reconnecting");
        directory.local("connected", "ready");
        expect(store.get()?.progress).toMatchObject({ kind: "done", tookMs: expect.any(Number) });

        vi.advanceTimersByTime(3_000);
        expect(store.get()).toBeUndefined();
    });
});
