import { randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { createServer, request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { artifactAddressPublic } from "@slopus/happy-agent-client";
import { connect, isIP, type AddressInfo, type Socket } from "node:net";
import { pipeline } from "node:stream/promises";
import { artifactSiteScheme } from "./artifactSite";

/*
 * Which addresses an artifact page may reach is the client package's: the
 * daemon's restricted proxy and this one judge every address by the same
 * function, so the two can never disagree.
 */
export { artifactAddressPublic };

/**
 * Host names that only ever mean this machine or Happy itself, refused before
 * anything is resolved. Happy Agent answers on a Unix socket and the virtual
 * `happy-agent` origin, and every desktop bridge listens on loopback, so this
 * and the address check together keep every route to the daemon out of reach.
 */
export function artifactHostRefused(hostname: string): boolean {
    const host = hostname
        .toLowerCase()
        .replace(/^\[|\]$/gu, "")
        .replace(/\.$/u, "");
    if (host === "") return true;
    if (isIP(host) !== 0) return !artifactAddressPublic(host);
    return (
        host === "localhost" ||
        host.endsWith(".localhost") ||
        host === "happy-agent" ||
        host.endsWith(".happy.invalid") ||
        host.endsWith(".internal") ||
        host.endsWith(".local")
    );
}

/**
 * Whether the artifact partition lets one request through.
 *
 * `site` is the one origin this guest serves, once its first page has loaded;
 * every artifact request must stay on it, so a page cannot load, frame, or
 * navigate to another artifact or another version. The web is reachable for
 * subresources, never as the guest's own page, and never at an address
 * `artifactHostRefused` names; the network proxy then judges the address the
 * name actually resolves to. Every other scheme is refused.
 */
export function artifactRequestAllowed(request: {
    readonly url: string;
    readonly resourceType: string;
    readonly site: string | undefined;
}): boolean {
    let address: URL;
    try {
        address = new URL(request.url);
    } catch {
        return false;
    }
    const mainFrame = request.resourceType === "mainFrame";
    switch (address.protocol) {
        case `${artifactSiteScheme}:`:
            return request.site !== undefined && address.hostname === request.site;
        case "http:":
        case "https:":
            return (
                !mainFrame &&
                address.username === "" &&
                address.password === "" &&
                !artifactHostRefused(address.hostname)
            );
        case "data:":
        case "blob:":
            return !mainFrame;
        default:
            return false;
    }
}

/** Request headers a guest never sends to the web: no credential, no cookie, no artifact address. */
export function artifactRequestHeaders(
    headers: Readonly<Record<string, string>>,
): Record<string, string> {
    const kept: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase();
        if (lower === "cookie" || lower === "authorization" || lower === "proxy-authorization")
            continue;
        if (lower === "referer" && value.startsWith(`${artifactSiteScheme}:`)) continue;
        kept[name] = value;
    }
    return kept;
}

/** Response headers a guest never keeps: nothing a server says may become a stored credential. */
export function artifactResponseHeaders(
    headers: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
    const kept: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase();
        if (lower === "set-cookie" || lower === "set-cookie2") continue;
        kept[name] = [...value];
    }
    return kept;
}

export type ArtifactAddressLookup = (
    hostname: string,
) => Promise<readonly { readonly address: string; readonly family: number }[]>;

export interface ArtifactNetworkProxyHandle {
    /** Loopback port the artifact partition is pointed at as its only route out. */
    readonly port: number;
    readonly username: string;
    readonly password: string;
    close(): void;
}

export interface ArtifactNetworkProxyOptions {
    /** Resolves a host name; the system resolver unless a test supplies one. */
    readonly lookup?: ArtifactAddressLookup;
    /** Judges a resolved address; `artifactAddressPublic` unless a test supplies one. */
    readonly addressAllowed?: (address: string) => boolean;
}

/**
 * The artifact partition's only way onto the network.
 *
 * A host name is not an address: a public name can resolve to this machine or
 * to a router on the local network, and a name resolved once can resolve to
 * something else the next time it is asked. So the decision is made here, on
 * the address itself. The proxy resolves each name once, refuses it if any
 * address it resolves to is private, loopback, link-local, or otherwise not on
 * the public internet, and then connects to exactly the address it judged.
 * Chromium never resolves an artifact page's hosts itself.
 *
 * HTTPS arrives as a tunnel, so its bytes stay end to end between Chromium and
 * the server. Plain HTTP is forwarded with the same credential and cookie
 * headers removed that the partition removes for HTTPS before encryption.
 */
