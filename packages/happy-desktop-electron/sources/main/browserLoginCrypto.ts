import { spawn } from "node:child_process";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { open } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import koffi, { type LibraryHandle } from "koffi";
import {
    BrowserLoginKeychainError,
    browserLoginKeychainPasswordRead,
} from "./browserLoginKeychain";
import { browserLoginNativeBytesCopy } from "./browserLoginNativeBytes";
import { browserLoginNssVerify } from "./browserLoginNssTrust";

/** Source-browser cryptography is main-only. Buffers returned here belong to the caller, which must wipe them. */

export interface BrowserLoginChromiumPassword {
    readonly origin: string;
    readonly encryptedPassword: Buffer;
}

export interface BrowserLoginChromiumDecryptor {
    passwordDecrypt(input: BrowserLoginChromiumPassword): Promise<Buffer>;
    dispose(): void;
}

export interface BrowserLoginFirefoxLogin {
    readonly origin: string;
    readonly encryptedUsername: string;
    readonly encryptedPassword: string;
}

export interface BrowserLoginFirefoxDecryptor {
    loginDecrypt(input: BrowserLoginFirefoxLogin): Promise<{ username: Buffer; password: Buffer }>;
    /** The account name alone, to label a login in the picker. */
    usernameDecrypt(input: Omit<BrowserLoginFirefoxLogin, "encryptedPassword">): Promise<Buffer>;
    dispose(): void;
}

export interface BrowserLoginFirefoxOptions {
    readonly profilePath: string;
    /** Discovered from the installed Firefox application, never supplied by a renderer. */
    readonly nssLibraryPath: string;
    readonly selectedSites: readonly string[];
    /** Native secure input, main only. The callback transfers ownership of its UTF-8 buffer. */
    readonly primaryPasswordRequest?: (input: {
        readonly attempt: number;
    }) => Promise<Buffer | null>;
}

export class BrowserLoginFirefoxPrimaryPasswordRequiredError extends Error {
    readonly code = "firefox-primary-password-required";
    constructor() {
        super("Firefox requires its primary password to use this login.");
    }
}

export class BrowserLoginAppBoundError extends Error {
    readonly code = "browser-app-bound-encryption";
    constructor() {
        super("This browser protects its saved logins with app-bound encryption.");
    }
}

/** The Keychain refused, or the person denied, the browser's key. */
export class BrowserLoginKeyRefusedError extends Error {
    readonly code = "browser-login-key-refused";
    constructor() {
        super("The Keychain did not unlock this browser's saved logins.");
    }
}

export class BrowserLoginCryptoCancelledError extends Error {
    readonly code = "browser-login-cancelled";
    constructor() {
        super("Using the saved login was canceled.");
    }
}

const maximumEncryptedBytes = 1024 * 1024;
const maximumSecretBytes = 65_536;

