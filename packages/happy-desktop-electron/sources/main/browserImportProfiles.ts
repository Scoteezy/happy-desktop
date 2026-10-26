import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { isIP } from "node:net";

export type BrowserImportBrowser = "chrome" | "arc" | "brave" | "edge" | "firefox" | "safari";
export type BrowserImportEngine = "chromium" | "firefox" | "safari";

/** Main-only source locations. The controller assigns opaque IDs for the bridge. */
export interface BrowserImportProfile {
    readonly browser: BrowserImportBrowser;
    readonly label: string;
    readonly profileName: string;
    readonly engine: BrowserImportEngine;
    readonly platform: "darwin" | "win32";
    readonly directory: string;
    readonly cookiesPath?: string;
    readonly loginsPath?: string;
    readonly loginsPaths: readonly string[];
    readonly localStatePath?: string;
    readonly nssLibraryPath?: string;
    readonly unsupportedCookiesReason?: string;
    readonly unsupportedPasswordsReason?: string;
}

const browserLabels: Record<BrowserImportBrowser, string> = {
    chrome: "Chrome",
    arc: "Arc",
    brave: "Brave",
    edge: "Edge",
    firefox: "Firefox",
    safari: "Safari",
};

/** No databases, credential values, or Keychain APIs are opened during discovery. */
export async function browserImportProfilesDiscover(): Promise<readonly BrowserImportProfile[]> {
    const platform = process.platform;
    if (platform !== "darwin" && platform !== "win32")
        throw new Error("Browser import is available on macOS and Windows.");
    const userHome = homedir();
    const profiles: BrowserImportProfile[] = [];
    const roots: readonly (readonly [BrowserImportBrowser, string])[] =
        platform === "darwin"
            ? [
                  ["chrome", join(userHome, "Library/Application Support/Google/Chrome")],
                  ["arc", join(userHome, "Library/Application Support/Arc/User Data")],
                  [
                      "brave",
                      join(userHome, "Library/Application Support/BraveSoftware/Brave-Browser"),
                  ],
                  ["edge", join(userHome, "Library/Application Support/Microsoft Edge")],
              ]
            : [
                  [
                      "chrome",
                      join(
                          process.env.LOCALAPPDATA ?? join(userHome, "AppData/Local"),
                          "Google/Chrome/User Data",
                      ),
                  ],
                  [
                      "brave",
                      join(
                          process.env.LOCALAPPDATA ?? join(userHome, "AppData/Local"),
                          "BraveSoftware/Brave-Browser/User Data",
                      ),
                  ],
                  [
                      "edge",
                      join(
                          process.env.LOCALAPPDATA ?? join(userHome, "AppData/Local"),
                          "Microsoft/Edge/User Data",
                      ),
                  ],
                  [
                      "arc",
                      join(
                          process.env.LOCALAPPDATA ?? join(userHome, "AppData/Local"),
                          "Arc/User Data",
                      ),
                  ],
                  ...(await windowsArcRoots(userHome)),
              ];
    for (const [browser, root] of roots) {
        let entries;
        try {
            entries = await readdir(root, { withFileTypes: true });
        } catch (error) {
            if (absent(error)) continue;
            profiles.push({
                browser,
                label: browserLabels[browser],
                profileName: "Default",
                engine: "chromium",
                platform,
                directory: root,
                loginsPaths: [],
                unsupportedCookiesReason:
                    "Happy could not read this browser's profiles. Check access and try again.",
                unsupportedPasswordsReason:
                    "Happy could not read this browser's profiles. Check access and try again.",
            });
            continue;
        }
        for (const entry of entries.slice(0, 1024).sort((a, b) => a.name.localeCompare(b.name))) {
            if (
                !entry.isDirectory() ||
                (!/^Profile \d+$/.test(entry.name) && entry.name !== "Default")
            )
                continue;
            const directory = join(root, entry.name);
            const cookiesPath = await firstFile([
                join(directory, "Network/Cookies"),
                join(directory, "Cookies"),
            ]);
            const loginsPaths: string[] = [];
            for (const path of [
                join(directory, "Login Data"),
                join(directory, "Login Data For Account"),
            ])
                if (await fileExists(path)) loginsPaths.push(path);
            if (!cookiesPath && loginsPaths.length === 0) continue;
            const chromeWindows = platform === "win32" && browser === "chrome";
            profiles.push({
                browser,
                label: browserLabels[browser],
                profileName: entry.name,
                engine: "chromium",
                platform,
                directory,
                cookiesPath,
                loginsPath: loginsPaths[0],
                loginsPaths,
                localStatePath: join(root, "Local State"),
                ...(chromeWindows
                    ? {
                          unsupportedCookiesReason:
                              "Chrome on Windows protects cookies with app-bound encryption, so another app cannot import them.",
                          unsupportedPasswordsReason:
                              "Chrome on Windows requires a password CSV export because app-bound encryption blocks direct import.",
                      }
                    : {}),
            });
        }
    }
    const firefoxRoot =
        platform === "darwin"
            ? join(userHome, "Library/Application Support/Firefox")
            : join(process.env.APPDATA ?? join(userHome, "AppData/Roaming"), "Mozilla/Firefox");
    profiles.push(...(await firefoxProfiles(firefoxRoot, platform)));
    if (platform === "darwin") {
        const paths = [
            join(
                userHome,
                "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies",
            ),
            join(userHome, "Library/Cookies/Cookies.binarycookies"),
        ];
        // Safari remains discoverable when macOS denies access before Full Disk Access.
        const cookiesPath = (await firstFile(paths)) ?? paths[0];
        profiles.push({
            browser: "safari",
            label: "Safari",
            profileName: "Safari",
            engine: "safari",
            platform,
            directory: join(userHome, "Library/Safari"),
            cookiesPath,
            loginsPaths: [],
            unsupportedPasswordsReason:
                "Safari passwords must be imported from Safari's password CSV export.",
        });
        profiles.push(...(await safariNamedProfiles(userHome)));
    } else {
        profiles.push({
            browser: "safari",
            label: "Safari",
            profileName: "Safari",
            engine: "safari",
            platform,
            directory: "",
            loginsPaths: [],
            unsupportedCookiesReason: "Safari browser import is available only on macOS.",
            unsupportedPasswordsReason:
                "Export Safari passwords as CSV on a Mac, then choose that CSV here.",
        });
    }
    return profiles;
}

