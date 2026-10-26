import { chmod, copyFile, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import {
    browserImportHostNormalize,
    browserImportOriginNormalize,
    browserImportTextFileRead,
    type BrowserImportProfile,
} from "./browserImportProfiles";
import {
    browserImportSafariCookieMetadataRead,
    browserImportSafariCookiesRead,
} from "./browserImportSafariCookies";

export interface BrowserImportCookieMetadata {
    /** Exact canonical cookie host, without a leading domain dot. */
    readonly domain: string;
    readonly sourceHost: string;
    readonly name: string;
    readonly path: string;
    readonly secure: boolean;
    readonly httpOnly: boolean;
    readonly hostOnly: boolean;
    /** Unix seconds; null means a session cookie. */
    readonly expires: number | null;
    readonly sameSite: "unspecified" | "no_restriction" | "lax" | "strict";
}

export type BrowserImportCookieRecord = BrowserImportCookieMetadata &
    (
        | {
              readonly kind: "chromium";
              readonly encryptedValue: Buffer;
              readonly value: string;
              readonly databaseVersion: number;
          }
        | { readonly kind: "plaintext"; readonly value: string }
    );

export interface BrowserImportPasswordMetadata {
    readonly origin: string;
    /** Firefox account names remain encrypted until the person selects its site. */
    readonly username?: string;
    readonly updatedAt: number;
}

export type BrowserImportPasswordRecord =
    | {
          readonly kind: "chromium";
          readonly origin: string;
          readonly username: string;
          readonly updatedAt: number;
          readonly encryptedPassword: Buffer;
      }
    | {
          readonly kind: "firefox";
          readonly origin: string;
          readonly updatedAt: number;
          readonly encryptedUsername: string;
          readonly encryptedPassword: string;
      };

type Row = Record<string, SQLOutputValue>;
const maximumRows = 100_000;
const maximumPasswordRows = 20_000;
const maximumDatabaseBytes = 256 * 1024 * 1024;
const maximumCiphertextBytes = 512 * 1024;
const maximumSelectedBytes = 32 * 1024 * 1024;

/** Metadata queries never SELECT cookie values, encrypted values, or password blobs. */
export async function browserImportCookieMetadataRead(
    profile: BrowserImportProfile,
): Promise<readonly BrowserImportCookieMetadata[]> {
    cookiesRequire(profile);
    if (profile.engine === "safari")
        return browserImportSafariCookieMetadataRead(profile.cookiesPath!);
    return databaseRead(profile.cookiesPath!, (database) =>
        cookieRows(database, profile.engine).map((entry) => entry.metadata),
    );
}

/** Only rowids matching chosen canonical domains can participate in a value query. */
export async function browserImportCookiesRead(
    profile: BrowserImportProfile,
    domains: ReadonlySet<string>,
    allowed: (cookie: BrowserImportCookieMetadata) => boolean = () => true,
): Promise<readonly BrowserImportCookieRecord[]> {
    cookiesRequire(profile);
    selectionRequire(domains, browserImportHostNormalize);
    if (domains.size === 0) return [];
    if (profile.engine === "safari")
        return browserImportSafariCookiesRead(profile.cookiesPath!, domains, allowed);
    return databaseRead(profile.cookiesPath!, (database) => {
        const rows = cookieRows(database, profile.engine).filter(
            (row) => domains.has(row.metadata.domain) && allowed(row.metadata),
        );
        const records: BrowserImportCookieRecord[] = [];
        let bytes = 0;
        if (profile.engine === "chromium") {
            const columns = columnsRead(database, "cookies", ["encrypted_value", "value"]);
            if (!columns.has("encrypted_value") || !columns.has("value")) throw formatError();
            const version = chromiumVersionRead(database);
            const query = database.prepare(
                "SELECT substr(encrypted_value, 1, 65537) AS encrypted_value, substr(value, 1, 65537) AS value FROM cookies WHERE rowid = ?",
            );
            query.setReadBigInts(true);
            for (const row of rows) {
                const secret = query.get(row.rowid);
                if (!secret) throw changedError();
                const encryptedValue = blobRequire(secret.encrypted_value, 65_536);
                const value = textRequire(secret.value, 65_536);
                bytes += encryptedValue.length + value.length * 2;
                if (bytes > maximumSelectedBytes) {
                    encryptedValue.fill(0);
                    throw limitError();
                }
                records.push({
                    ...row.metadata,
                    kind: "chromium",
                    databaseVersion: version,
                    encryptedValue,
                    value,
                });
            }
        } else {
            const columns = columnsRead(database, "moz_cookies", ["value"]);
            if (!columns.has("value")) throw formatError();
            const query = database.prepare(
                "SELECT substr(value, 1, 65537) AS value FROM moz_cookies WHERE rowid = ?",
            );
            query.setReadBigInts(true);
            for (const row of rows) {
                const secret = query.get(row.rowid);
                if (!secret) throw changedError();
                const value = textRequire(secret.value, 65_536);
                bytes += value.length * 2;
                if (bytes > maximumSelectedBytes) throw limitError();
                records.push({
                    ...row.metadata,
                    kind: "plaintext",
                    value,
                });
            }
        }
        return records;
    });
}

export async function browserImportPasswordMetadataRead(
    profile: BrowserImportProfile,
): Promise<readonly BrowserImportPasswordMetadata[]> {
    passwordsRequire(profile);
    if (profile.engine === "firefox") {
        const file = await firefoxLoginsRead(profile.loginsPath!);
        return file.flatMap((entry) => {
            const metadata = firefoxMetadata(entry);
            return metadata ? [metadata] : [];
        });
    }
    const output: BrowserImportPasswordMetadata[] = [];
    for (const path of profile.loginsPaths) {
        output.push(
            ...(await databaseRead(path, (database) =>
                chromiumPasswordRows(database).map((row) => row.metadata),
            )),
        );
        if (output.length > maximumPasswordRows) throw limitError();
    }
    return output;
}

export async function browserImportPasswordsRead(
    profile: BrowserImportProfile,
    origins: ReadonlySet<string>,
): Promise<readonly BrowserImportPasswordRecord[]> {
    passwordsRequire(profile);
    selectionRequire(origins, browserImportOriginNormalize);
    if (origins.size === 0) return [];
    if (profile.engine === "firefox") {
        const file = await firefoxLoginsRead(profile.loginsPath!);
        const records: BrowserImportPasswordRecord[] = [];
        let bytes = 0;
        for (const entry of file) {
            const metadata = firefoxMetadata(entry);
            if (!metadata || !origins.has(metadata.origin)) continue;
            if (
                entry.encType !== 1 ||
                typeof entry.encryptedUsername !== "string" ||
                typeof entry.encryptedPassword !== "string" ||
                entry.encryptedUsername.length > maximumCiphertextBytes ||
                entry.encryptedPassword.length > maximumCiphertextBytes
            )
                throw formatError();
            bytes += (entry.encryptedUsername.length + entry.encryptedPassword.length) * 2;
            if (bytes > maximumSelectedBytes) throw limitError();
            records.push({
                kind: "firefox",
                origin: metadata.origin,
                updatedAt: metadata.updatedAt,
                encryptedUsername: entry.encryptedUsername,
                encryptedPassword: entry.encryptedPassword,
            });
        }
        return records;
    }
    const records: BrowserImportPasswordRecord[] = [];
    let bytes = 0;
    for (const path of profile.loginsPaths) {
        records.push(
            ...(await databaseRead(path, (database) => {
                columnsRead(database, "logins", ["password_value"]);
                const rows = chromiumPasswordRows(database).filter((row) =>
                    origins.has(row.metadata.origin),
                );
                const query = database.prepare(
                    `SELECT substr(password_value, 1, ${maximumCiphertextBytes + 1}) AS password_value FROM logins WHERE rowid = ?`,
                );
                query.setReadBigInts(true);
                return rows.map((row): BrowserImportPasswordRecord => {
                    const secret = query.get(row.rowid);
                    if (!secret) throw changedError();
                    const encryptedPassword = blobRequire(
                        secret.password_value,
                        maximumCiphertextBytes,
                    );
                    bytes += encryptedPassword.length + (row.metadata.username?.length ?? 0) * 2;
                    if (bytes > maximumSelectedBytes) {
                        encryptedPassword.fill(0);
                        throw limitError();
                    }
                    return {
                        kind: "chromium",
                        origin: row.metadata.origin,
                        username: row.metadata.username!,
                        updatedAt: row.metadata.updatedAt,
                        encryptedPassword,
                    };
                });
            })),
        );
        if (records.length > maximumPasswordRows) throw limitError();
    }
    return records;
}

function cookiesRequire(profile: BrowserImportProfile): void {
    if (profile.unsupportedCookiesReason) throw new Error(profile.unsupportedCookiesReason);
    if (!profile.cookiesPath)
        throw new Error("This browser profile has no cookie database to import.");
}

function passwordsRequire(profile: BrowserImportProfile): void {
    if (profile.unsupportedPasswordsReason) throw new Error(profile.unsupportedPasswordsReason);
    if (profile.engine === "safari")
        throw new Error("Safari passwords require Safari's password CSV export.");
    if (!profile.loginsPath || profile.loginsPaths.length === 0)
        throw new Error("This browser profile has no saved-password database to import.");
}

function selectionRequire(
    values: ReadonlySet<string>,
    canonical: (value: string) => string | undefined,
): void {
    if (
        values.size > maximumPasswordRows ||
        [...values].some((value) => canonical(value) !== value)
    )
        throw new Error("The selected browser sites are invalid. Choose the sites again.");
}

async function databaseRead<T>(path: string, read: (database: DatabaseSync) => T): Promise<T> {
    try {
        const info = await stat(path);
        if (!info.isFile() || info.size > maximumDatabaseBytes) throw limitError();
        if ((await fileSize(`${path}-wal`)) > maximumDatabaseBytes) throw limitError();
        // SQLite reads a live WAL with its shared-memory protocol, so the live
        // file is always tried first and is never opened with immutable=1.
        return databaseFileRead(path, read);
    } catch (error) {
        if (error instanceof BrowserImportDatabaseLockedError) {
            try {
                return await snapshotRead(path, read);
            } catch (snapshotError) {
                // A failed private copy carries a temporary path; never surface it.
                if (snapshotError instanceof BrowserImportDatabaseError) throw snapshotError;
                throw new BrowserImportDatabaseError(
                    "Close the source browser and try again. Its database is locked.",
                );
            }
        }
        if (error instanceof BrowserImportDatabaseError) throw error;
        throw new BrowserImportDatabaseError(
            "Close the source browser and try again. Its database is unreadable or uses an unsupported format.",
        );
    }
}

/**
 * A running Chromium holds its logins database under SQLite's exclusive locking
 * mode, so no other process can read it live. Like other browser importers, read
 * a private copy instead. Only a rollback-journal database with no transaction
 * in flight is copied: an empty journal and no WAL mean the main file alone is
 * the committed state, and an unchanged size and mtime around the copy prove no
 * write landed during it. The copy holds the same still-encrypted records as the
 * source, lives in a fresh 0700 directory, and is removed before returning.
 */
async function snapshotRead<T>(path: string, read: (database: DatabaseSync) => T): Promise<T> {
    if ((await fileSize(`${path}-wal`)) > 0)
        throw new BrowserImportDatabaseError(
            "Close the source browser and try again. Its database is locked.",
        );
    const directory = await mkdtemp(join(tmpdir(), "happy-browser-import-"));
    try {
        const copy = join(directory, "snapshot.sqlite");
        for (let attempt = 0; attempt < 5; attempt += 1) {
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 200));
            if ((await fileSize(`${path}-journal`)) > 0) continue;
            const before = await stat(path);
            await copyFile(path, copy);
            await chmod(copy, 0o600);
            const after = await stat(path);
            if (
                before.size !== after.size ||
                before.mtimeMs !== after.mtimeMs ||
                (await fileSize(`${path}-journal`)) > 0
            )
                continue;
            try {
                return databaseFileRead(copy, read);
            } catch (error) {
                if (error instanceof BrowserImportDatabaseError) throw error;
                throw new BrowserImportDatabaseError(
                    "Close the source browser and try again. Its database is unreadable or uses an unsupported format.",
                );
            }
        }
        throw new BrowserImportDatabaseError(
            "The source browser kept writing its database. Close the browser and try again.",
        );
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
}