/** Call only after site selection. A browser key is unlocked lazily, once per context. */
export async function browserLoginChromiumDecryptorCreate(options: {
    /** The Keychain service of the browser's key, from Happy's own browser table. */
    readonly keychainService?: string;
    readonly selectedSites: readonly string[];
    readonly localStatePath?: string;
}): Promise<BrowserLoginChromiumDecryptor> {
    const selected = selectionRequire(options.selectedSites);
    platformRequire();
    if (process.platform === "darwin" && !options.keychainService) throw unavailable();
    const controller = new AbortController();
    let key: Buffer | null = null;
    let keyPending: Promise<Buffer> | null = null;

    function live(): void {
        if (controller.signal.aborted) throw cancelled();
    }

    async function keyRead(): Promise<Buffer> {
        live();
        if (!keyPending)
            keyPending = (async () => {
                const derived =
                    process.platform === "darwin"
                        ? await macKeyRead(options.keychainService!, controller.signal)
                        : await windowsKeyRead(options.localStatePath, controller.signal);
                if (controller.signal.aborted) {
                    derived.fill(0);
                    throw cancelled();
                }
                key = derived;
                return derived;
            })();
        return keyPending;
    }

    async function decrypt(encrypted: Buffer): Promise<Buffer> {
        live();
        encryptedRequire(encrypted);
        const prefix = encrypted.subarray(0, 3).toString("ascii");
        if (prefix === "v20") throw new BrowserLoginAppBoundError();
        try {
            if (process.platform === "darwin") {
                const unlocked = await keyRead();
                live();
                return chromiumCbcDecrypt(encrypted, unlocked);
            }
            if (prefix === "v10" || prefix === "v11") {
                const unlocked = await keyRead();
                live();
                return chromiumGcmDecrypt(encrypted, unlocked);
            }
            // Legacy Windows records are protected directly by current-user DPAPI.
            const result = await windowsDpapiUnprotect(encrypted, controller.signal);
            if (controller.signal.aborted) {
                result.fill(0);
                throw cancelled();
            }
            if (result.length > maximumSecretBytes + 32) {
                result.fill(0);
                throw decryptionFailed();
            }
            return result;
        } catch (error) {
            if (
                error instanceof BrowserLoginAppBoundError ||
                error instanceof BrowserLoginKeyRefusedError
            )
                throw error;
            if (controller.signal.aborted) throw cancelled();
            throw decryptionFailed();
        }
    }

    return {
        async passwordDecrypt(input) {
            live();
            selectedRequire(selected, input.origin);
            const result = await decrypt(input.encryptedPassword);
            if (controller.signal.aborted) {
                result.fill(0);
                throw cancelled();
            }
            if (result.length > maximumSecretBytes) {
                result.fill(0);
                throw decryptionFailed();
            }
            return result;
        },
        dispose() {
            controller.abort();
            key?.fill(0);
            key = null;
            keyPending = null;
        },
    };
}

async function macKeyRead(service: string, signal: AbortSignal): Promise<Buffer> {
    interactiveAccessRequire();
    let secret: Buffer;
    try {
        // By service alone: the account name differs between browsers and builds.
        secret = await browserLoginKeychainPasswordRead(service, signal);
    } catch (error) {
        if (signal.aborted) throw cancelled();
        throw error instanceof BrowserLoginKeychainError
            ? new BrowserLoginKeyRefusedError()
            : unavailable();
    }
    try {
        // The Keychain returns the stored bytes exactly; nothing is trimmed.
        return pbkdf2Sync(secret, "saltysalt", 1003, 16, "sha1");
    } finally {
        secret.fill(0);
    }
}

async function windowsKeyRead(
    localStatePath: string | undefined,
    signal: AbortSignal,
): Promise<Buffer> {
    if (!localStatePath || !isAbsolute(localStatePath)) throw unavailable();
    const file = await open(localStatePath, "r");
    let bytes: Buffer | undefined;
    let wrapped: Buffer | undefined;
    try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw unavailable();
        bytes = await file.readFile();
        if (bytes.length > 16 * 1024 * 1024) throw unavailable();
        const parsed: unknown = JSON.parse(bytes.toString("utf8"));
        if (
            typeof parsed !== "object" ||
            parsed === null ||
            !("os_crypt" in parsed) ||
            typeof parsed.os_crypt !== "object" ||
            parsed.os_crypt === null ||
            !("encrypted_key" in parsed.os_crypt) ||
            typeof parsed.os_crypt.encrypted_key !== "string"
        )
            throw unavailable();
        wrapped = base64Require(parsed.os_crypt.encrypted_key);
        if (wrapped.length < 6 || !wrapped.subarray(0, 5).equals(Buffer.from("DPAPI", "ascii")))
            throw unavailable();
        const key = await windowsDpapiUnprotect(wrapped.subarray(5), signal);
        if (key.length !== 32) {
            key.fill(0);
            throw unavailable();
        }
        return key;
    } catch {
        throw unavailable();
    } finally {
        bytes?.fill(0);
        wrapped?.fill(0);
        await file.close();
    }
}

const dpapiScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$wrapped = $null
$clear = $null
$memory = $null
try {
    Add-Type -AssemblyName System.Security
    $memory = New-Object System.IO.MemoryStream
    [Console]::OpenStandardInput().CopyTo($memory)
    if ($memory.Length -eq 0 -or $memory.Length -gt 1048576) { exit 1 }
    $wrapped = $memory.ToArray()
    $clear = [System.Security.Cryptography.ProtectedData]::Unprotect($wrapped, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    $outputStream = [Console]::OpenStandardOutput()
    $outputStream.Write($clear, 0, $clear.Length)
    $outputStream.Flush()
} catch { exit 1 }
finally {
    if ($null -ne $clear) { [Array]::Clear($clear, 0, $clear.Length) }
    if ($null -ne $wrapped) { [Array]::Clear($wrapped, 0, $wrapped.Length) }
    if ($null -ne $memory) { $memory.Dispose() }
}
`;

async function windowsDpapiUnprotect(encrypted: Buffer, signal: AbortSignal): Promise<Buffer> {
    if (process.platform !== "win32") throw unavailable();
    encryptedRequire(encrypted);
    const powershell = join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
    );
    return privateProcess(
        powershell,
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", dpapiScript],
        encrypted,
        signal,
        maximumSecretBytes + 32,
    );
}

/** No shell, secret command arguments, stderr capture, inherited output, or exception text. */
function privateProcess(
    executable: string,
    args: readonly string[],
    input: Buffer | null,
    signal: AbortSignal,
    maximumOutput: number,
): Promise<Buffer> {
    interactiveAccessRequire();
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(cancelled());
            return;
        }
        const child = spawn(executable, [...args], {
            stdio: ["pipe", "pipe", "ignore"],
            windowsHide: true,
        });
        const chunks: Buffer[] = [];
        let length = 0;
        let settled = false;
        const timer = setTimeout(() => finish(false), 120_000);
        const abort = () => finish(false);
        signal.addEventListener("abort", abort, { once: true });
        function finish(success: boolean): void {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            if (!success) child.kill();
            const result = success ? Buffer.concat(chunks, length) : null;
            for (const chunk of chunks) chunk.fill(0);
            chunks.length = 0;
            if (result) resolve(result);
            else reject(signal.aborted ? cancelled() : unavailable());
        }
        child.stdout.on("data", (chunk: Buffer) => {
            if (settled) {
                chunk.fill(0);
                return;
            }
            length += chunk.length;
            chunks.push(chunk);
            if (length > maximumOutput) finish(false);
        });
        child.on("error", () => finish(false));
        child.stdout.on("error", () => finish(false));
        child.stdin.on("error", () => finish(false));
        child.on("close", (code) => finish(code === 0));
        child.stdin.end(input);
    });
}

// These pure primitives are separate from OS unlocking so no decryption retry can
// accidentally make another Keychain request or guess a different browser's key.
function chromiumCbcDecrypt(encrypted: Buffer, key: Buffer): Buffer {
    const prefix = encrypted.subarray(0, 3).toString("ascii");
    if (
        (prefix !== "v10" && prefix !== "v11") ||
        key.length !== 16 ||
        encrypted.length < 19 ||
        (encrypted.length - 3) % 16 !== 0
    )
        throw decryptionFailed();
    const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 32));
    const partial = decipher.update(encrypted.subarray(3));
    let final: Buffer | undefined;
    try {
        final = decipher.final();
        return Buffer.concat([partial, final]);
    } finally {
        partial.fill(0);
        final?.fill(0);
    }
}

function chromiumGcmDecrypt(encrypted: Buffer, key: Buffer): Buffer {
    if (key.length !== 32 || encrypted.length < 31) throw decryptionFailed();
    const decipher = createDecipheriv("aes-256-gcm", key, encrypted.subarray(3, 15));
    decipher.setAuthTag(encrypted.subarray(-16));
    const partial = decipher.update(encrypted.subarray(15, -16));
    let final: Buffer | undefined;
    try {
        final = decipher.final();
        return Buffer.concat([partial, final]);
    } finally {
        partial.fill(0);
        final?.fill(0);
    }
}

// NSS has process-global key-slot state. A single live read owns it until dispose.
let firefoxContextActive = false;
let nssShutdownFailed = false;
let retainedNssLibrary: LibraryHandle | null = null;

interface NssItem {
    type: number;
    data: bigint | null;
    len: number;
}

export async function browserLoginFirefoxDecryptorCreate(
    options: BrowserLoginFirefoxOptions,
): Promise<BrowserLoginFirefoxDecryptor> {
    const selected = selectionRequire(options.selectedSites);
    platformRequire();
    interactiveAccessRequire();
    if (
        !isAbsolute(options.profilePath) ||
        !isAbsolute(options.nssLibraryPath) ||
        options.profilePath.includes("\0") ||
        basename(options.nssLibraryPath) !==
            (process.platform === "darwin" ? "libnss3.dylib" : "nss3.dll")
    )
        throw unavailable();
    if (nssShutdownFailed || retainedNssLibrary)
        throw new Error(
            "Firefox logins are unavailable in this app session. Reopen Happy to try again.",
        );
    if (firefoxContextActive)
        throw new Error("Another Firefox login is being read. Try again in a moment.");
    // Verified for this load alone. Nothing is awaited between here and koffi.load.
    const verified = await browserLoginNssVerify(options.nssLibraryPath);
    if (firefoxContextActive) {
        verified.close();
        throw new Error("Another Firefox login is being read. Try again in a moment.");
    }
    firefoxContextActive = true;
    let library: LibraryHandle | null = null;
    let initialized = false;
    let slot: bigint | null = null;
    let disposed = false;
    let shutdown: (() => number) | undefined;
    let slotFree: ((slot: bigint) => void) | undefined;
    let slotLogout: ((slot: bigint) => number) | undefined;

    function dispose(): void {
        if (disposed) return;
        disposed = true;
        try {
            if (slot) {
                slotLogout?.(slot);
                slotFree?.(slot);
                slot = null;
            }
            if (initialized && shutdown?.() !== 0) nssShutdownFailed = true;
        } catch {
            nssShutdownFailed = true;
        } finally {
            initialized = false;
            // Do not unload NSS after a failed shutdown: its worker threads can still
            // own code pointers. A new profile is then refused until app restart.
            if (nssShutdownFailed) retainedNssLibrary = library;
            else {
                try {
                    library?.unload();
                } catch {
                    retainedNssLibrary = library;
                    nssShutdownFailed = true;
                }
            }
            library = null;
            firefoxContextActive = false;
        }
    }

    try {
        try {
            // NSS loads its sibling libraries beside it, so it loads by path;
            // the bundle is root's, and still the one just verified.
            verified.unchanged();
            library = koffi.load(options.nssLibraryPath, { global: false });
        } finally {
            verified.close();
        }
        const initialize = library.func(
            "int NSS_Initialize(const char *, const char *, const char *, const char *, unsigned int)",
        );
        const isInitialized = library.func("int NSS_IsInitialized(void)");
        shutdown = library.func("int NSS_Shutdown(void)");
        slotFree = library.func("void PK11_FreeSlot(void *)");
        slotLogout = library.func("int PK11_Logout(void *)");
        const slotRead = library.func("void *PK11_GetInternalKeySlot(void)");
        const needLogin = library.func("int PK11_NeedLogin(void *)");
        const passwordCheck = library.func("PK11_CheckUserPassword", "int", ["void *", "void *"]);
        // Official NSS flags: READONLY | NOMODDB | NOROOTINIT | OPTIMIZESPACE.
        // NOMODDB also prevents loading arbitrary modules from the source profile.
        if (
            isInitialized() !== 0 ||
            initialize(`sql:${options.profilePath}`, "", "", "", 0x1 | 0x4 | 0x10 | 0x20) !== 0
        )
            throw unavailable();
        initialized = true;
        slot = slotRead() as bigint | null;
        if (!slot) throw unavailable();
        const empty = Buffer.alloc(1);
        let unlocked = needLogin(slot) === 0 || passwordCheck(slot, empty) === 0;
        if (!unlocked && !options.primaryPasswordRequest)
            throw new BrowserLoginFirefoxPrimaryPasswordRequiredError();
        for (let attempt = 1; !unlocked && attempt <= 3; attempt += 1) {
            const password = await options.primaryPasswordRequest!({ attempt });
            if (password === null) throw cancelled();
            let terminated: Buffer | undefined;
            try {
                if (password.length > maximumSecretBytes || password.includes(0))
                    throw new Error("This Firefox primary password cannot be used.");
                terminated = Buffer.alloc(password.length + 1);
                password.copy(terminated);
                unlocked = passwordCheck(slot, terminated) === 0;
            } finally {
                password.fill(0);
                terminated?.fill(0);
            }
        }
        if (!unlocked) throw new Error("Firefox did not accept its primary password.");

        const itemType = koffi.struct({
            type: "unsigned int",
            data: "void *",
            len: "unsigned int",
        });
        const itemPointer = koffi.pointer(itemType);
        const decrypt = library.func("PK11SDR_Decrypt", "int", [
            itemPointer,
            koffi.inout(itemPointer),
            "void *",
        ]);
        const freeItem = library.func("SECITEM_ZfreeItem", "void", [itemPointer, "int"]);

        function valueDecrypt(encoded: string): Buffer {
            const encrypted = base64Require(encoded);
            const output: NssItem = { type: 0, data: null, len: 0 };
            try {
                const source = { type: 0, data: encrypted, len: encrypted.length };
                if (
                    decrypt(source, output, null) !== 0 ||
                    output.len > maximumSecretBytes ||
                    (!output.data && output.len !== 0)
                )
                    throw decryptionFailed();
                return browserLoginNativeBytesCopy(output.data, output.len);
            } finally {
                encrypted.fill(0);
                if (output.data) freeItem(output, 0);
            }
        }

        return {
            async usernameDecrypt(input) {
                if (disposed) throw cancelled();
                selectedRequire(selected, input.origin);
                try {
                    return valueDecrypt(input.encryptedUsername);
                } catch {
                    throw decryptionFailed();
                }
            },
            async loginDecrypt(input) {
                if (disposed) throw cancelled();
                selectedRequire(selected, input.origin);
                let username: Buffer | undefined;
                try {
                    username = valueDecrypt(input.encryptedUsername);
                    const password = valueDecrypt(input.encryptedPassword);
                    return { username, password };
                } catch {
                    username?.fill(0);
                    throw decryptionFailed();
                }
            },
            dispose,
        };
    } catch (error) {
        dispose();
        if (
            error instanceof BrowserLoginFirefoxPrimaryPasswordRequiredError ||
            error instanceof BrowserLoginCryptoCancelledError
        )
            throw error;
        // Native exceptions must never carry paths, buffers, passwords or NSS diagnostics.
        throw new Error(
            "Firefox could not unlock this login. Check its primary password and installed application, then try again.",
        );
    }
}

function selectionRequire(sites: readonly string[]): ReadonlySet<string> {
    if (
        sites.length === 0 ||
        sites.length > 20_000 ||
        sites.some((site) => typeof site !== "string" || site.length === 0 || site.length > 4096)
    )
        throw new Error("Choose a saved login before unlocking this browser.");
    return new Set(sites);
}

function selectedRequire(selected: ReadonlySet<string>, site: string): void {
    if (!selected.has(site)) throw new Error("This site was not chosen.");
}

function encryptedRequire(encrypted: Buffer): void {
    if (
        !Buffer.isBuffer(encrypted) ||
        encrypted.length === 0 ||
        encrypted.length > maximumEncryptedBytes
    )
        throw decryptionFailed();
}

function base64Require(encoded: string): Buffer {
    if (
        encoded.length === 0 ||
        encoded.length > maximumEncryptedBytes * 2 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    )
        throw decryptionFailed();
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.length > maximumEncryptedBytes) {
        bytes.fill(0);
        throw decryptionFailed();
    }
    return bytes;
}

function platformRequire(): void {
    if (process.platform !== "darwin" && process.platform !== "win32")
        throw new Error("Browser logins are available on macOS and Windows.");
}

function interactiveAccessRequire(): void {
    if (
        process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN !== undefined ||
        process.env.HAPPY_DESKTOP_GYM_PROFILE !== undefined
    ) {
        throw new Error("Browser unlocking is unavailable in hidden app sessions.");
    }
}

function unavailable(): Error {
    return new Error("The browser's encryption key could not be unlocked.");
}
function decryptionFailed(): Error {
    return new Error("This saved login could not be decrypted.");
}
function cancelled(): BrowserLoginCryptoCancelledError {
    return new BrowserLoginCryptoCancelledError();
}
