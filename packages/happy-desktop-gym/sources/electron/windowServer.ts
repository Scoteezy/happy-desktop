import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

/** What the macOS window server saw of one process while it was watched. */
export interface WindowServerReport {
    readonly pid: number;
    readonly samples: number;
    readonly durationMs: number;
    /** Every window on the system, any owner: zero means the watcher was blind. */
    readonly systemWindowsMax: number;
    readonly windowsOwned: number;
    readonly onscreenSamples: number;
    readonly onscreenFirst: readonly unknown[];
    readonly regularPolicySamples: number;
    readonly activeSamples: number;
    readonly frontmostApplications: readonly string[];
}

export interface WindowServerWatch {
    stop(): Promise<WindowServerReport>;
}

/**
 * Watches the window server for `pid` from outside the app, so a hidden run is
 * proven invisible by the system that would draw it rather than by the app's
 * own account. macOS only; elsewhere, or without `swiftc`, it returns
 * undefined and the caller reports the proof as unavailable.
 */
export async function windowServerWatchStart(pid: number): Promise<WindowServerWatch | undefined> {
    if (process.platform !== "darwin") return undefined;
    const executable = await windowServerWatcherBuild().catch(() => undefined);
    if (!executable) return undefined;
    const child = spawn(executable, ["--pid", String(pid)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
    });
    const exited = new Promise<void>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) =>
            code === 0 ? resolve() : reject(new Error(`window-server watcher exited ${code}`)),
        );
    });
    exited.catch(() => undefined);
    await new Promise<void>((resolve, reject) => {
        child.stderr.once("data", () => resolve());
        child.once("error", reject);
    });
    return {
        async stop() {
            child.kill("SIGTERM");
            await exited;
            return JSON.parse(output) as WindowServerReport;
        },
    };
}

/** Throws unless the watched process never had a window on screen, a Dock tile, or focus. */
export function windowServerReportAssert(report: WindowServerReport): void {
    if (report.systemWindowsMax === 0)
        throw new Error(
            "The window-server watcher saw no windows at all; it cannot prove anything. " +
                "Run it with access to the window server (outside a sandbox).",
        );
    if (report.onscreenSamples > 0 || report.regularPolicySamples > 0 || report.activeSamples > 0)
        throw new Error(`The desktop app reached the screen: ${JSON.stringify(report)}`);
}

async function windowServerWatcherBuild(): Promise<string> {
    const source = fileURLToPath(new URL("./windowServer.swift", import.meta.url));
    const hash = createHash("sha256")
        .update(await readFile(source))
        .digest("hex")
        .slice(0, 16);
    const directory = join(tmpdir(), "hdg", "window-server");
    const executable = join(directory, `watch-${hash}`);
    if (existsSync(executable)) return executable;
    await mkdir(directory, { recursive: true });
    await execFileAsync(
        "swiftc",
        ["-O", "-module-cache-path", join(directory, "module-cache"), source, "-o", executable],
        { env: { ...process.env, TMPDIR: directory }, timeout: 180_000 },
    );
    return executable;
}
