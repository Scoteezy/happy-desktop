import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

/** Mozilla Corporation's Apple Developer Team ID, which signs every Firefox build. */
const mozillaTeamId = "43AQ936H96";

function run(file: string, args: readonly string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            file,
            [...args],
            { timeout: 120_000, windowsHide: true, maxBuffer: 64 * 1024 },
            (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
        );
    });
}

function inside(root: string, path: string): boolean {
    const fromRoot = relative(root, path);
    return fromRoot !== "" && !fromRoot.startsWith(`..${sep}`) && fromRoot !== "..";
}

/**
 * NSS runs inside Happy's own process, with its Keychain and privacy grants.
 * Load it only from a system-wide Firefox install whose code is Mozilla's, so
 * a library another program placed on disk never runs as Happy.
 */
export async function browserImportNssTrustRequire(nssLibraryPath: string): Promise<void> {
    const refused = () =>
        new Error(
            "Happy could not verify that Firefox is Mozilla's own install. Reinstall Firefox from mozilla.org and try again.",
        );
    let resolved: string;
    try {
        resolved = await realpath(nssLibraryPath);
    } catch {
        throw refused();
    }
    // A symbolic link could swap the library after it was verified.
    if (resolved !== nssLibraryPath) throw refused();
    if (process.platform === "darwin") {
        const bundle = dirname(dirname(dirname(resolved)));
        if (
            dirname(bundle) !== "/Applications" ||
            !/^Firefox[^/]*\.app$/.test(bundle.slice("/Applications/".length)) ||
            resolved !== join(bundle, "Contents/MacOS/libnss3.dylib")
        )
            throw refused();
        const requirement = `=anchor apple generic and certificate leaf[subject.OU] = "${mozillaTeamId}"`;
        try {
            // The whole bundle: libnss3 loads its sibling libraries from it.
            await run("/usr/bin/codesign", [
                "--verify",
                "--deep",
                "--strict",
                `-R${requirement}`,
                bundle,
            ]);
            await run("/usr/bin/codesign", ["--verify", "--strict", `-R${requirement}`, resolved]);
        } catch {
            throw refused();
        }
        return;
    }
    if (process.platform === "win32") {
        const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(
            (root): root is string => !!root,
        );
        if (!roots.some((root) => inside(root, resolved))) throw refused();
        const script =
            "$s = Get-AuthenticodeSignature -LiteralPath $env:HAPPY_NSS_PATH; " +
            "if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match 'O=Mozilla Corporation') { 'trusted' }";
        try {
            const output = await new Promise<string>((resolve, reject) => {
                execFile(
                    join(
                        process.env.SystemRoot ?? "C:\\Windows",
                        "System32\\WindowsPowerShell\\v1.0\\powershell.exe",
                    ),
                    ["-NoProfile", "-NonInteractive", "-Command", script],
                    {
                        timeout: 60_000,
                        windowsHide: true,
                        maxBuffer: 64 * 1024,
                        env: { ...process.env, HAPPY_NSS_PATH: resolved },
                    },
                    (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
                );
            });
            if (output.trim() !== "trusted") throw new Error();
        } catch {
            throw refused();
        }
        return;
    }
    throw refused();
}
