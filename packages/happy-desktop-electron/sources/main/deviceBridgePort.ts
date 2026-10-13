import { Agent, request as httpRequest } from "node:http";
import { connect, createServer, type AddressInfo, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { createWebSocketStream, type WebSocket } from "ws";

/** A local connection that has not opened in this long is given up on. */
const LOCAL_CONNECT_TIMEOUT_MS = 10_000;
/** The workspace end of a forwarded connection, likewise. */
const WORKSPACE_CONNECT_TIMEOUT_MS = 30_000;

export interface WorkspaceToLocalEvents {
    /** The listener on the workspace's machine is open. */
    ready(bridge: { readonly id: string; readonly port: number | null }): void;
    connectionsChanged(count: number): void;
    /** A program in the workspace connected, and the local end could not be reached. */
    connectionFailed(message: string): void;
    /** A local end was reached again after a failure. */
    connectionSucceeded(): void;
    /** The control channel closed, with its WebSocket close code and reason. */
    closed(code: number, reason: string): void;
}

export interface WorkspaceToLocalOptions {
    readonly localPort: number;
    /** Accepts one waiting connection of this bridge. */
    accept(bridgeId: string, connectionId: string): Promise<WebSocket>;
    readonly events: WorkspaceToLocalEvents;
}

/**
 * Runs one port bridge's control channel: each program that connects to the
 * workspace's listener is relayed to `localhost:localPort` on this computer,
 * or declined at once when nothing answers there.
 *
 * The local end is reached first and the connection accepted after, so a
 * program in the workspace sees a refused port as a closed connection rather
 * than one that opens and then hangs.
 */
export function workspaceToLocalRun(
    control: WebSocket,
    options: WorkspaceToLocalOptions,
): { close(): void } {
    const relays = new Set<{ close(): void }>();
    let bridgeId: string | undefined;
    let closed = false;
    let count = 0;

    const countChange = (delta: number): void => {
        count += delta;
        options.events.connectionsChanged(count);
    };

    const reject = (connectionId: string): void => {
        if (closed || control.readyState !== control.OPEN) return;
        control.send(JSON.stringify({ type: "reject", connectionId }));
    };

    const connectionHandle = (connectionId: string): void => {
        if (bridgeId === undefined) {
            reject(connectionId);
            return;
        }
        const id = bridgeId;
        const local = connect({
            host: "localhost",
            port: options.localPort,
            autoSelectFamily: true,
            timeout: LOCAL_CONNECT_TIMEOUT_MS,
        });
        const relay: { close(): void } = {
            close: () => local.destroy(),
        };
        relays.add(relay);
        let connected = false;
        local.once("timeout", () => local.destroy(new Error("timeout")));
        // Once relayed, the relay owns the socket's failures; until then a
        // failure is the local end not answering.
        local.on("error", (error: NodeJS.ErrnoException) => {
            if (connected) return;
            relays.delete(relay);
            if (closed) return;
            reject(connectionId);
            options.events.connectionFailed(
                error.code === "ECONNREFUSED"
                    ? `Nothing is listening on port ${String(options.localPort)} on this computer.`
                    : `Port ${String(options.localPort)} on this computer could not be reached.`,
            );
        });
        local.once("connect", () => {
            connected = true;
            local.setTimeout(0);
            if (closed) {
                local.destroy();
                return;
            }
            options.events.connectionSucceeded();
            options.accept(id, connectionId).then(
                (socket) => {
                    if (closed || local.destroyed) {
                        socket.terminate();
                        local.destroy();
                        return;
                    }
                    countChange(1);
                    relay.close = () => {
                        local.destroy();
                        socket.terminate();
                    };
                    webSocketRelay(socket, local, () => {
                        relays.delete(relay);
                        countChange(-1);
                    });
                },
                () => {
                    // The connection was given up on, or its program left first.
                    relays.delete(relay);
                    local.destroy();
                },
            );
        });
    };

    control.on("message", (data, binary) => {
        if (closed) return;
        if (binary) return;
        let message: {
            readonly type?: unknown;
            readonly connectionId?: unknown;
            readonly bridge?: {
                readonly id?: unknown;
                readonly port?: { readonly port?: unknown } | null;
            };
        };
        try {
            message = JSON.parse(webSocketText(data)) as typeof message;
        } catch {
            return;
        }
        if (message.type === "ready" && typeof message.bridge?.id === "string") {
            bridgeId = message.bridge.id;
            const port = message.bridge.port?.port;
            options.events.ready({
                id: bridgeId,
                port: typeof port === "number" ? port : null,
            });
            return;
        }
        if (message.type === "connection" && typeof message.connectionId === "string")
            connectionHandle(message.connectionId);
    });
    control.on("error", () => undefined);
    control.once("close", (code, reason) => {
        const wasClosed = closed;
        closed = true;
        for (const relay of relays) relay.close();
        relays.clear();
        if (!wasClosed) options.events.closed(code, reason.toString("utf8"));
    });
    control.resume();

    return {
        close() {
            if (closed) return;
            closed = true;
            for (const relay of relays) relay.close();
            relays.clear();
            control.close(1000);
        },
    };
}

export interface LocalToWorkspaceEvents {
    connectionsChanged(count: number): void;
    connectionFailed(message: string): void;
    connectionSucceeded(): void;
}

export interface LocalToWorkspaceOptions {
    /** `0` lets this computer choose. */
    readonly localPort: number;
    /** `host:port` as the workspace reaches it. */
    readonly target: string;
    /** Opens one `CONNECT` tunnel into the workspace's network. */
    open(): Promise<Duplex>;
    readonly events: LocalToWorkspaceEvents;
}

/** A refusal to listen that names its port, for the person who chose it. */
export class LocalListenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LocalListenError";
    }
}

