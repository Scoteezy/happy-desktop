import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import type { PreparedGym } from "./gym.js";
import { happyAgentRuntimeCreate, type StartedHappyAgentRuntime } from "./happyAgentRuntime.js";
import { catalogSnapshotRead } from "./history.js";
import { gymHostEnvironment } from "./hostEnvironment.js";
import { gymInferenceServerCreate } from "./inferenceServer.js";
import { gymRunPathsRead } from "./paths.js";

const execFileAsync = promisify(execFile);

/** Adds an owned clone and real, durable long conversations to a prepared run. */
export async function gymPublicRepositoryAttach(root: string, source: string): Promise<void> {
    if (!isAbsolute(source))
        throw new Error("--repository must be an absolute local checkout path.");
    const paths = await gymRunPathsRead(root);
    const statePath = join(paths.root, "prepared.json");
    const state = JSON.parse(await readFile(statePath, "utf8")) as PreparedGym;
    if (state.manifest.publicRepository)
        throw new Error("This Gym already has a public repository.");
    const checkout = join(paths.projects, "public-repository");
    const git = async (cwd: string, args: readonly string[]) =>
        (
            await execFileAsync("git", args, {
                cwd,
                env: {
                    ...gymHostEnvironment(paths),
                    GIT_LFS_SKIP_SMUDGE: "1",
                    GIT_TERMINAL_PROMPT: "0",
                },
                windowsHide: true,
                timeout: 120_000,
                maxBuffer: 8 * 1024 * 1024,
            })
        ).stdout;
    const commit = (await git(source, ["rev-parse", "HEAD"])).trim();
    // Local-only clone: no remote writes, hard links, source mutations, or repo scripts.
    const exists = await stat(checkout)
        .then(() => true)
        .catch((error) => {
            if (error.code === "ENOENT") return false;
            throw error;
        });
    if (exists) {
        if (
            (await git(checkout, ["rev-parse", "HEAD"])).trim() !== commit ||
            (await git(checkout, ["status", "--porcelain"])).trim()
        )
            throw new Error(
                "An interrupted public fixture must still be clean at the pinned commit.",
            );
    } else
        await git(paths.root, [
            "-c",
            "core.longpaths=true",
            "clone",
            "--no-hardlinks",
            "--no-checkout",
            source,
            checkout,
        ]);
    await git(checkout, [
        "-c",
        "core.longpaths=true",
        "-c",
        "core.autocrlf=false",
        "checkout",
        "--detach",
        commit,
    ]);
    const trackedPaths = (await git(checkout, ["ls-files", "-z"])).split("\0").filter(Boolean);
    const trackedFiles = trackedPaths.length;
    const sourcePaths = trackedPaths.filter((path) => /\.(?:ts|tsx|rs|py|go)$/u.test(path));
    const excerpts = await Promise.all(
        [0, 0.25, 0.5, 0.75].map(async (fraction) => {
            const path = sourcePaths[Math.floor(sourcePaths.length * fraction)];
            return path
                ? `${path}\n${(await readFile(join(checkout, path), "utf8")).slice(0, 8_192)}`
                : "";
        }),
    );
    const material =
        `Repository paths:\n${trackedPaths.slice(0, 250).join("\n")}\n\n` + excerpts.join("\n\n");
    const inference = gymInferenceServerCreate(state.manifest, paths.inferenceLog);
    await inference.start();
    let runtime: StartedHappyAgentRuntime | undefined;
    try {
        runtime = await happyAgentRuntimeCreate(paths, inference);
        const { project } = await runtime.client.registerProject(checkout);
        await runtime.client.waitForWorkspace(project.id, "ready", 120_000);
        const sessionIds: string[] = [];
        let messages = 0;
        const sessions = 4;
        const turns = 40;
        for (let session = 0; session < sessions; session += 1) {
            const { agent } = await runtime.client.createAgent(project.id);
            sessionIds.push(agent.id);
            for (let turn = 0; turn < turns; turn += 1) {
                const submission = await runtime.client.sendMessage(
                    agent.id,
                    `Review this public repository at ${commit}. Discuss its editor, extension host, search, ` +
                        `file watching, and terminal architecture. [gym-long-chat-session] ` +
                        `${material}\n[gym-history-public-${session}-turn-${turn}]`,
                );
                await runtime.client.waitForAgentIdle(agent.id, submission.runId, 90_000);
                if ((turn + 1) % 16 === 0) await runtime.client.compactAgent(agent.id);
            }
            messages += await runtime.client.agentMessageCount(agent.id);
            console.log(
                `Gym public repository: seeded ${session + 1}/${sessions} long conversations.`,
            );
        }
        const allSessionIds = [...state.sessionIds, ...sessionIds];
        await runtime.stop();
        await inference.start();
        runtime = await happyAgentRuntimeCreate(paths, inference);
        let persistedMessages = 0;
        for (const id of sessionIds)
            persistedMessages += await runtime.client.agentMessageCount(id);
        if (persistedMessages !== messages)
            throw new Error("Public repository history did not survive restart.");
        const catalog = await catalogSnapshotRead(runtime.client, allSessionIds);
        const addedTurns = sessions * turns;
        const manifest = {
            ...state.manifest,
            datasetVersion: `${state.manifest.datasetVersion}+public-${commit.slice(0, 12)}`,
            publicRepository: {
                commit,
                source,
                checkout,
                trackedFiles,
                projectId: project.id,
                sessionIds,
            },
            target: {
                ...state.manifest.target,
                totalProjects: state.manifest.target.totalProjects + 1,
                regularProjects: state.manifest.target.regularProjects + 1,
                fileCount: state.manifest.target.fileCount + trackedFiles,
                sessions: state.manifest.target.sessions + sessions,
                primarySessions: state.manifest.target.primarySessions + sessions,
                turns: state.manifest.target.turns + addedTurns,
                messageRange: state.manifest.target.messageRange.map((n) => n + messages),
            },
        };
        const updated = {
            ...state,
            manifest,
            projects: [...state.projects, { ...project, worktreeIds: [] }],
            sessionIds: allSessionIds,
            catalog,
            seededTurns: state.seededTurns + addedTurns,
            durableCounts: {
                sessions: state.durableCounts.sessions + sessions,
                turns: state.durableCounts.turns + addedTurns,
                messages: state.durableCounts.messages + messages,
            },
            fixture: { ...state.fixture, fileCount: state.fixture.fileCount + trackedFiles },
        };
        await writeFile(statePath, `${JSON.stringify(updated, null, 2)}\n`);
        await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(
            JSON.stringify(
                {
                    publicRepository: manifest.publicRepository,
                    durableCounts: updated.durableCounts,
                },
                null,
                2,
            ),
        );
    } finally {
        await runtime?.stop();
        await inference.stop();
    }
}
