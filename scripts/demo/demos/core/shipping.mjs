import { execFile as exec } from "node:child_process";
import { chmod, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFile = promisify(exec);

// `/usr/bin/git` is Apple's xcrun shim; from the gym's constrained environment
// it prints developer-path warnings into the Bash output. The demo runs the
// actual git binary it resolves to, placed on the gym's own PATH.
async function gitResolve() {
    const { stdout } = await execFile("xcrun", ["--find", "git"], { timeout: 15000 });
    return stdout.trim();
}
let gitBinary = "/usr/bin/git";

const gitOptions = [
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "protocol.allow=never",
    // Only the local path transport, for the gym's own bare origin.
    "-c",
    "protocol.file.allow=always",
];

async function git(cwd, ...args) {
    const { stdout } = await execFile(gitBinary, [...gitOptions, "-C", cwd, ...args], {
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

/** Real Bash execution of the declared offline Git and CI screenplay. */
const offlineShipCommand =
    `git commit -am "Animate the voice waveform while speaking" && git push -q origin HEAD:main && ` +
    `gh run watch --exit-status "$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"`;
export let shipCommand;

/** The deploy run the offline \`gh\` fixture reports. */
export const deployRun = { id: "17482913402", workflow: "Deploy" };

/**
 * Auto stays enabled. The shipping commands are simulated, not permission
 * approvals: Git control files and remotes are never mutated during the shot.
 * The simulated push only restores this take's waveform fixture to its known
 * baseline; the ordinary Git watcher then genuinely observes a clean checkout.
 * Initial private-repository preparation below happens off camera.
 */
export async function shippingPrepare(gym, { path, before, after }) {
    gitBinary = await gitResolve();
    const gitOnPath = join(gym.paths.bin, "git");
    await rm(gitOnPath, { force: true });
    const root = await realpath(gym.paths.root);
    // Auto shells rebuild PATH rather than inheriting the daemon's value.
    // Select the offline fixtures explicitly so the shot cannot accidentally
    // call real Git. This changes command lookup, never sandbox permissions.
    const bin = await realpath(gym.paths.bin);
    shipCommand = `export PATH='${bin.replaceAll("'", "'\\''")}':"$PATH"\n${offlineShipCommand}`;
    const project = join(root, "projects", "happy");
    const origins = join(root, "origins");
    const origin = join(origins, "happy.git");
    await mkdir(origins, { recursive: true });
    // The fixture's own main is the baseline. The tracking ref is not: an
    // earlier take's real push moves it, and a workspace created from it would
    // already contain the change this take is meant to make.
    const baseline = (await git(project, "rev-parse", "refs/heads/main")).trim();
    const bare = await git(origin, "rev-parse", "--is-bare-repository").catch(() => "");
    if (bare.trim() !== "true") {
        await git(origins, "init", "--quiet", "--bare", "--initial-branch=main", origin);
    }
    const remotes = (await git(project, "remote")).split("\n");
    if (remotes.includes("origin")) await git(project, "remote", "set-url", "origin", origin);
    else await git(project, "remote", "add", "origin", origin);
    // Fetch and push both address the bare origin; an earlier fixture's
    // separate push URL would silently send the commit elsewhere.
    await git(project, "config", "--unset-all", "remote.origin.pushurl").catch(() => undefined);
    // The bare origin holds exactly the baseline the worktrees compare against.
    await git(project, "push", "--quiet", "--force", origin, `${baseline}:refs/heads/main`);
    await git(project, "update-ref", "refs/remotes/origin/main", baseline);
    if ((await git(origin, "rev-parse", "main")).trim() !== baseline)
        throw new Error("The fixture origin does not hold the baseline commit.");

    // The only mutating Git verbs used by the screenplay are offline. All
    // other calls retain the real binary, including the daemon's Git watcher.
    // This script cannot restore another checkout, another file, or unexpected
    // content. It writes no receipt into the checkout that could dirty it.
    await writeFile(
        gitOnPath,
        `#!${process.execPath}
// Offline demo fixture, not a Git implementation or an Auto-review verdict.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
const args = process.argv.slice(2);
if (args[0] !== "commit" && args[0] !== "push") {
    const child = cp.spawnSync(${JSON.stringify(gitBinary)}, args, {
        stdio: "inherit",
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    });
    process.exit(child.status ?? 1);
}
const cwd = fs.realpathSync(process.cwd());
if (!cwd.startsWith(${JSON.stringify(join(root, "ws", "happy") + "/")}))
    throw new Error("The shipping fixture is confined to this gym's happy worktrees.");
const file = fs.realpathSync(path.join(cwd, ${JSON.stringify(path)}));
if (file !== path.join(cwd, ${JSON.stringify(path)}))
    throw new Error("The waveform fixture must not be a symlink.");
if (fs.readFileSync(file, "utf8") !== ${JSON.stringify(after)})
    throw new Error("The waveform file does not match this take's exact edit.");
if (JSON.stringify(args) === ${JSON.stringify(JSON.stringify(["commit", "-am", "Animate the voice waveform while speaking"]))}) {
    console.log("Offline demo: commit staged (no Git control files changed).");
} else if (JSON.stringify(args) === ${JSON.stringify(JSON.stringify(["push", "-q", "origin", "HEAD:main"]))}) {
    fs.writeFileSync(file, ${JSON.stringify(before)});
    console.log("Offline demo: push staged (no remote contacted).");
} else {
    throw new Error("Unsupported shipping command in the offline demo.");
}
`,
        "utf8",
    );
    await chmod(gitOnPath, 0o755);

    // Offline `gh`: one deploy run, watched for a realistic few seconds.
    const gh = join(gym.paths.bin, "gh");
    await writeFile(
        gh,
        `#!/bin/sh
# Offline fixture for the Happy demo gym. Reports one deploy run; never reaches GitHub.
case "$1 $2" in
  "run list")
    printf '%s\\n' '${deployRun.id}'
    ;;
  "run watch")
    printf '* main ${deployRun.workflow} · ${deployRun.id}\\n'
    printf 'Triggered via push less than a minute ago\\n\\n'
    printf 'JOBS\\n'
    sleep 3
    printf '✓ build in 41s (ID 49371022851)\\n'
    sleep 4
    printf '✓ deploy in 33s (ID 49371022852)\\n\\n'
    printf '✓ Run ${deployRun.workflow} (${deployRun.id}) completed with '"'"'success'"'"'\\n'
    ;;
  *)
    printf 'gh: unknown command in the demo fixture: %s\\n' "$*" >&2
    exit 1
    ;;
esac
`,
        "utf8",
    );
    await chmod(gh, 0o755);
    return { origin, baseline, gh, git: gitOnPath, gitBinary, before };
}

/**
 * Prove the simulated push changed no Git history, restored exactly the
 * waveform fixture, and let the real daemon reconcile its zero-change state.
 */
export async function shippingVerify(gym, workspaceId, { origin, baseline, path, before }) {
    const { workspace } = await gym.client.getWorkspace(workspaceId);
    const cwd = await realpath(workspace.compute.path);
    const head = (await git(cwd, "rev-parse", "HEAD")).trim();
    const shipped = (await git(origin, "rev-parse", "main")).trim();
    if (head !== baseline || shipped !== baseline)
        throw new Error("The offline ship fixture must not change Git history.");
    if ((await readFile(join(cwd, path), "utf8")) !== before)
        throw new Error("The offline ship fixture did not restore the exact baseline.");
    const deadline = Date.now() + 20000;
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
                realCommit: false,
                realPush: false,
                permissionMode: "auto",
                shipping:
                    "Offline Git/CI screenplay. Only the exact waveform fixture was restored; the real Git watcher reconciled its clean state. No commit, push, deployment, or permission-review verdict.",
                workspaceId,
                cwd,
                path,
                baseline,
                head,
                origin,
                git: snapshot,
            };
        if (Date.now() >= deadline)
            throw new Error("The real Git read model did not reconcile the restored fixture.");
        await delay(250);
    }
}
