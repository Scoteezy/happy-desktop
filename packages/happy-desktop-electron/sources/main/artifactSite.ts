import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { HappyAgentDaemonClient } from "./happyAgentDaemonClient";

/** The scheme every artifact site is served under, and only inside its own partition. */
export const artifactSiteScheme = "happy-artifact";

/** The minimal Happy Agent surface an artifact site reads through. */
export type ArtifactSiteClient = Pick<
    HappyAgentDaemonClient,
    "getArtifactVersion" | "openArtifactFile" | "openArtifactApi"
> & {
    readonly connection?: (id: string) => ArtifactSiteClient;
};

/** A request a site cannot be opened for, with the status the renderer is told. */
export class ArtifactSiteError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = "ArtifactSiteError";
    }
}

export interface ArtifactSiteHandle {
    /**
     * Opens sites backed by one Happy Agent connection. The returned function
     * reads the version's manifest and names the address its entry is served
     * at; every file the page asks for afterwards is read through `client`.
     */
    register(client: ArtifactSiteClient): {
        readonly open: (
            artifactId: string,
            version: number,
            connectionId?: string,
        ) => Promise<string>;
    };
    /** Whether an address is the entry or a file of a site opened by `open`. */
    owns(url: string): boolean;
    /** The `protocol.handle` handler for the artifact partition's session. */
    handle(request: Request): Promise<Response>;
    close(): void;
}

/** One numbered version published as an origin of its own. */
interface ArtifactSite {
    readonly client: ArtifactSiteClient;
    readonly connectionId?: string;
    readonly artifactId: string;
    readonly version: number;
    /** Exactly the manifest's paths, each with the media type the daemon decided for it. */
    readonly files: ReadonlyMap<string, string>;
}

/**
 * How many versions keep a site at once. A reader looks at a handful of
 * artifacts, so this only keeps a window left open for a week from
 * remembering every version it ever showed.
 */
const ARTIFACT_SITE_LIMIT = 64;
/** A manifest larger than this is not a page anyone wrote by hand. */
const ARTIFACT_SITE_MAX_FILES = 10_000;
const ARTIFACT_ID = /^[a-z0-9]{1,48}$/u;
const BYTE_RANGE = /^bytes=\d*-\d*$/u;

/**
 * The host a numbered version is served as: `<artifact>-v<number>`, so two
 * versions, and two artifacts, never share storage or a same-origin read.
 *
 * A version reached through a remote connection carries a label derived from
 * that connection as well, so a remote Happy Agent cannot mint an artifact id
 * that lands on the origin of one this machine published. There is no `latest`
 * host: a site is one immutable version, and what it names never changes.
 */
export function artifactSiteHost(
    artifactId: string,
    version: number,
    connectionId?: string,
): string | undefined {
    if (!ARTIFACT_ID.test(artifactId) || !Number.isSafeInteger(version) || version < 1)
        return undefined;
    const site = `${artifactId}-v${String(version)}`;
    if (site.length > 63) return undefined;
    if (connectionId === undefined) return site;
    const connection = createHash("sha256").update(connectionId).digest("hex").slice(0, 16);
    return `${site}.c${connection}`;
}

/**
 * The manifest path a site URL's path names, or nothing when it cannot name one.
 *
 * Each segment is decoded once and must then be a segment a manifest could
 * hold: never empty, `.`, or `..`, and never holding a slash, a backslash, or a
 * control character. An encoded slash is how a single segment would smuggle a
 * second level past a check that splits on `/`, so it is refused rather than
 * decoded into one.
 */
export function artifactSitePath(pathname: string): string | undefined {
    if (!pathname.startsWith("/") || pathname.length > 4096) return undefined;
    const segments: string[] = [];
    for (const segment of pathname.slice(1).split("/")) {
        let value: string;
        try {
            value = decodeURIComponent(segment);
        } catch {
            return undefined;
        }
        if (
            value === "" ||
            value === "." ||
            value === ".." ||
            value.includes("/") ||
            value.includes("\\") ||
            controlCharacterHeld(value)
        )
            return undefined;
        segments.push(value);
    }
    return segments.join("/");
}

