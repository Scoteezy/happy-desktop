import { randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { createServer, request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { BlockList, connect, isIP, type AddressInfo, type Socket } from "node:net";
import { pipeline } from "node:stream/promises";
import { artifactSiteScheme } from "./artifactSite";

/**
 * Every address range an artifact page may not reach: this machine, the local
 * network it sits on, and the ranges that only ever name one of those or
 * nothing at all. An IPv6 address that embeds an IPv4 one is judged by the
 * address it embeds, so a mapped or translated loopback is still loopback.
 */
const refusedAddresses = (() => {
    const list = new BlockList();
    for (const [network, prefix] of [
        ["0.0.0.0", 8],
        ["10.0.0.0", 8],
        ["100.64.0.0", 10],
        ["127.0.0.0", 8],
        ["169.254.0.0", 16],
        ["172.16.0.0", 12],
        ["192.0.0.0", 24],
        ["192.0.2.0", 24],
        ["192.88.99.0", 24],
        ["192.168.0.0", 16],
        ["198.18.0.0", 15],
        ["198.51.100.0", 24],
        ["203.0.113.0", 24],
        ["224.0.0.0", 4],
        ["240.0.0.0", 4],
    ] as const)
        list.addSubnet(network, prefix, "ipv4");
    for (const [network, prefix] of [
        ["100::", 64],
        ["2001:db8::", 32],
        ["fc00::", 7],
        ["fe80::", 10],
        ["fec0::", 10],
        ["ff00::", 8],
    ] as const)
        list.addSubnet(network, prefix, "ipv6");
    return list;
})();

/** The sixteen bytes of an IPv6 address `isIP` already accepted, in any textual form. */
function ipv6Bytes(address: string): number[] {
    let text = address.toLowerCase();
    const zone = text.indexOf("%");
    if (zone >= 0) text = text.slice(0, zone);
    let quad: number[] | undefined;
    const dotted = /(\d+\.\d+\.\d+\.\d+)$/u.exec(text);
    if (dotted) {
        quad = dotted[1]!.split(".").map(Number);
        text = `${text.slice(0, -dotted[1]!.length)}0:0`;
    }
    const halves = text.split("::");
    const groupsOf = (part: string | undefined) => (part ? part.split(":") : []);
    const head = groupsOf(halves[0]);
    const tail = groupsOf(halves[1]);
    const groups = [
        ...head,
        ...Array<string>(halves.length === 2 ? 8 - head.length - tail.length : 0).fill("0"),
        ...tail,
    ];
    const bytes = groups.flatMap((group) => {
        const value = Number.parseInt(group, 16);
        return [value >> 8, value & 255];
    });
    if (quad) bytes.splice(12, 4, ...quad);
    return bytes;
}

/**
 * The IPv4 address an IPv6 one stands for — mapped, compatible, NAT64, or
 * 6to4 — or `null` for a range that hides its destination and is refused whole.
 */
function ipv6Embedded(bytes: readonly number[]): string | null | undefined {
    const zero = (from: number, to: number) => bytes.slice(from, to).every((value) => value === 0);
    const quad = (at: number) => bytes.slice(at, at + 4).join(".");
    if (zero(0, 10) && bytes[10] === 255 && bytes[11] === 255) return quad(12);
    if (zero(0, 12)) return quad(12);
    const nat64 = bytes[0] === 0 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b;
    if (nat64 && zero(4, 12)) return quad(12);
    // Local-use NAT64 and Teredo carry an address this check cannot see.
    if (nat64 && bytes[4] === 0 && bytes[5] === 1) return null;
    if (bytes[0] === 0x20 && bytes[1] === 0x01 && zero(2, 4)) return null;
    if (bytes[0] === 0x20 && bytes[1] === 0x02) return quad(2);
    return undefined;
}

/** Whether an artifact page may open a connection to this IP address. */
export function artifactAddressPublic(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return !refusedAddresses.check(address, "ipv4");
    if (family !== 6) return false;
    const embedded = ipv6Embedded(ipv6Bytes(address));
    if (embedded === null) return false;
    if (embedded !== undefined) return !refusedAddresses.check(embedded, "ipv4");
    return !refusedAddresses.check(address.replace(/%.*$/u, ""), "ipv6");
}

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