/**
 * Listens on `127.0.0.1:localPort` and carries each connection to `target` in
 * the workspace, through the workspace's own proxy and a nested `CONNECT`.
 * Loopback only: nothing else on the network can reach a workspace this way.
 */
export function localToWorkspaceListen(
    options: LocalToWorkspaceOptions,
): Promise<{ readonly port: number; close(): void }> {
    const sockets = new Set<Duplex>();
    let count = 0;
    let closed = false;
    const countChange = (delta: number): void => {
        count += delta;
        options.events.connectionsChanged(count);
    };
    const server = createServer((local) => {
        local.on("error", () => local.destroy());
        if (closed) {
            local.destroy();
            return;
        }
        sockets.add(local);
        countChange(1);
        local.once("close", () => {
            sockets.delete(local);
            countChange(-1);
        });
        void workspaceConnect(options, sockets).then(
            ({ upstream, head }) => {
                if (local.destroyed || closed) {
                    upstream.destroy();
                    return;
                }
                options.events.connectionSucceeded();
                if (head.length > 0) local.write(head);
                streamRelay(local, upstream);
            },
            (error: unknown) => {
                local.destroy();
                if (!closed)
                    options.events.connectionFailed(
                        error instanceof Error ? error.message : String(error),
                    );
            },
        );
    });
    return new Promise((resolve, reject) => {
        server.once("error", (error: NodeJS.ErrnoException) => {
            const port = String(options.localPort);
            reject(
                new LocalListenError(
                    error.code === "EADDRINUSE"
                        ? `Port ${port} on this computer is already in use.`
                        : error.code === "EACCES"
                          ? `Port ${port} on this computer needs administrator rights.`
                          : `Port ${port} on this computer could not be opened.`,
                ),
            );
        });
        server.listen({ host: "127.0.0.1", port: options.localPort, exclusive: true }, () => {
            server.removeAllListeners("error");
            server.on("error", () => undefined);
            resolve({
                port: (server.address() as AddressInfo).port,
                close() {
                    if (closed) return;
                    closed = true;
                    server.close();
                    for (const socket of sockets) socket.destroy();
                    sockets.clear();
                },
            });
        });
    });
}

/** Opens the workspace proxy tunnel and asks it, with a nested `CONNECT`, for `target`. */
async function workspaceConnect(
    options: LocalToWorkspaceOptions,
    sockets: Set<Duplex>,
): Promise<{ readonly upstream: Duplex; readonly head: Buffer }> {
    let tunnel: Duplex;
    try {
        tunnel = await options.open();
    } catch {
        throw new Error("The workspace could not be reached.");
    }
    sockets.add(tunnel);
    tunnel.on("error", () => tunnel.destroy());
    tunnel.once("close", () => sockets.delete(tunnel));
    return new Promise((resolve, reject) => {
        const agent = new Agent({ keepAlive: false });
        agent.createConnection = () => tunnel as Socket;
        const nested = httpRequest({
            agent,
            headers: { host: options.target },
            method: "CONNECT",
            path: options.target,
            timeout: WORKSPACE_CONNECT_TIMEOUT_MS,
        });
        const fail = (message: string): void => {
            tunnel.destroy();
            reject(new Error(message));
        };
        nested.once("connect", (response, upstream, head) => {
            if (response.statusCode !== 200) {
                upstream.destroy();
                fail(
                    `Nothing in the workspace answered on ${options.target.slice(options.target.lastIndexOf(":") + 1)}.`,
                );
                return;
            }
            nested.setTimeout(0);
            resolve({ upstream, head });
        });
        nested.once("response", (response) => {
            response.resume();
            fail("The workspace refused the connection.");
        });
        nested.once("timeout", () => nested.destroy(new Error("timeout")));
        nested.once("error", () => fail("The workspace could not be reached."));
        nested.end();
    });
}

/** Carries one accepted bridge connection both ways; either end closing closes both. */
function webSocketRelay(socket: WebSocket, local: Socket, ended: () => void): void {
    const stream = createWebSocketStream(socket, { allowHalfOpen: false });
    let done = false;
    const finish = (): void => {
        if (done) return;
        done = true;
        local.destroy();
        stream.destroy();
        socket.terminate();
        ended();
    };
    stream.on("error", finish);
    stream.once("close", finish);
    local.on("error", finish);
    local.once("close", finish);
    stream.pipe(local);
    local.pipe(stream);
}

function streamRelay(first: Duplex, second: Duplex): void {
    first.on("error", () => second.destroy());
    second.on("error", () => first.destroy());
    first.once("close", () => second.destroy());
    second.once("close", () => first.destroy());
    first.pipe(second);
    second.pipe(first);
}

function webSocketText(data: import("ws").RawData): string {
    if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
    return data.toString("utf8");
}
