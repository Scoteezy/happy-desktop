import type {
    AppHappyAgentDaemonInstall,
    AppHappyAgentDaemonRestartReason,
    AppHappyAgentDaemonStore,
    AppHappyAgentUpdateProgress,
    AppHappyAgentUpdateReason,
    AppHappyAgentUpdateSnapshot,
    AppHappyAgentUpdateStore,
} from "happy-desktop-app";
import {
    LOCAL_HAPPY_AGENT_ID,
    type HappyAgentDirectoryEntry,
    type HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";

/** How long a finished update stays on its card before it clears itself. */
const DONE_VISIBLE_MS = 3_000;
/**
 * How long a drain that has reported nothing yet is kept off screen. The
 * main process polls the daemon every 400ms, so the first real report is
 * usually in by then; a drain with nothing to wait for has moved on.
 */
const REVEAL_HOLD_MS = 1_200;

/**
 * The local agent's update as the footer card tells it.
 *
 * The running steps are the main process's report. The last of them,
 * "reconnecting", is held here past that report until this window is talking
 * to the new daemon again: the main process can reach the daemon before this
 * window's own connection has come back and read the catalog. Only then is the
 * update "done", which this window states for three seconds with the time it
 * took, then clears.
 *
 * "Talking to the new daemon" is read from the window's connection as it is
 * now — the same fact its connection status shows — not from having watched
 * it drop. The main process reports the update finished only once the old
 * daemon has exited and the new one answers, so a connection that is up by
 * then is up on the new daemon. Requiring the drop to have been seen held the
 * card on "Reconnecting" for good whenever this store was not being read at
 * that moment: the sidebar unmounted while Settings was open, or a window
 * opened part-way through.
 *
 * The time is measured from the start the host reports with every step, and
 * to the moment the restart itself finished when the host knows it, as it
 * does for `happy-agent reload`. An older host reports no start; then the time
 * is measured only when this window saw the update begin, and a window opened
 * part-way through says nothing about it rather than a shorter number.
 */
export function desktopAgentUpdateStoreCreate(input: {
    readonly daemon: AppHappyAgentDaemonStore;
    readonly happyAgents: HappyAgentDirectoryStore;
}): AppHappyAgentUpdateStore {
    const listeners = new Set<() => void>();
    let snapshot: AppHappyAgentUpdateSnapshot | undefined;
    let snapshotKey = "";
    let unsubscribe: (() => void) | undefined;

    // One update, from the first report of it until it is cleared.
    let active = false;
    let startedAt: number | undefined;
    // What the host said of it: why, when it began, and when it finished.
    let reason: AppHappyAgentDaemonRestartReason = "install";
    let finishedAt: number | undefined;
    let expanded = true;
    // Held "reconnecting" until the window is connected again.
    let held = false;
    let done: { readonly tookMs?: number } | undefined;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    // The failure the card is showing, so a new one opens the card again.
    let failure: string | undefined;
    let chiefOfStaff: "idle" | "pending" | "refused" = "idle";
    // The reader asked to stop waiting for this drain; cleared once it ends.
    let restartRequested = false;
    // The card appears whole: not on the drain's opening report, which knows
    // nothing yet, but on its first real one, or once the hold runs out.
    let revealed = false;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    const clear = (): void => {
        revealed = false;
        if (revealTimer !== undefined) clearTimeout(revealTimer);
        revealTimer = undefined;
        active = false;
        held = false;
        done = undefined;
        failure = undefined;
        startedAt = undefined;
        reason = "install";
        finishedAt = undefined;
        expanded = true;
        chiefOfStaff = "idle";
        restartRequested = false;
        if (doneTimer !== undefined) clearTimeout(doneTimer);
        doneTimer = undefined;
    };

    const local = (): HappyAgentDirectoryEntry | undefined =>
        input.happyAgents.get().happyAgents.find((entry) => entry.id === LOCAL_HAPPY_AGENT_ID);

    const progressRead = (): AppHappyAgentUpdateProgress | undefined => {
        const install = input.daemon.get().install;
        if (install.phase !== "idle") {
            if (!active || done) {
                clear();
                active = true;
                // The update's own opening report: asked for, nothing drained
                // yet. Anything later is a window that arrived part-way.
                if (
                    install.phase === "draining" &&
                    install.waitingPeak === 0 &&
                    install.waitingFor.length === 0
                )
                    startedAt = Date.now();
                revealTimer = setTimeout(() => {
                    revealTimer = undefined;
                    revealed = true;
                    reconcile();
                }, REVEAL_HOLD_MS);
            }
            reason = install.reason;
            if (install.startedAt !== undefined) startedAt = install.startedAt;
            if (install.phase === "reconnecting" && install.finishedAt !== undefined)
                finishedAt = install.finishedAt;
            if (
                install.phase !== "draining" ||
                install.waitingFor.length > 0 ||
                install.waitingPeak > 0
            )
                revealed = true;
            if (install.phase !== "draining") restartRequested = false;
            if (install.phase === "error") {
                held = false;
                const key = `${install.failedAt}:${install.message}`;
                if (failure !== key) {
                    failure = key;
                    expanded = true;
                    chiefOfStaff = "idle";
                }
            } else {
                held = true;
                failure = undefined;
            }
            return progressProject(install, restartRequested);
        }
        if (done) return { kind: "done", reason: reasonProject(reason), ...done };
        if (!held) {
            if (active) clear();
            return undefined;
        }
        const entry = local();
        if (!entry || !settled(entry)) return { kind: "reconnecting" };
        held = false;
        // A connection that came back failing has its own explanation beside
        // the Happy Agent; "Updated" over it would be untrue.
        if (entry.status === "error") {
            clear();
            return undefined;
        }
        done =
            startedAt === undefined
                ? {}
                : { tookMs: Math.max(0, (finishedAt ?? Date.now()) - startedAt) };
        doneTimer = setTimeout(() => {
            doneTimer = undefined;
            clear();
            reconcile();
        }, DONE_VISIBLE_MS);
        return { kind: "done", reason: reasonProject(reason), ...done };
    };

    const chiefOfStaffAvailable = (): boolean => {
        const entry = local();
        return (
            entry?.status === "connected" &&
            entry.session !== undefined &&
            entry.bots.some((bot) => bot.systemKey === "chief_of_staff")
        );
    };

    const compute = (): AppHappyAgentUpdateSnapshot | undefined => {
        const progress = progressRead();
        if (!progress) return undefined;
        return {
            chiefOfStaff:
                chiefOfStaff === "pending"
                    ? "pending"
                    : chiefOfStaff === "refused" || !chiefOfStaffAvailable()
                      ? "unavailable"
                      : "available",
            expanded,
            progress,
            // Anything past the opening report is real, including a window
            // that arrived part-way or a held "reconnecting".
            revealed: revealed || progress.kind !== "draining",
        };
    };

    function reconcile(): void {
        const next = compute();
        // Directory notifications are frequent and rarely change the card, so
        // only a different card is published.
        const key = next === undefined ? "" : JSON.stringify(next);
        if (key === snapshotKey) return;
        snapshotKey = key;
        snapshot = next;
        for (const listener of listeners) listener();
    }

    return {
        get: () => {
            if (listeners.size === 0) {
                snapshot = compute();
                snapshotKey = snapshot === undefined ? "" : JSON.stringify(snapshot);
            }
            return snapshot;
        },
        subscribe(listener) {
            listeners.add(listener);
            if (listeners.size === 1) {
                const disposers = [
                    input.daemon.subscribe(reconcile),
                    input.happyAgents.subscribe(reconcile),
                ];
                unsubscribe = () => {
                    for (const dispose of disposers) dispose();
                };
                reconcile();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                unsubscribe?.();
                unsubscribe = undefined;
            };
        },
        cardToggle() {
            const current = snapshot?.progress.kind;
            if (current === undefined) return;
            if (current === "done") {
                clear();
            } else if (current === "failed") {
                // Folding a failure away is reading it: the window is handed
                // back exactly as a dismissed failure always has been.
                clear();
                input.daemon.daemonInstallDismiss();
            } else {
                expanded = !expanded;
            }
            reconcile();
        },
        updateRetry() {
            const daemon = input.daemon.get();
            if (daemon.install.phase !== "error") return;
            // An install whose download is still waiting goes again onto it.
            // Otherwise the selected version, which a failed install may
            // already have moved to, is restarted.
            if (daemon.install.reason === "install" && daemon.readyVersion !== undefined)
                input.daemon.daemonInstall();
            else input.daemon.daemonRestart();
        },
        restartNow() {
            const install = input.daemon.get().install;
            if (install.phase !== "draining" || install.reason === "reload" || restartRequested)
                return;
            restartRequested = true;
            reconcile();
            // The main process stops waiting and asks the daemon to exit; its
            // next report is the stop, which clears the request.
            input.daemon.daemonInstallKill();
        },
        chiefOfStaffAsk() {
            const install = input.daemon.get().install;
            const workspace = local()?.session?.workspace;
            if (install.phase !== "error" || chiefOfStaff === "pending" || !workspace) return;
            const key = failure;
            chiefOfStaff = "pending";
            reconcile();
            workspace
                .chiefOfStaffDraftAppend({
                    kind: "updateFailed",
                    message: install.message,
                    step: install.failedAt,
                    version: install.version,
                })
                .then(
                    () => {
                        if (failure === key) chiefOfStaff = "idle";
                        reconcile();
                    },
                    () => {
                        // A daemon left draining, or one not serving at all,
                        // refuses the draft. The link goes rather than stays
                        // as one that leads nowhere.
                        if (failure === key) chiefOfStaff = "refused";
                        reconcile();
                    },
                );
        },
    };
}

/**
 * Whether the window is back in touch with the updated agent, asked only once
 * the main process has reported it serving: connected with its catalog read,
 * or a failure the window explains on its own.
 */
function settled(entry: HappyAgentDirectoryEntry): boolean {
    if (entry.status === "error") return true;
    return entry.status === "connected" && entry.projectsStatus !== "loading";
}

function progressProject(
    install: Exclude<AppHappyAgentDaemonInstall, { phase: "idle" }>,
    restartRequested: boolean,
): AppHappyAgentUpdateProgress {
    const started = install.startedAt === undefined ? {} : { startedAt: install.startedAt };
    switch (install.phase) {
        case "draining":
            return {
                kind: "draining",
                // A reload run from a terminal is not this window's to stop.
                restartNow:
                    install.reason === "reload"
                        ? "unavailable"
                        : restartRequested
                          ? "pending"
                          : "available",
                ...started,
                waitingFor: install.waitingFor,
                waitingPeak: install.waitingPeak,
            };
        case "stopping":
            return { killed: install.killed, kind: "stopping", ...started };
        case "starting":
        case "reconnecting":
            return { kind: install.phase, ...started };
        case "error":
            return {
                failedAt: install.failedAt,
                kind: "failed",
                message: install.message,
                reason: reasonProject(install.reason),
                version: install.version,
            };
    }
}

/** An install moves onto another version; a restart or reload comes back on the same one. */
function reasonProject(reason: AppHappyAgentDaemonRestartReason): AppHappyAgentUpdateReason {
    return reason === "install" ? "update" : "restart";
}
