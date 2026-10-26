import { open } from "node:fs/promises";
import { browserImportHostNormalize } from "./browserImportProfiles";
import type {
    BrowserImportCookieMetadata,
    BrowserImportCookieRecord,
} from "./browserImportDatabase";

const maximumFileBytes = 64 * 1024 * 1024;
const maximumCookies = 100_000;

/** Parsing metadata never decodes a cookie's value string. No file is copied. */
export async function browserImportSafariCookieMetadataRead(
    path: string,
): Promise<readonly BrowserImportCookieMetadata[]> {
    const source = await sourceRead(path);
    try {
        return cookiesParse(source).map((cookie) => cookie.metadata);
    } catch {
        throw formatError();
    } finally {
        source.fill(0);
    }
}

/** Only values belonging to explicitly chosen canonical hosts are decoded. */
export async function browserImportSafariCookiesRead(
    path: string,
    domains: ReadonlySet<string>,
    allowed: (cookie: BrowserImportCookieMetadata) => boolean = () => true,
): Promise<readonly BrowserImportCookieRecord[]> {
    if (
        domains.size > 20_000 ||
        [...domains].some((domain) => browserImportHostNormalize(domain) !== domain)
    )
        throw new Error("The selected Safari sites are invalid. Choose the sites again.");
    if (domains.size === 0) return [];
    const source = await sourceRead(path);
    try {
        const records: BrowserImportCookieRecord[] = [];
        let bytes = 0;
        for (const cookie of cookiesParse(source)) {
            if (!domains.has(cookie.metadata.domain) || !allowed(cookie.metadata)) continue;
            const value = stringRead(cookie.bytes, cookie.valueOffset, 65_536);
            bytes += value.length * 2;
            if (bytes > 32 * 1024 * 1024) throw new Error();
            records.push({
                ...cookie.metadata,
                kind: "plaintext",
                value,
            });
        }
        return records;
    } catch {
        throw formatError();
    } finally {
        source.fill(0);
    }
}

interface ParsedCookie {
    readonly metadata: BrowserImportCookieMetadata;
    readonly bytes: Buffer;
    readonly valueOffset: number;
}

function cookiesParse(source: Buffer): readonly ParsedCookie[] {
    if (source.length < 8 || source.toString("ascii", 0, 4) !== "cook") throw formatError();
    const pageCount = source.readUInt32BE(4);
    if (pageCount > 16_384 || 8 + pageCount * 4 > source.length) throw formatError();
    let pageStart = 8 + pageCount * 4;
    let total = 0;
    const records: ParsedCookie[] = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const pageSize = source.readUInt32BE(8 + pageIndex * 4);
        if (pageSize < 12 || pageSize > source.length - pageStart) throw formatError();
        const page = source.subarray(pageStart, pageStart + pageSize);
        pageStart += pageSize;
        if (page.readUInt32BE(0) !== 0x00000100) throw formatError();
        const count = page.readUInt32LE(4);
        total += count;
        if (total > maximumCookies || 8 + count * 4 + 4 > page.length) throw formatError();
        const headerEnd = 8 + count * 4 + 4;
        if (page.readUInt32LE(headerEnd - 4) !== 0) throw formatError();
        const intervals: { start: number; end: number }[] = [];
        for (let index = 0; index < count; index++) {
            const offset = page.readUInt32LE(8 + index * 4);
            if (offset < headerEnd || offset + 56 > page.length) throw formatError();
            const size = page.readUInt32LE(offset);
            if (size < 56 || size > page.length - offset) throw formatError();
            intervals.push({ start: offset, end: offset + size });
        }
        intervals.sort((a, b) => a.start - b.start);
        if (
            intervals.some(
                (interval, index) => index > 0 && interval.start < intervals[index - 1].end,
            )
        )
            throw formatError();
        // Validate every record interval before allocating metadata strings, so
        // repeated/overlapping malicious offsets cannot amplify memory use.
        for (const interval of intervals) {
            const cookie = page.subarray(interval.start, interval.end);
            const flags = cookie.readUInt32LE(8);
            // Safari stores HTTP cookies too; only secure cookies may be imported.
            if (!(flags & 1)) continue;
            const hostOffset = cookie.readUInt32LE(16);
            const nameOffset = cookie.readUInt32LE(20);
            const pathOffset = cookie.readUInt32LE(24);
            const valueOffset = cookie.readUInt32LE(28);
            // The format lays out host, name, path, then value. Reject aliases
            // or overlapping fields so a corrupt metadata offset cannot expose
            // a cookie's value during the preselection metadata read.
            if (
                hostOffset < 56 ||
                nameOffset <= hostOffset ||
                pathOffset <= nameOffset ||
                valueOffset <= pathOffset ||
                valueOffset >= cookie.length
            )
                throw formatError();
            const sourceHost = stringRead(cookie.subarray(0, nameOffset), hostOffset, 8192);
            const domain = browserImportHostNormalize(sourceHost);
            const name = stringRead(cookie.subarray(0, pathOffset), nameOffset, 4096);
            const path = stringRead(cookie.subarray(0, valueOffset), pathOffset, 8192);
            const cocoaExpiry = cookie.readDoubleLE(40);
            if (!Number.isFinite(cocoaExpiry)) throw formatError();
            const expires = cocoaExpiry === 0 ? null : cocoaExpiry + 978_307_200;
            if (
                !domain ||
                !path.startsWith("/") ||
                // Reject control bytes at this external browser-file boundary.
                // eslint-disable-next-line no-control-regex
                /[\x00-\x1f\x7f]/.test(name + path) ||
                (expires !== null && expires <= Date.now() / 1000)
            )
                continue;
            records.push({
                bytes: cookie,
                valueOffset,
                metadata: {
                    domain,
                    sourceHost,
                    name,
                    path,
                    secure: true,
                    httpOnly: Boolean(flags & 4),
                    hostOnly: !sourceHost.startsWith("."),
                    expires,
                    sameSite: "unspecified",
                },
            });
        }
    }
    // Safari appends a checksum/footer after the pages. It contains no records.
    return records;
}

function stringRead(source: Buffer, offset: number, maximum: number): string {
    if (offset < 56 || offset >= source.length) throw formatError();
    const bound = Math.min(source.length, offset + maximum + 1);
    const end = source.subarray(offset, bound).indexOf(0);
    if (end < 0 || end > maximum) throw formatError();
    return new TextDecoder("utf-8", { fatal: true }).decode(source.subarray(offset, offset + end));
}

async function sourceRead(path: string): Promise<Buffer> {
    let source: Buffer | undefined;
    try {
        const handle = await open(path, "r");
        try {
            const info = await handle.stat();
            if (!info.isFile() || info.size > maximumFileBytes) throw formatError();
            source = Buffer.alloc(info.size + 1);
            let offset = 0;
            while (offset < source.length) {
                const read = await handle.read(source, offset, source.length - offset, offset);
                if (!read.bytesRead) break;
                offset += read.bytesRead;
            }
            if (offset !== info.size) throw formatError();
            return source.subarray(0, offset);
        } finally {
            await handle.close();
        }
    } catch (error) {
        source?.fill(0);
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM")
            throw new Error(
                "Safari cookies require Full Disk Access. Enable it for Happy in macOS System Settings → Privacy & Security → Full Disk Access, then choose Safari again.",
            );
        if (code === "ENOENT")
            throw new Error(
                "Safari's cookie file could not be found. Open Safari once, then try again.",
            );
        throw formatError();
    }
}

function formatError(): Error {
    return new Error(
        "Safari's cookie file is unsupported, damaged, or changing. Close Safari and try again.",
    );
}
