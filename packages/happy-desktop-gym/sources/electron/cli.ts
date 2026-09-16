import { gymPrepare, gymRun } from "./gym.js";
import { gymProfilesList } from "./manifest.js";
import { gymRunClean, gymRunsRootResolve } from "./paths.js";
import { gymSmokeRun } from "./smoke.js";
import { gymPublicRepositoryAttach } from "./publicRepository.js";
import type { GymProfile, GymWorkloadName } from "./types.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const workloads: readonly GymWorkloadName[] = [
    "public-repository",
    "boot",
    "catalog-switch",
    "long-transcript",
    "long-chat-scroll",
    "session-switch-load",
    "file-switch-warm",
    "highlight-warm",
    "changed-files-warm",
    "panel-file-edit",
    "streaming",
    "mixed-replay",
    "memory-idle",
    "window-edge-resize",
    "archive-reconcile",
    "all",
];

export async function main(argv = process.argv.slice(2)): Promise<void> {
    const command = argv[0] ?? "help";
    const flags = parseFlags(argv.slice(1));
    if (command === "help" || command === "--help" || command === "-h") {
        printHelp();
        return;
    }
    if (command === "clean") {
        const root = required(flags, "root");
        await gymRunClean(root);
        console.log(JSON.stringify({ cleaned: root }));
        return;
    }
    if (command === "smoke") {
        const result = await gymSmokeRun();
        console.log(JSON.stringify({ command, ...result }, null, 2));
        return;
    }
    if (command === "attach-repository") {
        if (!flags.repository) throw new Error("--repository is required.");
        await gymPublicRepositoryAttach(required(flags, "root"), flags.repository);
        return;
    }
    if (command === "prepare") {
        const profile = profileRead(flags.profile);
        const prepared = await gymPrepare({
            profile,
            root: flags.root,
            artifactDirectory: flags.artifactDir,
        });
        console.log(
            JSON.stringify(
                {
                    command,
                    root: prepared.paths.root,
                    profile,
                    catalog: prepared.catalog,
                    seededSessions: prepared.sessionIds.length,
                    seededTurns: prepared.seededTurns,
                    durableCounts: prepared.durableCounts,
                    fixture: prepared.fixture,
                    persistedAfterRestart: prepared.persistedAfterRestart,
                    limitation: prepared.manifest.seed.limitation,
                },
                null,
                2,
            ),
        );
        return;
    }
    if (command === "run") {
        const workload = workloadRead(flags.workload);
        let root = flags.root;
        if (root === undefined) {
            const prepared = await gymPrepare({
                profile: profileRead(flags.profile),
                artifactDirectory: flags.artifactDir,
            });
            root = prepared.paths.root;
        }
        const result = await gymRun({ root, workload, uiTrace: flags.uiTrace });
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    throw new Error(`Unknown Gym command '${command}'. Use 'help' for usage.`);
}

function parseFlags(args: readonly string[]): {
    readonly profile?: string;
    readonly root?: string;
    readonly artifactDir?: string;
    readonly workload?: string;
    readonly uiTrace?: boolean;
    readonly repository?: string;
} {
    const result: {
        profile?: string;
        root?: string;
        artifactDir?: string;
        workload?: string;
        uiTrace?: boolean;
        repository?: string;
    } = {};
    for (let index = 0; index < args.length; index += 1) {
        const value = args[index];
        const next = args[index + 1];
        if (value === "--profile") result.profile = requiredValue(value, next, () => index++);
        else if (value === "--root") result.root = requiredValue(value, next, () => index++);
        else if (value === "--artifact-dir")
            result.artifactDir = requiredValue(value, next, () => index++);
        else if (value === "--workload")
            result.workload = requiredValue(value, next, () => index++);
        else if (value === "--ui-trace") result.uiTrace = true;
        else if (value === "--repository")
            result.repository = requiredValue(value, next, () => index++);
        else throw new Error(`Unknown option '${value}'.`);
    }
    return result;
}

function requiredValue(option: string, value: string | undefined, advance: () => void): string {
    if (value === undefined || value.startsWith("--")) {
        throw new Error(`${option} requires a value.`);
    }
    advance();
    return value;
}

function profileRead(value: string | undefined): GymProfile {
    const profile = value ?? "smoke";
    if (!gymProfilesList().includes(profile as GymProfile)) {
        throw new Error(`Unknown profile '${profile}'. Choose smoke, realistic, or stress.`);
    }
    return profile as GymProfile;
}

function workloadRead(value: string | undefined): GymWorkloadName {
    const workload = value ?? "all";
    if (!workloads.includes(workload as GymWorkloadName)) {
        throw new Error(`Unknown workload '${workload}'.`);
    }
    return workload as GymWorkloadName;
}

function required(flags: { readonly root?: string }, name: "root"): string {
    const value = flags[name];
    if (value === undefined) throw new Error(`--${name} is required.`);
    return value;
}

function printHelp(): void {
    console.log(`happy-desktop-gym/electron

Commands:
  prepare --profile smoke|realistic|stress [--root PATH] [--artifact-dir PATH]
  attach-repository --root PATH --repository ABSOLUTE_LOCAL_CHECKOUT
  run [--profile PROFILE] [--root PATH] [--workload WORKLOAD] [--ui-trace]
  smoke
  clean --root PATH

Workloads:
  boot, catalog-switch, long-transcript, file-switch-warm,
  long-chat-scroll, session-switch-load, highlight-warm, changed-files-warm,
  streaming, mixed-replay, memory-idle, window-edge-resize, archive-reconcile, public-repository, all

The default root is ${gymRunsRootResolve()}/g-<run-id>.
Only roots carrying the Gym ownership marker can be cleaned.`);
}

if (
    process.argv[1] !== undefined &&
    resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
        process.exitCode = 1;
    });
}
