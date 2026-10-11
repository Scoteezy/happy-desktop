import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { UserError } from "../types.js";
import { happyAgentActionFailed, happyAgentUserError } from "./happyAgentSupport.js";
import type { HappyAgentAvatarImage } from "./happyAgentTypes.js";

/** The daemon reads at most this many bytes of an uploaded profile photo. */
export const HAPPY_AGENT_PROFILE_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
/** The daemon refuses to decode a profile photo with more pixels than this. */
export const HAPPY_AGENT_PROFILE_PHOTO_MAX_PIXELS = 25_000_000;
/** The edge of the square a crop is drawn into; the daemon keeps at most this much. */
export const HAPPY_AGENT_PROFILE_PHOTO_SIZE = 512;
/** The largest file opened for cropping, which bounds what is read into memory. */
export const HAPPY_AGENT_PROFILE_PHOTO_SOURCE_MAX_BYTES = 50 * 1024 * 1024;
/** The most pixels opened for cropping, which bounds what is decoded. */
export const HAPPY_AGENT_PROFILE_PHOTO_SOURCE_MAX_PIXELS = 50_000_000;

const FORMAT_MESSAGE = "The profile photo must be a PNG, JPEG, or WebP image.";
const SIZE_MESSAGE = "The profile photo must be no larger than 8 MiB.";
const PIXELS_MESSAGE = "The profile photo must be no larger than 25 megapixels.";
const SOURCE_SIZE_MESSAGE = "Choose a picture no larger than 50 MiB.";
const SOURCE_PIXELS_MESSAGE = "Choose a picture no larger than 50 megapixels.";
const UNREADABLE_MESSAGE =
    "Happy could not read this picture. Try a different PNG, JPEG, or WebP file.";

/** The square to cut out of a picked picture, in its own oriented pixels. */
export interface HappyAgentProfilePhotoCropRegion {
    readonly x: number;
    readonly y: number;
    readonly size: number;
}

/** A picked picture, decoded the right way up and held while it is cropped. */
export interface HappyAgentProfilePhotoCropSource {
    /** An address the picture can be drawn from until it is closed. */
    readonly imageUrl: string;
    readonly width: number;
    readonly height: number;
    /** Draws `region` into a `size`-pixel square and encodes it. */
    crop(region: HappyAgentProfilePhotoCropRegion, size: number): Promise<Blob>;
    close(): void;
}

/**
 * Decoding and drawing pictures, which only a host with an image engine can
 * do. It rejects a picture it cannot decode.
 */
export interface HappyAgentProfilePhotoCodec {
    open(file: Blob): Promise<HappyAgentProfilePhotoCropSource>;
}

/**
 * Checks a file the reader picked before it is decoded for cropping.
 *
 * The file is not ours: its name and the browser's guess at its type say
 * nothing reliable about its bytes. So the encoding is detected from the
 * file's own signature, here at the boundary, and a picture too large to
 * decode comfortably is refused from its header before any pixels exist. A
 * header this cannot measure is left for the decoder to judge.
 */
export async function happyAgentProfilePhotoSourceCheck(file: Blob): Promise<void> {
    if (file.size > HAPPY_AGENT_PROFILE_PHOTO_SOURCE_MAX_BYTES)
        throw new UserError(SOURCE_SIZE_MESSAGE);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = contentTypeOf(bytes);
    if (contentType === undefined) throw new UserError(FORMAT_MESSAGE);
    const size = dimensionsOf(bytes, contentType);
    if (
        size !== undefined &&
        size.width * size.height > HAPPY_AGENT_PROFILE_PHOTO_SOURCE_MAX_PIXELS
    )
        throw new UserError(SOURCE_PIXELS_MESSAGE);
}

/** Why a picked picture could not be opened for cropping. */
export function happyAgentProfilePhotoSourceError(error: unknown): UserError {
    if (error instanceof UserError) return error;
    return new UserError(UNREADABLE_MESSAGE, undefined, error);
}

/**
 * Reads an encoded crop into the picture the daemon accepts, refusing what the
 * daemon would refuse with the same words. The daemon refuses a photo whose
 * declared type disagrees with its bytes, so the type is taken from the bytes;
 * and it answers one with too many pixels with a bare internal error, so the
 * limits are checked here first.
 */
