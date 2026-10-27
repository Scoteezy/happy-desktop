import { execFile } from "node:child_process";
import type { Stats } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
// Electron's own fs presents an `.asar` file as a folder with made-up owners
// and modes, and app bundles hold them. Ownership is read from the real files.
import fs from "original-fs";

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
}

/** A library Happy will not load, with the publisher's explanation. */
export class BrowserLoginLibraryRefusedError extends Error {}

/**
 * A library that passed every check, held open. `file` names the checked file
 * itself and stays that file even if its path is replaced afterwards.
 */
export interface BrowserLoginVerifiedLibrary {
    readonly path: string;
    /** `/dev/fd/N` for the open, checked file. */
    readonly file: string;
    /**
     * Throws unless the bundle and library paths still name what was checked.
     * Call it synchronously, immediately before loading.
     */
    unchanged(): void;
    close(): void;
}

/** Entries an app bundle may hold; more means it is not one Happy should walk. */
const bundleEntriesMaximum = 100_000;

function run(file: string, args: readonly string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        execFile(file, [...args], { timeout: 120_000, maxBuffer: 64 * 1024 }, (error) =>
            error ? reject(error) : resolve(),
        );
    });
}

/** Owned by root and writable by no one else, so this user cannot change it. */
function rootOnly(stats: Stats): boolean {
    return stats.uid === 0 && (stats.mode & 0o022) === 0;
}

function identity(stats: Stats): string {
    return `${stats.dev}:${stats.ino}`;
}

/**
 * Whether the bundle and the path to the library are root's alone: no
 * symbolic link between them and nothing this user can modify. Cheap enough to
 * decide whether to offer a source at all.
 */
export async function browserLoginLibraryInstallProtected(
    library: string,
    publisher: BrowserLoginLibraryPublisher,
): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    const bundle = publisher.macBundle(library);
    if (!bundle) return false;
    try {
        for (const path of pathFromBundle(bundle, library)) {
            const stats = await fs.promises.lstat(path);
            if (stats.isSymbolicLink() || !rootOnly(stats)) return false;
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * A native library runs inside Happy's own process, with its Keychain and
 * privacy grants, so Happy loads one only when no program running as this
 * user can have changed it. That is the case only for an install owned by
 * root: verifying a file this user can write and then loading it would leave
 * a window to swap it in between.
 *
 * Every time, before every load: the whole bundle must be root's and nothing
 * else's write, then its code signature must be the publisher's. Nothing is
 * remembered between loads. Windows is refused: there, proving that this user
 * cannot write the install needs an ACL evaluation Happy does not make.
 */
export async function browserLoginLibraryVerify(
    library: string,
    publisher: BrowserLoginLibraryPublisher,
): Promise<BrowserLoginVerifiedLibrary> {
    const refused = () => new BrowserLoginLibraryRefusedError(publisher.refusal);
    if (process.platform !== "darwin") throw refused();
    const bundle = publisher.macBundle(library);
    if (!bundle) throw refused();
    let identities: Map<string, string>;
    try {
        identities = await bundleRootOnlyRequire(bundle, library);
    } catch {
        throw refused();
    }
    // Held open from here: what loads is this file, whatever the path names later.
    let descriptor: number;
    try {
        descriptor = fs.openSync(library, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch {
        throw refused();
    }
    const verified: BrowserLoginVerifiedLibrary = {
        path: library,
        file: `/dev/fd/${descriptor}`,
        unchanged() {
            for (const [path, expected] of identities) {
                const stats = fs.lstatSync(path, { throwIfNoEntry: false });
                if (!stats || stats.isSymbolicLink() || identity(stats) !== expected)
                    throw refused();
            }
            const open = fs.fstatSync(descriptor);
            if (!rootOnly(open) || identity(open) !== identities.get(library)) throw refused();
        },
        close: () => fs.closeSync(descriptor),
    };
    try {
        verified.unchanged();
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
            library,
        ]);
        verified.unchanged();
        return verified;
    } catch {
        verified.close();
        throw refused();
    }
}

/** The bundle directory, each directory below it on the way to the library, and the library. */
function pathFromBundle(bundle: string, library: string): readonly string[] {
    const fromBundle = relative(bundle, library);
    if (fromBundle === "" || fromBundle.startsWith("..") || fromBundle.startsWith(sep))
        throw new Error("The library is outside its bundle.");
    const paths = [bundle];
    for (const part of fromBundle.split(sep)) paths.push(join(paths.at(-1)!, part));
    return paths;
}

/**
 * Requires every entry of the bundle to be root's alone, and the path to the
 * library to hold no symbolic link. Links elsewhere in a bundle are ordinary
 * (framework versions), and a root-owned link cannot be repointed by this
 * user. Returns the identity of each path from the bundle to the library.
 */
async function bundleRootOnlyRequire(
    bundle: string,
    library: string,
): Promise<Map<string, string>> {
    const identities = new Map<string, string>();
    for (const path of pathFromBundle(bundle, library)) {
        const stats = await fs.promises.lstat(path);
        if (stats.isSymbolicLink() || !rootOnly(stats)) throw new Error("Not root's alone.");
        identities.set(path, identity(stats));
    }
    if (!(await fs.promises.lstat(library)).isFile()) throw new Error("Not a file.");
    if ((await fs.promises.lstat(dirname(bundle))).isSymbolicLink())
        throw new Error("Linked parent.");
    let entries = 0;
    const pending = [bundle];
    while (pending.length > 0) {
        const directory = pending.pop()!;
        for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
            entries += 1;
            if (entries > bundleEntriesMaximum) throw new Error("Bundle too large.");
            const path = join(directory, entry.name);
            const stats = await fs.promises.lstat(path);
            if (stats.isSymbolicLink() ? stats.uid !== 0 : !rootOnly(stats))
                throw new Error("Not root's alone.");
            if (stats.isDirectory()) pending.push(path);
        }
    }
    return identities;
}
