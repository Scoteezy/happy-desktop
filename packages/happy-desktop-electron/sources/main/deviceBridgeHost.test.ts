import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer, type IncomingMessage } from "node:http";
import { connect, createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import type {
    HappyAgentDeviceBridgeHostState,
    HappyAgentLocalUsbDevice,
} from "happy-desktop-state";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { deviceBridgeHostCreate, type DeviceBridgeHost } from "./deviceBridgeHost";
import type { LocalUsbDevices, LocalUsbOpened } from "./deviceBridgeUsbDevice";
import { URB_STATUS } from "./deviceBridgeUsbip";
import { HappyAgentDaemonClient } from "./happyAgentDaemonClient";

const token = "daemon-token";
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Items pushed by one side, taken in order by the other. */
function queue<T>() {
    const items: T[] = [];
    const waiting: ((item: T) => void)[] = [];
    return {
        push(item: T) {
            const next = waiting.shift();
            if (next) next(item);
            else items.push(item);
        },
        next(): Promise<T> {
            const item = items.shift();
            if (item !== undefined) return Promise.resolve(item);
            return new Promise((resolve) => waiting.push(resolve));
        },
    };
}

interface Opened {
    readonly socket: WebSocket;
    readonly url: URL;
}

/**
 * Happy Agent's bridge routes as API.md specifies them, on a Unix socket: the
 * USB, port, and connection upgrades, and the workspace proxy's nested CONNECT.
 */
async function daemonCreate() {
    // Unix socket paths are short; a long temporary directory leaves little room.
    const directory = await mkdtemp(join(tmpdir(), "hdb-"));
    const socketPath = join(directory, "d.sock");
    const webSockets = new WebSocketServer({ noServer: true });
    const usb = queue<Opened>();
    const ports = queue<Opened>();
    const accepted = queue<Opened>();
    const refusals = new Map<string, { readonly status: number; readonly body: unknown }>();
    const server = createHttpServer((_request, response) => response.writeHead(404).end());
    const sockets = new Set<Duplex>();
    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
    });
    server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(request.url ?? "/", "http://happy-agent");
        if (request.headers.authorization !== `Bearer ${token}`) {
            socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
            return;
        }
        const refusal = refusals.get(url.pathname);
        if (refusal) {
            const body = JSON.stringify(refusal.body);
            socket.end(
                `HTTP/1.1 ${String(refusal.status)} Conflict\r\nContent-Type: application/json\r\nContent-Length: ${String(Buffer.byteLength(body))}\r\nConnection: close\r\n\r\n${body}`,
            );
            return;
        }
        webSockets.handleUpgrade(request, socket, head, (webSocket) => {
            const opened = { socket: webSocket, url };
            if (url.pathname.endsWith("/bridges/usb")) usb.push(opened);
            else if (url.pathname.endsWith("/bridges/port")) ports.push(opened);
            else accepted.push(opened);
        });
    });
    // `CONNECT /v0/workspaces/:id/proxy`, then the nested `CONNECT host:port`.
    server.on("connect", (_request, socket: Socket) => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        let head = Buffer.alloc(0);
        const read = (chunk: Buffer) => {
            head = Buffer.concat([head, chunk]);
            const end = head.indexOf("\r\n\r\n");
            if (end < 0) return;
            socket.off("data", read);
            const target = /^CONNECT [^:]+:(\d+) /u.exec(head.toString("latin1"));
            const upstream = connect({ host: "127.0.0.1", port: Number(target?.[1]) }, () => {
                socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
                const rest = head.subarray(end + 4);
                if (rest.length > 0) upstream.write(rest);
                socket.pipe(upstream);
                upstream.pipe(socket);
            });
            upstream.on("error", () => socket.destroy());
            socket.on("error", () => upstream.destroy());
        };
        socket.on("data", read);
    });
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
    });
    cleanups.push(async () => {
        for (const client of webSockets.clients) client.terminate();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(directory, { recursive: true, force: true });
    });
    return {
        client: new HappyAgentDaemonClient({ socketPath, token }),
        usb,
        ports,
        accepted,
        refuse(path: string, status: number, body: unknown) {
            refusals.set(path, { status, body });
        },
    };
}

async function echoServer(): Promise<number> {
    const server: Server = createServer((socket) => {
        socket.on("error", () => socket.destroy());
        socket.pipe(socket);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const sockets = new Set<Socket>();
    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
    });
    cleanups.push(
        () =>
            new Promise<void>((resolve) => {
                for (const socket of sockets) socket.destroy();
                server.close(() => resolve());
            }),
    );
    return (server.address() as AddressInfo).port;
}

