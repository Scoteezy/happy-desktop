import { useSyncExternalStore, type ReactNode } from "react";
import type { AppHappyAgentDaemonInstall, AppHappyAgentDaemonStore } from "happy-desktop-app";
import { SetupPage, SetupPrompt } from "happy-desktop-ui";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectoryStore } from "./happyAgentDirectoryStore";
import type { DesktopRuntimeStore } from "./runtimeStore";

/**
 * How long the local Happy Agent must stay failed before it takes the window.
 * Long enough that a reconnect blip never flashes a full-window screen, short
 * enough that a dead agent is said plainly almost at once.
 */
const BROKEN_HOLD_MS = 3_000;

const HAPPY_URL = "https://happy.engineering";
const HAPPY_AGENT_REPOSITORY_URL = "https://github.com/slopus/happy-agent";

export interface DesktopAgentBrokenSnapshot {
    /** The local Happy Agent is broken and the window should say only that. */
    readonly visible: boolean;
    /** What the local connection last reported, verbatim. */
    readonly message?: string;
    /** The local Happy Agent's version, when it has ever been known. */
    readonly version?: string;
    /** This Happy can restart the agent itself: it installed and manages it. */
    readonly restartable: boolean;
    /** The restart's own progress, from the host's report. */
    readonly install: AppHappyAgentDaemonInstall;
}

export interface DesktopAgentBrokenStore {
    get(): DesktopAgentBrokenSnapshot;
    subscribe(listener: () => void): () => void;
    /** Restarts the local Happy Agent through the host's managed restart. */
    restart(): void;
    /** Stops waiting for a drain that will not finish and takes the agent down now. */
    kill(): void;
}

const hidden: DesktopAgentBrokenSnapshot = {
    visible: false,
    restartable: false,
    install: { phase: "idle" },
};

/**
 * Whether the local Happy Agent is broken badly enough to own the window.
 *
 * Only the local host counts: every remote reaches this window through it, so
 * when it is gone nothing behind the ordinary layout works, while a remote that
 * fails is one machine of several and stays a notice beside itself. The startup
 * screens keep the window while the runtime still owns it, a protocol gap has a
 * screen of its own, and a restart someone started elsewhere keeps its update
 * card — unless it fails, which is a broken agent again.
 *
 * A restart asked for from this screen keeps the screen until the agent is
 * connected again, so the window does not drop back to the layout mid-restart.
 */
export function desktopAgentBrokenStoreCreate(input: {
    readonly daemon: AppHappyAgentDaemonStore;
    readonly happyAgents: HappyAgentDirectoryStore;
    readonly runtime: DesktopRuntimeStore;
}): DesktopAgentBrokenStore {
    const listeners = new Set<() => void>();
    let snapshot = hidden;
    let snapshotKey = "";
    let brokenSince: number | undefined;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let requested = false;
    let unsubscribes: (() => void)[] = [];

    const holdClear = (): void => {
        if (holdTimer !== undefined) clearTimeout(holdTimer);
        holdTimer = undefined;
    };

    const read = (): DesktopAgentBrokenSnapshot => {
        const directory = input.happyAgents.get();
        const local = directory.happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID);
        const daemon = input.daemon.get();
        const runtime = input.runtime.get();
        if (local?.status === "connected") requested = false;
        const mounted =
            runtime?.phase === "ready" ||
            directory.happyAgents.some((entry) => entry.session !== undefined);
        const broken =
            mounted &&
            local !== undefined &&
            local.protocolMismatch === undefined &&
            (local.status === "error" || local.status === "disconnected");
        if (!broken) {
            brokenSince = undefined;
            holdClear();
        } else if (brokenSince === undefined) {
            brokenSince = Date.now();
            holdTimer = setTimeout(() => {
                holdTimer = undefined;
                reconcile();
            }, BROKEN_HOLD_MS);
        }
        const held = brokenSince !== undefined && Date.now() - brokenSince >= BROKEN_HOLD_MS;
        const settled = daemon.install.phase === "idle" || daemon.install.phase === "error";
        const visible =
            (held && settled) || (requested && local !== undefined && local.status !== "connected");
        if (!visible) return hidden;
        const version = local?.version ?? daemon.installedVersion;
        return {
            visible,
            ...(local?.message ? { message: local.message } : {}),
            ...(version ? { version } : {}),
            restartable: daemon.managed && daemon.installedVersion !== undefined,
            install: daemon.install,
        };
    };

    const reconcile = (): void => {
        const next = read();
        const key = JSON.stringify(next);
        if (key === snapshotKey) return;
        snapshotKey = key;
        snapshot = next;
        for (const listener of listeners) listener();
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                unsubscribes = [
                    input.happyAgents.subscribe(reconcile),
                    input.daemon.subscribe(reconcile),
                    input.runtime.subscribe(reconcile),
                ];
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                for (const unsubscribe of unsubscribes) unsubscribe();
                unsubscribes = [];
                holdClear();
                brokenSince = undefined;
            };
        },
        restart() {
            requested = true;
            input.daemon.daemonRestart();
            reconcile();
        },
        kill() {
            input.daemon.daemonInstallKill();
        },
    };
}