/**
 * Opens one SQLite file read-only for a single read transaction.
 *
 * node:sqlite is synchronous and this runs on Electron's main thread, so a busy
 * wait freezes every Happy window. A running Chromium never releases its
 * exclusive logins lock, so waiting gains nothing: allow only a brief retry
 * for a writer's momentary lock, then fall back to the private copy.
 */
function databaseFileRead<T>(path: string, read: (database: DatabaseSync) => T): T {
    let database: DatabaseSync | undefined;
    try {
        database = new DatabaseSync(path, {
            readOnly: true,
            allowExtension: false,
            enableDoubleQuotedStringLiterals: false,
            timeout: 25,
        });
        database.exec(
            "PRAGMA busy_timeout = 25; PRAGMA query_only = ON; PRAGMA trusted_schema = OFF; BEGIN DEFERRED;",
        );
        const result = read(database);
        database.exec("COMMIT");
        return result;
    } catch (error) {
        // SQLITE_BUSY (5) or SQLITE_LOCKED (6), including their extended codes.
        const code = (error as { errcode?: unknown }).errcode;
        if (typeof code === "number" && ((code & 0xff) === 5 || (code & 0xff) === 6))
            throw new BrowserImportDatabaseLockedError();
        throw error;
    } finally {
        try {
            database?.close();
        } catch {
            /* Never expose a native SQLite error or path. */
        }
    }
}