async function unusedPort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
}

/** A USB device that answers every control transfer with a device descriptor. */
function usbDevicesFake() {
    const events = { opened: 0, closed: 0 };
    let detach: (() => void) | undefined;
    const descriptor = Buffer.from([
        18, 1, 0x00, 0x02, 0xe0, 0x01, 0x01, 64, 0x34, 0x12, 0x78, 0x56, 1, 0, 1, 2, 3, 1,
    ]);
    const adapter: HappyAgentLocalUsbDevice = {
        busId: "1-4",
        vendorId: "1234",
        productId: "5678",
        name: "Test adapter",
        manufacturer: "Happy",
        bluetooth: true,
    };
    const devices: LocalUsbDevices = {
        get: () => ({ available: true, devices: [adapter] }),
        subscribe: () => () => undefined,
        open: async (busId): Promise<LocalUsbOpened> => {
            events.opened += 1;
            return {
                description: adapter,
                heldInterfaces: () => [1],
                onHeldChange: () => undefined,
                onDetached: (listener) => {
                    detach = listener;
                },
                close: async () => {
                    events.closed += 1;
                },
                device: {
                    record: {
                        busId,
                        busNumber: 1,
                        deviceNumber: 5,
                        speed: 2,
                        vendorId: 0x1234,
                        productId: 0x5678,
                        bcdDevice: 1,
                        deviceClass: 0xe0,
                        deviceSubclass: 1,
                        deviceProtocol: 1,
                        configurationValue: 1,
                        configurationCount: 1,
                        interfaceCount: 2,
                    },
                    endpoint: () => undefined,
                    controlSubmit: (_setup, data, done) => {
                        const length = Math.min(
                            typeof data === "number" ? data : 0,
                            descriptor.length,
                        );
                        setImmediate(() =>
                            done({
                                status: URB_STATUS.ok,
                                actualLength: length,
                                data: descriptor.subarray(0, length),
                            }),
                        );
                        return { cancel: () => undefined };
                    },
                    transferSubmit: (_address, _type, _data, done) => {
                        setImmediate(() => done({ status: URB_STATUS.protocol, actualLength: 0 }));
                        return { cancel: () => undefined };
                    },
                    configurationSet: (_value, done) => setImmediate(() => done(0)),
                    alternateSet: (_interface, _alternate, done) => setImmediate(() => done(0)),
                    haltClear: (_address, done) => setImmediate(() => done(0)),
                },
            };
        },
    };
    return { devices, events, unplug: () => detach?.() };
}

function hostCreate(client: HappyAgentDaemonClient, usb = usbDevicesFake().devices) {
    const host = deviceBridgeHostCreate({ usb });
    host.clientSet(client);
    const states: HappyAgentDeviceBridgeHostState[] = [];
    const changes = queue<HappyAgentDeviceBridgeHostState>();
    host.stateFollow(undefined, (state) => {
        states.push(state);
        changes.push(state);
    });
    cleanups.push(() => host.close());
    /** The first state, from now on, that satisfies `test`. */
    const until = async (test: (state: HappyAgentDeviceBridgeHostState) => boolean) => {
        if (states.length > 0 && test(states.at(-1)!)) return states.at(-1)!;
        for (;;) {
            const state = await changes.next();
            if (test(state)) return state;
        }
    };
    return { host, states, until };
}

function message(socket: WebSocket): Promise<{ data: Buffer; binary: boolean }> {
    return new Promise((resolve) =>
        socket.once("message", (data, binary) => resolve({ data: data as Buffer, binary })),
    );
}

function closed(socket: WebSocket): Promise<number> {
    return new Promise((resolve) => socket.once("close", (code) => resolve(code)));
}

async function readyOpen(daemon: Awaited<ReturnType<typeof daemonCreate>>, port: number) {
    const control = await daemon.ports.next();
    control.socket.send(
        JSON.stringify({
            type: "ready",
            bridge: { id: "bport", kind: "port", port: { host: "127.0.0.1", port } },
        }),
    );
    return control;
}

