import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { safeStorage } from "electron";
import type { BrowserLoginId, BrowserLoginSnapshot } from "happy-desktop-state";

interface VaultRecord extends BrowserLoginSnapshot {
    readonly nonce: string;
    readonly ciphertext: string;
    readonly tag: string;
}

interface VaultFile {
    readonly version: 1;
    readonly wrappedKey: string;
    readonly records: readonly VaultRecord[];
}

/** Main-only input. Never expose it through the app bridge or agent transport. */
export interface BrowserLoginSecretInput {
    readonly origin: string;
    readonly username: string;
    readonly password: string;
}

interface SecretPayload extends BrowserLoginSecretInput {
    readonly id: BrowserLoginId;
    readonly updatedAt: number;
}

const maximumFileBytes = 64 * 1024 * 1024;
const maximumRecords = 20_000;
const maximumUsernameLength = 4096;
const maximumPasswordLength = 65_536;

/** Validate owned canonical origins; normalize external URLs at the import boundary. */
export function browserLoginOriginRequire(origin: string): string {
    try {
        const url = new URL(origin);
        if (
            origin.length <= 8192 &&
            url.protocol === "https:" &&
            url.origin === origin &&
            !url.username &&
            !url.password
        )
            return origin;
    } catch {
        // An untrusted URL could contain credentials; never include it in an error.
    }
    throw new Error("Passwords require an exact HTTPS origin.");
}

/**
 * One main-owned vault per desktop user-data directory, shared across networks.
 * Construction opens no resources. Listing metadata requires no Keychain call.
 * Reads and mutations serialize; only successful writes publish new metadata.
 * The app's single-instance lock protects this file from other app processes.
 */
export class BrowserLoginVault {
    private pending: Promise<void> = Promise.resolve();

    constructor(private readonly path: string) {}

    loginsRead(): Promise<readonly BrowserLoginSnapshot[]> {
        return this.serial(async () => (await this.fileRead())?.records.map(metadataOf) ?? []);
    }

    /** Atomically commit a save or a batch already selected by the person. */
    loginsSave(
        inputs: readonly BrowserLoginSecretInput[],
        commitRequire?: () => void,
    ): Promise<readonly BrowserLoginSnapshot[]> {
        // Copy caller-owned input before queueing, so selection cannot change mid-save.
        const selected = inputs.map((input) => ({ ...input }));
        return this.serial(async () => {
            commitRequire?.();
            this.platformRequire();
            if (selected.length > maximumRecords)
                throw new Error("The password vault has reached its login limit.");
            for (const input of selected) secretInputRequire(input);
            let file = await this.fileRead();
            if (selected.length === 0) return file?.records.map(metadataOf) ?? [];
            let key: Buffer | undefined;
            try {
                if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error();
                if (file) {
                    const unlocked = await this.keyUnwrap(file);
                    key = unlocked.key;
                    file = unlocked.file;
                    // Never replace an existing secret if its ciphertext is corrupt.
                    for (const record of file.records) recordDecrypt(record, key);
                } else {
                    key = randomBytes(32);
                    const wrapped = await safeStorage.encryptStringAsync(key.toString("base64"));
                    file = { version: 1, wrappedKey: wrapped.toString("base64"), records: [] };
                }
                const records = [...file.records];
                const indexes = new Map(
                    records.map((record, index) => [identityOf(record), index]),
                );
                for (const input of selected) {
                    const identity = identityOf(input);
                    const index = indexes.get(identity);
                    const metadata: BrowserLoginSnapshot = {
                        id:
                            index === undefined
                                ? (randomUUID() as BrowserLoginId)
                                : records[index].id,
                        origin: input.origin,
                        username: input.username,
                        updatedAt: Date.now(),
                    };
                    const record = recordEncrypt({ ...metadata, password: input.password }, key);
                    if (index === undefined) {
                        indexes.set(identity, records.length);
                        records.push(record);
                    } else records[index] = record;
                }
                if (records.length > maximumRecords) throw new Error();
                await this.fileWrite({ ...file, records }, commitRequire);
                return records.map(metadataOf);
            } catch (error) {
                // Causes here are fixed-text errors or Keychain failures, never a
                // credential value, so the cause is logged for diagnosis.
                console.error(
                    "[browser-passwords] vault save failed:",
                    error instanceof Error
                        ? (error.stack ?? `${error.name}: ${error.message}`)
                        : typeof error,
                );
                throw new Error(
                    "The password vault could not save these logins. Nothing was saved.",
                );
            } finally {
                key?.fill(0);
            }
        });
    }

