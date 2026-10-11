import { createServer, request as httpRequest, type Server } from "node:http";
import { connect, createServer as createTcpServer, type AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import {
    artifactAddressPublic,
    artifactHostRefused,
    artifactNetworkProxyCreate,
    artifactRequestAllowed,
    artifactRequestHeaders,
    artifactResponseHeaders,
    type ArtifactNetworkProxyHandle,
} from "./artifactNetwork";

const SITE = "k3v8w2m9q4x7z1c5b6n0p2r8-v2";

describe("artifact network addresses", () => {
    it("refuses this machine, the local network, and ranges that name nothing public", () => {
        for (const address of [
            "0.0.0.0",
            "10.1.2.3",
            "100.64.0.1",
            "127.0.0.1",
            "127.255.255.254",
            "169.254.169.254",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.1.1",
            "198.18.0.1",
            "224.0.0.251",
            "255.255.255.255",
            "::",
            "::1",
            "fe80::1",
            "fe80::1%en0",
            "fc00::1",
            "fd12:3456::1",
            "ff02::1",
            "::ffff:127.0.0.1",
            "::ffff:7f00:1",
            "0:0:0:0:0:ffff:7f00:1",
            "::ffff:192.168.1.1",
            "::127.0.0.1",
            "64:ff9b::a9fe:a9fe",
            "64:ff9b::10.0.0.1",
            "64:ff9b:1::8.8.8.8",
            "2002:c0a8:0101::1",
            "2002:7f00:1::",
            "2001:0:4136:e378:8000:63bf:3fff:fdd2",
            "2001:db8::1",
            "not an address",
        ])
            expect(artifactAddressPublic(address), address).toBe(false);
    });

    it("lets the public internet through", () => {
        for (const address of [
            "1.1.1.1",
            "8.8.8.8",
            "93.184.216.34",
            "172.32.0.1",
            "2606:4700:4700::1111",
            "2a00:1450:4001:81c::200e",
            "::ffff:8.8.8.8",
            "64:ff9b::808:808",
            "2002:0808:0808::1",
        ])
            expect(artifactAddressPublic(address), address).toBe(true);
    });

    it("refuses every name for this machine and Happy before resolving it", () => {
        for (const host of [
            "localhost",
            "LOCALHOST",
            "localhost.",
            "app.localhost",
            "happy-agent",
            "s-abc.0123.happy.invalid",
            "printer.local",
            "metadata.google.internal",
            "127.0.0.1",
            "[::1]",
            "10.0.0.1",
            "",
        ])
            expect(artifactHostRefused(host), host).toBe(true);
        for (const host of ["example.com", "cdn.jsdelivr.net", "8.8.8.8", "[2606:4700:4700::1111]"])
            expect(artifactHostRefused(host), host).toBe(false);
    });
});

describe("artifact request filter", () => {
    // `null` is a guest that has not loaded its first page yet.
    const allowed = (url: string, resourceType = "script", site: string | null = SITE) =>
        artifactRequestAllowed({ url, resourceType, site: site ?? undefined });

    it("holds artifact requests to the guest's own site", () => {
        expect(allowed(`happy-artifact://${SITE}/app.js`)).toBe(true);
        expect(allowed(`happy-artifact://${SITE}/page.html`, "mainFrame")).toBe(true);
        expect(allowed(`happy-artifact://${SITE}/frame.html`, "subFrame")).toBe(true);
        expect(allowed("happy-artifact://k3v8w2m9q4x7z1c5b6n0p2r8-v1/app.js")).toBe(false);
        expect(allowed("happy-artifact://other-v2/app.js")).toBe(false);
        expect(allowed("happy-artifact://other-v2/index.html", "subFrame")).toBe(false);
        expect(allowed(`happy-artifact://${SITE}/app.js`, "script", null)).toBe(false);
    });

    it("lets the web in as subresources, never as the page and never at a private address", () => {
        expect(allowed("https://cdn.jsdelivr.net/npm/lib.js")).toBe(true);
        expect(allowed("http://example.com/image.png", "image")).toBe(true);
        expect(allowed("https://www.youtube.com/embed/x", "subFrame")).toBe(true);
        expect(allowed("https://example.com/", "mainFrame")).toBe(false);
        expect(allowed("http://localhost:3000/")).toBe(false);
        expect(allowed("http://127.0.0.1:52344/capability/v0/health", "xhr")).toBe(false);
        expect(allowed("http://happy-agent/v0/artifacts", "xhr")).toBe(false);
        expect(allowed("http://192.168.1.1/admin", "image")).toBe(false);
        expect(allowed("http://169.254.169.254/latest/meta-data/", "xhr")).toBe(false);
        expect(allowed("http://[::1]:8080/", "xhr")).toBe(false);
        expect(allowed("https://user:secret@example.com/", "xhr")).toBe(false);
    });

    it("refuses every other scheme", () => {
        for (const url of [
            "file:///etc/passwd",
            "ws://example.com/socket",
            "wss://example.com/socket",
            "javascript:alert(1)",
            "chrome://settings",
            "devtools://devtools/bundled/inspector.html",
            "ftp://example.com/file",
            "happy://callback",
            "not a url",
        ])
            expect(allowed(url), url).toBe(false);
        expect(allowed("data:image/png;base64,AAAA", "image")).toBe(true);
        expect(allowed("blob:happy-artifact://x/1", "media")).toBe(true);
        expect(allowed("data:text/html,<h1>x</h1>", "mainFrame")).toBe(false);
    });

    it("sends no credential, cookie, or artifact address to the web, and keeps no cookie from it", () => {
        expect(
            artifactRequestHeaders({
                Accept: "*/*",
                Cookie: "session=1",
                Authorization: "Bearer token",
                "Proxy-Authorization": "Basic x",
                Referer: `happy-artifact://${SITE}/index.html`,
            }),
        ).toEqual({ Accept: "*/*" });
        expect(artifactRequestHeaders({ Referer: "https://example.com/" })).toEqual({
            Referer: "https://example.com/",
        });
        expect(
            artifactResponseHeaders({
                "Content-Type": ["text/plain"],
                "Set-Cookie": ["a=b"],
                "set-cookie2": ["c=d"],
            }),
        ).toEqual({ "Content-Type": ["text/plain"] });
    });
});

describe("artifact network proxy", () => {
    let proxy: ArtifactNetworkProxyHandle | undefined;
    let upstream: Server | undefined;
    afterEach(() => {
        proxy?.close();
        upstream?.close();
        proxy = undefined;
        upstream = undefined;
    });

    const authorization = (handle: ArtifactNetworkProxyHandle) =>
        `Basic ${Buffer.from(`${handle.username}:${handle.password}`).toString("base64")}`;

    /** Sends one CONNECT and reads the proxy's status line. */
    const tunnel = (handle: ArtifactNetworkProxyHandle, target: string, credential = true) =>
        new Promise<string>((resolve, reject) => {
            const socket = connect(handle.port, "127.0.0.1", () => {
                socket.write(
                    `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${
                        credential ? `Proxy-Authorization: ${authorization(handle)}\r\n` : ""
                    }\r\n`,
                );
            });
            socket.once("data", (chunk) => {
                resolve(chunk.toString("latin1").split("\r\n")[0]!);
                socket.destroy();
            });
            socket.once("error", reject);
        });

    it("requires its own credential", async () => {
        proxy = await artifactNetworkProxyCreate({
            lookup: async () => [{ address: "8.8.8.8", family: 4 }],
        });
        expect(await tunnel(proxy, "example.com:443", false)).toContain("407");
    });

    it("refuses this machine and private networks by address, including names that resolve there", async () => {
        const answers: Record<string, { address: string; family: number }[]> = {
            "rebind.example": [{ address: "127.0.0.1", family: 4 }],
            "router.example": [{ address: "192.168.1.1", family: 4 }],
            "mixed.example": [
                { address: "93.184.216.34", family: 4 },
                { address: "10.0.0.5", family: 4 },
            ],
            "v6.example": [{ address: "::ffff:127.0.0.1", family: 6 }],
        };
        proxy = await artifactNetworkProxyCreate({ lookup: async (host) => answers[host] ?? [] });
        for (const target of [
            "127.0.0.1:443",
            "[::1]:443",
            "localhost:443",
            "happy-agent:443",
            "169.254.169.254:80",
            "rebind.example:443",
            "router.example:443",
            "mixed.example:443",
            "v6.example:443",
            "unresolvable.example:443",
        ])
            expect(await tunnel(proxy, target), target).toContain("403");
    });

    it("connects a tunnel to exactly the address it judged", async () => {
        const echo = createTcpServer((socket) => socket.pipe(socket));
        await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve));
        const port = (echo.address() as AddressInfo).port;
        const looked: string[] = [];
        proxy = await artifactNetworkProxyCreate({
            lookup: async (host) => {
                looked.push(host);
                return [{ address: "127.0.0.1", family: 4 }];
            },
            // The test's public server is on loopback; production never admits it.
            addressAllowed: (address) => address === "127.0.0.1",
        });
        try {
            const handle = proxy;
            const echoed = await new Promise<string>((resolve, reject) => {
                const socket = connect(handle.port, "127.0.0.1", () => {
                    socket.write(
                        `CONNECT public.example:${String(port)} HTTP/1.1\r\nHost: public.example\r\nProxy-Authorization: ${authorization(handle)}\r\n\r\n`,
                    );
                });
                let buffered = "";
                socket.on("data", (chunk) => {
                    buffered += chunk.toString("latin1");
                    if (buffered.includes("\r\n\r\n") && !buffered.includes("ping"))
                        socket.write("ping");
                    if (buffered.endsWith("ping")) {
                        resolve(buffered);
                        socket.destroy();
                    }
                });
                socket.once("error", reject);
            });
            expect(echoed.startsWith("HTTP/1.1 200")).toBe(true);
            expect(looked).toEqual(["public.example"]);
        } finally {
            echo.close();
        }
    });

    it("forwards plain HTTP without credentials or cookies either way", async () => {
        let received: Record<string, string | string[] | undefined> = {};
        upstream = createServer((request, response) => {
            received = request.headers;
            response.writeHead(200, { "set-cookie": "tracker=1", "content-type": "text/plain" });
            response.end("page");
        });
        await new Promise<void>((resolve) => upstream!.listen(0, "127.0.0.1", resolve));
        const port = (upstream.address() as AddressInfo).port;
        proxy = await artifactNetworkProxyCreate({
            lookup: async () => [{ address: "127.0.0.1", family: 4 }],
            addressAllowed: (address) => address === "127.0.0.1",
        });
        const handle = proxy;
        const answer = await new Promise<{
            status: number;
            headers: Record<string, unknown>;
            body: string;
        }>((resolve, reject) => {
            const request = httpRequest(
                {
                    host: "127.0.0.1",
                    port: handle.port,
                    path: `http://public.example:${String(port)}/page?x=1`,
                    headers: {
                        host: `public.example:${String(port)}`,
                        cookie: "session=1",
                        authorization: "Bearer secret",
                        "proxy-authorization": authorization(handle),
                    },
                },
                (response) => {
                    let body = "";
                    response.on("data", (chunk: Buffer) => (body += chunk.toString()));
                    response.on("end", () =>
                        resolve({
                            status: response.statusCode ?? 0,
                            headers: response.headers,
                            body,
                        }),
                    );
                },
            );
            request.once("error", reject);
            request.end();
        });
        expect(answer.status).toBe(200);
        expect(answer.body).toBe("page");
        expect(answer.headers["set-cookie"]).toBeUndefined();
        expect(received.host).toBe(`public.example:${String(port)}`);
        expect(received.cookie).toBeUndefined();
        expect(received.authorization).toBeUndefined();
        expect(received["proxy-authorization"]).toBeUndefined();
    });
});