export async function happyAgentProfilePhotoRead(file: Blob): Promise<HappyAgentAvatarImage> {
    if (file.size > HAPPY_AGENT_PROFILE_PHOTO_MAX_BYTES) throw new UserError(SIZE_MESSAGE);
    const data = await file.arrayBuffer();
    const bytes = new Uint8Array(data);
    const contentType = contentTypeOf(bytes);
    if (contentType === undefined) throw new UserError(FORMAT_MESSAGE);
    const size = dimensionsOf(bytes, contentType);
    if (size !== undefined && size.width * size.height > HAPPY_AGENT_PROFILE_PHOTO_MAX_PIXELS)
        throw new UserError(PIXELS_MESSAGE);
    return { contentType, data };
}

/**
 * Why a profile photo change did not happen, in words the reader can act on.
 * The daemon's own message is kept where it already says what was wrong; the
 * statuses whose bodies say nothing useful are given one.
 */
export function happyAgentProfilePhotoError(
    error: unknown,
    change: "upload" | "removal",
): UserError {
    if (error instanceof UserError) return error;
    if (error instanceof HappyAgentApiError) {
        if (error.status === 409)
            return new UserError(
                "The profile changed somewhere else in the meantime. Try again.",
                undefined,
                error,
            );
        if (error.status === 413) return new UserError(SIZE_MESSAGE, undefined, error);
        if (error.status === 401)
            return new UserError(
                "Happy Agent has no saved profile for you yet. Save your name first.",
                undefined,
                error,
            );
        if (error.status === 500)
            return new UserError(
                change === "upload"
                    ? "Happy Agent could not read this image. Try a different PNG, JPEG, or WebP file."
                    : "Happy Agent could not remove the photo.",
                undefined,
                error,
            );
        return happyAgentUserError(error);
    }
    const failure = happyAgentActionFailed(error);
    if (!failure.ok && failure.failure === "offline")
        return new UserError(
            "Happy Agent is unreachable. Try again once it is back.",
            undefined,
            error,
        );
    return happyAgentUserError(error);
}

function contentTypeOf(bytes: Uint8Array): HappyAgentAvatarImage["contentType"] | undefined {
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    )
        return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return "image/jpeg";
    if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP")
        return "image/webp";
    return undefined;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

interface Dimensions {
    readonly width: number;
    readonly height: number;
}

function dimensionsOf(
    bytes: Uint8Array,
    contentType: HappyAgentAvatarImage["contentType"],
): Dimensions | undefined {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    switch (contentType) {
        case "image/png":
            // The first chunk is always IHDR: width and height, big-endian.
            if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return undefined;
            return { width: view.getUint32(16), height: view.getUint32(20) };
        case "image/jpeg":
            return jpegDimensionsOf(bytes, view);
        case "image/webp":
            return webpDimensionsOf(bytes, view);
    }
}

/** Walks the marker segments to the first start-of-frame, which holds the size. */
function jpegDimensionsOf(bytes: Uint8Array, view: DataView): Dimensions | undefined {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 0xff) return undefined;
        const marker = bytes[offset + 1]!;
        // Fill bytes before a marker.
        if (marker === 0xff) {
            offset += 1;
            continue;
        }
        // Standalone markers carry no length.
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
            offset += 2;
            continue;
        }
        const length = view.getUint16(offset + 2);
        const frame =
            marker >= 0xc0 &&
            marker <= 0xcf &&
            marker !== 0xc4 &&
            marker !== 0xc8 &&
            marker !== 0xcc;
        if (frame) {
            if (offset + 9 > bytes.length) return undefined;
            return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        }
        offset += 2 + length;
    }
    return undefined;
}

/** The first chunk names the bitstream, and each of the three keeps the size in its own place. */
function webpDimensionsOf(bytes: Uint8Array, view: DataView): Dimensions | undefined {
    if (bytes.length < 30) return undefined;
    switch (ascii(bytes, 12, 4)) {
        case "VP8X":
            return {
                width: 1 + (view.getUint32(24, true) & 0xffffff),
                height: 1 + (view.getUint32(26, true) >>> 8),
            };
        case "VP8 ":
            if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return undefined;
            return {
                width: view.getUint16(26, true) & 0x3fff,
                height: view.getUint16(28, true) & 0x3fff,
            };
        case "VP8L": {
            if (bytes[20] !== 0x2f) return undefined;
            const bits = view.getUint32(21, true);
            return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
        }
        default:
            return undefined;
    }
}
