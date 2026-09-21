import { readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * The mobile gym owns its lifecycle and auth. A recording consumes only its
 * versioned, non-secret manifest; it never imports code or credentials from it.
 */
export async function mobileRunRead(directory) {
    const root = await realpath(resolve(directory));
    const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
    const port = manifest.server?.port;
    if (
        manifest.kind !== "happy-mobile-gym" ||
        manifest.version !== 1 ||
        typeof manifest.runId !== "string" ||
        typeof manifest.owner !== "string" ||
        manifest.runRoot !== root ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535 ||
        manifest.server.url !== `http://127.0.0.1:${port}` ||
        !/^[a-f0-9]{40,64}$/u.test(manifest.source?.commit ?? "") ||
        !/^[a-f0-9]{64}$/u.test(manifest.source?.trackedDiffSha256 ?? "") ||
        typeof manifest.source?.dirty !== "boolean"
    ) {
        throw new Error("Expected a version-1 isolated Happy mobile gym run manifest.");
    }
    return {
        runId: manifest.runId,
        serverUrl: manifest.server.url,
        source: {
            commit: manifest.source.commit,
            trackedDiffSha256: manifest.source.trackedDiffSha256,
            dirty: manifest.source.dirty,
        },
    };
}
