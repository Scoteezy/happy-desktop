import { describe, expect, it } from "vitest";
import {
    usbExportCreate,
    type UsbExportDevice,
    type UsbExportEndpoint,
    type UsbExportResult,
} from "./deviceBridgeUsbExport";
import { URB_STATUS, type UsbipDeviceRecord } from "./deviceBridgeUsbip";

const record: UsbipDeviceRecord = {
    busId: "1-2.3",
    busNumber: 1,
    deviceNumber: 7,
    speed: 2,
    vendorId: 0x2341,
    productId: 0x0043,
    bcdDevice: 0x0001,
    deviceClass: 0xe0,
    deviceSubclass: 0x01,
    deviceProtocol: 0x01,
    configurationValue: 1,
    configurationCount: 1,
    interfaceCount: 2,
};

function importRequest(busId: string): Buffer {
    const bytes = Buffer.alloc(40);
    bytes.writeUInt16BE(0x0111, 0);
    bytes.writeUInt16BE(0x8003, 2);
    bytes.write(busId, 8, "latin1");
    return bytes;
}

function submit(options: {
    readonly seqnum: number;
    readonly direction: 0 | 1;
    readonly endpoint: number;
    readonly length: number;
    readonly flags?: number;
    readonly setup?: Buffer;
    readonly data?: Buffer;
}): Buffer {
    const data =
        options.direction === 0 ? (options.data ?? Buffer.alloc(options.length)) : Buffer.alloc(0);
    const bytes = Buffer.alloc(48 + data.length);
    bytes.writeUInt32BE(1, 0);
    bytes.writeUInt32BE(options.seqnum, 4);
    bytes.writeUInt32BE(0x00010007, 8);
    bytes.writeUInt32BE(options.direction, 12);
    bytes.writeUInt32BE(options.endpoint, 16);
    bytes.writeUInt32BE(options.flags ?? 0, 20);
    bytes.writeUInt32BE(options.length, 24);
    bytes.writeUInt32BE(0xffffffff, 32);
    (options.setup ?? Buffer.alloc(8)).copy(bytes, 40);
    data.copy(bytes, 48);
    return bytes;
}

function unlink(seqnum: number, target: number): Buffer {
    const bytes = Buffer.alloc(48);
    bytes.writeUInt32BE(2, 0);
    bytes.writeUInt32BE(seqnum, 4);
    bytes.writeUInt32BE(target, 20);
    return bytes;
}

function setup(requestType: number, request: number, value: number, index: number, length: number) {
    const bytes = Buffer.alloc(8);
    bytes.writeUInt8(requestType, 0);
    bytes.writeUInt8(request, 1);
    bytes.writeUInt16LE(value, 2);
    bytes.writeUInt16LE(index, 4);
    bytes.writeUInt16LE(length, 6);
    return bytes;
}

interface Reply {
    readonly command: number;
    readonly seqnum: number;
    readonly status: number;
    readonly actualLength: number;
    readonly data: Buffer;
}

/**
 * Splits what the exporter sent after its import reply into replies. Only a
 * reply to an IN submit carries data, which only the submit's sender knows.
 */
function replies(sent: readonly Buffer[], inbound: ReadonlySet<number> = new Set()): Reply[] {
    let stream = Buffer.concat(sent);
    const parsed: Reply[] = [];
    while (stream.length >= 48) {
        const command = stream.readUInt32BE(0);
        const actualLength = command === 3 ? stream.readUInt32BE(24) : 0;
        const dataLength = command === 3 && inbound.has(stream.readUInt32BE(4)) ? actualLength : 0;
        parsed.push({
            command,
            seqnum: stream.readUInt32BE(4),
            status: stream.readInt32BE(20),
            actualLength,
            data: stream.subarray(48, 48 + dataLength),
        });
        stream = stream.subarray(48 + dataLength);
    }
    return parsed;
}

/** A device whose every transfer waits until the test completes it. */
function scriptedDevice(endpoints: Readonly<Record<number, UsbExportEndpoint>> = {}) {
    const pending: {
        readonly kind: "control" | "transfer";
        readonly address: number;
        readonly data: Buffer | number;
        readonly done: (result: UsbExportResult) => void;
        cancelled: boolean;
    }[] = [];
    const calls: string[] = [];
    const device: UsbExportDevice = {
        record,
        endpoint: (address) => endpoints[address],
        controlSubmit(_setup, data, done) {
            const entry = { kind: "control" as const, address: 0, data, done, cancelled: false };
            pending.push(entry);
            return { cancel: () => (entry.cancelled = true) };
        },
        transferSubmit(address, _type, data, done) {
            const entry = { kind: "transfer" as const, address, data, done, cancelled: false };
            pending.push(entry);
            return { cancel: () => (entry.cancelled = true) };
        },
        configurationSet(value, done) {
            calls.push(`configuration ${String(value)}`);
            queueMicrotask(() => done(URB_STATUS.ok));
        },
        alternateSet(interfaceNumber, alternate, done) {
            calls.push(`interface ${String(interfaceNumber)} alternate ${String(alternate)}`);
            queueMicrotask(() => done(URB_STATUS.ok));
        },
        haltClear(address, done) {
            calls.push(`halt ${address.toString(16)}`);
            queueMicrotask(() => done(URB_STATUS.ok));
        },
    };
    return { device, pending, calls };
}