describe("deviceBridgeHost", () => {
    it("relays a workspace program's connection to the port on this computer", async () => {
        const daemon = await daemonCreate();
        const localPort = await echoServer();
        const { host, until } = hostCreate(daemon.client);
        const opening = host.workspaceToLocalOpen(undefined, {
            workspaceId: "w1",
            workspacePort: 0,
            localPort,
        });
        const control = await readyOpen(daemon, 41_000);
        expect(control.url.pathname).toBe("/v0/workspaces/w1/bridges/port");
        expect(control.url.searchParams.get("port")).toBe("0");
        await opening;
        const open = await until((state) => state.bridges[0]?.status === "open");
        expect(open.bridges[0]).toMatchObject({
            kind: "workspaceToLocal",
            bridgeId: "bport",
            workspacePort: 41_000,
            localPort,
            connections: 0,
            error: null,
        });

        control.socket.send(JSON.stringify({ type: "connection", connectionId: "c1" }));
        const connection = await daemon.accepted.next();
        expect(connection.url.pathname).toBe("/v0/workspaces/w1/bridges/bport/connections/c1");
        const echoed = message(connection.socket);
        connection.socket.send(Buffer.from("ping"));
        expect((await echoed).data.toString()).toBe("ping");
        await until(
            (state) =>
                state.bridges[0]?.kind === "workspaceToLocal" && state.bridges[0].connections === 1,
        );

        // A drop reconnects, asking for the port it had so programs keep their address.
        control.socket.close(1011);
        await until((state) => state.bridges[0]?.status === "reconnecting");
        const again = await readyOpen(daemon, 41_000);
        expect(again.url.searchParams.get("port")).toBe("41000");
        await until((state) => state.bridges[0]?.status === "open");

        const closing = closed(again.socket);
        const id = (await until(() => true)).bridges[0]!.id;
        await host.bridgeClose(undefined, id);
        expect(await closing).toBe(1000);
        await until((state) => state.bridges.length === 0);
    });

    it("declines a waiting connection when nothing listens on this computer", async () => {
        const daemon = await daemonCreate();
        const localPort = await unusedPort();
        const { host, until } = hostCreate(daemon.client);
        const opening = host.workspaceToLocalOpen(undefined, {
            workspaceId: "w1",
            workspacePort: 5432,
            localPort,
        });
        const control = await readyOpen(daemon, 5432);
        await opening;
        const declined = message(control.socket);
        control.socket.send(JSON.stringify({ type: "connection", connectionId: "c9" }));
        const reply = await declined;
        expect(reply.binary).toBe(false);
        expect(JSON.parse(reply.data.toString())).toEqual({ type: "reject", connectionId: "c9" });
        const failed = await until((state) => state.bridges[0]?.error !== null);
        expect(failed.bridges[0]).toMatchObject({
            status: "open",
            error: `Nothing is listening on port ${String(localPort)} on this computer.`,
        });
    });

    it("says why Happy Agent refused a bridge and keeps nothing", async () => {
        const daemon = await daemonCreate();
        daemon.refuse("/v0/workspaces/w1/bridges/port", 409, {
            error: "Port 5432 is in use on the workspace's machine.",
            code: "port_unavailable",
        });
        daemon.refuse("/v0/workspaces/w1/bridges/usb", 409, {
            error: "USB is unavailable.",
            code: "bridge_unavailable",
            reason: { code: "vhci_not_loaded", message: "The vhci-hcd module is not loaded." },
        });
        const { host, until } = hostCreate(daemon.client);
        await expect(
            host.workspaceToLocalOpen(undefined, {
                workspaceId: "w1",
                workspacePort: 5432,
                localPort: 5432,
            }),
        ).rejects.toThrow("Port 5432 is in use on the workspace's machine.");
        await expect(
            host.usbAttach(undefined, { workspaceId: "w1", busId: "1-4", name: "Test adapter" }),
        ).rejects.toThrow("The vhci-hcd module is not loaded.");
        await until((state) => state.bridges.length === 0);
    });

    it("exports a USB device to the workspace's kernel and fails for good on a kernel refusal", async () => {
        const daemon = await daemonCreate();
        const usb = usbDevicesFake();
        const { host, until } = hostCreate(daemon.client, usb.devices);
        const attaching = host.usbAttach(undefined, {
            workspaceId: "w1",
            busId: "1-4",
            name: "Test adapter",
        });
        const bridge = await daemon.usb.next();
        expect(bridge.url.searchParams.get("busId")).toBe("1-4");
        expect(bridge.url.searchParams.get("name")).toBe("Test adapter");
        const bridgeId = bridge.url.searchParams.get("id")!;
        expect(bridgeId).toMatch(/^[a-z][a-z0-9]{1,31}$/u);

        // The daemon is the USB/IP client: it imports, then the kernel asks.
        const imported = message(bridge.socket);
        const request = Buffer.alloc(40);
        request.writeUInt16BE(0x0111, 0);
        request.writeUInt16BE(0x8003, 2);
        request.write("1-4", 8, "latin1");
        bridge.socket.send(request);
        const reply = (await imported).data;
        expect(reply.length).toBe(320);
        expect(reply.readUInt32BE(4)).toBe(0);
        const answered = message(bridge.socket);
        const submit = Buffer.alloc(48);
        submit.writeUInt32BE(1, 0);
        submit.writeUInt32BE(1, 4);
        submit.writeUInt32BE(1, 12);
        submit.writeUInt32BE(18, 24);
        submit.writeUInt32BE(0xffffffff, 32);
        Buffer.from([0x80, 6, 0, 1, 0, 0, 18, 0]).copy(submit, 40);
        bridge.socket.send(submit);
        const descriptor = (await answered).data;
        expect(descriptor.readUInt32BE(0)).toBe(3);
        expect(descriptor.readUInt32BE(24)).toBe(18);
        expect(descriptor.subarray(48)[0]).toBe(18);
        await attaching;
        const open = await until((state) => state.bridges[0]?.status === "open");
        expect(open.bridges[0]).toMatchObject({
            kind: "usb",
            bridgeId,
            busId: "1-4",
            bluetooth: true,
            heldInterfaces: [1],
        });

        bridge.socket.close(4502, "The kernel refused the attachment.");
        const failed = await until((state) => state.bridges[0]?.status === "failed");
        expect(failed.bridges[0]?.error).toBe("The kernel refused the attachment.");
        expect(usb.events).toEqual({ opened: 1, closed: 1 });
        await host.bridgeClose(undefined, failed.bridges[0]!.id);
        await until((state) => state.bridges.length === 0);
    });

    it("ends a USB bridge when its device is unplugged", async () => {
        const daemon = await daemonCreate();
        const usb = usbDevicesFake();
        const { host, until } = hostCreate(daemon.client, usb.devices);
        const attaching = host.usbAttach(undefined, {
            workspaceId: "w1",
            busId: "1-4",
            name: "Test adapter",
        });
        const bridge = await daemon.usb.next();
        const imported = message(bridge.socket);
        const request = Buffer.alloc(40);
        request.writeUInt16BE(0x0111, 0);
        request.writeUInt16BE(0x8003, 2);
        request.write("1-4", 8, "latin1");
        bridge.socket.send(request);
        await imported;
        const submit = Buffer.alloc(48);
        submit.writeUInt32BE(1, 0);
        submit.writeUInt32BE(1, 4);
        submit.writeUInt32BE(1, 12);
        submit.writeUInt32BE(8, 24);
        submit.writeUInt32BE(0xffffffff, 32);
        Buffer.from([0x80, 6, 0, 1, 0, 0, 8, 0]).copy(submit, 40);
        bridge.socket.send(submit);
        await attaching;
        const closing = closed(bridge.socket);
        usb.unplug();
        expect(await closing).toBe(1000);
        await until((state) => state.bridges.length === 0);
        expect(usb.events.closed).toBe(1);
    });

    it("forwards a port on this computer to a port in the workspace", async () => {
        const daemon = await daemonCreate();
        const workspacePort = await echoServer();
        const { host, until } = hostCreate(daemon.client);
        await host.localToWorkspaceOpen(undefined, {
            workspaceId: "w1",
            localPort: 0,
            workspacePort,
        });
        const open = await until((state) => state.bridges.length === 1);
        const forward = open.bridges[0]!;
        expect(forward).toMatchObject({
            kind: "localToWorkspace",
            status: "open",
            workspaceHost: "localhost",
            workspacePort,
        });
        const localPort = forward.kind === "localToWorkspace" ? forward.localPort : 0;
        expect(localPort).toBeGreaterThan(0);
        const socket = connect({ host: "127.0.0.1", port: localPort });
        cleanups.push(() => void socket.destroy());
        const echoed = new Promise<string>((resolve) =>
            socket.once("data", (data) => resolve(data.toString())),
        );
        socket.write("hello");
        expect(await echoed).toBe("hello");
        await expect(
            host.localToWorkspaceOpen(undefined, { workspaceId: "w1", localPort, workspacePort }),
        ).rejects.toThrow(`Port ${String(localPort)} on this computer is already in use.`);
    });

    it("keeps each Happy Agent connection's bridges to itself", async () => {
        const daemon = await daemonCreate();
        const workspacePort = await echoServer();
        const host: DeviceBridgeHost = deviceBridgeHostCreate({ usb: usbDevicesFake().devices });
        host.clientSet(daemon.client);
        cleanups.push(() => host.close());
        const remote: HappyAgentDeviceBridgeHostState[] = [];
        host.stateFollow("peer", (state) => remote.push(state));
        await host.localToWorkspaceOpen(undefined, {
            workspaceId: "w1",
            localPort: 0,
            workspacePort,
        });
        expect(remote.at(-1)?.bridges).toEqual([]);
    });
});