export function artifactNetworkProxyCreate(
    options: ArtifactNetworkProxyOptions = {},
): Promise<ArtifactNetworkProxyHandle> {
    const lookup: ArtifactAddressLookup =
        options.lookup ?? ((hostname) => dnsLookup(hostname, { all: true, verbatim: true }));
    const addressAllowed = options.addressAllowed ?? artifactAddressPublic;
    const username = randomBytes(24).toString("base64url");
    const password = randomBytes(32).toString("base64url");
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    const sockets = new Set<Socket>();

    /** The one address a connection to this host goes to, or nothing when it may not go. */
    const resolve = async (
        hostname: string,
    ): Promise<{ readonly address: string; readonly family: 4 | 6 } | undefined> => {
        const host = hostname.replace(/^\[|\]$/gu, "");
        if (artifactHostRefused(host)) return undefined;
        let addresses: readonly { readonly address: string; readonly family: number }[];
        try {
            addresses =
                isIP(host) !== 0 ? [{ address: host, family: isIP(host) }] : await lookup(host);
        } catch {
            return undefined;
        }
        // A name with even one private answer is refused whole: Chromium would
        // otherwise be one retry away from the address it was refused.
        if (addresses.length === 0 || addresses.some(({ address }) => !addressAllowed(address)))
            return undefined;
        const first = addresses[0]!;
        return { address: first.address, family: first.family === 6 ? 6 : 4 };
    };

    const server = createServer((request, response) => {
        if (request.headers["proxy-authorization"] !== authorization) {
            response.writeHead(407, {
                connection: "close",
                "proxy-authenticate": 'Basic realm="Happy artifacts"',
            });
            response.end();
            return;
        }
        let target: URL;
        try {
            target = new URL(request.url ?? "");
        } catch {
            response.writeHead(400).end();
            return;
        }
        if (target.protocol !== "http:" || target.username !== "" || target.password !== "") {
            response.writeHead(403).end();
            return;
        }
        void resolve(target.hostname).then((destination) => {
            if (!destination) {
                response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
                response.end("An artifact cannot reach this address.");
                return;
            }
            const headers: IncomingHttpHeaders = { ...request.headers };
            for (const name of [
                "authorization",
                "cookie",
                "proxy-authorization",
                "proxy-connection",
            ])
                delete headers[name];
            const outgoing = httpRequest(
                {
                    host: destination.address,
                    family: destination.family,
                    port: Number(target.port || 80),
                    method: request.method,
                    path: `${target.pathname}${target.search}`,
                    headers,
                    setHost: false,
                },
                (incoming) => {
                    const answered = { ...incoming.headers };
                    delete answered["set-cookie"];
                    response.writeHead(incoming.statusCode ?? 502, answered);
                    void pipeline(incoming, response).catch(() => response.destroy());
                },
            );
            outgoing.on("error", () => {
                if (response.headersSent) response.destroy();
                else response.writeHead(502).end();
            });
            response.once("close", () => outgoing.destroy());
            void pipeline(request, outgoing).catch(() => outgoing.destroy());
        });
    });
    server.on("connect", (request, socket: Socket, head: Buffer) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
        socket.on("error", () => socket.destroy());
        if (request.headers["proxy-authorization"] !== authorization) {
            socket.end(
                'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Happy artifacts"\r\nConnection: close\r\n\r\n',
            );
            return;
        }
        let target: URL;
        try {
            target = new URL(`http://${request.url ?? ""}`);
        } catch {
            socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
            return;
        }
        const port = Number(target.port || 443);
        void resolve(target.hostname).then((destination) => {
            if (!destination || socket.destroyed) {
                socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
                return;
            }
            const upstream = connect({
                host: destination.address,
                family: destination.family,
                port,
            });
            let connected = false;
            sockets.add(upstream);
            upstream.once("close", () => {
                sockets.delete(upstream);
                socket.destroy();
            });
            socket.once("close", () => upstream.destroy());
            upstream.once("error", () => {
                if (!connected && socket.writable)
                    socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
                upstream.destroy();
            });
            upstream.once("connect", () => {
                connected = true;
                socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
                if (head.byteLength > 0) upstream.write(head);
                socket.pipe(upstream);
                upstream.pipe(socket);
            });
        });
    });
    // A page's WebSocket is not a subresource the partition admits, so an
    // upgrade has nothing to be forwarded to.
    server.on("upgrade", (_request, socket) => socket.destroy());
    server.on("clientError", (_error, socket) => socket.destroy());

    return new Promise((resolvePromise, reject) => {
        const onError = (error: unknown) => reject(error as Error);
        server.once("error", onError);
        server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", onError);
            const address = server.address() as AddressInfo | null;
            if (!address) {
                server.close();
                reject(new Error("The artifact network proxy did not bind a loopback port."));
                return;
            }
            resolvePromise({
                port: address.port,
                username,
                password,
                close: () => {
                    for (const socket of sockets) socket.destroy();
                    server.close();
                    server.closeAllConnections();
                },
            });
        });
    });
}