function exportCreate(device: UsbExportDevice) {
    const sent: Buffer[] = [];
    const events: string[] = [];
    const exporter = usbExportCreate(device, {
        send: (bytes) => sent.push(bytes),
        started: () => events.push("started"),
        failed: (message) => events.push(`failed: ${message}`),
    });
    return { exporter, sent, events };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("usbExportCreate", () => {
    it("answers the import of its own device with the device record", () => {
        const { device } = scriptedDevice();
        const { exporter, sent, events } = exportCreate(device);
        const request = importRequest("1-2.3");
        // The request may arrive split anywhere.
        exporter.receive(request.subarray(0, 13));
        expect(sent).toHaveLength(0);
        exporter.receive(request.subarray(13));
        expect(sent).toHaveLength(1);
        const reply = sent[0]!;
        expect(reply.length).toBe(8 + 312);
        expect(reply.readUInt16BE(0)).toBe(0x0111);
        expect(reply.readUInt16BE(2)).toBe(0x0003);
        expect(reply.readUInt32BE(4)).toBe(0);
        const device312 = reply.subarray(8);
        expect(device312.subarray(256, 288).toString("latin1").split("\0")[0]).toBe("1-2.3");
        expect(device312.readUInt32BE(288)).toBe(1);
        expect(device312.readUInt32BE(292)).toBe(7);
        expect(device312.readUInt32BE(296)).toBe(2);
        expect(device312.readUInt16BE(300)).toBe(0x2341);
        expect(device312.readUInt16BE(302)).toBe(0x0043);
        expect([device312[306], device312[307], device312[308]]).toEqual([0xe0, 0x01, 0x01]);
        expect(device312[311]).toBe(2);
        // Started means the kernel is talking to the device, not merely importing it.
        expect(events).toEqual([]);
    });

    it("refuses an import of another device and fails", () => {
        const { device } = scriptedDevice();
        const { exporter, sent, events } = exportCreate(device);
        exporter.receive(importRequest("9-9"));
        expect(sent).toHaveLength(1);
        expect(sent[0]!.length).toBe(8);
        expect(sent[0]!.readUInt32BE(4)).not.toBe(0);
        expect(events).toEqual(["failed: The workspace's machine asked for a different device."]);
    });

    it("runs control transfers both ways and replies with exactly the data read", async () => {
        const { device, pending } = scriptedDevice();
        const { exporter, sent, events } = exportCreate(device);
        exporter.receive(importRequest("1-2.3"));
        sent.length = 0;
        exporter.receive(
            Buffer.concat([
                submit({
                    seqnum: 1,
                    direction: 1,
                    endpoint: 0,
                    length: 18,
                    setup: setup(0x80, 6, 0x0100, 0, 18),
                }),
                submit({
                    seqnum: 2,
                    direction: 0,
                    endpoint: 0,
                    length: 2,
                    setup: setup(0x40, 1, 0, 0, 2),
                    data: Buffer.from([0xaa, 0xbb]),
                }),
            ]),
        );
        expect(events).toEqual(["started"]);
        expect(pending.map((entry) => entry.data)).toEqual([18, Buffer.from([0xaa, 0xbb])]);
        // Completions arrive in any order; each reply carries its own sequence number.
        pending[1]!.done({ status: URB_STATUS.ok, actualLength: 2 });
        pending[0]!.done({ status: URB_STATUS.ok, actualLength: 3, data: Buffer.from([1, 2, 3]) });
        await settle();
        expect(replies(sent, new Set([1]))).toEqual([
            { command: 3, seqnum: 2, status: 0, actualLength: 2, data: Buffer.alloc(0) },
            { command: 3, seqnum: 1, status: 0, actualLength: 3, data: Buffer.from([1, 2, 3]) },
        ]);
    });

    it("refuses transfers on endpoints this computer kept or cannot carry", async () => {
        const { device, pending } = scriptedDevice({
            0x81: { type: "bulk", maxPacketSize: 64, claimed: false },
            0x82: { type: "isochronous", maxPacketSize: 192, claimed: true },
        });
        const { exporter, sent } = exportCreate(device);
        exporter.receive(importRequest("1-2.3"));
        sent.length = 0;
        exporter.receive(
            Buffer.concat([
                submit({ seqnum: 5, direction: 1, endpoint: 1, length: 64 }),
                submit({ seqnum: 6, direction: 1, endpoint: 2, length: 192 }),
                submit({ seqnum: 7, direction: 1, endpoint: 3, length: 64 }),
            ]),
        );
        await settle();
        expect(pending).toHaveLength(0);
        expect(replies(sent).map(({ seqnum, status }) => [seqnum, status])).toEqual([
            [5, URB_STATUS.protocol],
            [6, URB_STATUS.protocol],
            [7, URB_STATUS.stall],
        ]);
    });

    it("answers an unlink in place of the transfer it cancelled", async () => {
        const { device, pending } = scriptedDevice({
            0x81: { type: "interrupt", maxPacketSize: 64, claimed: true },
        });
        const { exporter, sent } = exportCreate(device);
        exporter.receive(importRequest("1-2.3"));
        sent.length = 0;
        exporter.receive(submit({ seqnum: 10, direction: 1, endpoint: 1, length: 64 }));
        exporter.receive(unlink(11, 10));
        expect(pending[0]!.cancelled).toBe(true);
        pending[0]!.done({ status: URB_STATUS.unlinked, actualLength: 0 });
        // An unlink of a transfer already answered is answered at once.
        exporter.receive(unlink(12, 10));
        await settle();
        expect(
            replies(sent).map(({ command, seqnum, status }) => [command, seqnum, status]),
        ).toEqual([
            [4, 11, URB_STATUS.unlinked],
            [4, 12, 0],
        ]);
    });

    it("carries out the requests the host stack must perform itself", async () => {
        const { device, pending, calls } = scriptedDevice();
        const { exporter, sent } = exportCreate(device);
        exporter.receive(importRequest("1-2.3"));
        sent.length = 0;
        exporter.receive(
            Buffer.concat([
                submit({
                    seqnum: 20,
                    direction: 0,
                    endpoint: 0,
                    length: 0,
                    setup: setup(0x00, 0x09, 1, 0, 0),
                }),
                submit({
                    seqnum: 21,
                    direction: 0,
                    endpoint: 0,
                    length: 0,
                    setup: setup(0x01, 0x0b, 1, 2, 0),
                }),
                submit({
                    seqnum: 22,
                    direction: 0,
                    endpoint: 0,
                    length: 0,
                    setup: setup(0x02, 0x01, 0, 0x81, 0),
                }),
                submit({
                    seqnum: 23,
                    direction: 0,
                    endpoint: 0,
                    length: 0,
                    setup: setup(0x23, 0x03, 4, 1, 0),
                }),
            ]),
        );
        await settle();
        expect(pending).toHaveLength(0);
        expect(calls).toEqual(["configuration 1", "interface 2 alternate 1", "halt 81"]);
        expect(replies(sent).map(({ seqnum, status }) => [seqnum, status])).toEqual([
            [20, 0],
            [21, 0],
            [22, 0],
            [23, 0],
        ]);
    });

    it("ends a bulk OUT that fills its last packet with an empty one when asked", async () => {
        const { device, pending } = scriptedDevice({
            0x02: { type: "bulk", maxPacketSize: 64, claimed: true },
        });
        const { exporter, sent } = exportCreate(device);
        exporter.receive(importRequest("1-2.3"));
        sent.length = 0;
        exporter.receive(
            submit({ seqnum: 30, direction: 0, endpoint: 2, length: 128, flags: 0x40 }),
        );
        pending[0]!.done({ status: URB_STATUS.ok, actualLength: 128 });
        expect(pending).toHaveLength(2);
        expect(pending[1]!.data).toEqual(Buffer.alloc(0));
        expect(sent).toHaveLength(0);
        pending[1]!.done({ status: URB_STATUS.ok, actualLength: 0 });
        await settle();
        expect(replies(sent).map(({ seqnum, actualLength }) => [seqnum, actualLength])).toEqual([
            [30, 128],
        ]);
    });

    it("fails on a stream that is not USB/IP and answers nothing after closing", async () => {
        const { device, pending } = scriptedDevice({
            0x81: { type: "bulk", maxPacketSize: 64, claimed: true },
        });
        const { exporter, sent, events } = exportCreate(device);
        exporter.receive(importRequest("1-2.3"));
        exporter.receive(submit({ seqnum: 40, direction: 1, endpoint: 1, length: 64 }));
        sent.length = 0;
        exporter.close();
        expect(pending[0]!.cancelled).toBe(true);
        pending[0]!.done({ status: URB_STATUS.unlinked, actualLength: 0 });
        await settle();
        expect(sent).toHaveLength(0);

        const other = exportCreate(scriptedDevice().device);
        other.exporter.receive(importRequest("1-2.3"));
        const garbage = Buffer.alloc(48);
        garbage.writeUInt32BE(9, 0);
        other.exporter.receive(garbage);
        expect(other.events).toEqual(["failed: The USB/IP client sent unknown command 9."]);
        expect(events).toEqual(["started"]);
    });
});
