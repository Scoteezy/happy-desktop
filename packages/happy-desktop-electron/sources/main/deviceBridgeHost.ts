import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import type { Duplex } from "node:stream";
import type { WebSocket } from "ws";
import type {
    HappyAgentDeviceBridgeHostState,
    HappyAgentLocalBridge,
    HappyAgentLocalBridgeStatus,
    HappyAgentLocalToWorkspaceRequest,
    HappyAgentUsbAttachRequest,
    HappyAgentWorkspaceToLocalRequest,
} from "happy-desktop-state";
import { HappyAgentDaemonHttpError } from "./happyAgentDaemonClient";
import { LocalListenError, localToWorkspaceListen, workspaceToLocalRun } from "./deviceBridgePort";
import { usbExportCreate } from "./deviceBridgeUsbExport";
import {
    LocalUsbError,
    localUsbDevicesCreate,
    type LocalUsbDevices,
    type LocalUsbOpened,
} from "./deviceBridgeUsbDevice";

/** What the host needs of one Happy Agent connection: its bridge WebSockets and its proxy. */
export interface DeviceBridgeClient {
    connection(id: string): DeviceBridgeClient;
    openUsbBridge(
        workspaceId: string,
        query: { readonly busId: string; readonly id: string; readonly name: string },
    ): Promise<WebSocket>;
    openPortBridge(
        workspaceId: string,
        query: { readonly port: number; readonly name: string },
    ): Promise<WebSocket>;
    acceptBridgeConnection(
        workspaceId: string,
        bridgeId: string,
        connectionId: string,
    ): Promise<WebSocket>;
    openWorkspaceHttpProxy(workspaceId: string): Promise<Duplex>;
}

/**
 * Every bridge and forward this computer holds, for the whole app.
 *
 * A bridge lives exactly as long as the WebSocket that opened it, so whoever
 * holds that WebSocket decides how long a device stays attached. That is this
 * host, not a window: reloading the renderer or taking a renderer update keeps
 * every bridge, and quitting the app closes them all. Nothing is remembered
 * across a restart.
 *
 * `connectionId` names the Happy Agent a bridge goes to: absent for the local
 * daemon, otherwise one of its remote connections.
 */
export interface DeviceBridgeHost {
    /**
     * The daemon client every later attempt resolves its connection through. A
     * replaced daemon connection is picked up by the next reconnect.
     */
    clientSet(client: DeviceBridgeClient): void;
    stateFollow(
        connectionId: string | undefined,
        listener: (state: HappyAgentDeviceBridgeHostState) => void,
    ): () => void;
    usbAttach(connectionId: string | undefined, request: HappyAgentUsbAttachRequest): Promise<void>;
    workspaceToLocalOpen(
        connectionId: string | undefined,
        request: HappyAgentWorkspaceToLocalRequest,
    ): Promise<void>;
    localToWorkspaceOpen(
        connectionId: string | undefined,
        request: HappyAgentLocalToWorkspaceRequest,
    ): Promise<void>;
    bridgeClose(connectionId: string | undefined, id: string): Promise<void>;
    close(): Promise<void>;
}

/** Waits between reconnects of a dropped bridge; the last repeats until it holds. */
const RECONNECT_DELAYS_MS: readonly number[] = [1_000, 2_000, 5_000, 10_000, 30_000];
/** The workspace's kernel asks for an attached device's descriptors at once. */
const USB_START_TIMEOUT_MS = 20_000;
const PORT_READY_TIMEOUT_MS = 15_000;
/** The daemon takes binary messages of at most 1 MiB; the stream splits anywhere. */
const BRIDGE_MESSAGE_BYTES = 1024 * 1024;

const CLOSE_NORMAL = 1000;
const CLOSE_SHUTDOWN = 1001;
const CLOSE_PROTOCOL = 4400;
const CLOSE_DEVICE_REFUSED = 4404;
const CLOSE_IMPORT_TIMEOUT = 4408;
const CLOSE_NO_FREE_PORT = 4409;
const CLOSE_KERNEL_REFUSED = 4502;

/**
 * How one connection of a bridge ended. `ended` is the bridge being over, for
 * good and on purpose; `dropped` may pass and is reconnected; `refused` will
 * not pass and leaves the bridge failed, saying why, until it is closed.
 */
type Ending =
    | { readonly kind: "ended" }
    | { readonly kind: "dropped"; readonly message: string }
    | { readonly kind: "refused"; readonly message: string };

