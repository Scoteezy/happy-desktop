import {
    URB_STATUS,
    USBIP_DIR_IN,
    UsbipCommandReader,
    usbipImportReplyEncode,
    usbipImportRequestParse,
    usbipSubmitReplyEncode,
    usbipUnlinkReplyEncode,
    type UsbipDeviceRecord,
    type UsbipSubmit,
} from "./deviceBridgeUsbip";

/** How one transfer ended, as a Linux URB status and the bytes it moved. */
export interface UsbExportResult {
    readonly status: number;
    readonly actualLength: number;
    /** IN data, exactly `actualLength` bytes. */
    readonly data?: Buffer;
}

export interface UsbExportTransfer {
    cancel(): void;
}

export type UsbExportEndpointType = "bulk" | "interrupt" | "isochronous";

/** One endpoint of the configuration the device is in now. */
export interface UsbExportEndpoint {
    readonly type: UsbExportEndpointType;
    readonly maxPacketSize: number;
    /** False when this computer's own driver kept the endpoint's interface. */
    readonly claimed: boolean;
}

/**
 * One opened device, as the exporter drives it. The real one is libusb; tests
 * give a scripted one. Every completion arrives asynchronously, after submit
 * has returned.
 */
export interface UsbExportDevice {
    readonly record: UsbipDeviceRecord;
    endpoint(address: number): UsbExportEndpoint | undefined;
    controlSubmit(
        setup: Buffer,
        data: Buffer | number,
        done: (result: UsbExportResult) => void,
    ): UsbExportTransfer;
    transferSubmit(
        address: number,
        type: "bulk" | "interrupt",
        data: Buffer | number,
        done: (result: UsbExportResult) => void,
    ): UsbExportTransfer;
    configurationSet(value: number, done: (status: number) => void): void;
    alternateSet(interfaceNumber: number, alternate: number, done: (status: number) => void): void;
    haltClear(address: number, done: (status: number) => void): void;
}

export interface UsbExportEvents {
    /** Sends bytes of the USB/IP connection to the client, in order. */
    send(bytes: Buffer): void;
    /** The client imported the device and the kernel has started talking to it. */
    started(): void;
    /** The connection is broken and must end. */
    failed(message: string): void;
}

export interface UsbExport {
    receive(bytes: Buffer): void;
    /** Cancels every transfer in flight and answers nothing more. */
    close(): void;
}

/** `URB_ZERO_PACKET`: an OUT transfer that fills its last packet ends with an empty one. */
const URB_ZERO_PACKET = 0x40;

const USB_REQ_CLEAR_FEATURE = 0x01;
const USB_REQ_SET_FEATURE = 0x03;
const USB_REQ_SET_CONFIGURATION = 0x09;
const USB_REQ_SET_INTERFACE = 0x0b;
const USB_RECIP_DEVICE = 0x00;
const USB_RECIP_INTERFACE = 0x01;
const USB_RECIP_ENDPOINT = 0x02;
const USB_RT_PORT = 0x23;
const USB_ENDPOINT_HALT = 0;
const USB_PORT_FEAT_RESET = 4;

interface InFlight {
    readonly transfer: UsbExportTransfer;
    /** The unlink that asked for this transfer back; its reply replaces the submit's. */
    unlinkSeqnum?: number;
}

const NOT_CANCELLABLE: UsbExportTransfer = { cancel: () => undefined };

/**
 * A USB/IP server for exactly one device, over one byte stream.
 *
 * It answers the client's import with the device, then runs every URB the
 * client submits against the real device, all of them concurrently, and
 * replies as each completes. The four requests the kernel's own exporter
 * handles itself — choosing a configuration, an alternate setting, clearing a
 * halt, and resetting the port — are carried out through the host's USB stack
 * instead of being passed through as raw control transfers, which that stack
 * would refuse or misunderstand.
 */