async function fileSize(path: string): Promise<number> {
    try {
        return (await stat(path)).size;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
        throw error;
    }
}

class BrowserImportDatabaseError extends Error {}
class BrowserImportDatabaseLockedError extends Error {}
function formatError(): Error {
    return new BrowserImportDatabaseError(
        "This browser's saved-data format is unsupported or damaged. Update Happy, or use a password CSV export for passwords.",
    );
}
function changedError(): Error {
    return new BrowserImportDatabaseError(
        "The browser data changed during import. Close the browser and choose its sites again.",
    );
}
function limitError(): Error {
    return new BrowserImportDatabaseError(
        "This browser profile exceeds the import size or record limit.",
    );
}

/** Table and column names below are constants, never untrusted identifiers. */
function columnsRead(
    database: DatabaseSync,
    table: "cookies" | "moz_cookies" | "logins" | "meta",
    required: readonly string[],
): ReadonlySet<string> {
    const schema = database.prepare("SELECT type FROM sqlite_master WHERE name = ?").get(table);
    if (schema?.type !== "table") throw formatError();
    const columns = new Set<string>();
    for (const row of database.prepare(`PRAGMA table_info("${table}")`).iterate())
        if (typeof row.name === "string") columns.add(row.name);
    if (columns.has("rowid")) throw formatError();
    if (required.some((column) => !columns.has(column))) throw formatError();
    return columns;
}

