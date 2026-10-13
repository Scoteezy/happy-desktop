/**
 * The desktop host's side of local bridges: the USB devices plugged into this
 * computer, and the bridges and forwards this computer holds open.
 *
 * Happy Agent knows a bridge only from the moment it is open, and knows nothing
 * of where its local end goes. Both of those live in the desktop host, which
 * holds every bridge's WebSocket, so this contract is how the host says so.
 * The desktop host produces exactly these shapes; product state joins them with
 * the daemon's own bridge list.
 */

/** One USB device plugged into this computer. */
export interface HappyAgentLocalUsbDevice {
    /** Its USB/IP bus ID on this computer, stable for as long as it stays plugged in. */
    readonly busId: string;
    /** Lowercase four-digit hexadecimal, as Happy Agent reports them. */
    readonly vendorId: string;
    readonly productId: string;
    /** The product's own name, or one made from its IDs when it reports none. */
    readonly name: string;
    readonly manufacturer: string | null;
    /** A USB Bluetooth controller, which becomes a Bluetooth adapter on the workspace's machine. */
    readonly bluetooth: boolean;
}

/** Whether this computer can export USB devices at all, and which are plugged in. */
export type HappyAgentLocalUsb =
    | { readonly available: true; readonly devices: readonly HappyAgentLocalUsbDevice[] }
    | { readonly available: false; readonly reason: string };

/**
 * Where one held bridge stands. A bridge that dropped for a reason that may
 * pass reconnects on its own; one refused for a reason that will not stays
 * `failed` with that reason until it is closed.
 */
export type HappyAgentLocalBridgeStatus = "connecting" | "open" | "reconnecting" | "failed";

interface HappyAgentLocalBridgeBase {
    /** Minted by the host, and the same across every reconnect. */
    readonly id: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly status: HappyAgentLocalBridgeStatus;
    /** Why the last attempt did not hold, while reconnecting or failed. */
    readonly error: string | null;
}

/** A USB device of this computer attached to the workspace's machine. */
export interface HappyAgentLocalUsbBridge extends HappyAgentLocalBridgeBase {
    readonly kind: "usb";
    /** The Happy Agent bridge carrying it now. Each reconnect opens a new one. */
    readonly bridgeId: string | null;
    readonly busId: string;
    readonly vendorId: string;
    readonly productId: string;
    readonly bluetooth: boolean;
    /** Interfaces this computer's own drivers kept, which the workspace cannot use. */
    readonly heldInterfaces: readonly number[];
}

/** A port on the workspace's machine whose connections reach a port on this computer. */
export interface HappyAgentLocalPortBridge extends HappyAgentLocalBridgeBase {
    readonly kind: "workspaceToLocal";
    readonly bridgeId: string | null;
    /** Where programs in the workspace connect, once Happy Agent is listening there. */
    readonly workspacePort: number | null;
    readonly localPort: number;
    readonly connections: number;
}

/** A port on this computer whose connections reach a port in the workspace. */
export interface HappyAgentLocalForward extends HappyAgentLocalBridgeBase {
    readonly kind: "localToWorkspace";
    readonly localPort: number;
    readonly workspaceHost: string;
    readonly workspacePort: number;
    readonly connections: number;
}

export type HappyAgentLocalBridge =
    | HappyAgentLocalUsbBridge
    | HappyAgentLocalPortBridge
    | HappyAgentLocalForward;

/** What the host holds and sees for one Happy Agent connection. */
export interface HappyAgentDeviceBridgeHostState {
    readonly usb: HappyAgentLocalUsb;
    readonly bridges: readonly HappyAgentLocalBridge[];
}

export interface HappyAgentDeviceBridgeHostHandlers {
    /** The whole current state, every time it changes. */
    stateReceived(state: HappyAgentDeviceBridgeHostState): void;
    /** The desktop app around this renderer predates local bridges. */
    appOutdated(): void;
    /** The host could not be reached; it is being asked again. */
    failed(message: string): void;
}

export interface HappyAgentUsbAttachRequest {
    readonly workspaceId: string;
    readonly busId: string;
    readonly name: string;
}

export interface HappyAgentWorkspaceToLocalRequest {
    readonly workspaceId: string;
    /** `0` lets Happy Agent choose. */
    readonly workspacePort: number;
    readonly localPort: number;
}

export interface HappyAgentLocalToWorkspaceRequest {
    readonly workspaceId: string;
    /** `0` lets this computer choose. */
    readonly localPort: number;
    readonly workspacePort: number;
}

/**
 * Local bridges, as the desktop host offers them to one Happy Agent connection.
 * Each opening resolves once the bridge is established, and rejects with the
 * reason it could not be, so the place that asked can say why.
 */
export interface HappyAgentDeviceBridgeHost {
    stateFollow(handlers: HappyAgentDeviceBridgeHostHandlers): () => void;
    usbAttach(request: HappyAgentUsbAttachRequest): Promise<void>;
    workspaceToLocalOpen(request: HappyAgentWorkspaceToLocalRequest): Promise<void>;
    localToWorkspaceOpen(request: HappyAgentLocalToWorkspaceRequest): Promise<void>;
    /** Closes one bridge or forward this computer holds, by its host ID. */
    bridgeClose(id: string): Promise<void>;
}
