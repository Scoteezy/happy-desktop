import { execFile as exec } from "node:child_process";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFile = promisify(exec);
const logicPath = "packages/happy-app/sources/realtime/waveformActive.ts";
const gitOptions = [
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "protocol.allow=never",
];

async function git(cwd, ...args) {
    const { stdout } = await execFile("/usr/bin/git", [...gitOptions, "-C", cwd, ...args], {
        env: {
            PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_TERMINAL_PROMPT: "0",
            GIT_OPTIONAL_LOCKS: "0",
            GIT_NO_LAZY_FETCH: "1",
        },
        timeout: 15000,
        maxBuffer: 1024 * 1024,
    });
    return stdout;
}

/**
 * Shipping is screenplay, not a real push or deployment. Restore one generated
 * fixture edit so the unchanged Git watcher publishes genuinely clean counters.
 * The caller supplies the world's exact strings, avoiding a circular import.
 */
export async function stagedShippingFinalize(gym, workspaceId, { path, before, after }) {
    if (
        path !== logicPath ||
        typeof before !== "string" ||
        typeof after !== "string" ||
        before === after
    )
        throw new Error("Staged shipping requires the exact waveform fixture edit.");
    const root = await realpath(gym.paths.root);
    const projectPath = join(root, "projects", "happy");
    if ((await realpath(projectPath)) !== projectPath)
        throw new Error("The Happy fixture must not redirect outside the gym.");
    const { workspace } = await gym.client.getWorkspace(workspaceId);
    if (workspace.compute.type !== "host")
        throw new Error("Staged shipping requires a local managed fixture worktree.");
    const cwd = await realpath(workspace.compute.path);
    const within = relative(root, cwd);
    if (
        !within ||
        within === ".." ||
        within.startsWith("../") ||
        isAbsolute(within) ||
        cwd === projectPath ||
        !(await lstat(join(cwd, ".git"))).isFile() ||
        (await git(cwd, "rev-parse", "--show-toplevel")).trim() !== cwd
    )
        throw new Error("The checkout is not an isolated managed fixture worktree.");
    const commonDirectory = async (directory) =>
        realpath(
            resolve(directory, (await git(directory, "rev-parse", "--git-common-dir")).trim()),
        );
    if ((await commonDirectory(cwd)) !== (await commonDirectory(projectPath)))
        throw new Error("The worktree does not belong to the Happy fixture.");
    const head = (await git(cwd, "rev-parse", "HEAD")).trim();
    if (
        head !== (await git(projectPath, "rev-parse", "HEAD")).trim() ||
        head !== (await git(cwd, "rev-parse", "origin/main")).trim() ||
        (await git(cwd, "show", `HEAD:${path}`)) !== before
    )
        throw new Error("The fixture no longer has the expected unchanged baseline.");
    const file = join(cwd, path);
    if ((await realpath(file)) !== file || !(await lstat(file)).isFile())
        throw new Error("The waveform fixture must be an ordinary file inside its worktree.");
    if (
        (await git(cwd, "status", "--porcelain=v1", "-z", "--untracked-files=all")) !==
        ` M ${path}\0`
    )
        throw new Error("Staged shipping may restore only the single unstaged waveform edit.");
    if ((await readFile(file, "utf8")) !== after)
        throw new Error("The waveform fixture does not match the exact recorded change.");

    // This is the only mutation: ordinary generated fixture bytes, never Git controls.
    await writeFile(file, before, "utf8");
    if (await git(cwd, "status", "--porcelain=v1", "--untracked-files=all"))
        throw new Error("Restoring the staged fixture did not leave a clean checkout.");
    const deadline = Date.now() + 15000;
    for (;;) {
        // SDK: GET /v0/workspaces/:workspaceId/git -> { git: GitState }.
        const { git: snapshot } = await gym.client.getWorkspaceGit(workspaceId);
        if (
            snapshot.comparison === "ready" &&
            snapshot.facts.head === head &&
            snapshot.base === head &&
            snapshot.countsExact &&
            snapshot.changedFiles === 0 &&
            snapshot.insertions === 0 &&
            snapshot.deletions === 0 &&
            snapshot.files.length === 0 &&
            !snapshot.filesTruncated &&
            !snapshot.conflicted
        )
            return {
                staged: true,
                shipping:
                    "Push/deploy outcome is screenplay; fixture edit restored to baseline to clear authoritative counters",
                workspaceId,
                cwd,
                path,
                head,
                git: snapshot,
            };
        if (Date.now() >= deadline)
            throw new Error("The real Git read model did not reconcile to the restored fixture.");
        await delay(250);
    }
}
