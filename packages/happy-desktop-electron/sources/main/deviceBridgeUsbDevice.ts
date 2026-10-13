import { createRequire } from "node:module";
import type * as UsbModule from "usb";
import type { Device, Interface, LibUSBException } from "usb";
import type { HappyAgentLocalUsb, HappyAgentLocalUsbDevice } from "happy-desktop-state";
import type {
    UsbExportDevice,
    UsbExportEndpoint,
    UsbExportResult,
    UsbExportTransfer,
} from "./deviceBridgeUsbExport";
import { URB_STATUS, type UsbipDeviceRecord, type UsbipSpeed } from "./deviceBridgeUsbip";

type Usb = typeof UsbModule;

/** Why one device could not be opened, and whether trying again could change that. */
export class LocalUsbError extends Error {
    constructor(
        message: string,
        readonly permanent: boolean,
    ) {
        super(message);
        this.name = "LocalUsbError";
    }
}

/** One device opened for export, with its interfaces claimed where they were free. */
export interface LocalUsbOpened {
    readonly device: UsbExportDevice;
    readonly description: HappyAgentLocalUsbDevice;
    /** Interfaces this computer's own drivers kept, which the workspace cannot use. */
    heldInterfaces(): readonly number[];
    /** Called when the held interfaces change, after the workspace picks a configuration. */
    onHeldChange(listener: () => void): void;
    /** Called once when the device is unplugged. */
    onDetached(listener: () => void): void;
    /** Cancels its transfers, releases its interfaces, and closes it. */
    close(): Promise<void>;
}

/** The USB devices plugged into this computer, and the opening of one for export. */
export interface LocalUsbDevices {
    get(): HappyAgentLocalUsb;
    /** Called after every change; watching for devices starts with the first listener. */
    subscribe(listener: () => void): () => void;
    open(busId: string): Promise<LocalUsbOpened>;
}

const USB_CLASS_HUB = 0x09;
const USB_CLASS_WIRELESS = 0xe0;
const TRANSFER_TYPE_ISOCHRONOUS = 1;
const TRANSFER_TYPE_BULK = 2;
const TRANSFER_TYPE_INTERRUPT = 3;
/** `bMaxPacketSize0` of a SuperSpeed device is an exponent: 2⁹ = 512 bytes. */
const SUPER_SPEED_CONTROL_EXPONENT = 9;
const SPEED_LOW: UsbipSpeed = 1;
const SPEED_FULL: UsbipSpeed = 2;
const SPEED_HIGH: UsbipSpeed = 3;
const SPEED_SUPER: UsbipSpeed = 5;
/** Releasing a device waits this long for cancelled transfers to come back. */
const CLOSE_DRAIN_MS = 2_000;

let loaded: { readonly usb: Usb } | { readonly reason: string } | undefined;

/**
 * node-usb, loaded on first use. libusb is a native library this app does not
 * own: it may be missing or fail to start, and then USB is simply unavailable
 * here rather than the app failing to start.
 */
function usbLoad(): { readonly usb: Usb } | { readonly reason: string } {
    if (loaded) return loaded;
    try {
        const usb = createRequire(import.meta.url)("usb") as Usb;
        loaded =
            usb.usb.INIT_ERROR || typeof usb.getDeviceList !== "function"
                ? { reason: "USB could not be started on this computer." }
                : { usb };
    } catch {
        loaded = { reason: "USB is not available in this version of Happy." };
    }
    return loaded;
}

/**
 * The device's USB/IP bus ID: its bus and the hub ports leading to it, as
 * Linux names them (`1-2.3`). That stays the same for as long as the device
 * stays plugged into the same port.
 */
function busIdOf(device: Device): string {
    const ports = device.portNumbers;
    return ports && ports.length > 0
        ? `${String(device.busNumber)}-${ports.join(".")}`
        : `${String(device.busNumber)}:${String(device.deviceAddress)}`;
}

function hex4(value: number): string {
    return value.toString(16).padStart(4, "0");
}