function controlCharacterHeld(value: string): boolean {
    for (const character of value) {
        const code = character.codePointAt(0) ?? 0;
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

/** The site and manifest path an address names, or nothing when it is not a site address. */
export function artifactSiteAddress(
    candidate: string,
): { readonly host: string; readonly path: string } | undefined {
    let address: URL;
    try {
        address = new URL(candidate);
    } catch {
        return undefined;
    }
    if (
        address.protocol !== `${artifactSiteScheme}:` ||
        address.username !== "" ||
        address.password !== "" ||
        address.port !== "" ||
        address.hostname === ""
    )
        return undefined;
    const path = artifactSitePath(address.pathname);
    return path === undefined ? undefined : { host: address.hostname, path };
}

/**
 * The already-encoded part after `/api/` when a site URL's path names its
 * artifact's API, `undefined` when it names a file, and `null` when it names
 * the API with a path no API route could have.
 *
 * `/api/` belongs to Happy Agent rather than to the manifest. What follows is
 * forwarded as written and never interpreted, so it is held to segments that
 * cannot climb out of the API or hide a second level, as file paths are.
 */
export function artifactSiteApiPath(pathname: string): string | null | undefined {
    if (pathname !== "/api" && !pathname.startsWith("/api/")) return undefined;
    const rest = pathname.slice("/api/".length);
    return artifactSitePath(`/${rest}`) === undefined ? null : rest;
}

/** The address a manifest path is served at on one site. */
function artifactSiteUrl(host: string, path: string): string {
    return `${artifactSiteScheme}://${host}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Serves numbered artifact versions to an isolated guest as sites of their own.
 *
 * An HTML artifact is a small site: its page names its stylesheet, its script,
 * and the pictures beside it by relative paths. Serving each version at the
 * root of its own origin is what lets those references resolve the way they
 * will anywhere else the artifact is published, while keeping one artifact's
 * storage, and one version's, out of reach of every other.
 *
 * Only a version's manifest is ever served, path for path. Main reads every
 * file from Happy Agent with the daemon credential, which never leaves this
 * process: the guest is answered bytes and never a cookie, a token, or an
 * address it could take somewhere else.
 */
export function artifactSitesCreate(): ArtifactSiteHandle {
    const sites = new Map<string, ArtifactSite>();
    const remember = (host: string, site: ArtifactSite): void => {
        // Re-inserted so insertion order is use order and the oldest site
        // nobody is looking at is the one that goes.
        sites.delete(host);
        sites.set(host, site);
        for (const stale of sites.keys()) {
            if (sites.size <= ARTIFACT_SITE_LIMIT) break;
            sites.delete(stale);
        }
    };
    return {
        register: (client) => ({
            open: async (artifactId, version, connectionId) => {
                const host = artifactSiteHost(artifactId, version, connectionId);
                if (host === undefined)
                    throw new ArtifactSiteError(400, "This artifact version cannot be served.");
                const reader =
                    connectionId === undefined ? client : client.connection?.(connectionId);
                if (!reader)
                    throw new ArtifactSiteError(501, "Remote artifacts are unavailable here.");
                const { version: read } = await reader.getArtifactVersion(artifactId, version);
                if (read.artifactId !== artifactId || read.number !== version)
                    throw new ArtifactSiteError(502, "Happy Agent answered for another version.");
                if (read.files.length > ARTIFACT_SITE_MAX_FILES)
                    throw new ArtifactSiteError(
                        413,
                        "This artifact holds too many files to serve.",
                    );
                const files = new Map<string, string>();
                for (const file of read.files) {
                    // `/api/` is the artifact's API on every site, so a file
                    // published there is shadowed rather than served.
                    if (file.path === "api" || file.path.startsWith("api/")) continue;
                    // The daemon already refuses these paths; a manifest that
                    // still holds one is not served at all rather than in part.
                    if (
                        artifactSitePath(
                            `/${file.path.split("/").map(encodeURIComponent).join("/")}`,
                        ) !== file.path
                    )
                        throw new ArtifactSiteError(
                            502,
                            "This artifact names a file it cannot hold.",
                        );
                    files.set(file.path, file.mimeType);
                }
                if (!files.has(read.entry.path))
                    throw new ArtifactSiteError(
                        502,
                        "This artifact's entry is not one of its files.",
                    );
                remember(host, {
                    client,
                    ...(connectionId === undefined ? {} : { connectionId }),
                    artifactId,
                    version,
                    files,
                });
                return artifactSiteUrl(host, read.entry.path);
            },
        }),
        owns: (url) => {
            const address = artifactSiteAddress(url);
            return (
                address !== undefined && sites.get(address.host)?.files.has(address.path) === true
            );
        },
        handle: async (request) => {
            const api = artifactSiteApi(request.url);
            if (api) {
                const site = sites.get(api.host);
                return site ? forward(site, api.rest, api.search, request) : refuse(404);
            }
            // A version is something to read. There is nothing on a site to
            // submit to, and a page asking to is answered as such.
            if (request.method !== "GET") return refuse(405, { allow: "GET" });
            const address = artifactSiteAddress(request.url);
            const site = address ? sites.get(address.host) : undefined;
            const mimeType = address && site ? site.files.get(address.path) : undefined;
            if (!address || !site || mimeType === undefined) return refuse(404);
            const reader =
                site.connectionId === undefined
                    ? site.client
                    : site.client.connection?.(site.connectionId);
            if (!reader) return refuse(502);
            const range = request.headers.get("range") ?? undefined;
            let upstream: Awaited<ReturnType<ArtifactSiteClient["openArtifactFile"]>>;
            try {
                upstream = await reader.openArtifactFile(
                    site.artifactId,
                    site.version,
                    address.path,
                    range !== undefined && BYTE_RANGE.test(range) ? range : undefined,
                );
            } catch {
                return refuse(502);
            }
            if (
                upstream.statusCode !== 200 &&
                upstream.statusCode !== 206 &&
                upstream.statusCode !== 416
            ) {
                upstream.body.resume();
                return refuse(upstream.statusCode === 404 ? 404 : 502);
            }
            const headers = new Headers(siteHeaders);
            headers.set("content-type", mimeType);
            for (const name of ["accept-ranges", "content-length", "content-range", "etag"]) {
                const value = upstream.headers[name];
                if (typeof value === "string") headers.set(name, value);
            }
            return new Response(
                upstream.statusCode === 416
                    ? null
                    : (Readable.toWeb(upstream.body) as ReadableStream<Uint8Array>),
                { status: upstream.statusCode, headers },
            );
        },
        close: () => sites.clear(),
    };
}

/** Where a site URL names its artifact's API. */
function artifactSiteApi(
    candidate: string,
): { readonly host: string; readonly rest: string | null; readonly search: string } | undefined {
    let address: URL;
    try {
        address = new URL(candidate);
    } catch {
        return undefined;
    }
    if (
        address.protocol !== `${artifactSiteScheme}:` ||
        address.username !== "" ||
        address.password !== "" ||
        address.port !== "" ||
        address.hostname === ""
    )
        return undefined;
    const rest = artifactSiteApiPath(address.pathname);
    return rest === undefined
        ? undefined
        : { host: address.hostname, rest, search: address.search };
}

/**
 * The largest request body a page may send its API. A value is small
 * structured data; the API itself decides what it accepts below this.
 */
const ARTIFACT_API_MAX_BODY_BYTES = 1024 * 1024;
/** The only headers a page's API request carries: never a cookie, a credential, or where it came from. */
const apiRequestHeaders = [
    "accept",
    "cache-control",
    "content-type",
    "if-match",
    "if-none-match",
    "last-event-id",
];
/** The only headers of the API's answer a page is shown. */
const apiResponseHeaders = [
    "cache-control",
    "content-length",
    "content-type",
    "etag",
    "last-modified",
    "location",
    "retry-after",
];

/**
 * Forwards one request to the API of the artifact a site serves, through the
 * connection it was opened on, and streams the answer back as it arrives: a
 * realtime channel is one long response. The desktop knows the API's prefix
 * and nothing else, so its answers, errors included, reach the page untouched.
 */
async function forward(
    site: ArtifactSite,
    rest: string | null,
    search: string,
    request: Request,
): Promise<Response> {
    if (rest === null) return refuse(404);
    const reader =
        site.connectionId === undefined ? site.client : site.client.connection?.(site.connectionId);
    if (!reader) return refuse(502);
    const headers: Record<string, string> = {};
    for (const name of apiRequestHeaders) {
        const value = request.headers.get(name);
        if (value !== null) headers[name] = value;
    }
    let body: Buffer | undefined;
    if (request.body) {
        body = await bodyRead(request.body);
        if (!body) return refuse(413);
    }
    let upstream: Awaited<ReturnType<ArtifactSiteClient["openArtifactApi"]>>;
    try {
        upstream = await reader.openArtifactApi(site.artifactId, rest, search, {
            method: request.method,
            headers,
            ...(body === undefined ? {} : { body }),
            signal: request.signal,
        });
    } catch {
        return refuse(502);
    }
    const answered = new Headers(siteHeaders);
    for (const name of apiResponseHeaders) {
        const value = upstream.headers[name];
        if (typeof value === "string") answered.set(name, value);
    }
    const status = upstream.statusCode;
    if (request.method === "HEAD" || status === 204 || status === 205 || status === 304) {
        upstream.body.resume();
        return new Response(null, { status, headers: answered });
    }
    return new Response(Readable.toWeb(upstream.body) as ReadableStream<Uint8Array>, {
        status,
        headers: answered,
    });
}

/** A request body, or nothing once it outgrows what an API request may carry. */
async function bodyRead(stream: ReadableStream<Uint8Array>): Promise<Buffer | undefined> {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = stream.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return Buffer.concat(chunks);
        size += value.byteLength;
        if (size > ARTIFACT_API_MAX_BODY_BYTES) {
            void reader.cancel();
            return undefined;
        }
        chunks.push(value);
    }
}

/**
 * What every answer from a site says about itself. The media type is the one
 * the manifest records, so a page cannot talk Chromium into reading a file as
 * another kind; no other origin may embed a site's files, artifact or not; and
 * a page that names nothing else sends no referrer that would tell a server
 * which artifact it is looking at.
 */
const siteHeaders: Readonly<Record<string, string>> = {
    "cache-control": "no-cache",
    "cross-origin-resource-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
};

function refuse(status: number, extra: Readonly<Record<string, string>> = {}): Response {
    return new Response(null, { status, headers: { ...siteHeaders, ...extra } });
}