export function usbExportCreate(device: UsbExportDevice, events: UsbExportEvents): UsbExport {
    let phase: "import" | "urb" | "closed" = "import";
    let started = false;
    let pending: Buffer = Buffer.alloc(0);
    const reader = new UsbipCommandReader();
    const inFlight = new Map<number, InFlight>();

    const fail = (message: string): void => {
        if (phase === "closed") return;
        close();
        events.failed(message);
    };

    const complete = (seqnum: number, result: UsbExportResult): void => {
        const entry = inFlight.get(seqnum);
        if (!entry || phase === "closed") return;
        inFlight.delete(seqnum);
        if (entry.unlinkSeqnum !== undefined) {
            events.send(usbipUnlinkReplyEncode(entry.unlinkSeqnum, result.status));
            return;
        }
        events.send(
            usbipSubmitReplyEncode({
                seqnum,
                status: result.status,
                actualLength: result.actualLength,
                ...(result.data ? { data: result.data } : {}),
            }),
        );
    };

    const statusComplete = (seqnum: number) => (status: number) =>
        complete(seqnum, { status, actualLength: 0 });

    const special = (submit: UsbipSubmit): boolean => {
        const requestType = submit.setup[0]!;
        const request = submit.setup[1]!;
        const value = submit.setup.readUInt16LE(2);
        const index = submit.setup.readUInt16LE(4);
        const seqnum = submit.seqnum;
        if (request === USB_REQ_SET_CONFIGURATION && requestType === USB_RECIP_DEVICE) {
            inFlight.set(seqnum, { transfer: NOT_CANCELLABLE });
            device.configurationSet(value & 0xff, statusComplete(seqnum));
            return true;
        }
        if (request === USB_REQ_SET_INTERFACE && requestType === USB_RECIP_INTERFACE) {
            inFlight.set(seqnum, { transfer: NOT_CANCELLABLE });
            device.alternateSet(index & 0xff, value & 0xff, statusComplete(seqnum));
            return true;
        }
        if (
            request === USB_REQ_CLEAR_FEATURE &&
            requestType === USB_RECIP_ENDPOINT &&
            value === USB_ENDPOINT_HALT
        ) {
            inFlight.set(seqnum, { transfer: NOT_CANCELLABLE });
            device.haltClear(index & 0xff, statusComplete(seqnum));
            return true;
        }
        if (
            request === USB_REQ_SET_FEATURE &&
            requestType === USB_RT_PORT &&
            value === USB_PORT_FEAT_RESET
        ) {
            // The client's own root hub resets the port it attached the device
            // to; a real reset here would make this computer re-enumerate the
            // device and end the bridge it is travelling on.
            inFlight.set(seqnum, { transfer: NOT_CANCELLABLE });
            queueMicrotask(() => complete(seqnum, { status: URB_STATUS.ok, actualLength: 0 }));
            return true;
        }
        return false;
    };

    const submit = (command: UsbipSubmit): void => {
        const seqnum = command.seqnum;
        const reply = (result: UsbExportResult) => complete(seqnum, result);
        const refuse = (status: number): void => {
            inFlight.set(seqnum, { transfer: NOT_CANCELLABLE });
            queueMicrotask(() => reply({ status, actualLength: 0 }));
        };
        const input = command.direction === USBIP_DIR_IN;
        if (command.endpoint === 0) {
            if (special(command)) return;
            const transfer = device.controlSubmit(
                command.setup,
                input ? command.transferLength : command.data,
                reply,
            );
            if (!inFlight.has(seqnum) && phase !== "closed") inFlight.set(seqnum, { transfer });
            return;
        }
        const address = (command.endpoint & 0x0f) | (input ? 0x80 : 0);
        const endpoint = device.endpoint(address);
        if (!endpoint) {
            refuse(URB_STATUS.stall);
            return;
        }
        // An interface this computer's driver kept, or a transfer type the
        // host stack cannot carry, fails like a broken pipe would: the
        // workspace's driver sees an error rather than waiting forever.
        if (!endpoint.claimed || endpoint.type === "isochronous") {
            refuse(URB_STATUS.protocol);
            return;
        }
        const zeroPacket =
            !input &&
            endpoint.type === "bulk" &&
            (command.transferFlags & URB_ZERO_PACKET) !== 0 &&
            command.data.length > 0 &&
            command.data.length % endpoint.maxPacketSize === 0;
        const entry: { transfer: UsbExportTransfer; unlinkSeqnum?: number } = {
            transfer: NOT_CANCELLABLE,
        };
        inFlight.set(seqnum, entry);
        entry.transfer = device.transferSubmit(
            address,
            endpoint.type,
            input ? command.transferLength : command.data,
            (result) => {
                if (!zeroPacket || result.status !== URB_STATUS.ok || phase === "closed") {
                    reply(result);
                    return;
                }
                entry.transfer = device.transferSubmit(address, "bulk", Buffer.alloc(0), (empty) =>
                    reply(
                        empty.status === URB_STATUS.ok
                            ? result
                            : { status: empty.status, actualLength: result.actualLength },
                    ),
                );
            },
        );
    };

    const urbReceive = (bytes: Buffer): void => {
        const commands = reader.push(bytes);
        if (commands instanceof Error) {
            fail(commands.message);
            return;
        }
        for (const command of commands) {
            if (phase === "closed") return;
            if (!started) {
                started = true;
                events.started();
            }
            if (command.kind === "submit") {
                submit(command);
                continue;
            }
            const target = inFlight.get(command.unlinkSeqnum);
            if (!target) {
                // Already answered: the kernel's exporter says so with a zero status.
                events.send(usbipUnlinkReplyEncode(command.seqnum, URB_STATUS.ok));
                continue;
            }
            target.unlinkSeqnum = command.seqnum;
            target.transfer.cancel();
        }
    };

    const importReceive = (bytes: Buffer): void => {
        pending = pending.length === 0 ? bytes : Buffer.concat([pending, bytes]);
        const request = usbipImportRequestParse(pending);
        if (request.kind === "incomplete") return;
        if (request.kind === "malformed") {
            fail("The workspace's machine did not ask for the device.");
            return;
        }
        if (request.busId !== device.record.busId) {
            events.send(usbipImportReplyEncode(undefined));
            fail("The workspace's machine asked for a different device.");
            return;
        }
        events.send(usbipImportReplyEncode(device.record));
        phase = "urb";
        const rest = pending.subarray(request.length);
        pending = Buffer.alloc(0);
        if (rest.length > 0) urbReceive(rest);
    };

    const close = (): void => {
        if (phase === "closed") return;
        phase = "closed";
        for (const entry of inFlight.values()) entry.transfer.cancel();
        inFlight.clear();
    };

    return {
        receive(bytes) {
            if (phase === "import") importReceive(bytes);
            else if (phase === "urb") urbReceive(bytes);
        },
        close,
    };
}
