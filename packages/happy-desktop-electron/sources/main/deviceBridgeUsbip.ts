/**
 * The USB/IP wire format, from the exporter's side: what a USB/IP server reads
 * and writes for exactly one device. Every field is big-endian, as USB/IP
 * defines it; the eight-byte control setup inside a submit is the USB setup
 * packet itself and stays little-endian.
 */

export const USBIP_VERSION = 0x0111;
const OP_REQ_IMPORT = 0x8003;
const OP_REP_IMPORT = 0x0003;
const OP_HEADER_BYTES = 8;
const BUS_ID_BYTES = 32;
const IMPORT_REQUEST_BYTES = OP_HEADER_BYTES + BUS_ID_BYTES;
/** `struct usbip_usb_device`: path, bus ID, numbers, identifiers, and class bytes. */
const DEVICE_BYTES = 312;
const PATH_BYTES = 256;

export const USBIP_CMD_SUBMIT = 1;
export const USBIP_CMD_UNLINK = 2;
const USBIP_RET_SUBMIT = 3;
const USBIP_RET_UNLINK = 4;
/** Every command and reply header is this long, whatever it carries. */
const URB_HEADER_BYTES = 48;
const ISO_DESCRIPTOR_BYTES = 16;
/** A non-isochronous submit says so with either of these packet counts. */
const NO_ISO_PACKETS = 0xffffffff;
/** No transfer this server will carry is larger; anything bigger is a broken stream. */
export const USBIP_MAX_TRANSFER_BYTES = 64 * 1024 * 1024;
const MAX_ISO_PACKETS = 1024;

export const USBIP_DIR_OUT = 0;
export const USBIP_DIR_IN = 1;

/** Linux URB status values the kernel's USB/IP client understands. */
export const URB_STATUS = {
    ok: 0,
    /** ENOENT: the transfer was killed. */
    killed: -2,
    /** ENODEV: the device is gone. */
    noDevice: -19,
    /** EPIPE: the endpoint stalled. */
    stall: -32,
    /** EPROTO: the transfer failed. */
    protocol: -71,
    /** EOVERFLOW: the device sent more than was asked for. */
    overflow: -75,
    /** ECONNRESET: the transfer was unlinked. */
    unlinked: -104,
    /** ETIMEDOUT */
    timedOut: -110,
} as const;

/** The kernel's `usb_device_speed`. */
export type UsbipSpeed = 1 | 2 | 3 | 4 | 5 | 6;

/** The device an import answers with, as the kernel attaches it. */
export interface UsbipDeviceRecord {
    readonly busId: string;
    readonly busNumber: number;
    readonly deviceNumber: number;
    readonly speed: UsbipSpeed;
    readonly vendorId: number;
    readonly productId: number;
    readonly bcdDevice: number;
    readonly deviceClass: number;
    readonly deviceSubclass: number;
    readonly deviceProtocol: number;
    readonly configurationValue: number;
    readonly configurationCount: number;
    readonly interfaceCount: number;
}

/** `OP_REQ_IMPORT`, once its 40 bytes have arrived. */
export function usbipImportRequestParse(
    bytes: Buffer,
):
    | { readonly kind: "incomplete" }
    | { readonly kind: "malformed" }
    | { readonly kind: "request"; readonly busId: string; readonly length: number } {
    if (bytes.length < IMPORT_REQUEST_BYTES) return { kind: "incomplete" };
    if (bytes.readUInt16BE(0) !== USBIP_VERSION || bytes.readUInt16BE(2) !== OP_REQ_IMPORT)
        return { kind: "malformed" };
    const field = bytes.subarray(OP_HEADER_BYTES, IMPORT_REQUEST_BYTES);
    const end = field.indexOf(0);
    return {
        kind: "request",
        busId: field.subarray(0, end < 0 ? BUS_ID_BYTES : end).toString("latin1"),
        length: IMPORT_REQUEST_BYTES,
    };
}

/** `OP_REP_IMPORT`: the header and device on success, the header alone on refusal. */
export function usbipImportReplyEncode(device: UsbipDeviceRecord | undefined): Buffer {
    const reply = Buffer.alloc(device ? OP_HEADER_BYTES + DEVICE_BYTES : OP_HEADER_BYTES);
    reply.writeUInt16BE(USBIP_VERSION, 0);
    reply.writeUInt16BE(OP_REP_IMPORT, 2);
    reply.writeUInt32BE(device ? 0 : 1, 4);
    if (!device) return reply;
    const record = reply.subarray(OP_HEADER_BYTES);
    // The path is the exporter's own name for the device; nothing reads it but people.
    record.write(`/happy/usb/${device.busId}`, 0, PATH_BYTES - 1, "latin1");
    record.write(device.busId, PATH_BYTES, BUS_ID_BYTES - 1, "latin1");
    record.writeUInt32BE(device.busNumber, 288);
    record.writeUInt32BE(device.deviceNumber, 292);
    record.writeUInt32BE(device.speed, 296);
    record.writeUInt16BE(device.vendorId, 300);
    record.writeUInt16BE(device.productId, 302);
    record.writeUInt16BE(device.bcdDevice, 304);
    record.writeUInt8(device.deviceClass, 306);
    record.writeUInt8(device.deviceSubclass, 307);
    record.writeUInt8(device.deviceProtocol, 308);
    record.writeUInt8(device.configurationValue, 309);
    record.writeUInt8(device.configurationCount, 310);
    record.writeUInt8(device.interfaceCount, 311);
    return reply;
}

