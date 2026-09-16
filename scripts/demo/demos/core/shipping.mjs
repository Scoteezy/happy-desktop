import { execFile as exec } from "node:child_process";
import { chmod, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
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

/** The one command the screenplay runs to ship. Every part of it executes for real. */
export const shipCommand =
    `git commit -am "Animate the voice waveform while speaking" && git push -q origin HEAD:main && ` +
    `gh run watch --exit-status "$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')"`;

/** The deploy run the offline \`gh\` fixture reports. */
export const deployRun = { id: "17482913402", workflow: "Deploy" };

/**
 * Shipping happens through a real commit and a real push, but the push lands
 * in a bare repository owned by this private gym and the deploy run comes from
 * an offline \`gh\` fixture on the gym's own PATH. Nothing leaves the machine and
 * no permission review is answered by the screenplay: the phone sends its
 * message with Full access, which is the real product setting for this work.
 */
export async function shippingPrepare(gym) {
    gitBinary = await gitResolve();
    const gitOnPath = join(gym.paths.bin, "git");
    await rm(gitOnPath, { force: true });
    await symlink(gitBinary, gitOnPath);
    const root = await realpath(gym.paths.root);
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
    await rm(join(root, "demo-remotes"), { recursive: true, force: true });
    // The bare origin holds exactly the baseline the worktrees compare against.
    await git(project, "push", "--quiet", "--force", origin, `${baseline}:refs/heads/main`);
    await git(project, "update-ref", "refs/remotes/origin/main", baseline);
    if ((await git(origin, "rev-parse", "main")).trim() !== baseline)
        throw new Error("The fixture origin does not hold the baseline commit.");

    // The commit needs an author; this is the gym's fictional profile.
    await writeFile(
        join(gym.paths.home, ".gitconfig"),
        "[user]\n\tname = Alex\n\temail = alex@example.com\n",
        "utf8",
    );

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
    return { origin, baseline, gh, git: gitOnPath, gitBinary };
}

/**
 * After the real command ran: the fixture origin's main must be the worktree's
 * new HEAD, and the daemon's own Git read model must have reconciled to zero
 * changes on its own. The demo never restores or rewrites files to get there.
 */
export async function shippingVerify(gym, workspaceId, { origin, baseline, path }) {
    const { workspace } = await gym.client.getWorkspace(workspaceId);
    const cwd = await realpath(workspace.compute.path);
    const head = (await git(cwd, "rev-parse", "HEAD")).trim();
    const shipped = (await git(origin, "rev-parse", "main")).trim();
    if (head === baseline || shipped !== head)
        throw new Error("The ship command did not push the worktree's new commit to the origin.");
    const subject = (await git(cwd, "log", "-1", "--format=%s", head)).trim();
    const changed = (await git(cwd, "diff", "--name-only", `${baseline}..${head}`)).trim();
    if (changed !== path) throw new Error(`The shipped commit changed ${changed}, not ${path}.`);
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
                shipped: true,
                shipping:
                    "Real commit and real push into the gym's own bare origin; the deploy run is an offline gh fixture. No real remote, deployment, or permission review verdict.",
                workspaceId,
                cwd,
                path,
                baseline,
                head,
                subject,
                origin,
                git: snapshot,
            };
        if (Date.now() >= deadline)
            throw new Error("The real Git read model did not reconcile to the pushed commit.");
        await delay(250);
    }
}
