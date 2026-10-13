import type { HappyAgentDeviceBridgesSnapshot } from "happy-desktop-state";
import { HappyAgentDevicesPanel } from "../../src/HappyAgentDevicesPanel";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-295";

const noop = () => {};

const idle = {
    attaching: [],
    workspaceToLocal: { pending: false },
    localToWorkspace: { pending: false },
} as const;

const allAvailable = {
    usb: { available: true },
    bluetooth: { available: true },
    workspaceToLocal: { available: true },
    localToWorkspace: { available: true },
} as const;

const populated: HappyAgentDeviceBridgesSnapshot = {
    ...idle,
    support: "supported",
    capabilities: allAvailable,
    host: { status: "ready" },
    usb: {
        available: true,
        devices: [
            {
                busId: "1-2",
                vendorId: "0403",
                productId: "6001",
                name: "FT232R USB UART",
                manufacturer: "FTDI",
                bluetooth: false,
            },
            {
                busId: "1-3.1",
                vendorId: "2341",
                productId: "0043",
                name: "Arduino Uno",
                manufacturer: "Arduino SA",
                bluetooth: false,
            },
            {
                busId: "2-1",
                vendorId: "0a12",
                productId: "0001",
                name: "CSR8510 A10",
                manufacturer: null,
                bluetooth: true,
            },
        ],
    },
    bridges: [
        {
            kind: "usb",
            id: "b1",
            name: "FT232R USB UART",
            heldHere: true,
            status: "open",
            error: null,
            busId: "1-2",
            vendorId: "0403",
            productId: "6001",
            bluetooth: false,
            heldInterfaces: [],
        },
        {
            kind: "workspaceToLocal",
            id: "b2",
            name: "localhost:5432 on studio-mac",
            heldHere: true,
            status: "open",
            error: null,
            workspacePort: 5432,
            localPort: 5432,
            connections: 2,
        },
        {
            kind: "localToWorkspace",
            id: "b3",
            name: "localhost:3000",
            heldHere: true,
            status: "reconnecting",
            error: "The workspace’s machine stopped answering.",
            localPort: 3000,
            workspaceHost: "localhost",
            workspacePort: 3000,
            connections: 0,
        },
        {
            kind: "workspaceToLocal",
            id: "b4",
            name: "localhost:8080 on travel-laptop",
            heldHere: false,
            status: "open",
            error: null,
            workspacePort: 8080,
            localPort: null,
            connections: null,
        },
    ],
};

const failures: HappyAgentDeviceBridgesSnapshot = {
    ...populated,
    attaching: ["1-3.1"],
    usbError: {
        busId: "2-1",
        message: "macOS is using this device, so it cannot be attached to the workspace.",
    },
    workspaceToLocal: { pending: false, error: "Port 5432 in the workspace is already in use." },
    bridges: [
        {
            kind: "usb",
            id: "b5",
            name: "Logitech USB Receiver",
            heldHere: true,
            status: "failed",
            error: "The workspace’s machine cannot load the USB/IP driver.",
            busId: "1-4",
            vendorId: "046d",
            productId: "c52b",
            bluetooth: false,
            heldInterfaces: [0, 1],
        },
    ],
};

const checking: HappyAgentDeviceBridgesSnapshot = {
    ...idle,
    support: "checking",
    host: { status: "connecting" },
    bridges: [],
};

const unavailable: HappyAgentDeviceBridgesSnapshot = {
    ...idle,
    support: "supported",
    capabilities: {
        usb: {
            available: false,
            reason: "The workspace’s machine has no vhci_hcd kernel module.",
        },
        bluetooth: {
            available: false,
            reason: "The workspace’s machine has no vhci_hcd kernel module.",
        },
        workspaceToLocal: { available: true },
        localToWorkspace: { available: true },
    },
    host: { status: "ready" },
    usb: { available: false, reason: "USB devices cannot be read on this Mac." },
    bridges: [],
};

const appOutdated: HappyAgentDeviceBridgesSnapshot = {
    ...idle,
    support: "supported",
    capabilities: allAvailable,
    host: { status: "appOutdated" },
    bridges: [],
};

const unsupported: HappyAgentDeviceBridgesSnapshot = {
    ...idle,
    support: "unsupported",
    host: { status: "ready" },
    bridges: [],
};

function Panel(props: { devices: HappyAgentDeviceBridgesSnapshot }) {
    return (
        <div style={{ display: "flex", height: "640px", width: "320px" }}>
            <HappyAgentDevicesPanel
                devices={props.devices}
                onBridgeClose={noop}
                onLocalToWorkspaceOpen={noop}
                onUsbAttach={noop}
                onWorkspaceToLocalOpen={noop}
            />
        </div>
    );
}

export function HappyAgentDevicesPanelPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A remote workspace's Devices tab: what the workspace's machine can bridge, this Mac's USB devices and Bluetooth adapters, port forwarding in both directions, and every open bridge."
            title="HappyAgentDevicesPanel"
        >
            <Specimen
                detail="devices plugged in, one attached, ports forwarded both ways, and one bridge another device holds"
                label="Populated"
                number="01"
                stage="surface"
            >
                <Panel devices={populated} />
            </Specimen>

            <Specimen
                detail="an attach in flight, a refused attach, a refused forward, and a stopped bridge"
                label="Failures"
                number="02"
                stage="surface"
            >
                <Panel devices={failures} />
            </Specimen>

            <Specimen
                detail="before Happy Agent and this Mac have answered"
                label="Checking"
                number="03"
                stage="surface"
            >
                <Panel devices={checking} />
            </Specimen>

            <Specimen
                detail="the workspace's machine cannot take USB, and this Mac cannot read it"
                label="Unavailable"
                number="04"
                stage="surface"
            >
                <Panel devices={unavailable} />
            </Specimen>

            <Specimen
                detail="a renderer newer than the installed app"
                label="App outdated"
                number="05"
                stage="surface"
            >
                <Panel devices={appOutdated} />
            </Specimen>

            <Specimen
                detail="the workspace's Happy Agent predates bridges"
                label="Unsupported"
                number="06"
                stage="surface"
            >
                <Panel devices={unsupported} />
            </Specimen>
        </ComponentPage>
    );
}