function rowsRead(database: DatabaseSync, query: string, maximum: number): Row[] {
    const statement = database.prepare(`${query} LIMIT ${maximum + 1}`);
    statement.setReadBigInts(true);
    const rows: Row[] = [];
    let bytes = 0;
    for (const row of statement.iterate()) {
        if (rows.length === maximum) throw limitError();
        for (const value of Object.values(row))
            bytes +=
                typeof value === "string"
                    ? value.length * 2
                    : value instanceof Uint8Array
                      ? value.length
                      : 16;
        if (bytes > maximumSelectedBytes) throw limitError();
        rows.push(row);
    }
    return rows;
}

function cookieRows(
    database: DatabaseSync,
    engine: "chromium" | "firefox" | "safari",
): { rowid: bigint; metadata: BrowserImportCookieMetadata }[] {
    const chromium = engine === "chromium";
    const table = chromium ? "cookies" : "moz_cookies";
    const columns = columnsRead(
        database,
        table,
        chromium
            ? ["host_key", "name", "path", "is_secure", "is_httponly", "expires_utc"]
            : ["host", "name", "path", "isSecure", "isHttpOnly", "expiry"],
    );
    const host = chromium ? "host_key" : "host";
    const secure = chromium ? "is_secure" : "isSecure";
    const httpOnly = chromium ? "is_httponly" : "isHttpOnly";
    const expiry = chromium ? "expires_utc" : "expiry";
    // Firefox's `sameSite` is its effective policy, which reads "None" for a
    // cookie that set no attribute; `rawSameSite` is what the site actually sent.
    const sameSiteColumn = chromium
        ? "samesite"
        : columns.has("rawSameSite")
          ? "rawSameSite"
          : "sameSite";
    const sameSite = columns.has(sameSiteColumn) ? `"${sameSiteColumn}"` : "-1";
    // Partitioned/contextual cookies cannot be merged into an unrelated top-level
    // cookie jar while preserving their security scope. Exclude them explicitly.
    const scope = chromium
        ? columns.has("top_frame_site_key")
            ? " AND top_frame_site_key = ''"
            : ""
        : columns.has("originAttributes")
          ? " AND originAttributes = ''"
          : "";
    const rows = rowsRead(
        database,
        `SELECT rowid AS import_rowid, substr("${host}",1,8193) AS host, substr(name,1,4097) AS name, substr(path,1,8193) AS path,
        "${secure}" AS secure, "${httpOnly}" AS http_only, "${expiry}" AS expiry, ${sameSite} AS same_site FROM "${table}" WHERE "${secure}" = 1${scope}`,
        maximumRows,
    );
    const output: { rowid: bigint; metadata: BrowserImportCookieMetadata }[] = [];
    for (const row of rows) {
        const sourceHost = textRequire(row.host, 8192);
        const domain = browserImportHostNormalize(sourceHost);
        const name = textRequire(row.name, 4096);
        const path = textRequire(row.path, 8192);
        // Reject control bytes at this external browser-file boundary.
        // eslint-disable-next-line no-control-regex
        if (!domain || !path.startsWith("/") || /[\x00-\x1f\x7f]/.test(name + path)) continue;
        const expires = chromium ? chromiumSeconds(row.expiry) : unixSeconds(row.expiry);
        if (expires !== null && expires <= Date.now() / 1000) continue;
        const sameSite = chromium
            ? chromiumSameSiteRead(row.same_site)
            : firefoxSameSiteRead(row.same_site);
        output.push({
            rowid: integerRequire(row.import_rowid),
            metadata: {
                domain,
                sourceHost,
                name,
                path,
                secure: true,
                httpOnly: integerRequire(row.http_only) === 1n,
                hostOnly: !sourceHost.startsWith("."),
                expires,
                sameSite,
            },
        });
    }
    return output;
}

