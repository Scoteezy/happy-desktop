import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HappyDaemonPaths } from "./happyAgentBinaryPaths";
import {
    happyAgentVersionLocal,
    happyAgentVersionNewer,
    happyAgentVersionValid,
} from "./happyAgentVersion";

/** The exit status `happy-agent start` and `reload` use when the data is newer than they are. */
export const HAPPY_AGENT_DATA_NEWER_EXIT_CODE = 65;
const DATA_NEWER_MESSAGE = "This data was written by a newer Happy Agent; update to continue.";
const MAXIMUM_STAMP_BYTES = 64 * 1024;

/**
 * Happy Agent refused this machine's data because a newer release wrote it, or
 * Happy refused to run a release older than that data allows.
 *
 * Either way the answer is an update, never another attempt: the same binary
 * against the same data refuses the same way every time.
 */
export class HappyAgentDataNewerError extends Error {
    constructor(message: string = DATA_NEWER_MESSAGE, options?: ErrorOptions) {
        super(message, options);
        this.name = "HappyAgentDataNewerError";
    }
}

/** Where the daemon records the oldest release that may open its data. */
export function happyAgentDataVersionPath(paths: Pick<HappyDaemonPaths, "agentDirectory">): string {
    return join(paths.agentDirectory, "data-version.json");
}

/**
 * The oldest Happy Agent release this machine's data allows, or nothing.
 *
 * Read afresh at every decision, because a daemon raises it the moment it
 * migrates. A missing, unreadable, or unknown stamp is no constraint: homes
 * written before the stamp existed have none, and a stamp Happy cannot read must
 * not strand anybody on the version they already run. Development builds stamp
 * `0.0.0`, which constrains nothing either.
 */
export async function happyAgentDataMinimumRead(
    paths: Pick<HappyDaemonPaths, "agentDirectory">,
): Promise<string | undefined> {
    let text: string;
    try {
        text = await readFile(happyAgentDataVersionPath(paths), "utf8");
    } catch {
        return undefined;
    }
    if (text.length > MAXIMUM_STAMP_BYTES) return undefined;
    return happyAgentDataMinimumParse(text);
}

export function happyAgentDataMinimumParse(text: string): string | undefined {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const stamp = value as Record<string, unknown>;
    if (stamp.version !== 1) return undefined;
    const minimum = stamp.minimumVersion;
    if (
        typeof minimum !== "string" ||
        minimum.length > 128 ||
        !happyAgentVersionValid(minimum) ||
        happyAgentVersionLocal(minimum)
    )
        return undefined;
    return minimum;
}

/**
 * Whether `version` is too old to open data that needs `minimum`.
 *
 * A development build is never refused here: it is installed by hand, its
 * version says nothing about its code, and the daemon itself still refuses data
 * it cannot read.
 */
export function happyAgentVersionBelowData(version: string, minimum: string | undefined): boolean {
    if (minimum === undefined || happyAgentVersionLocal(version)) return false;
    return happyAgentVersionNewer(minimum, version);
}

/**
 * The refusal for running `version` on data that needs `minimum`, in words a
 * person can act on. `kept` is the version Happy goes on running instead.
 */
export function happyAgentDataDowngradeError(
    version: string,
    minimum: string,
    kept?: string,
): HappyAgentDataNewerError {
    return new HappyAgentDataNewerError(
        `Happy Agent ${version} is older than your data, which a newer Happy Agent already updated. ` +
            `It needs Happy Agent ${minimum} or newer.` +
            (kept !== undefined && kept !== version
                ? ` Happy is keeping Happy Agent ${kept}.`
                : ""),
    );
}

/** Throws the refusal when `version` may not open this machine's data. */
export async function happyAgentDataVersionRequire(
    paths: Pick<HappyDaemonPaths, "agentDirectory">,
    version: string,
    kept?: string,
): Promise<void> {
    const minimum = await happyAgentDataMinimumRead(paths);
    if (minimum !== undefined && happyAgentVersionBelowData(version, minimum))
        throw happyAgentDataDowngradeError(version, minimum, kept);
}

/**
 * The refusal a `happy-agent start` or `reload` that exited 65 reported, with
 * its own one-line explanation, or nothing for any other failure. The exit
 * status decides; the text is only shown.
 */
export function happyAgentDataRefusal(
    error: unknown,
    stderr?: string,
): HappyAgentDataNewerError | undefined {
    if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== HAPPY_AGENT_DATA_NEWER_EXIT_CODE
    )
        return undefined;
    const written =
        stderr ?? ("stderr" in error && typeof error.stderr === "string" ? error.stderr : "");
    const line = written
        .split(/\r?\n/u)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .at(-1);
    return new HappyAgentDataNewerError(line ?? DATA_NEWER_MESSAGE, { cause: error });
}
