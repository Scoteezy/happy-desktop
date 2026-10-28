import { spawn } from "node:child_process";
import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { open } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
    BrowserLoginKeychainError,
    browserLoginKeychainPasswordRead,
} from "./browserLoginKeychain";

/** Source-browser cryptography is main-only. Buffers returned here belong to the caller, which must wipe them. */

export interface BrowserLoginChromiumPassword {
    readonly origin: string;
    readonly encryptedPassword: Buffer;
}

export interface BrowserLoginChromiumDecryptor {
    passwordDecrypt(input: BrowserLoginChromiumPassword): Promise<Buffer>;
    dispose(): void;
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