    /**
     * Main-only comparison for a save offer: whether this exact login is already
     * saved, saved with another password, or new. Never returns the secret.
     */
    loginStatus(input: BrowserLoginSecretInput): Promise<"saved" | "changed" | "new"> {
        return this.serial(async () => {
            browserLoginOriginRequire(input.origin);
            const file = await this.fileRead();
            const record = file?.records.find(
                (entry) => entry.origin === input.origin && entry.username === input.username,
            );
            if (!file || !record) return "new";
            let key: Buffer | undefined;
            try {
                if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error();
                key = (await this.keyUnwrap(file)).key;
                return recordDecrypt(record, key).password === input.password ? "saved" : "changed";
            } catch {
                // An unreadable record is offered as an update; saving still
                // refuses to replace corrupt ciphertext.
                return "changed";
            } finally {
                key?.fill(0);
            }
        });
    }

    /** Publish metadata only after the ciphertext has been removed successfully. */
    loginRemove(id: BrowserLoginId): Promise<readonly BrowserLoginSnapshot[]> {
        return this.serial(async () => {
            const file = await this.fileRead();
            if (!file) return [];
            const records = file.records.filter((record) => record.id !== id);
            if (records.length !== file.records.length) await this.fileWrite({ ...file, records });
            return records.map(metadataOf);
        });
    }

    /**
     * Main-only scoped use. The controller derives origin from WebFrameMain,
     * verifies the current document and explicit picker selection, then sends
     * directly to that top frame. No secret is returned or placed in metadata.
     */
    async loginUse(
        id: BrowserLoginId,
        origin: string,
        use: (login: BrowserLoginSecretInput) => Promise<void>,
    ): Promise<void> {
        // Only the file read and decryption hold the vault. `use` may wait on a
        // person (a native dialog, a fill probe); saves and fills must not stall.
        const secret = await this.serial(async () => {
            browserLoginOriginRequire(origin);
            const file = await this.fileRead();
            const record = file?.records.find(
                (entry) => entry.id === id && entry.origin === origin,
            );
            if (!file || !record) throw new Error("This login is unavailable for this site.");
            let key: Buffer | undefined;
            let secret: SecretPayload;
            try {
                if (!(await safeStorage.isAsyncEncryptionAvailable())) throw new Error();
                const unlocked = await this.keyUnwrap(file);
                key = unlocked.key;
                secret = recordDecrypt(record, key);
                if (unlocked.file !== file) await this.fileWrite(unlocked.file);
            } catch {
                throw new Error("The password vault could not unlock this login.");
            } finally {
                key?.fill(0);
            }
            return secret;
        });
        // JS strings cannot be reliably zeroed; do not retain them beyond use.
        try {
            await use({
                origin: secret.origin,
                username: secret.username,
                password: secret.password,
            });
        } catch {
            throw new Error("Happy could not use this login.");
        }
    }

    private platformRequire(): void {
        if (process.platform !== "darwin" && process.platform !== "win32")
            throw new Error(
                "The password vault is available on macOS and Windows. Linux is not supported.",
            );
    }