async function safariNamedProfiles(userHome: string): Promise<readonly BrowserImportProfile[]> {
    // Safari's UUID stores use this fixed layout. Reference: T3 Code's Safari
    // source discovery, Sources.ts at c6cb164bc007a02da724bb446fa2d1efceb1b8b5.
    // Only this one directory level is enumerated, never the person's home tree.
    const root = join(
        userHome,
        "Library/Containers/com.apple.Safari/Data/Library/WebKit/WebsiteDataStore",
    );
    let entries;
    try {
        entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
        if (absent(error)) return [];
        return [
            {
                browser: "safari",
                label: "Safari",
                profileName: "Other Safari profiles",
                engine: "safari",
                platform: "darwin",
                directory: root,
                loginsPaths: [],
                unsupportedCookiesReason:
                    "Safari profiles require Full Disk Access. Enable it for Happy in macOS System Settings → Privacy & Security → Full Disk Access, then choose Safari again.",
                unsupportedPasswordsReason:
                    "Safari passwords must be imported from Safari's password CSV export.",
            },
        ];
    }
    const candidates = entries.filter(
        (entry) =>
            entry.isDirectory() &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.name),
    );
    if (candidates.length > 1024)
        throw new Error("Safari has too many profiles to import at once.");
    const profiles: BrowserImportProfile[] = [];
    for (const entry of candidates.sort((a, b) => a.name.localeCompare(b.name))) {
        const directory = join(root, entry.name);
        const cookiesPath = await firstFile([join(directory, "Cookies/Cookies.binarycookies")]);
        if (!cookiesPath) continue;
        profiles.push({
            browser: "safari",
            label: "Safari",
            profileName: entry.name,
            engine: "safari",
            platform: "darwin",
            directory,
            cookiesPath,
            loginsPaths: [],
            unsupportedPasswordsReason:
                "Safari passwords must be imported from Safari's password CSV export.",
        });
    }
    return profiles;
}

async function windowsArcRoots(
    userHome: string,
): Promise<readonly (readonly [BrowserImportBrowser, string])[]> {
    const packages = join(process.env.LOCALAPPDATA ?? join(userHome, "AppData/Local"), "Packages");
    try {
        const entries = await readdir(packages, { withFileTypes: true });
        return entries
            .filter(
                (entry) => entry.isDirectory() && entry.name.startsWith("TheBrowserCompany.Arc_"),
            )
            .slice(0, 16)
            .map(
                (entry) =>
                    ["arc", join(packages, entry.name, "LocalCache/Local/Arc/User Data")] as const,
            );
    } catch {
        return [];
    }
}