function chromiumVersionRead(database: DatabaseSync): number {
    columnsRead(database, "meta", ["key", "value"]);
    const value = database.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value;
    const version =
        typeof value === "string" && /^\d{1,6}$/.test(value)
            ? Number(value)
            : typeof value === "bigint"
              ? Number(value)
              : value;
    if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1)
        throw formatError();
    return version;
}

function chromiumPasswordRows(
    database: DatabaseSync,
): { rowid: bigint; metadata: BrowserImportPasswordMetadata }[] {
    const columns = columnsRead(database, "logins", [
        "origin_url",
        "signon_realm",
        "username_value",
    ]);
    const updated = columns.has("date_password_modified")
        ? "date_password_modified"
        : columns.has("date_created")
          ? "date_created"
          : "0";
    const blocked = columns.has("blocked_by_user")
        ? " AND blocked_by_user = 0"
        : columns.has("blacklisted_by_user")
          ? " AND blacklisted_by_user = 0"
          : "";
    const scheme = columns.has("scheme") ? " AND scheme = 0" : "";
    const rows = rowsRead(
        database,
        `SELECT rowid AS import_rowid, substr(origin_url,1,8193) AS origin_url,
        substr(signon_realm,1,8193) AS signon_realm, substr(username_value,1,4097) AS username_value,
        ${updated} AS updated FROM logins WHERE 1=1${blocked}${scheme}`,
        maximumPasswordRows,
    );
    const output: { rowid: bigint; metadata: BrowserImportPasswordMetadata }[] = [];
    for (const row of rows) {
        const origin = browserImportOriginNormalize(textRequire(row.origin_url, 8192));
        const realm = browserImportOriginNormalize(textRequire(row.signon_realm, 8192));
        if (!origin || origin !== realm) continue;
        output.push({
            rowid: integerRequire(row.import_rowid),
            metadata: {
                origin,
                username: textRequire(row.username_value, 4096),
                updatedAt: chromiumMilliseconds(row.updated),
            },
        });
    }
    return output;
}