export interface UsbipSubmit {
    readonly kind: "submit";
    readonly seqnum: number;
    readonly direction: typeof USBIP_DIR_OUT | typeof USBIP_DIR_IN;
    /** The endpoint number, without its direction bit. */
    readonly endpoint: number;
    readonly transferFlags: number;
    readonly transferLength: number;
    readonly interval: number;
    /** Isochronous packet count; zero for every other transfer. */
    readonly isoPackets: number;
    readonly setup: Buffer;
    /** The OUT data, empty for IN. */
    readonly data: Buffer;
}

export interface UsbipUnlink {
    readonly kind: "unlink";
    readonly seqnum: number;
    readonly unlinkSeqnum: number;
}

export type UsbipCommand = UsbipSubmit | UsbipUnlink;

/**
 * Reads commands out of the byte stream the client sends after the import.
 * The stream is split anywhere, so bytes wait here until a whole command has
 * arrived; anything that is not a command is a broken stream.
 */
export class UsbipCommandReader {
    #buffer: Buffer = Buffer.alloc(0);

    /** Every whole command the new bytes completed, or an error for a broken stream. */
    push(chunk: Buffer): UsbipCommand[] | Error {
        this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
        const commands: UsbipCommand[] = [];
        for (;;) {
            if (this.#buffer.length < URB_HEADER_BYTES) return commands;
            const header = this.#buffer;
            const command = header.readUInt32BE(0);
            const seqnum = header.readUInt32BE(4);
            if (command === USBIP_CMD_UNLINK) {
                commands.push({ kind: "unlink", seqnum, unlinkSeqnum: header.readUInt32BE(20) });
                this.#buffer = this.#buffer.subarray(URB_HEADER_BYTES);
                continue;
            }
            if (command !== USBIP_CMD_SUBMIT)
                return new Error(`The USB/IP client sent unknown command ${String(command)}.`);
            const directionValue = header.readUInt32BE(12);
            if (directionValue !== USBIP_DIR_OUT && directionValue !== USBIP_DIR_IN)
                return new Error("The USB/IP client sent an unknown transfer direction.");
            const direction = directionValue;
            const transferLength = header.readUInt32BE(24);
            if (transferLength > USBIP_MAX_TRANSFER_BYTES)
                return new Error("The USB/IP client asked for an oversized transfer.");
            const packets = header.readUInt32BE(32);
            const isoPackets = packets === NO_ISO_PACKETS ? 0 : packets;
            if (isoPackets > MAX_ISO_PACKETS)
                return new Error("The USB/IP client sent too many isochronous packets.");
            const dataBytes = direction === USBIP_DIR_OUT ? transferLength : 0;
            const length = URB_HEADER_BYTES + dataBytes + isoPackets * ISO_DESCRIPTOR_BYTES;
            if (this.#buffer.length < length) return commands;
            commands.push({
                kind: "submit",
                seqnum,
                direction,
                endpoint: header.readUInt32BE(16),
                transferFlags: header.readUInt32BE(20),
                transferLength,
                interval: header.readUInt32BE(36),
                isoPackets,
                setup: Buffer.from(header.subarray(40, 48)),
                data: Buffer.from(header.subarray(URB_HEADER_BYTES, URB_HEADER_BYTES + dataBytes)),
            });
            this.#buffer = this.#buffer.subarray(length);
        }
    }
}

/**
 * `USBIP_RET_SUBMIT` with its IN data. The reply's device, direction, and
 * endpoint stay zero, as the kernel's own exporter sends them: the client
 * matches a reply to its submit by sequence number alone.
 */
export function usbipSubmitReplyEncode(reply: {
    readonly seqnum: number;
    readonly status: number;
    readonly actualLength: number;
    readonly data?: Buffer;
}): Buffer {
    const data = reply.data ?? Buffer.alloc(0);
    const encoded = Buffer.alloc(URB_HEADER_BYTES + data.length);
    encoded.writeUInt32BE(USBIP_RET_SUBMIT, 0);
    encoded.writeUInt32BE(reply.seqnum, 4);
    encoded.writeInt32BE(reply.status, 20);
    encoded.writeUInt32BE(reply.actualLength, 24);
    data.copy(encoded, URB_HEADER_BYTES);
    return encoded;
}

/** `USBIP_RET_UNLINK`. */
export function usbipUnlinkReplyEncode(seqnum: number, status: number): Buffer {
    const encoded = Buffer.alloc(URB_HEADER_BYTES);
    encoded.writeUInt32BE(USBIP_RET_UNLINK, 0);
    encoded.writeUInt32BE(seqnum, 4);
    encoded.writeInt32BE(status, 20);
    return encoded;
}