class BridgeFailure extends Error {
    constructor(
        message: string,
        readonly permanent: boolean,
    ) {
        super(message);
        this.name = "BridgeFailure";
    }
}

function failureOf(error: unknown): BridgeFailure {
    if (error instanceof BridgeFailure) return error;
    if (error instanceof LocalUsbError) return new BridgeFailure(error.message, error.permanent);
    if (error instanceof LocalListenError) return new BridgeFailure(error.message, true);
    if (error instanceof HappyAgentDaemonHttpError) {
        // A request Happy Agent turned down is turned down again; an
        // unavailable, restarting, or reauthenticating one may pass.
        const status = error.statusCode;
        const permanent = status >= 400 && status < 500 && status !== 401 && status !== 403;
        return new BridgeFailure(error.message, permanent);
    }
    const code = (error as { readonly code?: unknown } | undefined)?.code;
    if (code === "ECONNREFUSED" || code === "ENOENT")
        return new BridgeFailure("Happy Agent is not running.", false);
    return new BridgeFailure(
        error instanceof Error && error.message.length > 0
            ? error.message
            : "The connection to Happy Agent failed.",
        false,
    );
}

/** A CUID2-shaped ID: a letter, then letters and digits. */
function idCreate(): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = randomBytes(24);
    let id = alphabet[bytes[0]! % 26]!;
    for (let index = 1; index < bytes.length; index += 1) id += alphabet[bytes[index]! % 36]!;
    return id;
}

