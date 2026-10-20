import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DesktopDaemonInstall } from "../shared/desktopContract";
import { DesktopDaemonController } from "./desktopDaemonController";
import { happyDaemonPaths } from "./happyAgentBinaryPaths";
import { happyAgentReloadStatusParse } from "./happyAgentReloadStatus";

const temporaryRoots: string[] = [];
const stops: (() => void)[] = [];
afterEach(async () => {
    for (const stop of stops.splice(0)) stop();
    const parent = resolve(tmpdir()) + sep;
    for (const root of temporaryRoots.splice(0)) {
        if (!resolve(root).startsWith(parent) || !root.includes("happy-reload-status-"))
            throw new Error("Refusing to remove an unexpected fixture directory.");
        await rm(root, { recursive: true, force: true });
    }
});

/** A process that has certainly exited: the largest pid macOS and Linux never hand out. */
const EXITED_PID = 2 ** 22 + 1;

function status(fields: Record<string, unknown>): Record<string, unknown> {
    const now = Date.now();
    return {
        format: 1,
        operationId: "op-1",
        pid: process.pid,
        startedAt: now - 4_000,
        updatedAt: now,
        phase: "draining",
        phaseStartedAt: now - 4_000,
        version: "0.9.1",
        ...fields,
    };
}

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "happy-reload-status-"));
    temporaryRoots.push(root);
    const paths = happyDaemonPaths({ HAPPY_HOME_DIR: join(root, "happy") });
    await mkdir(paths.agentDirectory, { recursive: true });
    const controller = await DesktopDaemonController.create({ paths });
    const installs: DesktopDaemonInstall[] = [];
    controller.subscribe((snapshot) => {
        const last = installs.at(-1);
        if (JSON.stringify(last) !== JSON.stringify(snapshot.install))
            installs.push(snapshot.install);
    });
    controller.runtimeSet({
        phase: "choosing",
        targets: [],
        update: { status: "idle" } as never,
    });
    const write = async (fields: Record<string, unknown>): Promise<void> => {
        const path = join(paths.agentDirectory, "reload.json");
        await writeFile(`${path}.tmp`, JSON.stringify(status(fields)), { mode: 0o600 });
        await rename(`${path}.tmp`, path);
    };
    return { controller, installs, write };
}

/** Waits for the watcher's half-second poll to see a write. */
function settle(): Promise<void> {
    return new Promise((done) => setTimeout(done, 1_300));
}

describe("happy-agent reload status", { timeout: 30_000 }, () => {
    it("reads format 1 and ignores fields it does not know", () => {
        const parsed = happyAgentReloadStatusParse(
            JSON.stringify(
                status({
                    future: { anything: true },
                    waitingFor: [
                        {
                            agents: [{ id: "a1", stage: "tools" }],
                            count: 1,
                            name: "agents",
                        },
                    ],
                    waitingPeak: 2,
                }),
            ),
        );
        expect(parsed).toMatchObject({
            operationId: "op-1",
            phase: "draining",
            version: "0.9.1",
            waitingFor: [{ agents: [{ id: "a1", stage: "tools" }], count: 1, name: "agents" }],
            waitingPeak: 2,
        });
        expect(parsed).not.toHaveProperty("future");
    });

    it("reads anything else as no reload", () => {
        expect(happyAgentReloadStatusParse("{")).toBeUndefined();
        expect(happyAgentReloadStatusParse(JSON.stringify(status({ format: 2 })))).toBeUndefined();
        expect(
            happyAgentReloadStatusParse(JSON.stringify(status({ phase: "paused" }))),
        ).toBeUndefined();
    });

    it("shows a reload run outside the app through every step, then hands the window back", async () => {
        const { controller, installs, write } = await fixture();
        stops.push(controller.reloadWatch());
        const startedAt = Date.now() - 4_000;
        await write({
            startedAt,
            waitingFor: [{ count: 1, name: "agents", agents: [{ id: "a1", stage: "tools" }] }],
            waitingPeak: 1,
        });
        await settle();
        expect(controller.get().install).toEqual({
            killable: false,
            phase: "draining",
            reason: "reload",
            startedAt,
            version: "0.9.1",
            waitingFor: [{ agents: [{ id: "a1", stage: "tools" }], count: 1, name: "agents" }],
            waitingPeak: 1,
        });
        await write({ phase: "stopping", startedAt });
        await settle();
        expect(controller.get().install).toMatchObject({ killed: false, phase: "stopping" });
        await write({ phase: "starting", startedAt });
        await settle();
        expect(controller.get().install).toMatchObject({ phase: "starting", startedAt });

        // Done is held as reconnecting until this window is connected again.
        const finishedAt = Date.now();
        await write({ finishedAt, phase: "done", startedAt });
        await settle();
        expect(controller.get().install).toEqual({
            finishedAt,
            phase: "reconnecting",
            reason: "reload",
            startedAt,
            version: "0.9.1",
        });
        controller.runtimeSet({
            activeTarget: { happyAgentVersion: "0.9.1" } as never,
            activeTargetId: "local",
            connectionId: 1,
            mode: "local",
            phase: "ready",
            targets: [],
            update: { status: "idle" } as never,
        });
        await settle();
        expect(controller.get().install).toEqual({ phase: "idle" });
        expect(installs.map((install) => install.phase)).toEqual([
            "draining",
            "stopping",
            "starting",
            "reconnecting",
            "idle",
        ]);

        // Shown once: the same report read again changes nothing.
        await write({ finishedAt, phase: "done", startedAt, updatedAt: Date.now() });
        await settle();
        expect(controller.get().install).toEqual({ phase: "idle" });
    });

    it("passes over a finished reload that was already old when first seen", async () => {
        const { controller, write } = await fixture();
        await write({ finishedAt: Date.now() - 31_000, phase: "done" });
        stops.push(controller.reloadWatch());
        await settle();
        expect(controller.get().install).toEqual({ phase: "idle" });
    });

    it("shows a fresh failure, with where it stopped", async () => {
        const { controller, write } = await fixture();
        stops.push(controller.reloadWatch());
        await write({
            failedAt: "starting",
            finishedAt: Date.now(),
            message: "The new Happy Agent was not ready after 5 minutes.",
            phase: "failed",
        });
        await settle();
        expect(controller.get().install).toMatchObject({
            failedAt: "starting",
            message: "The new Happy Agent was not ready after 5 minutes.",
            phase: "error",
            reason: "reload",
        });
    });

    it("ignores an abandoned reload it never showed, and fails one it did", async () => {
        const { controller, write } = await fixture();
        stops.push(controller.reloadWatch());
        // Its command has exited: never shown.
        await write({ operationId: "gone", pid: EXITED_PID });
        await settle();
        expect(controller.get().install).toEqual({ phase: "idle" });
        // Its report stopped moving: never shown.
        await write({ operationId: "stale", updatedAt: Date.now() - 16_000 });
        await settle();
        expect(controller.get().install).toEqual({ phase: "idle" });

        // Shown running, then its command exits mid-reload.
        await write({ operationId: "live", phase: "stopping" });
        await settle();
        expect(controller.get().install).toMatchObject({ phase: "stopping", reason: "reload" });
        await write({ operationId: "live", phase: "stopping", pid: EXITED_PID });
        await settle();
        expect(controller.get().install).toMatchObject({
            failedAt: "stopping",
            phase: "error",
            reason: "reload",
        });
    });
});