/** A USB Bluetooth controller: the device, or one of its interfaces, is class e0/01/01. */
function bluetoothIs(device: Device): boolean {
    const descriptor = device.deviceDescriptor;
    if (
        descriptor.bDeviceClass === USB_CLASS_WIRELESS &&
        descriptor.bDeviceSubClass === 0x01 &&
        descriptor.bDeviceProtocol === 0x01
    )
        return true;
    try {
        return (
            device.configDescriptor?.interfaces.some((alternates) =>
                alternates.some(
                    (setting) =>
                        setting.bInterfaceClass === USB_CLASS_WIRELESS &&
                        setting.bInterfaceSubClass === 0x01 &&
                        setting.bInterfaceProtocol === 0x01,
                ),
            ) ?? false
        );
    } catch {
        return false;
    }
}

/**
 * The speed the device runs at, which the workspace's kernel needs to attach it
 * to a port of that speed.
 *
 * libusb knows it, but node-usb does not pass it on, so it is read off what the
 * speeds force on a device's descriptors: a SuperSpeed control endpoint is 512
 * bytes, and a bulk endpoint is exactly 512 bytes at high speed, 1024 at
 * SuperSpeed, and at most 64 at full speed. A device that shows none of these
 * is taken as full speed, which every USB 2 port also carries.
 */
function speedOf(device: Device): UsbipSpeed {
    const descriptor = device.deviceDescriptor;
    if (descriptor.bMaxPacketSize0 === SUPER_SPEED_CONTROL_EXPONENT) return SPEED_SUPER;
    let endpoints: { readonly bmAttributes: number; readonly wMaxPacketSize: number }[] = [];
    try {
        endpoints =
            device.configDescriptor?.interfaces.flatMap((alternates) =>
                alternates.flatMap((setting) => setting.endpoints),
            ) ?? [];
    } catch {
        // A configuration that cannot be read leaves only the device descriptor.
    }
    let bulk = false;
    for (const endpoint of endpoints) {
        const type = endpoint.bmAttributes & 0x03;
        const size = endpoint.wMaxPacketSize & 0x7ff;
        const extraTransactions = (endpoint.wMaxPacketSize >> 11) & 0x03;
        if (type === TRANSFER_TYPE_BULK) {
            if (size === 1024) return SPEED_SUPER;
            if (size === 512) return SPEED_HIGH;
            bulk = true;
        } else if (
            extraTransactions > 0 ||
            (type === TRANSFER_TYPE_INTERRUPT && size > 64) ||
            (type === TRANSFER_TYPE_ISOCHRONOUS && size > 1023)
        )
            return SPEED_HIGH;
    }
    if (
        !bulk &&
        descriptor.bcdUSB < 0x0200 &&
        descriptor.bMaxPacketSize0 === 8 &&
        endpoints.every(
            (endpoint) =>
                (endpoint.bmAttributes & 0x03) === TRANSFER_TYPE_INTERRUPT &&
                (endpoint.wMaxPacketSize & 0x7ff) <= 8,
        )
    )
        return SPEED_LOW;
    return SPEED_FULL;
}

/** A libusb transfer status or error number, as the Linux URB status it stands for. */
function urbStatusOf(error: LibUSBException | undefined, usb: Usb): number {
    if (!error) return URB_STATUS.ok;
    const bindings = usb.usb;
    switch (error.errno) {
        case bindings.LIBUSB_TRANSFER_TIMED_OUT:
        case bindings.LIBUSB_ERROR_TIMEOUT:
            return URB_STATUS.timedOut;
        case bindings.LIBUSB_TRANSFER_CANCELLED:
            return URB_STATUS.unlinked;
        case bindings.LIBUSB_TRANSFER_STALL:
        case bindings.LIBUSB_ERROR_PIPE:
            return URB_STATUS.stall;
        case bindings.LIBUSB_TRANSFER_NO_DEVICE:
        case bindings.LIBUSB_ERROR_NO_DEVICE:
            return URB_STATUS.noDevice;
        case bindings.LIBUSB_TRANSFER_OVERFLOW:
        case bindings.LIBUSB_ERROR_OVERFLOW:
            return URB_STATUS.overflow;
        default:
            return URB_STATUS.protocol;
    }
}