function computerName(): string {
    const name = hostname()
        .replace(/\.local$/u, "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f-\u009f]/gu, "")
        .trim();
    return name.length > 0 ? name.slice(0, 64) : "this computer";
}

function sendChunked(socket: WebSocket, bytes: Buffer): void {
    if (socket.readyState !== socket.OPEN) return;
    for (let offset = 0; offset < bytes.length; offset += BRIDGE_MESSAGE_BYTES)
        socket.send(bytes.subarray(offset, offset + BRIDGE_MESSAGE_BYTES), { binary: true });
}

function webSocketBytes(data: import("ws").RawData): Buffer {
    if (Array.isArray(data)) return Buffer.concat(data);
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    return data;
}

function usbEndingOf(code: number, reason: string, closing: boolean): Ending {
    if (closing) return { kind: "ended" };
    switch (code) {
        case CLOSE_NORMAL:
            return { kind: "ended" };
        case CLOSE_SHUTDOWN:
            return { kind: "dropped", message: "Happy Agent is restarting." };
        case CLOSE_PROTOCOL:
            return {
                kind: "refused",
                message: reason || "The workspace's machine broke off the device's connection.",
            };
        case CLOSE_DEVICE_REFUSED:
            return {
                kind: "refused",
                message: reason || "The workspace's machine refused the device.",
            };
        case CLOSE_IMPORT_TIMEOUT:
            return {
                kind: "dropped",
                message: "The device did not answer the workspace's machine in time.",
            };
        case CLOSE_NO_FREE_PORT:
            return {
                kind: "refused",
                message: reason || "The workspace's machine has no free USB port for this device.",
            };
        case CLOSE_KERNEL_REFUSED:
            return {
                kind: "refused",
                message: reason || "The workspace machine's kernel refused the device.",
            };
        default:
            return { kind: "dropped", message: "The connection to the workspace was lost." };
    }
}

function portEndingOf(code: number, reason: string, closing: boolean): Ending {
    if (closing || code === CLOSE_NORMAL) return { kind: "ended" };
    if (code === CLOSE_SHUTDOWN) return { kind: "dropped", message: "Happy Agent is restarting." };
    if (code === CLOSE_PROTOCOL)
        return { kind: "refused", message: reason || "The workspace broke off the bridge." };
    return { kind: "dropped", message: "The connection to the workspace was lost." };
}

/**
 * One bridge's connection, over and over: established once before it is
 * shown, then reconnected after every drop until it ends, is refused, or is
 * closed. `connect` resolves once a connection holds and reports how it ends
 * through its callback; a connection that never held rejects instead.
 */
class Reconnecting {
    status: HappyAgentLocalBridgeStatus = "connecting";
    error: string | null = null;
    #closed = false;
    #attempt = 0;
    #timer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly connect: (ended: (ending: Ending) => void) => Promise<void>,
        private readonly changed: () => void,
        /** Lets go of everything the bridge holds; it stays listed while failed. */
        private readonly release: () => void,
        /** Takes the bridge out of the list for good. */
        private readonly remove: () => void,
    ) {}

    /** Whether the bridge is over, so an attempt still opening must let go of what it opened. */
    get closed(): boolean {
        return this.#closed;
    }

    async start(): Promise<void> {
        try {
            await this.connect(this.#ended);
        } catch (error) {
            // Closed while opening is the outcome that was asked for.
            if (this.#closed) return;
            this.#closed = true;
            this.release();
            this.remove();
            throw new Error(failureOf(error).message);
        }
        if (!this.#closed) this.#held();
    }

    close(): void {
        this.#closed = true;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = undefined;
    }

    #held(): void {
        this.status = "open";
        this.error = null;
        this.#attempt = 0;
        this.changed();
    }

    #ended = (ending: Ending): void => {
        if (this.#closed) return;
        if (ending.kind === "ended") {
            this.#closed = true;
            this.release();
            this.remove();
            return;
        }
        if (ending.kind === "refused") {
            this.#fail(ending.message);
            return;
        }
        this.#retry(ending.message);
    };

    #fail(message: string): void {
        this.#closed = true;
        this.status = "failed";
        this.error = message;
        this.release();
        this.changed();
    }

    #retry(message: string): void {
        this.status = "reconnecting";
        this.error = message;
        this.changed();
        const delay = RECONNECT_DELAYS_MS[Math.min(this.#attempt, RECONNECT_DELAYS_MS.length - 1)]!;
        this.#attempt += 1;
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            if (this.#closed) return;
            this.connect(this.#ended).then(
                () => {
                    if (!this.#closed) this.#held();
                },
                (error: unknown) => {
                    if (this.#closed) return;
                    const failure = failureOf(error);
                    if (failure.permanent) this.#fail(failure.message);
                    else this.#retry(failure.message);
                },
            );
        }, delay);
    }
}

interface Held {
    readonly id: string;
    readonly connectionId: string | undefined;
    readonly busId?: string;
    state(): HappyAgentLocalBridge;
    close(): Promise<void>;
}

interface Follower {
    readonly connectionId: string | undefined;
    readonly listener: (state: HappyAgentDeviceBridgeHostState) => void;
    last?: string;
}

export function deviceBridgeHostCreate(
    options: { readonly usb?: LocalUsbDevices } = {},
): DeviceBridgeHost {
    const usb = options.usb ?? localUsbDevicesCreate();
    const held = new Map<string, Held>();
    const followers = new Set<Follower>();
    let usbStop: (() => void) | undefined;
    let root: DeviceBridgeClient | undefined;
    let closed = false;

    const clientFor = (connectionId: string | undefined): DeviceBridgeClient => {
        if (!root) throw new BridgeFailure("Happy Agent is not connected yet.", false);
        return connectionId === undefined ? root : root.connection(connectionId);
    };

    const changed = (): void => {
        if (followers.size === 0) return;
        const devices = usb.get();
        for (const follower of followers) {
            const state: HappyAgentDeviceBridgeHostState = {
                usb: devices,
                bridges: [...held.values()]
                    .filter((entry) => entry.connectionId === follower.connectionId)
                    .map((entry) => entry.state()),
            };
            const serialized = JSON.stringify(state);
            if (serialized === follower.last) continue;
            follower.last = serialized;
            follower.listener(state);
        }
    };

    const assertOpen = (): void => {
        if (closed) throw new Error("Happy is quitting.");
    };

    const usbAttach = async (
        connectionId: string | undefined,
        request: HappyAgentUsbAttachRequest,
    ): Promise<void> => {
        assertOpen();
        if ([...held.values()].some((entry) => entry.busId === request.busId))
            throw new Error("This device is already attached to a workspace.");
        const id = idCreate();
        let opened: LocalUsbOpened | undefined;
        let bridgeId: string | null = null;
        let current: { close(): void } | undefined;
        const listed = usb.get();
        const known = listed.available
            ? listed.devices.find((device) => device.busId === request.busId)
            : undefined;
        const release = (): void => {
            current?.close();
            current = undefined;
            bridgeId = null;
            const device = opened;
            opened = undefined;
            void device?.close();
        };
        const connect = async (ended: (ending: Ending) => void): Promise<void> => {
            if (!opened) {
                const device = await usb.open(request.busId);
                if (lifecycle.closed) {
                    await device.close();
                    throw new BridgeFailure("The bridge was closed.", true);
                }
                opened = device;
                device.onDetached(() => {
                    // Unplugged is the end of it; there is nothing to reconnect.
                    current?.close();
                    ended({ kind: "ended" });
                });
                device.onHeldChange(changed);
            }
            const device = opened;
            const attemptId = idCreate();
            const socket = await clientFor(connectionId).openUsbBridge(request.workspaceId, {
                busId: request.busId,
                id: attemptId,
                name: request.name,
            });
            if (lifecycle.closed || opened !== device) {
                socket.close(CLOSE_NORMAL);
                throw new BridgeFailure("The bridge was closed.", true);
            }
            return new Promise<void>((resolve, reject) => {
                let started = false;
                let finished = false;
                let closing = false;
                const attempt = {
                    close: () => {
                        closing = true;
                        finish({ kind: "ended" });
                    },
                };
                const finish = (ending: Ending): void => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(deadline);
                    exporter.close();
                    if (socket.readyState === socket.OPEN) socket.close(CLOSE_NORMAL);
                    if (current === attempt) current = undefined;
                    if (started) {
                        ended(ending);
                        return;
                    }
                    reject(
                        new BridgeFailure(
                            ending.kind === "ended"
                                ? "The workspace ended the bridge."
                                : ending.message,
                            ending.kind !== "dropped",
                        ),
                    );
                };
                const deadline = setTimeout(
                    () =>
                        finish({
                            kind: "dropped",
                            message: "The workspace's machine did not start using the device.",
                        }),
                    USB_START_TIMEOUT_MS,
                );
                const exporter = usbExportCreate(device.device, {
                    send: (bytes) => sendChunked(socket, bytes),
                    started: () => {
                        if (finished) return;
                        started = true;
                        clearTimeout(deadline);
                        bridgeId = attemptId;
                        resolve();
                    },
                    failed: (message) => finish({ kind: "refused", message }),
                });
                current = attempt;
                socket.on("message", (data, binary) => {
                    if (!binary) {
                        finish({
                            kind: "refused",
                            message:
                                "Happy Agent sent the device's connection something unexpected.",
                        });
                        return;
                    }
                    exporter.receive(webSocketBytes(data));
                });
                socket.on("error", () => undefined);
                socket.once("close", (code, reason) =>
                    finish(usbEndingOf(code, reason.toString("utf8"), closing)),
                );
                socket.resume();
            });
        };
        const lifecycle = new Reconnecting(connect, changed, release, () => {
            held.delete(id);
            changed();
        });
        held.set(id, {
            id,
            connectionId,
            busId: request.busId,
            state: () => ({
                kind: "usb",
                id,
                workspaceId: request.workspaceId,
                name: request.name,
                status: lifecycle.status,
                error: lifecycle.error,
                bridgeId,
                busId: request.busId,
                vendorId: opened?.description.vendorId ?? known?.vendorId ?? "0000",
                productId: opened?.description.productId ?? known?.productId ?? "0000",
                bluetooth: opened?.description.bluetooth ?? known?.bluetooth ?? false,
                heldInterfaces: opened?.heldInterfaces() ?? [],
            }),
            close: async () => {
                lifecycle.close();
                const device = opened;
                opened = undefined;
                current?.close();
                current = undefined;
                held.delete(id);
                changed();
                await device?.close();
            },
        });
        changed();
        await lifecycle.start();
    };

    const workspaceToLocalOpen = async (
        connectionId: string | undefined,
        request: HappyAgentWorkspaceToLocalRequest,
    ): Promise<void> => {
        assertOpen();
        const id = idCreate();
        let bridgeId: string | null = null;
        let workspacePort: number | null =
            request.workspacePort === 0 ? null : request.workspacePort;
        let connections = 0;
        let connectionError: string | null = null;
        let current: { close(): void } | undefined;
        const name = `localhost:${String(request.localPort)} on ${computerName()}`;
        const release = (): void => {
            current?.close();
            current = undefined;
            bridgeId = null;
            connections = 0;
        };
        const connect = async (ended: (ending: Ending) => void): Promise<void> => {
            // A reconnect asks for the port it had, so programs keep their address.
            const control = await clientFor(connectionId).openPortBridge(request.workspaceId, {
                port: workspacePort ?? 0,
                name,
            });
            if (lifecycle.closed) {
                control.close(CLOSE_NORMAL);
                throw new BridgeFailure("The bridge was closed.", true);
            }
            return new Promise<void>((resolve, reject) => {
                let ready = false;
                let closing = false;
                let finished = false;
                let run: { close(): void } | undefined;
                const attempt = {
                    close: () => {
                        closing = true;
                        finish({ kind: "ended" });
                    },
                };
                const finish = (ending: Ending): void => {
                    if (finished) return;
                    finished = true;
                    clearTimeout(deadline);
                    run?.close();
                    connections = 0;
                    if (current === attempt) current = undefined;
                    if (ready) {
                        ended(ending);
                        return;
                    }
                    reject(
                        new BridgeFailure(
                            ending.kind === "ended"
                                ? "The workspace ended the bridge."
                                : ending.message,
                            ending.kind !== "dropped",
                        ),
                    );
                };
                const deadline = setTimeout(
                    () =>
                        finish({
                            kind: "dropped",
                            message: "The workspace did not open its port in time.",
                        }),
                    PORT_READY_TIMEOUT_MS,
                );
                current = attempt;
                run = workspaceToLocalRun(control, {
                    localPort: request.localPort,
                    accept: (bridge, waiting) =>
                        clientFor(connectionId).acceptBridgeConnection(
                            request.workspaceId,
                            bridge,
                            waiting,
                        ),
                    events: {
                        ready: (bridge) => {
                            if (finished) return;
                            ready = true;
                            clearTimeout(deadline);
                            bridgeId = bridge.id;
                            if (bridge.port !== null) workspacePort = bridge.port;
                            resolve();
                        },
                        connectionsChanged: (count) => {
                            connections = count;
                            changed();
                        },
                        connectionFailed: (message) => {
                            connectionError = message;
                            changed();
                        },
                        connectionSucceeded: () => {
                            if (connectionError === null) return;
                            connectionError = null;
                            changed();
                        },
                        closed: (code, reason) => finish(portEndingOf(code, reason, closing)),
                    },
                });
            });
        };
        const lifecycle = new Reconnecting(connect, changed, release, () => {
            held.delete(id);
            changed();
        });
        held.set(id, {
            id,
            connectionId,
            state: () => ({
                kind: "workspaceToLocal",
                id,
                workspaceId: request.workspaceId,
                name,
                status: lifecycle.status,
                error: lifecycle.error ?? connectionError,
                bridgeId,
                workspacePort,
                localPort: request.localPort,
                connections,
            }),
            close: async () => {
                lifecycle.close();
                current?.close();
                current = undefined;
                held.delete(id);
                changed();
            },
        });
        changed();
        await lifecycle.start();
    };

    const localToWorkspaceOpen = async (
        connectionId: string | undefined,
        request: HappyAgentLocalToWorkspaceRequest,
    ): Promise<void> => {
        assertOpen();
        const id = idCreate();
        const workspaceHost = "localhost";
        let connections = 0;
        let connectionError: string | null = null;
        const listener = await localToWorkspaceListen({
            localPort: request.localPort,
            target: `${workspaceHost}:${String(request.workspacePort)}`,
            open: () => clientFor(connectionId).openWorkspaceHttpProxy(request.workspaceId),
            events: {
                connectionsChanged: (count) => {
                    connections = count;
                    changed();
                },
                connectionFailed: (message) => {
                    connectionError = message;
                    changed();
                },
                connectionSucceeded: () => {
                    if (connectionError === null) return;
                    connectionError = null;
                    changed();
                },
            },
        }).catch((error: unknown) => {
            throw new Error(failureOf(error).message);
        });
        if (closed) {
            listener.close();
            throw new Error("Happy is quitting.");
        }
        held.set(id, {
            id,
            connectionId,
            state: () => ({
                kind: "localToWorkspace",
                id,
                workspaceId: request.workspaceId,
                name: `localhost:${String(listener.port)}`,
                status: "open",
                error: connectionError,
                localPort: listener.port,
                workspaceHost,
                workspacePort: request.workspacePort,
                connections,
            }),
            close: async () => {
                listener.close();
                held.delete(id);
                changed();
            },
        });
        changed();
    };

    return {
        clientSet(client) {
            root = client;
        },
        stateFollow(connectionId, listener) {
            const follower: Follower = { connectionId, listener };
            followers.add(follower);
            usbStop ??= usb.subscribe(changed);
            changed();
            return () => {
                followers.delete(follower);
                if (followers.size === 0) {
                    usbStop?.();
                    usbStop = undefined;
                }
            };
        },
        usbAttach,
        workspaceToLocalOpen,
        localToWorkspaceOpen,
        async bridgeClose(connectionId, id) {
            const entry = held.get(id);
            if (!entry || entry.connectionId !== connectionId) return;
            await entry.close();
        },
        async close() {
            closed = true;
            usbStop?.();
            usbStop = undefined;
            followers.clear();
            await Promise.all([...held.values()].map((entry) => entry.close()));
        },
    };
}