async function firefoxProfiles(
    root: string,
    platform: "darwin" | "win32",
): Promise<readonly BrowserImportProfile[]> {
    let source: string;
    try {
        source = await browserImportTextFileRead(join(root, "profiles.ini"), 1024 * 1024);
    } catch (error) {
        if (absent(error)) return [];
        return [
            {
                browser: "firefox",
                label: "Firefox",
                profileName: "Firefox",
                engine: "firefox",
                platform,
                directory: root,
                loginsPaths: [],
                unsupportedCookiesReason: "Firefox profiles could not be read. Check file access.",
                unsupportedPasswordsReason:
                    "Firefox profiles could not be read. Check file access.",
            },
        ];
    }
    const sections: Map<string, string>[] = [];
    let section: Map<string, string> | undefined;
    for (const line of source.replace(/^\uFEFF/, "").split(/\r?\n/)) {
        const header = /^\[(Profile\d+)\]$/.exec(line.trim());
        if (header) {
            section = new Map();
            sections.push(section);
            continue;
        }
        if (line.trim().startsWith("[")) {
            section = undefined;
            continue;
        }
        const field = /^([^=;#]+)=(.*)$/.exec(line);
        if (section && field) section.set(field[1].trim(), field[2].trim());
    }
    const profiles: BrowserImportProfile[] = [];
    const seen = new Set<string>();
    // NSS runs inside Happy, so only system-wide installs are candidates;
    // the decryptor verifies Mozilla's signature before loading it.
    const nssLibraryPath = await firstFile(
        platform === "darwin"
            ? [
                  "/Applications/Firefox.app/Contents/MacOS/libnss3.dylib",
                  "/Applications/Firefox Developer Edition.app/Contents/MacOS/libnss3.dylib",
                  "/Applications/Firefox Nightly.app/Contents/MacOS/libnss3.dylib",
              ]
            : [
                  join(process.env.ProgramFiles ?? "C:\\Program Files", "Mozilla Firefox/nss3.dll"),
                  join(
                      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
                      "Mozilla Firefox/nss3.dll",
                  ),
              ],
    );
    for (const values of sections.slice(0, 1024)) {
        const path = values.get("Path");
        if (!path || path.includes("\0") || path.length > 8192) continue;
        const relativeFlag = values.get("IsRelative");
        if (relativeFlag !== "0" && relativeFlag !== "1") continue;
        if (relativeFlag === "0" && !isAbsolute(path)) continue;
        // Discovery polls every profile: a network path would make Happy
        // authenticate to, or mount, a server profiles.ini names.
        if (relativeFlag === "0" && networkPath(path)) continue;
        if (relativeFlag === "1" && isAbsolute(path)) continue;
        const directory = relativeFlag === "1" ? resolve(root, path) : resolve(path);
        if (relativeFlag === "1") {
            const fromRoot = relative(root, directory);
            if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot))
                continue;
        }
        if (seen.has(directory)) continue;
        seen.add(directory);
        const cookiesPath = await firstFile([join(directory, "cookies.sqlite")]);
        const loginsPath = await firstFile([join(directory, "logins.json")]);
        if (!cookiesPath && !loginsPath) continue;
        profiles.push({
            browser: "firefox",
            label: "Firefox",
            engine: "firefox",
            platform,
            directory,
            profileName: (values.get("Name") ?? "Firefox").slice(0, 256),
            cookiesPath,
            loginsPath,
            loginsPaths: loginsPath ? [loginsPath] : [],
            nssLibraryPath,
            ...(!nssLibraryPath && loginsPath
                ? {
                      unsupportedPasswordsReason:
                          "Firefox's installed encryption library could not be found. Install Firefox, or use its password CSV export.",
                  }
                : {}),
        });
    }
    return profiles;
}

async function fileExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    } catch (error) {
        // A protected file still represents an installed profile. Reading later
        // produces the actionable access error without losing its choice row.
        return !absent(error);
    }
}

/** UNC and SMB shares, `\\?\UNC`, and macOS automounts are never browser profiles. */
function networkPath(path: string): boolean {
    const normalized = path.replaceAll("\\", "/").toLowerCase();
    return (
        normalized.startsWith("//") ||
        normalized.startsWith("/net/") ||
        normalized.startsWith("/network/") ||
        normalized.startsWith("/volumes/")
    );
}

async function firstFile(paths: readonly string[]): Promise<string | undefined> {
    for (const path of paths) if (await fileExists(path)) return path;
    return undefined;
}

function absent(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR";
}

/** Bounded main-only reads; callers replace filesystem errors with safe UI errors. */
export async function browserImportTextFileRead(
    path: string,
    maximumBytes: number,
): Promise<string> {
    const handle = await open(path, "r");
    try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > maximumBytes)
            throw new Error("The browser file exceeds the import limit.");
        const bytes = Buffer.alloc(Math.min(maximumBytes + 1, info.size + 1));
        let offset = 0;
        while (offset < bytes.length) {
            const read = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (!read.bytesRead) break;
            offset += read.bytesRead;
        }
        if (offset > maximumBytes || offset !== info.size)
            throw new Error(
                "The browser file changed while being read. Close the browser and try again.",
            );
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, offset));
    } finally {
        await handle.close();
    }
}

/** Exact cookie-host groups: no guessed registrable suffixes or wildcard selection. */
export function browserImportHostNormalize(source: string): string | undefined {
    if (!source || source.length > 8192 || /[\s/@?#\\%]/.test(source)) return undefined;
    const host = source.replace(/^\./, "").replace(/\.$/, "");
    if (host.includes(":") && !host.startsWith("[") && isIP(host) !== 6) return undefined;
    try {
        const url = new URL(`https://${isIP(host) === 6 ? `[${host}]` : host}/`);
        if (url.port || url.username || url.password) return undefined;
        const canonical = url.hostname.replace(/\.$/, "");
        if (isIP(canonical.replace(/^\[|\]$/g, ""))) return canonical;
        if (
            canonical.length > 253 ||
            canonical
                .split(".")
                .some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
        )
            return undefined;
        return canonical;
    } catch {
        return undefined;
    }
}

export function browserImportOriginNormalize(source: string): string | undefined {
    if (!source || source.length > 8192) return undefined;
    try {
        const url = new URL(source);
        return url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            browserImportHostNormalize(url.hostname)
            ? url.origin
            : undefined;
    } catch {
        return undefined;
    }
}