const NOT_CANCELLABLE: UsbExportTransfer = { cancel: () => undefined };

/** Creates the view of this computer's USB devices. Nothing is loaded until it is used. */
export function localUsbDevicesCreate(): LocalUsbDevices {
    const listeners = new Set<() => void>();
    /** Names read from devices, by bus and address, which a replug changes. */
    const names = new Map<
        string,
        { readonly name: string; readonly manufacturer: string | null }
    >();
    const nameReading = new Set<string>();
    let nameQueue: Promise<void> = Promise.resolve();
    const openedDevices = new Map<string, { readonly detached: () => void }>();
    let watching: Usb | undefined;

    const notify = (): void => {
        for (const listener of listeners) listener();
    };

    const keyOf = (device: Device): string =>
        `${String(device.busNumber)}:${String(device.deviceAddress)}`;

    const attached = (): void => notify();
    const detached = (device: Device): void => {
        const key = keyOf(device);
        names.delete(key);
        openedDevices.get(key)?.detached();
        notify();
    };

    /** Hotplug runs while anyone looks at the list or a device is attached. */
    const watchUpdate = (): void => {
        const wanted = listeners.size > 0 || openedDevices.size > 0;
        const state = usbLoad();
        if (wanted && !watching && "usb" in state) {
            watching = state.usb;
            watching.usb.on("attach", attached);
            watching.usb.on("detach", detached);
        } else if (!wanted && watching) {
            watching.usb.off("attach", attached);
            watching.usb.off("detach", detached);
            watching = undefined;
        }
    };

    /**
     * A device's own name for itself, which only the device can say. Reading it
     * opens the device for a moment, one device at a time.
     */
    const nameRead = (device: Device, key: string): void => {
        if (nameReading.has(key)) return;
        nameReading.add(key);
        nameQueue = nameQueue
            .then(async () => {
                const strings = await stringsRead(device);
                nameReading.delete(key);
                const descriptor = device.deviceDescriptor;
                names.set(key, {
                    name:
                        strings.product ??
                        `USB device ${hex4(descriptor.idVendor)}:${hex4(descriptor.idProduct)}`,
                    manufacturer: strings.manufacturer,
                });
                notify();
            })
            .catch(() => {
                nameReading.delete(key);
            });
    };

    const describe = (device: Device): HappyAgentLocalUsbDevice => {
        const descriptor = device.deviceDescriptor;
        const key = keyOf(device);
        const known = names.get(key);
        // An attached device is in a workspace's hands and is not opened again.
        if (!known && !openedDevices.has(key)) nameRead(device, key);
        return {
            busId: busIdOf(device),
            vendorId: hex4(descriptor.idVendor),
            productId: hex4(descriptor.idProduct),
            name:
                known?.name ??
                `USB device ${hex4(descriptor.idVendor)}:${hex4(descriptor.idProduct)}`,
            manufacturer: known?.manufacturer ?? null,
            bluetooth: bluetoothIs(device),
        };
    };

    const devicesList = (usb: Usb): Device[] =>
        usb
            .getDeviceList()
            .filter((device) => device.deviceDescriptor.bDeviceClass !== USB_CLASS_HUB);

    return {
        get() {
            const state = usbLoad();
            if ("reason" in state) return { available: false, reason: state.reason };
            let devices: Device[];
            try {
                devices = devicesList(state.usb);
            } catch {
                return {
                    available: false,
                    reason: "The USB devices of this computer could not be listed.",
                };
            }
            return {
                available: true,
                devices: devices
                    .map(describe)
                    .sort((left, right) =>
                        left.name === right.name
                            ? left.busId.localeCompare(right.busId)
                            : left.name.localeCompare(right.name),
                    ),
            };
        },
        subscribe(listener) {
            listeners.add(listener);
            watchUpdate();
            return () => {
                listeners.delete(listener);
                watchUpdate();
            };
        },
        async open(busId) {
            const state = usbLoad();
            if ("reason" in state) throw new LocalUsbError(state.reason, true);
            const device = devicesList(state.usb).find((candidate) => busIdOf(candidate) === busId);
            if (!device) throw new LocalUsbError("The device is no longer plugged in.", true);
            const key = keyOf(device);
            if (openedDevices.has(key))
                throw new LocalUsbError("This device is already attached to a workspace.", true);
            const description = describe(device);
            const opened = deviceOpen(state.usb, device, busId, description);
            const detachListeners = new Set<() => void>();
            let gone = false;
            openedDevices.set(key, {
                detached: () => {
                    if (gone) return;
                    gone = true;
                    for (const listener of detachListeners) listener();
                },
            });
            watchUpdate();
            return {
                ...opened,
                onDetached: (listener) => {
                    detachListeners.add(listener);
                },
                close: async () => {
                    detachListeners.clear();
                    await opened.close();
                    openedDevices.delete(key);
                    watchUpdate();
                    notify();
                },
            };
        },
    };
}

