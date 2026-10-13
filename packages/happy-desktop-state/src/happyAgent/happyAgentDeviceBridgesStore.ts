import {
    HappyAgentApiError,
    type HappyAgentClient,
    type HappyAgentUpdate,
    type WorkspaceBridge,
    type WorkspaceBridgeCapabilities,
    type WorkspaceBridgeCapability,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import type {
    HappyAgentDeviceBridgeHost,
    HappyAgentDeviceBridgeHostState,
    HappyAgentLocalBridge,
    HappyAgentLocalUsb,
} from "./happyAgentDeviceBridgeHost.js";
import type { HappyAgentGroupId } from "./happyAgentTypes.js";

/** One thing a workspace can bridge, and why not when it cannot. */
export type HappyAgentDeviceBridgeCapability =
    | { readonly available: true }
    | { readonly available: false; readonly reason: string };

export interface HappyAgentDeviceBridgeCapabilities {
    readonly usb: HappyAgentDeviceBridgeCapability;
    readonly bluetooth: HappyAgentDeviceBridgeCapability;
    /** Programs in the workspace reaching a port on this computer. */
    readonly workspaceToLocal: HappyAgentDeviceBridgeCapability;
    /** This computer reaching a port in the workspace. */
    readonly localToWorkspace: HappyAgentDeviceBridgeCapability;
}

/**
 * `closing` is a close this surface asked for and has not seen land yet; the
 * other states are the host's own, or `open` for a bridge another device holds.
 */
export type HappyAgentDeviceBridgeStatus =
    | "connecting"
    | "open"
    | "reconnecting"
    | "failed"
    | "closing";

interface HappyAgentDeviceBridgeItemBase {
    /** The host's ID when this computer holds it, otherwise Happy Agent's. */
    readonly id: string;
    readonly name: string;
    /** Whether this computer holds it. Another of the person's devices may hold the rest. */
    readonly heldHere: boolean;
    readonly status: HappyAgentDeviceBridgeStatus;
    readonly error: string | null;
}

export type HappyAgentDeviceBridgeItem =
    | (HappyAgentDeviceBridgeItemBase & {
          readonly kind: "usb";
          /** The device's bus on this computer; unknown for a device another computer holds. */
          readonly busId: string | null;
          readonly vendorId: string;
          readonly productId: string;
          readonly bluetooth: boolean;
          /** Interfaces this computer's drivers kept; empty for a device held elsewhere. */
          readonly heldInterfaces: readonly number[];
      })
    | (HappyAgentDeviceBridgeItemBase & {
          readonly kind: "workspaceToLocal";
          readonly workspacePort: number | null;
          /** Unknown for a bridge another device holds. */
          readonly localPort: number | null;
          readonly connections: number | null;
      })
    | (HappyAgentDeviceBridgeItemBase & {
          readonly kind: "localToWorkspace";
          readonly localPort: number;
          readonly workspaceHost: string;
          readonly workspacePort: number;
          readonly connections: number;
      });

/** What this desktop can do: bridges need the native app, not only this renderer. */
export type HappyAgentDeviceBridgeHostStatus =
    | { readonly status: "connecting" }
    | { readonly status: "ready" }
    | { readonly status: "appOutdated" }
    | { readonly status: "error"; readonly message: string };

export interface HappyAgentDeviceBridgeForm {
    readonly pending: boolean;
    readonly error?: string;
}

export interface HappyAgentDeviceBridgesSnapshot {
    /** Whether this workspace's Happy Agent serves bridges at all. */
    readonly support: "checking" | "supported" | "unsupported";
    readonly capabilities?: HappyAgentDeviceBridgeCapabilities;
    /** Why Happy Agent's bridges could not be read, while that is retried. */
    readonly error?: string;
    readonly host: HappyAgentDeviceBridgeHostStatus;
    /** USB on this computer, once the host has answered. */
    readonly usb?: HappyAgentLocalUsb;
    readonly bridges: readonly HappyAgentDeviceBridgeItem[];
    /** Bus IDs whose attach is in flight. */
    readonly attaching: readonly string[];
    /** The last attach that failed, until another starts. */
    readonly usbError?: { readonly busId: string; readonly message: string };
    readonly workspaceToLocal: HappyAgentDeviceBridgeForm;
    readonly localToWorkspace: HappyAgentDeviceBridgeForm;
}

export interface HappyAgentDeviceBridgesStore {
    get(): HappyAgentDeviceBridgesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Attaches one USB device or Bluetooth adapter of this computer to the workspace. */
    usbAttach(busId: string): void;
    /** Lets programs in the workspace reach `localPort` on this computer at `workspacePort`. */
    workspaceToLocalOpen(localPort: number, workspacePort: number): void;
    /** Lets this computer reach `workspacePort` in the workspace at `localPort`. */
    localToWorkspaceOpen(workspacePort: number, localPort: number): void;
    /** Closes one bridge, wherever it is held. */
    bridgeClose(id: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentDeviceBridgesDeps {
    readonly client: Pick<
        HappyAgentClient,
        "getHealth" | "listWorkspaceBridges" | "closeWorkspaceBridge"
    >;
    readonly sync: HappyAgentSync;
    readonly host: HappyAgentDeviceBridgeHost;
    readonly workspaceId: HappyAgentGroupId;
}

const BRIDGE_EVENTS = ["bridge.created", "bridge.updated", "bridges.capabilities.updated"] as const;

const FORM_IDLE: HappyAgentDeviceBridgeForm = { pending: false };
const NO_ITEMS: readonly HappyAgentDeviceBridgeItem[] = [];
const NO_BUS_IDS: readonly string[] = [];

/**
 * One workspace's local bridges: what its machine can take, what is open, and
 * the actions that open and close them.
 *
 * Two authorities meet here. Happy Agent says what the workspace's machine can
 * bridge and which bridges are open, reconciled through its list route and its
 * `bridge.*` events. The desktop host says which of them this computer holds,
 * where their local end goes, and which USB devices are plugged in. Neither is
 * mirrored into the other; a bridge is drawn from both, joined by its ID.
 *
 * Construction starts nothing. The first subscriber starts both feeds, and the
 * last one leaving stops them.
 */
export function happyAgentDeviceBridgesStoreCreate(
    deps: HappyAgentDeviceBridgesDeps,
): HappyAgentDeviceBridgesStore {
    const workspaceId = deps.workspaceId;
    const listeners = new Set<() => void>();
    let support: HappyAgentDeviceBridgesSnapshot["support"] = "checking";
    let capabilities: HappyAgentDeviceBridgeCapabilities | undefined;
    let readError: string | undefined;
    let host: HappyAgentDeviceBridgeHostStatus = { status: "connecting" };
    let hostState: HappyAgentDeviceBridgeHostState | undefined;
    /** Open bridges of this workspace, as Happy Agent last said. */
    const daemonBridges = new Map<string, WorkspaceBridge>();
    /**
     * Bridges seen closing. A bridge ID is never reopened, so a list read that
     * raced a close cannot bring one back.
     */
    const closedIds = new Set<string>();
    const closing = new Set<string>();
    const closeErrors = new Map<string, string>();
    let attaching: readonly string[] = NO_BUS_IDS;
    let usbError: HappyAgentDeviceBridgesSnapshot["usbError"];
    let workspaceToLocal = FORM_IDLE;
    let localToWorkspace = FORM_IDLE;
    let controller: AbortController | undefined;
    let pending: AbortController | undefined;
    let hostStop: (() => void) | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let snapshot: HappyAgentDeviceBridgesSnapshot = {
        support,
        host,
        bridges: NO_ITEMS,
        attaching,
        workspaceToLocal,
        localToWorkspace,
    };

    const publish = (): void => {
        const bridges = itemsReuse(snapshot.bridges, itemsProject());
        snapshot = {
            support,
            ...(capabilities ? { capabilities } : {}),
            ...(readError === undefined ? {} : { error: readError }),
            host,
            ...(hostState ? { usb: hostState.usb } : {}),
            bridges,
            attaching,
            ...(usbError ? { usbError } : {}),
            workspaceToLocal,
            localToWorkspace,
        };
        for (const listener of listeners) listener();
    };

    const itemsProject = (): HappyAgentDeviceBridgeItem[] => {
        const items: HappyAgentDeviceBridgeItem[] = [];
        const joined = new Set<string>();
        for (const local of hostState?.bridges ?? []) {
            if (local.workspaceId !== workspaceId) continue;
            const remote =
                local.kind !== "localToWorkspace" && local.bridgeId !== null
                    ? daemonBridges.get(local.bridgeId)
                    : undefined;
            if (remote) joined.add(remote.id);
            items.push(localItem(local, remote));
        }
        for (const remote of daemonBridges.values()) {
            if (joined.has(remote.id)) continue;
            const item = remoteItem(remote);
            if (item) items.push(item);
        }
        return items;
    };

    const localItem = (
        local: HappyAgentLocalBridge,
        remote: WorkspaceBridge | undefined,
    ): HappyAgentDeviceBridgeItem => {
        const base = {
            id: local.id,
            name: local.name,
            heldHere: true,
            status: closing.has(local.id) ? ("closing" as const) : local.status,
            error: closeErrors.get(local.id) ?? local.error,
        };
        switch (local.kind) {
            case "usb":
                return {
                    ...base,
                    kind: "usb",
                    busId: local.busId,
                    vendorId: local.vendorId,
                    productId: local.productId,
                    bluetooth: local.bluetooth,
                    heldInterfaces: local.heldInterfaces,
                };
            case "workspaceToLocal":
                return {
                    ...base,
                    kind: "workspaceToLocal",
                    workspacePort: local.workspacePort ?? remote?.port?.port ?? null,
                    localPort: local.localPort,
                    connections: local.connections,
                };
            case "localToWorkspace":
                return {
                    ...base,
                    kind: "localToWorkspace",
                    localPort: local.localPort,
                    workspaceHost: local.workspaceHost,
                    workspacePort: local.workspacePort,
                    connections: local.connections,
                };
        }
    };

    const remoteItem = (remote: WorkspaceBridge): HappyAgentDeviceBridgeItem | undefined => {
        const base = {
            id: remote.id,
            name: remote.name,
            heldHere: false,
            status: closing.has(remote.id) ? ("closing" as const) : ("open" as const),
            error: closeErrors.get(remote.id) ?? null,
        };
        if (remote.kind === "usb" && remote.usb)
            return {
                ...base,
                kind: "usb",
                busId: null,
                vendorId: remote.usb.vendorId,
                productId: remote.usb.productId,
                // Happy Agent describes the device by its class triple only.
                bluetooth:
                    remote.usb.deviceClass === 0xe0 &&
                    remote.usb.deviceSubclass === 0x01 &&
                    remote.usb.deviceProtocol === 0x01,
                heldInterfaces: [],
            };
        if (remote.kind === "port" && remote.port)
            return {
                ...base,
                kind: "workspaceToLocal",
                workspacePort: remote.port.port,
                localPort: null,
                connections: null,
            };
        return undefined;
    };

    const adopt = (list: {
        readonly capabilities: WorkspaceBridgeCapabilities;
        readonly bridges: readonly WorkspaceBridge[];
    }): void => {
        support = "supported";
        readError = undefined;
        capabilities = capabilitiesProject(list.capabilities);
        daemonBridges.clear();
        for (const bridge of list.bridges)
            if (bridge.status === "open" && !closedIds.has(bridge.id))
                daemonBridges.set(bridge.id, bridge);
        publish();
    };

    const reconcile = async (signal: AbortSignal): Promise<void> => {
        const health = await deps.client.getHealth({ signal });
        if (signal.aborted) return;
        if (health.capabilities?.workspaceBridges !== true) {
            unsupported();
            return;
        }
        try {
            const list = await deps.client.listWorkspaceBridges(workspaceId, { signal });
            if (!signal.aborted) adopt(list);
        } catch (error) {
            // A daemon that advertises bridges but lacks the route is treated as
            // the older daemon it effectively is.
            if (error instanceof HappyAgentApiError && error.status === 404) {
                if (!signal.aborted) unsupported();
                return;
            }
            throw error;
        }
    };

    const unsupported = (): void => {
        support = "unsupported";
        readError = undefined;
        capabilities = undefined;
        daemonBridges.clear();
        publish();
    };

    const reconcileRequest = (parent: AbortSignal): void => {
        pending?.abort();
        const own = new AbortController();
        pending = own;
        const signal = AbortSignal.any([parent, own.signal]);
        void reconcile(signal)
            .catch((error: unknown) => {
                if (signal.aborted) return;
                readError = errorText(error);
                publish();
            })
            .finally(() => {
                if (pending === own) pending = undefined;
            });
    };

    const eventApply = (event: HappyAgentUpdate, signal: AbortSignal): void => {
        if (event.kind === "connected") {
            reconcileRequest(signal);
            return;
        }
        if (event.kind !== "event") return;
        const { event: message } = event;
        if (message.type === "bridges.capabilities.updated") {
            reconcileRequest(signal);
            return;
        }
        if (message.type === "bridge.created") {
            const bridge = message.payload.bridge;
            if (
                bridge.workspaceId !== workspaceId ||
                bridge.status !== "open" ||
                closedIds.has(bridge.id)
            )
                return;
            daemonBridges.set(bridge.id, bridge);
            publish();
            return;
        }
        if (message.type === "bridge.updated") {
            const payload = message.payload;
            if (payload.workspaceId !== workspaceId || payload.changes.status !== "closed") return;
            closedRemember(payload.bridgeId);
            closing.delete(payload.bridgeId);
            closeErrors.delete(payload.bridgeId);
            if (daemonBridges.delete(payload.bridgeId)) publish();
        }
    };

    const closedRemember = (bridgeId: string): void => {
        // IDs are never reused, so this only bounds memory over a long session.
        if (closedIds.size >= 1_024) closedIds.clear();
        closedIds.add(bridgeId);
    };

    const hostFollow = (): void => {
        hostStop = deps.host.stateFollow({
            stateReceived(state) {
                host = { status: "ready" };
                hostState = state;
                // A held bridge the host has let go of is no longer closing.
                for (const id of closing)
                    if (!state.bridges.some((bridge) => bridge.id === id) && !daemonBridges.has(id))
                        closing.delete(id);
                publish();
            },
            appOutdated() {
                host = { status: "appOutdated" };
                hostState = undefined;
                publish();
            },
            failed(message) {
                host = { status: "error", message };
                publish();
            },
        });
    };

    const start = (): void => {
        if (controller || listeners.size === 0) return;
        const active = new AbortController();
        controller = active;
        if (!hostStop) hostFollow();
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...BRIDGE_EVENTS],
            })) {
                if (input.kind === "error") {
                    readError = errorText(input.error);
                    publish();
                } else if (input.kind === "bootstrap" || input.kind === "reconcile")
                    reconcileRequest(active.signal);
                else eventApply(input.update, active.signal);
            }
        })()
            .catch((error: unknown) => {
                if (active.signal.aborted) return;
                readError = errorText(error);
                publish();
            })
            .finally(() => {
                if (controller === active) controller = undefined;
                if (!active.signal.aborted && listeners.size > 0) retry = setTimeout(start, 1_000);
            });
    };

    const stop = (): void => {
        pending?.abort();
        pending = undefined;
        controller?.abort();
        controller = undefined;
        hostStop?.();
        hostStop = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
    };

    const ready = (): boolean =>
        support === "supported" && host.status === "ready" && listeners.size > 0;

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            start();
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        usbAttach(busId) {
            if (!ready() || attaching.includes(busId) || hostState?.usb.available !== true) return;
            const device = hostState.usb.devices.find((entry) => entry.busId === busId);
            if (!device) return;
            const capability = device.bluetooth ? capabilities?.bluetooth : capabilities?.usb;
            if (capability?.available !== true) return;
            attaching = [...attaching, busId];
            usbError = undefined;
            publish();
            void deps.host
                .usbAttach({ workspaceId, busId, name: device.name })
                .then(
                    () => {
                        attaching = attaching.filter((id) => id !== busId);
                    },
                    (error: unknown) => {
                        attaching = attaching.filter((id) => id !== busId);
                        usbError = { busId, message: errorText(error) };
                    },
                )
                .finally(publish);
        },
        workspaceToLocalOpen(localPort, workspacePort) {
            if (
                !ready() ||
                workspaceToLocal.pending ||
                capabilities?.workspaceToLocal.available !== true
            )
                return;
            const invalid =
                portInvalid(localPort, "The port on this computer", false) ??
                portInvalid(workspacePort, "The workspace port", true);
            if (invalid) {
                workspaceToLocal = { pending: false, error: invalid };
                publish();
                return;
            }
            workspaceToLocal = { pending: true };
            publish();
            void deps.host
                .workspaceToLocalOpen({ workspaceId, workspacePort, localPort })
                .then(
                    () => {
                        workspaceToLocal = FORM_IDLE;
                    },
                    (error: unknown) => {
                        workspaceToLocal = { pending: false, error: errorText(error) };
                    },
                )
                .finally(publish);
        },
        localToWorkspaceOpen(workspacePort, localPort) {
            if (
                !ready() ||
                localToWorkspace.pending ||
                capabilities?.localToWorkspace.available !== true
            )
                return;
            const invalid =
                portInvalid(workspacePort, "The workspace port", false) ??
                portInvalid(localPort, "The port on this computer", true);
            if (invalid) {
                localToWorkspace = { pending: false, error: invalid };
                publish();
                return;
            }
            localToWorkspace = { pending: true };
            publish();
            void deps.host
                .localToWorkspaceOpen({ workspaceId, localPort, workspacePort })
                .then(
                    () => {
                        localToWorkspace = FORM_IDLE;
                    },
                    (error: unknown) => {
                        localToWorkspace = { pending: false, error: errorText(error) };
                    },
                )
                .finally(publish);
        },
        bridgeClose(id) {
            const item = snapshot.bridges.find((bridge) => bridge.id === id);
            if (!item || item.status === "closing" || listeners.size === 0) return;
            closing.add(id);
            closeErrors.delete(id);
            publish();
            const closed = item.heldHere
                ? deps.host.bridgeClose(id)
                : deps.client
                      .closeWorkspaceBridge(workspaceId, id, { mutationId: crypto.randomUUID() })
                      .then(() => undefined);
            void closed.then(
                () => {
                    // The host's next state, or Happy Agent's close event, removes it.
                },
                (error: unknown) => {
                    closing.delete(id);
                    // Already closed is what was asked for.
                    if (!(error instanceof HappyAgentApiError && error.status === 404))
                        closeErrors.set(id, errorText(error));
                    publish();
                },
            );
        },
        [Symbol.dispose]() {
            stop();
            listeners.clear();
        },
    };
}