async function firefoxLoginsRead(path: string): Promise<readonly Record<string, unknown>[]> {
    try {
        const value: unknown = JSON.parse(await browserImportTextFileRead(path, 16 * 1024 * 1024));
        if (
            !objectIs(value) ||
            !Array.isArray(value.logins) ||
            ![1, 2, 3].includes(Number(value.version))
        )
            throw formatError();
        if (value.logins.length > maximumPasswordRows) throw limitError();
        if (!value.logins.every(objectIs)) throw formatError();
        return value.logins;
    } catch (error) {
        if (error instanceof BrowserImportDatabaseError) throw error;
        throw new BrowserImportDatabaseError(
            "Firefox saved logins could not be read. Close Firefox and try again, or use its password CSV export.",
        );
    }
}

function firefoxMetadata(
    entry: Record<string, unknown>,
): BrowserImportPasswordMetadata | undefined {
    if (
        typeof entry.hostname !== "string" ||
        (entry.httpRealm !== null && entry.httpRealm !== undefined && entry.httpRealm !== "")
    )
        return undefined;
    const origin = browserImportOriginNormalize(entry.hostname);
    if (!origin) return undefined;
    const updated = entry.timePasswordChanged ?? entry.timeCreated ?? 0;
    if (typeof updated !== "number" || !Number.isSafeInteger(updated) || updated < 0)
        throw formatError();
    return { origin, updatedAt: updated };
}

function objectIs(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function integerRequire(value: SQLOutputValue | undefined): bigint {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    throw formatError();
}
function textRequire(value: SQLOutputValue | undefined, maximum: number): string {
    if (typeof value !== "string" || value.length > maximum) throw formatError();
    return value;
}
function blobRequire(value: SQLOutputValue | undefined, maximum: number): Buffer {
    if (!(value instanceof Uint8Array) || value.byteLength > maximum) throw formatError();
    return Buffer.from(value);
}
/** A login's modification time; 0 means unknown, as Chrome itself writes it. */
function chromiumMilliseconds(value: SQLOutputValue | undefined): number {
    const integer = integerRequire(value);
    if (integer === 0n) return 0;
    const milliseconds = Number(integer / 1000n - 11_644_473_600_000n);
    // Chrome keeps logins whose date predates its 1601 epoch, typically ones
    // imported from another browser. The date is only informative, so such a
    // login is kept with an unknown date rather than failing the whole profile.
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) return 0;
    return milliseconds;
}
function chromiumSeconds(value: SQLOutputValue | undefined): number | null {
    const integer = integerRequire(value);
    if (integer === 0n) return null;
    const milliseconds = Number(integer / 1000n - 11_644_473_600_000n);
    if (!Number.isSafeInteger(milliseconds)) throw formatError();
    return milliseconds / 1000;
}
function unixSeconds(value: SQLOutputValue | undefined): number | null {
    const integer = integerRequire(value);
    if (integer === 0n) return null;
    const seconds = Number(integer);
    if (!Number.isSafeInteger(seconds)) throw formatError();
    return seconds;
}
/** Chromium's CookieSameSite; a value a newer Chromium adds keeps its default. */
function chromiumSameSiteRead(
    value: SQLOutputValue | undefined,
): BrowserImportCookieMetadata["sameSite"] {
    switch (integerRequire(value)) {
        case 0n:
            return "no_restriction";
        case 1n:
            return "lax";
        case 2n:
            return "strict";
        default:
            return "unspecified";
    }
}

/**
 * Firefox's nsICookie SameSite. Its 0 means both "None" and, in older profiles,
 * "no attribute": it stays unspecified, so Chromium applies Lax by default
 * rather than sending the cookie on every cross-site request.
 */
function firefoxSameSiteRead(
    value: SQLOutputValue | undefined,
): BrowserImportCookieMetadata["sameSite"] {
    switch (integerRequire(value)) {
        case 1n:
            return "lax";
        case 2n:
            return "strict";
        default:
            return "unspecified";
    }
}