function stringsRead(
    device: Device,
): Promise<{ readonly product: string | null; readonly manufacturer: string | null }> {
    const descriptor = device.deviceDescriptor;
    if (descriptor.iProduct === 0 && descriptor.iManufacturer === 0)
        return Promise.resolve({ product: null, manufacturer: null });
    return new Promise((resolve) => {
        try {
            device.open(false);
        } catch {
            resolve({ product: null, manufacturer: null });
            return;
        }
        const text = (value: string | undefined): string | null => {
            // eslint-disable-next-line no-control-regex
            const printable = value?.replace(/[\u0000-\u001f\u007f-\u009f]/gu, "").trim();
            return printable ? printable.slice(0, 128) : null;
        };
        device.getStringDescriptor(descriptor.iProduct, (productError, product) => {
            device.getStringDescriptor(
                descriptor.iManufacturer,
                (manufacturerError, manufacturer) => {
                    try {
                        device.close();
                    } catch {
                        // A device unplugged mid-read closes itself.
                    }
                    resolve({
                        product: productError ? null : text(product),
                        manufacturer: manufacturerError ? null : text(manufacturer),
                    });
                },
            );
        });
    });
}

/**
 * Opens one device and claims every interface this computer's own drivers have
 * left free. libusb takes a device whole or not at all on macOS without special
 * entitlements, so an interface a driver holds stays with that driver and is
 * reported rather than taken; a device whose every interface is held cannot be
 * attached at all.
 */