function capabilitiesProject(
    capabilities: WorkspaceBridgeCapabilities,
): HappyAgentDeviceBridgeCapabilities {
    return {
        usb: capabilityProject(capabilities.usb),
        bluetooth: capabilityProject(capabilities.bluetooth),
        workspaceToLocal: capabilityProject(capabilities.workspaceToLocal),
        localToWorkspace: capabilityProject(capabilities.localToWorkspace),
    };
}

/** An unknown reason code is still a reason: the capability is unavailable and says why. */
function capabilityProject(
    capability: WorkspaceBridgeCapability,
): HappyAgentDeviceBridgeCapability {
    if (capability.available && capability.reason === null) return { available: true };
    return {
        available: false,
        reason: capability.reason?.message ?? "This is not available for this workspace.",
    };
}

function portInvalid(port: number, label: string, zeroAllowed: boolean): string | undefined {
    if (Number.isInteger(port) && port >= (zeroAllowed ? 0 : 1) && port <= 65_535) return undefined;
    return `${label} must be a number from ${zeroAllowed ? "0" : "1"} to 65535.`;
}

/** Keeps every unchanged item's object, so a list re-renders only the rows that moved. */
function itemsReuse(
    previous: readonly HappyAgentDeviceBridgeItem[],
    next: readonly HappyAgentDeviceBridgeItem[],
): readonly HappyAgentDeviceBridgeItem[] {
    if (next.length === 0) return NO_ITEMS;
    const byId = new Map(previous.map((item) => [item.id, item]));
    let changed = previous.length !== next.length;
    const items = next.map((item, index) => {
        const before = byId.get(item.id);
        const kept = before && itemSame(before, item) ? before : item;
        if (kept !== previous[index]) changed = true;
        return kept;
    });
    return changed ? items : previous;
}

function itemSame(left: HappyAgentDeviceBridgeItem, right: HappyAgentDeviceBridgeItem): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
