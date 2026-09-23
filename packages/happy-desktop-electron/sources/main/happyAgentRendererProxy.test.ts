import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { PassThrough, Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { happyAgentHttpProxyCreate, type HappyAgentHttpProxyHandle } from "./happyAgentHttpProxy";
import {
    happyAgentRendererProxyCreate,
    type HappyAgentRendererProxy,
} from "./happyAgentRendererProxy";
import { HAPPY_AGENT_TERMINAL_PROTOCOL } from "./happyAgentTerminalBridge";

describe("authenticated renderer virtual-origin proxy", () => {
    let renderer: HappyAgentRendererProxy | undefined;
    let bridge: HappyAgentHttpProxyHandle | undefined;

    afterEach(() => {
        bridge?.close();
        renderer?.close();
        bridge = undefined;
        renderer = undefined;
    });

    const open = (
        path: string,
        options: {
            authorization?: string;
            host?: string;
            origin?: string;
            body?: string;
            method?: string;
        } = {},
    ) => {
        const headers: Record<string, string> = {
            host: options.host ?? "happy-agent",
            ...(options.authorization ? { "proxy-authorization": options.authorization } : {}),
            ...(options.origin ? { origin: options.origin } : {}),
        };
        const request = httpRequest({
            host: "127.0.0.1",
            port: renderer!.port,
            path,
            method: options.method ?? "GET",
            headers,
        });
        if (options.body !== undefined) request.end(options.body);
        else request.end();
        return request;
    };
    const read = (request: ReturnType<typeof httpRequest>) =>
        new Promise<{ status: number; body: string; headers: Record<string, unknown> }>(
            (resolve, reject) => {
                request.on("response", async (response) => {
                    try {
                        let body = "";
                        for await (const chunk of response) body += String(chunk);
                        resolve({
                            status: response.statusCode ?? 0,
                            body,
                            headers: response.headers,
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
                request.once("error", reject);
            },
        );
    const auth = () =>
        `Basic ${Buffer.from(`${renderer!.username}:${renderer!.password}`).toString("base64")}`;

    it("requires the private proxy credential and exact virtual origin without forwarding them", async () => {
        renderer = await happyAgentRendererProxyCreate();
        const rawRequest = vi.fn(
            async (_options: { headers?: Record<string, string>; path: string }) => ({
                statusCode: 200,
                headers: { "content-type": "text/plain" },
                body: Readable.from(["ok"]),
            }),
        );
        bridge = await happyAgentHttpProxyCreate({
            client: { rawRequest } as never,
            rendererProxy: renderer,
        });
        expect((await read(open("http://happy-agent/v0/history"))).status).toBe(407);
        expect(
            (await read(open("http://foreign.example/v0/history", { authorization: auth() })))
                .status,
        ).toBe(403);
        expect(
            (
                await read(
                    open("http://happy-agent/v0/history", { authorization: auth(), host: "evil" }),
                )
            ).status,
        ).toBe(403);
        expect(
            (
                await read(
                    open("http://happy-agent/v0/history", {
                        authorization: auth(),
                        origin: "https://evil.example",
                    }),
                )
            ).status,
        ).toBe(403);
        expect(rawRequest).not.toHaveBeenCalled();

        const ok = await read(open("http://happy-agent/v0/history", { authorization: auth() }));
        expect(ok).toMatchObject({ status: 200, body: "ok" });
        expect(rawRequest).toHaveBeenCalledOnce();
        expect(rawRequest.mock.calls[0]![0]).toMatchObject({ method: "GET", path: "/v0/history" });
        const forwarded = rawRequest.mock.calls[0]![0].headers;
        expect(forwarded?.authorization).toBeUndefined();
        expect(forwarded?.["proxy-authorization"]).toBeUndefined();
        expect(forwarded?.host).toBeUndefined();
        expect(ok.headers["set-cookie"]).toBeUndefined();
    });

    it("streams the daemon body, aborts a disconnected request, and swaps backing in place", async () => {
        renderer = await happyAgentRendererProxyCreate();
        const firstBody = new PassThrough();
        let signal: AbortSignal | undefined;
        const first = vi.fn(async (options: { signal: AbortSignal }) => {
            signal = options.signal;
            return { statusCode: 200, headers: {}, body: firstBody };
        });
        bridge = await happyAgentHttpProxyCreate({
            client: { rawRequest: first } as never,
            rendererProxy: renderer,
        });
        const pending = open("http://happy-agent/v0/history", { authorization: auth() });
        const incoming = await new Promise<Readable>((resolve, reject) => {
            pending.once("response", resolve);
            pending.once("error", reject);
            firstBody.write("first");
        });
        const chunks: string[] = [];
        incoming.on("data", (chunk) => chunks.push(String(chunk)));
        await vi.waitFor(() => expect(chunks).toEqual(["first"]));
        expect(signal?.aborted).toBe(false);

        const second = vi.fn(async () => ({
            statusCode: 201,
            headers: {},
            body: Readable.from(["second"]),
        }));
        bridge.replace({ client: { rawRequest: second } as never });
        expect(
            await read(open("http://happy-agent/v0/history", { authorization: auth() })),
        ).toMatchObject({
            status: 201,
            body: "second",
        });
        expect(second).toHaveBeenCalledOnce();
        expect(first).toHaveBeenCalledOnce();

        incoming.destroy();
        await vi.waitFor(() => expect(signal?.aborted).toBe(true));
        firstBody.destroy();
        bridge.close();
        expect(
            (await read(open("http://happy-agent/v0/history", { authorization: auth() }))).status,
        ).toBe(503);
    });

    it("propagates renderer read backpressure to a large daemon response", async () => {
        renderer = await happyAgentRendererProxyCreate();
        let produced = 0;
        const chunk = Buffer.alloc(64 * 1024, 0x61);
        bridge = await happyAgentHttpProxyCreate({
            rendererProxy: renderer,
            client: {
                rawRequest: async () => ({
                    statusCode: 200,
                    headers: {},
                    body: Readable.from(
                        (async function* () {
                            for (let index = 0; index < 512; index++) {
                                produced++;
                                yield chunk;
                            }
                        })(),
                    ),
                }),
            } as never,
        });
        const incoming = await new Promise<Readable>((resolve, reject) => {
            const pending = open("http://happy-agent/v0/history", { authorization: auth() });
            pending.once("response", resolve);
            pending.once("error", reject);
        });
        incoming.pause();
        await vi.waitFor(() => expect(produced).toBeGreaterThan(2));
        // If a layer buffers the whole body instead of respecting downstream
        // pressure, the generator runs through all 32 MiB while the reader waits.
        expect(produced).toBeLessThan(512);
        let received = 0;
        const complete = new Promise<void>((resolve, reject) => {
            incoming.on("data", (data: Buffer) => (received += data.byteLength));
            incoming.once("end", resolve);
            incoming.once("error", reject);
        });
        incoming.resume();
        await complete;
        expect(received).toBe(chunk.byteLength * 512);
    });

    it("delivers every chunk from a synchronous daemon readable with timing enabled", async () => {
        renderer = await happyAgentRendererProxyCreate();
        const debug = vi.fn();
        bridge = await happyAgentHttpProxyCreate({
            rendererProxy: renderer,
            debug,
            client: {
                rawRequest: async () => ({
                    statusCode: 200,
                    headers: {},
                    body: new Readable({
                        read() {
                            this.push(Buffer.from("first"));
                            this.push(Buffer.from("second"));
                            this.push(null);
                        },
                    }),
                }),
            } as never,
        });
        const reply = await read(open("http://happy-agent/v0/history", { authorization: auth() }));
        expect(reply).toMatchObject({ status: 200, body: "firstsecond" });
        expect(debug).not.toHaveBeenCalled();
    });

    it("keeps the authenticated CONNECT tunnel and capability-scoped terminal upgrade", async () => {
        renderer = await happyAgentRendererProxyCreate();
        const attachTerminal = vi.fn(async () => new PassThrough());
        bridge = await happyAgentHttpProxyCreate({
            rendererProxy: renderer,
            client: { attachTerminal } as never,
        });
        const socket = connect(renderer.port, "127.0.0.1");
        try {
            await new Promise<void>((resolve, reject) => {
                socket.once("connect", resolve);
                socket.once("error", reject);
            });
            socket.write(
                `CONNECT happy-agent:80 HTTP/1.1\r\nHost: happy-agent:80\r\nProxy-Authorization: ${auth()}\r\n\r\n`,
            );
            const connected = new Promise<string>((resolve) =>
                socket.once("data", (data) => resolve(String(data))),
            );
            expect(await connected).toContain("HTTP/1.1 200 Connection Established");
            const upgraded = new Promise<string>((resolve) =>
                socket.once("data", (data) => resolve(String(data))),
            );
            socket.write(
                `GET /v0/workspaces/workspace/terminals/terminal/attach HTTP/1.1\r\n` +
                    `Host: happy-agent\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
                    `Sec-WebSocket-Key: ${Buffer.alloc(16, 1).toString("base64")}\r\n` +
                    `Sec-WebSocket-Version: 13\r\nOrigin: null\r\n` +
                    `Sec-WebSocket-Protocol: ${HAPPY_AGENT_TERMINAL_PROTOCOL}\r\n\r\n`,
            );
            expect(await upgraded).toContain("HTTP/1.1 101 Switching Protocols");
            expect(attachTerminal).toHaveBeenCalledWith("workspace", "terminal");
        } finally {
            socket.destroy();
        }
    });
});