function deviceOpen(
    usb: Usb,
    device: Device,
    busId: string,
    description: HappyAgentLocalUsbDevice,
): Omit<LocalUsbOpened, "onDetached"> {
    const bindings = usb.usb;
    try {
        device.open(true);
    } catch (error) {
        const errno = (error as Partial<LibUSBException>).errno;
        throw new LocalUsbError(
            errno === bindings.LIBUSB_ERROR_ACCESS
                ? process.platform === "darwin"
                    ? "macOS did not let Happy open this device."
                    : "This computer's permissions do not let Happy open this device."
                : errno === bindings.LIBUSB_ERROR_NO_DEVICE
                  ? "The device is no longer plugged in."
                  : "The device could not be opened.",
            true,
        );
    }
    try {
        device.setAutoDetachKernelDriver(true);
    } catch {
        // Only some platforms, and only some processes, may detach a driver.
    }
    const claimed = new Set<number>();
    const held = new Set<number>();
    const heldListeners = new Set<() => void>();
    const inFlight = new Set<UsbModule.Transfer>();
    let closed = false;

    const interfaces = (): Interface[] => device.interfaces ?? [];
    const claimAll = (): void => {
        claimed.clear();
        held.clear();
        for (const candidate of interfaces()) {
            try {
                candidate.claim();
                claimed.add(candidate.interfaceNumber);
            } catch {
                held.add(candidate.interfaceNumber);
            }
        }
        for (const listener of heldListeners) listener();
    };
    const releaseAll = async (): Promise<void> => {
        await Promise.all(
            interfaces()
                .filter((candidate) => claimed.has(candidate.interfaceNumber))
                .map(
                    (candidate) =>
                        new Promise<void>((resolve) => {
                            try {
                                candidate.release(() => resolve());
                            } catch {
                                resolve();
                            }
                        }),
                ),
        );
        claimed.clear();
    };

    claimAll();
    if (interfaces().length > 0 && claimed.size === 0) {
        try {
            device.close();
        } catch {
            // Nothing was claimed, so nothing is pending.
        }
        throw new LocalUsbError(
            `${process.platform === "darwin" ? "macOS" : "This computer"} is using this device, so it cannot be attached to the workspace.`,
            true,
        );
    }

    const submit = (
        endpoint: number,
        type: number,
        buffer: Buffer,
        complete: (status: number, buffer: Buffer, actual: number) => void,
    ): UsbExportTransfer => {
        if (closed) {
            setImmediate(() => complete(URB_STATUS.noDevice, buffer, 0));
            return NOT_CANCELLABLE;
        }
        const transfer: UsbModule.Transfer = new usb.Transfer(
            device,
            endpoint,
            type,
            0,
            (error, data, actual) => {
                inFlight.delete(transfer);
                complete(urbStatusOf(error, usb), data, actual);
            },
        );
        try {
            transfer.submit(buffer);
        } catch (error) {
            setImmediate(() => complete(urbStatusOf(error as LibUSBException, usb), buffer, 0));
            return NOT_CANCELLABLE;
        }
        inFlight.add(transfer);
        return {
            cancel: () => {
                try {
                    transfer.cancel();
                } catch {
                    // Already complete.
                }
            },
        };
    };

    const callbackStatus =
        (done: (status: number) => void) =>
        (error?: LibUSBException): void =>
            done(urbStatusOf(error, usb));

    const record = (): UsbipDeviceRecord => {
        const descriptor = device.deviceDescriptor;
        let configuration: UsbModule.ConfigDescriptor | undefined;
        try {
            configuration = device.configDescriptor;
        } catch {
            configuration = undefined;
        }
        return {
            busId,
            busNumber: device.busNumber,
            deviceNumber: device.deviceAddress,
            speed: speedOf(device),
            vendorId: descriptor.idVendor,
            productId: descriptor.idProduct,
            bcdDevice: descriptor.bcdDevice,
            deviceClass: descriptor.bDeviceClass,
            deviceSubclass: descriptor.bDeviceSubClass,
            deviceProtocol: descriptor.bDeviceProtocol,
            configurationValue: configuration?.bConfigurationValue ?? 0,
            configurationCount: descriptor.bNumConfigurations,
            interfaceCount: configuration?.bNumInterfaces ?? 0,
        };
    };

    const exportDevice: UsbExportDevice = {
        // Read at each import: the workspace may have chosen another configuration.
        get record() {
            return record();
        },
        endpoint(address): UsbExportEndpoint | undefined {
            for (const candidate of interfaces()) {
                const endpoint = candidate.endpoints.find((entry) => entry.address === address);
                if (!endpoint) continue;
                const type = endpoint.transferType;
                return {
                    type:
                        type === TRANSFER_TYPE_BULK
                            ? "bulk"
                            : type === TRANSFER_TYPE_INTERRUPT
                              ? "interrupt"
                              : "isochronous",
                    maxPacketSize: endpoint.descriptor.wMaxPacketSize & 0x7ff,
                    claimed: claimed.has(candidate.interfaceNumber),
                };
            }
            return undefined;
        },
        controlSubmit(setup, data, done) {
            const input = (setup[0]! & 0x80) !== 0;
            // libusb sizes a control transfer by the setup packet's own length.
            const length = setup.readUInt16LE(6);
            const buffer = Buffer.alloc(8 + length);
            setup.copy(buffer, 0, 0, 8);
            if (!input) (data as Buffer).copy(buffer, 8, 0, length);
            return submit(
                0,
                bindings.LIBUSB_TRANSFER_TYPE_CONTROL,
                buffer,
                (status, result, actual) =>
                    done(
                        controlResult(
                            status,
                            input,
                            result,
                            actual,
                            typeof data === "number" ? data : length,
                        ),
                    ),
            );
        },
        transferSubmit(address, type, data, done) {
            const input = (address & 0x80) !== 0;
            const buffer = input ? Buffer.alloc(data as number) : (data as Buffer);
            return submit(
                address,
                type === "bulk"
                    ? bindings.LIBUSB_TRANSFER_TYPE_BULK
                    : bindings.LIBUSB_TRANSFER_TYPE_INTERRUPT,
                buffer,
                (status, result, actual) =>
                    done({
                        status,
                        actualLength: actual,
                        ...(input ? { data: Buffer.from(result.subarray(0, actual)) } : {}),
                    }),
            );
        },
        configurationSet(value, done) {
            let active: number | undefined;
            try {
                active = device.configDescriptor?.bConfigurationValue;
            } catch {
                active = undefined;
            }
            if (active === value) {
                // The workspace's kernel chooses the configuration the device is
                // already in whenever it attaches; changing it would cost every
                // claim, so only the alternate settings go back to their first.
                void Promise.all(
                    interfaces()
                        .filter(
                            (candidate) =>
                                claimed.has(candidate.interfaceNumber) &&
                                candidate.altSetting !== 0,
                        )
                        .map(
                            (candidate) =>
                                new Promise<void>((resolve) =>
                                    candidate.setAltSetting(0, () => resolve()),
                                ),
                        ),
                ).then(() => done(URB_STATUS.ok));
                return;
            }
            void releaseAll().then(() =>
                device.setConfiguration(value === 0 ? -1 : value, (error) => {
                    claimAll();
                    callbackStatus(done)(error);
                }),
            );
        },
        alternateSet(interfaceNumber, alternate, done) {
            const target = interfaces().find(
                (candidate) => candidate.interfaceNumber === interfaceNumber,
            );
            if (!target || !claimed.has(interfaceNumber)) {
                setImmediate(() => done(URB_STATUS.protocol));
                return;
            }
            target.setAltSetting(alternate, callbackStatus(done));
        },
        haltClear(address, done) {
            device.__clearHalt(address, callbackStatus(done));
        },
    };

    return {
        device: exportDevice,
        description,
        heldInterfaces: () => [...held].sort((left, right) => left - right),
        onHeldChange: (listener) => {
            heldListeners.add(listener);
        },
        close: async () => {
            if (closed) return;
            closed = true;
            heldListeners.clear();
            for (const transfer of inFlight) {
                try {
                    transfer.cancel();
                } catch {
                    // Already complete.
                }
            }
            const deadline = Date.now() + CLOSE_DRAIN_MS;
            while (inFlight.size > 0 && Date.now() < deadline)
                await new Promise((resolve) => setTimeout(resolve, 20));
            // A device that never gave its transfers back keeps its handle
            // rather than being closed under them.
            if (inFlight.size > 0) return;
            await releaseAll();
            try {
                device.close();
            } catch {
                // Unplugged devices are closed already.
            }
        },
    };
}

function controlResult(
    status: number,
    input: boolean,
    buffer: Buffer,
    actual: number,
    requested: number,
): UsbExportResult {
    if (!input) return { status, actualLength: actual };
    const length = Math.min(actual, requested);
    return {
        status,
        actualLength: length,
        data: Buffer.from(buffer.subarray(8, 8 + length)),
    };
}
