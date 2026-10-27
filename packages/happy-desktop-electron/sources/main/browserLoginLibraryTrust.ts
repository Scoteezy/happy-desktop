import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Who must have signed a native library before Happy loads it into its own
 * process, and where that publisher installs it. Every value is the
 * publisher's documented identity, never inferred from the file itself.
 */
export interface BrowserLoginLibraryPublisher {
    /** Shown when the library cannot be verified. */
    readonly refusal: string;
    /** The publisher's Apple Developer Team ID. */
    readonly appleTeamId: string;
    /** Code-signing identifiers the bundle and library must carry, when the publisher keeps them fixed. */
    readonly appleIdentifiers?: { readonly bundle: string; readonly library: string };
    /** The app bundle a library must sit in, or null when the path is not one the publisher installs to. */
    readonly macBundle: (library: string) => string | null;
    /** Organization names (`O=`) the Authenticode signing certificate may carry. */
    readonly windowsOrganizations: readonly string[];
    /** Whether the path is one the publisher installs to, given the Program Files roots. */
    readonly windowsLocation: (library: string, programFiles: readonly string[]) => boolean;
}

function run(
    file: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            file,
            [...args],
            { timeout: 120_000, windowsHide: true, maxBuffer: 64 * 1024, env },
            (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
        );
    });
}

/**
 * Libraries each publisher's check accepted, by path, with the file identity
 * they were verified at. A full signature check of a bundle takes seconds, and
 * a library is loaded each time the picker opens, so it is repeated only after
 * the install changes.
 */
const verified = new WeakMap<BrowserLoginLibraryPublisher, Map<string, string>>();

async function identity(path: string): Promise<string> {
    const [library, folder] = await Promise.all([stat(path), stat(dirname(path))]);
    return [library.ino, library.size, library.mtimeMs, library.ctimeMs, folder.mtimeMs].join(":");
}

/**
 * A native library runs inside Happy's own process, with its Keychain and
 * privacy grants. Load one only from its publisher's system-wide install, and
 * only while its code is the publisher's own, so a library another program
 * placed on disk never runs as Happy. Callers load exactly `library`, the path
 * verified here, and nothing they searched for themselves.
 */
export async function browserLoginLibraryTrustRequire(
    library: string,
    publisher: BrowserLoginLibraryPublisher,
): Promise<void> {
    const refused = () => new Error(publisher.refusal);
    let resolved: string;
    try {
        resolved = await realpath(library);
    } catch {
        throw refused();
    }
    // A symbolic link could swap the library after it was verified.
    if (resolved !== library) throw refused();
    let current: string;
    try {
        current = await identity(resolved);
    } catch {
        throw refused();
    }
    let accepted = verified.get(publisher);
    if (!accepted) {
        accepted = new Map();
        verified.set(publisher, accepted);
    }
    if (accepted.get(resolved) === current) return;
    try {
        await signatureRequire(resolved, publisher);
    } catch {
        throw refused();
    }
    if ((await identity(resolved).catch(() => undefined)) !== current) throw refused();
    accepted.set(resolved, current);
}

async function signatureRequire(
    resolved: string,
    publisher: BrowserLoginLibraryPublisher,
): Promise<void> {
    if (process.platform === "darwin") {
        const bundle = publisher.macBundle(resolved);
        if (!bundle) throw new Error("Not the publisher's install location.");
        const signer = `anchor apple generic and certificate leaf[subject.OU] = "${publisher.appleTeamId}"`;
        const identifiers = publisher.appleIdentifiers;
        // The whole bundle, so nothing the library loads beside it is foreign.
        await run("/usr/bin/codesign", [
            "--verify",
            "--deep",
            "--strict",
            `-R=${signer}${identifiers ? ` and identifier "${identifiers.bundle}"` : ""}`,
            bundle,
        ]);
        await run("/usr/bin/codesign", [
            "--verify",
            "--strict",
            `-R=${signer}${identifiers ? ` and identifier "${identifiers.library}"` : ""}`,
            resolved,
        ]);
        return;
    }
    if (process.platform === "win32") {
        const programFiles = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(
            (root): root is string => !!root,
        );
        if (!publisher.windowsLocation(resolved, programFiles))
            throw new Error("Not the publisher's install location.");
        const script =
            "$s = Get-AuthenticodeSignature -LiteralPath $env:HAPPY_LIBRARY_PATH; " +
            "if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match '(?:^|,\\s*)O=\"?([^,\"]+)\"?(?:,|$)' -and " +
            "($env:HAPPY_LIBRARY_PUBLISHERS -split \"`n\") -contains $Matches[1].Trim()) { 'trusted' }";
        const output = await run(
            join(
                process.env.SystemRoot ?? "C:\\Windows",
                "System32\\WindowsPowerShell\\v1.0\\powershell.exe",
            ),
            ["-NoProfile", "-NonInteractive", "-Command", script],
            {
                ...process.env,
                HAPPY_LIBRARY_PATH: resolved,
                HAPPY_LIBRARY_PUBLISHERS: publisher.windowsOrganizations.join("\n"),
            },
        );
        if (output.trim() !== "trusted") throw new Error("Not the publisher's signature.");
        return;
    }
    throw new Error("Unsupported platform.");
}