    private serial<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.pending.then(operation);
        this.pending = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    private async fileRead(): Promise<VaultFile | undefined> {
        this.platformRequire();
        try {
            const handle = await open(this.path, "r");
            try {
                const stat = await handle.stat();
                if (!stat.isFile() || stat.size > maximumFileBytes) throw new Error();
                const source = await handle.readFile("utf8");
                if (Buffer.byteLength(source) > maximumFileBytes) throw new Error();
                return vaultFileParse(JSON.parse(source));
            } finally {
                await handle.close();
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
            throw new Error("The password vault could not be read. The existing file was kept.");
        }
    }

    private async keyUnwrap(file: VaultFile): Promise<{ key: Buffer; file: VaultFile }> {
        const unwrapped = await safeStorage.decryptStringAsync(
            Buffer.from(file.wrappedKey, "base64"),
        );
        const key = base64Require(unwrapped.result, 32, 32);
        if (unwrapped.shouldReEncrypt) {
            try {
                // Preserve the same data key when the operating-system wrapper rotates.
                const wrapped = await safeStorage.encryptStringAsync(unwrapped.result);
                const next = { ...file, wrappedKey: wrapped.toString("base64") };
                // The caller authenticates ciphertext before committing this wrapper.
                return { key, file: next };
            } catch {
                key.fill(0);
                throw new Error("The password vault could not update its Keychain protection.");
            }
        }
        return { key, file };
    }

    private async fileWrite(file: VaultFile, commitRequire?: () => void): Promise<void> {
        const source = JSON.stringify(file);
        if (Buffer.byteLength(source) > maximumFileBytes)
            throw new Error("The password vault has reached its storage limit.");
        const temporary = `${this.path}.${randomUUID()}.tmp`;
        try {
            await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
            const handle = await open(temporary, "wx", 0o600);
            try {
                await handle.writeFile(source, "utf8");
                await handle.sync();
            } finally {
                await handle.close();
            }
            commitRequire?.();
            await rename(temporary, this.path);
        } catch {
            throw new Error("The password vault could not be written.");
        } finally {
            await unlink(temporary).catch(() => undefined);
        }
    }
}

function identityOf(input: Pick<BrowserLoginSecretInput, "origin" | "username">): string {
    return JSON.stringify([input.origin, input.username]);
}

function metadataOf(record: VaultRecord): BrowserLoginSnapshot {
    return {
        id: record.id,
        origin: record.origin,
        username: record.username,
        updatedAt: record.updatedAt,
    };
}

function secretInputRequire(input: BrowserLoginSecretInput): void {
    browserLoginOriginRequire(input.origin);
    if (
        input.username.length > maximumUsernameLength ||
        input.password.length === 0 ||
        input.password.length > maximumPasswordLength
    )
        throw new Error("This login cannot be saved.");
}

function recordEncrypt(payload: SecretPayload, key: Buffer): VaultRecord {
    const nonce = randomBytes(12);
    const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
    try {
        const cipher = createCipheriv("aes-256-gcm", key, nonce);
        cipher.setAAD(Buffer.from(payload.origin, "utf8"));
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return {
            id: payload.id,
            origin: payload.origin,
            username: payload.username,
            updatedAt: payload.updatedAt,
            nonce: nonce.toString("base64"),
            ciphertext: ciphertext.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
        };
    } finally {
        plaintext.fill(0);
    }
}

function recordDecrypt(record: VaultRecord, key: Buffer): SecretPayload {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(record.nonce, "base64"));
    decipher.setAAD(Buffer.from(record.origin, "utf8"));
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const partial = decipher.update(Buffer.from(record.ciphertext, "base64"));
    let plaintext: Buffer | undefined;
    try {
        plaintext = Buffer.concat([partial, decipher.final()]);
        const parsed: unknown = JSON.parse(plaintext.toString("utf8"));
        if (
            !objectIs(parsed) ||
            parsed.id !== record.id ||
            parsed.origin !== record.origin ||
            parsed.username !== record.username ||
            parsed.updatedAt !== record.updatedAt ||
            typeof parsed.password !== "string"
        )
            throw new Error();
        const secret = { ...metadataOf(record), password: parsed.password };
        secretInputRequire(secret);
        return secret;
    } finally {
        partial.fill(0);
        plaintext?.fill(0);
    }
}

/** Unknown data is confined to the disk boundary. Owned contracts stay closed. */
function objectIs(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64Require(value: unknown, minimum: number, maximum: number): Buffer {
    if (typeof value !== "string" || value.length > Math.ceil(maximum / 3) * 4) throw new Error();
    const decoded = Buffer.from(value, "base64");
    if (
        decoded.length < minimum ||
        decoded.length > maximum ||
        decoded.toString("base64") !== value
    )
        throw new Error();
    return decoded;
}

function vaultFileParse(value: unknown): VaultFile {
    if (
        !objectIs(value) ||
        value.version !== 1 ||
        !Array.isArray(value.records) ||
        value.records.length > maximumRecords
    )
        throw new Error();
    base64Require(value.wrappedKey, 1, 65_536);
    const records: VaultRecord[] = [];
    const ids = new Set<string>();
    const identities = new Set<string>();
    for (const record of value.records) {
        if (
            !objectIs(record) ||
            typeof record.id !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
                record.id,
            ) ||
            typeof record.origin !== "string" ||
            typeof record.username !== "string" ||
            record.username.length > maximumUsernameLength ||
            typeof record.updatedAt !== "number" ||
            !Number.isSafeInteger(record.updatedAt) ||
            record.updatedAt < 0
        )
            throw new Error();
        browserLoginOriginRequire(record.origin);
        base64Require(record.nonce, 12, 12);
        base64Require(record.tag, 16, 16);
        base64Require(record.ciphertext, 1, 512 * 1024);
        const identity = identityOf({ origin: record.origin, username: record.username });
        if (ids.has(record.id) || identities.has(identity)) throw new Error();
        ids.add(record.id);
        identities.add(identity);
        records.push({
            id: record.id as BrowserLoginId,
            origin: record.origin,
            username: record.username,
            updatedAt: record.updatedAt,
            nonce: record.nonce as string,
            tag: record.tag as string,
            ciphertext: record.ciphertext as string,
        });
    }
    return { version: 1, wrappedKey: value.wrappedKey as string, records };
}
