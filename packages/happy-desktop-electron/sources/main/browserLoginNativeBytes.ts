import koffi from "koffi";

/**
 * Copies native bytes into a fresh Buffer the caller owns and can wipe.
 * Electron's V8 memory cage forbids external ArrayBuffers, so `koffi.view`
 * aborts the whole process there. Decoding a fixed-length array copies into
 * a caged Uint8Array instead, on every platform.
 */
export function browserLoginNativeBytesCopy(pointer: unknown, length: number): Buffer {
    if (length === 0) return Buffer.alloc(0);
    const bytes: unknown = koffi.decode(pointer, koffi.array("uint8_t", length, "Typed"));
    if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
        if (bytes instanceof Uint8Array) bytes.fill(0);
        throw new Error("Native bytes could not be copied.");
    }
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length);
}