/**
 * The prompt someone can hand to any other assistant when Happy itself cannot
 * help: what they are using, what the app actually saw, and where the agent's
 * own documentation lives. It names the repository rather than a path on this
 * machine, so it reads the same on every platform.
 */
export function desktopAgentBrokenPrompt(snapshot: DesktopAgentBrokenSnapshot): string {
    const restartFailure =
        snapshot.install.phase === "error"
            ? ` Restarting it from the app failed: "${snapshot.install.message}".`
            : "";
    return (
        `I'm using Happy (${HAPPY_URL}), and the local Happy Agent on this computer is broken.` +
        ` The Happy desktop app reports: "${snapshot.message ?? "The local Happy Agent is not responding."}"` +
        (snapshot.version ? ` Happy Agent version: ${snapshot.version}.` : "") +
        restartFailure +
        ` Help me diagnose and recover it. Happy Agent's source code and documentation are at` +
        ` ${HAPPY_AGENT_REPOSITORY_URL}; its CLI is \`happy-agent\` with the subcommands` +
        ` start, stop, kill, reload, and status.`
    );
}

function restartStatus(
    install: AppHappyAgentDaemonInstall,
): { readonly label: string; readonly busy: boolean } | undefined {
    switch (install.phase) {
        case "idle":
            return undefined;
        case "draining":
            return { label: "Asking Happy Agent to stop…", busy: true };
        case "stopping":
            return { label: "Stopping Happy Agent…", busy: true };
        case "starting":
            return { label: "Starting Happy Agent…", busy: true };
        case "reconnecting":
            return { label: "Reconnecting…", busy: true };
        case "error":
            return { label: `Restart failed: ${install.message}`, busy: false };
    }
}

/**
 * The whole window while the local Happy Agent is broken, and nothing at all
 * otherwise. Like the protocol gate, it is the host alone; see the store.
 */
export function DesktopAgentBrokenGate(props: {
    readonly children: ReactNode;
    readonly store: DesktopAgentBrokenStore;
}) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    if (!snapshot.visible) return <>{props.children}</>;
    const status = restartStatus(snapshot.install);
    const restarting = status?.busy === true;
    return (
        <SetupPage
            {...(snapshot.restartable
                ? {
                      action: {
                          busy: restarting,
                          label: "Restart Happy Agent",
                          onSelect: props.store.restart,
                      },
                  }
                : {})}
            {...(snapshot.install.phase === "draining" && snapshot.install.killable
                ? { secondary: { label: "Stop it now", onSelect: props.store.kill } }
                : {})}
            copy={
                snapshot.restartable
                    ? (snapshot.message ?? "The local Happy Agent is not responding.")
                    : `${snapshot.message ?? "The local Happy Agent is not responding."} This Happy Agent is managed outside Happy; restart it there.`
            }
            data-testid="desktop-agent-broken-screen"
            scene="owl"
            {...(status ? { status } : {})}
            title="Happy is in a broken state"
        >
            <SetupPrompt label="prompt" prompt={desktopAgentBrokenPrompt(snapshot)} />
        </SetupPage>
    );
}
