import { describe, expect, it, vi } from "vitest";

// The package index starts code-highlighting workers, which Node cannot run;
// the view types are all this needs from it.
vi.mock("happy-desktop-ui", () => import("../../../happy-desktop-ui/src/LocalOnboardingScreen"));
vi.mock("./happyAgentDirectoryStore", () => ({ LOCAL_HAPPY_AGENT_ID: "local" }));
import { localOnboardingView, type LocalOnboardingViewSnapshot } from "./localOnboardingStore";
import type {
    DesktopDaemonSnapshot,
    DesktopRuntimeSnapshot,
    LocalOnboardingSnapshot,
} from "../shared/desktopContract";

const REFUSAL =
    "This data was written by a newer Happy Agent (version 0.4.106); update to continue.";

function daemon(extra: Partial<DesktopDaemonSnapshot>): DesktopDaemonSnapshot {
    return {
        install: { phase: "idle" },
        installation: "installed",
        installedVersion: "0.4.104",
        managed: true,
        operation: "idle",
        runtime: "stopped",
        updateAvailable: false,
        versions: [],
        ...extra,
    };
}

function view(
    stage: LocalOnboardingSnapshot["stage"],
    extra: Partial<LocalOnboardingViewSnapshot>,
): LocalOnboardingViewSnapshot {
    return {
        agentStarting: false,
        chiefOfStaffReady: false,
        onboarding: { busy: false, freshness: "checking", stage } as LocalOnboardingSnapshot,
        pending: false,
        providerAuthentication: { complete: false },
        ...extra,
    } as LocalOnboardingViewSnapshot;
}

const refused = {
    phase: "error",
    code: "data_newer",
    message: REFUSAL,
    request: { mode: "local" },
    retryable: false,
    targets: [],
    update: { status: "idle" },
} as const satisfies DesktopRuntimeSnapshot;

describe("a newer-data refusal in setup", () => {
    it("asks for the update instead of offering to try again", () => {
        expect(
            localOnboardingView(
                view("connectFailed", {
                    daemon: daemon({ availableVersion: "0.4.106", updateAvailable: true }),
                    runtime: refused,
                }),
            ),
        ).toEqual({
            kind: "data-newer",
            message: REFUSAL,
            update: { busy: false, version: "0.4.106" },
        });
    });

    it("waits for an update when none is on offer, and reports a failed one", () => {
        expect(
            localOnboardingView(view("connectFailed", { daemon: daemon({}), runtime: refused })),
        ).toEqual({ kind: "data-newer", message: REFUSAL });
        expect(
            localOnboardingView(
                view("connectFailed", {
                    daemon: daemon({
                        availableVersion: "0.4.106",
                        error: "GitHub returned HTTP 500 while downloading Happy Agent.",
                        updateAvailable: true,
                    }),
                    runtime: refused,
                }),
            ),
        ).toMatchObject({
            kind: "data-newer",
            update: { busy: false },
            updateError: "GitHub returned HTTP 500 while downloading Happy Agent.",
        });
    });

    it("shows the update as running while it runs", () => {
        expect(
            localOnboardingView(
                view("connectFailed", {
                    daemon: daemon({ availableVersion: "0.4.106", operation: "upgrading" }),
                    runtime: refused,
                }),
            ),
        ).toMatchObject({ update: { busy: true, version: "0.4.106" } });
    });

    it("never offers an update for an agent Happy does not manage", () => {
        expect(
            localOnboardingView(
                view("connectFailed", {
                    daemon: daemon({ managed: false, updateAvailable: true }),
                    runtime: refused,
                }),
            ),
        ).toEqual({ kind: "data-newer", message: REFUSAL });
    });

    it("explains a first install refused over newer data instead of retrying it", () => {
        const message =
            "Happy Agent 0.4.105 is older than your data, which a newer Happy Agent already updated. It needs Happy Agent 0.4.106 or newer.";
        expect(
            localOnboardingView(
                view("daemonDownload", {
                    daemon: daemon({
                        error: message,
                        errorCode: "data_newer",
                        installation: "missing",
                        installedVersion: undefined,
                    }),
                }),
            ),
        ).toEqual({ kind: "data-newer", message });
    });

    it("leaves every other connection failure on its retry", () => {
        expect(
            localOnboardingView(
                view("connectFailed", {
                    runtime: { ...refused, code: "start_timeout", retryable: true },
                }),
            ),
        ).toMatchObject({ kind: "connect-failed", retrying: false });
    });
});
