import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { expect, it } from "vitest";
import { UserError } from "../types.js";
import {
    HAPPY_AGENT_PROFILE_PHOTO_MAX_BYTES,
    HAPPY_AGENT_PROFILE_PHOTO_SOURCE_MAX_BYTES,
    happyAgentProfilePhotoError,
    happyAgentProfilePhotoRead,
    happyAgentProfilePhotoSourceCheck,
    happyAgentProfilePhotoSourceError,
} from "./happyAgentProfilePhoto.js";

/* A picked file is outside our contract: its encoding is read from its own
 * signature, and the daemon's size and pixel limits are refused here with the
 * daemon's words, because the daemon answers an undecodable or oversized
 * picture with a bare internal error. */

function png(width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(8, 13);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
    // SOI, an APP0 segment to walk past, then a baseline start-of-frame.
    const bytes = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 0, 0, 0,
        0x01, 0x01, 0x11, 0x00,
    ]);
    const view = new DataView(bytes.buffer);
    view.setUint16(13, height);
    view.setUint16(15, width);
    return bytes;
}

function webp(chunk: "VP8 " | "VP8L" | "VP8X", width: number, height: number): Uint8Array {
    const bytes = new Uint8Array(40);
    const view = new DataView(bytes.buffer);
    bytes.set([..."RIFF"].map((c) => c.charCodeAt(0)));
    bytes.set(
        [..."WEBP"].map((c) => c.charCodeAt(0)),
        8,
    );
    bytes.set(
        [...chunk].map((c) => c.charCodeAt(0)),
        12,
    );
    if (chunk === "VP8 ") {
        bytes.set([0x9d, 0x01, 0x2a], 23);
        view.setUint16(26, width, true);
        view.setUint16(28, height, true);
    } else if (chunk === "VP8L") {
        bytes[20] = 0x2f;
        view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
    } else {
        view.setUint32(24, (width - 1) & 0xffffff, true);
        bytes[27] = (height - 1) & 0xff;
        bytes[28] = ((height - 1) >> 8) & 0xff;
        bytes[29] = ((height - 1) >> 16) & 0xff;
    }
    return bytes;
}

const blob = (bytes: Uint8Array, type = "") => new Blob([bytes.slice()], { type });

it("names each accepted encoding by its signature, not by the browser's guess", async () => {
    // The declared type is the platform's guess from a file name; it is ignored.
    expect((await happyAgentProfilePhotoRead(blob(png(64, 64), "image/jpeg"))).contentType).toBe(
        "image/png",
    );
    expect((await happyAgentProfilePhotoRead(blob(jpeg(64, 64)))).contentType).toBe("image/jpeg");
    for (const chunk of ["VP8 ", "VP8L", "VP8X"] as const)
        expect((await happyAgentProfilePhotoRead(blob(webp(chunk, 64, 64)))).contentType).toBe(
            "image/webp",
        );
    const read = await happyAgentProfilePhotoRead(blob(png(2, 2)));
    expect(new Uint8Array(read.data)).toEqual(png(2, 2));
});

it("refuses what the daemon would refuse, in the daemon's words", async () => {
    await expect(
        happyAgentProfilePhotoRead(blob(new TextEncoder().encode("GIF89a"), "image/gif")),
    ).rejects.toThrow("The profile photo must be a PNG, JPEG, or WebP image.");
    await expect(happyAgentProfilePhotoRead(blob(new Uint8Array()))).rejects.toThrow(
        "The profile photo must be a PNG, JPEG, or WebP image.",
    );
    await expect(
        happyAgentProfilePhotoRead(blob(new Uint8Array(HAPPY_AGENT_PROFILE_PHOTO_MAX_BYTES + 1))),
    ).rejects.toThrow("The profile photo must be no larger than 8 MiB.");
});

it("refuses more than 25 megapixels in every encoding, and lets the limit itself through", async () => {
    const over = "The profile photo must be no larger than 25 megapixels.";
    await expect(happyAgentProfilePhotoRead(blob(png(5_001, 5_000)))).rejects.toThrow(over);
    await expect(happyAgentProfilePhotoRead(blob(jpeg(5_001, 5_000)))).rejects.toThrow(over);
    await expect(happyAgentProfilePhotoRead(blob(webp("VP8X", 10_001, 2_500)))).rejects.toThrow(
        over,
    );
    await expect(happyAgentProfilePhotoRead(blob(webp("VP8L", 16_000, 1_600)))).rejects.toThrow(
        over,
    );
    await expect(happyAgentProfilePhotoRead(blob(webp("VP8 ", 16_000, 1_600)))).rejects.toThrow(
        over,
    );
    await expect(happyAgentProfilePhotoRead(blob(png(5_000, 5_000)))).resolves.toMatchObject({
        contentType: "image/png",
    });
});

it("leaves a header it cannot measure for the daemon to judge", async () => {
    const truncated = jpeg(64, 64).subarray(0, 10);
    await expect(happyAgentProfilePhotoRead(blob(truncated))).resolves.toMatchObject({
        contentType: "image/jpeg",
    });
});

it("opens a larger picture for cropping than the daemon would store, within a decoding budget", async () => {
    // A camera photo is cropped down to the stored size, so the daemon's own
    // limits apply to the crop, not to the picture it is cut from.
    await expect(happyAgentProfilePhotoSourceCheck(blob(png(8_000, 6_000)))).resolves.toBe(
        undefined,
    );
    const heavy = new Uint8Array(HAPPY_AGENT_PROFILE_PHOTO_MAX_BYTES + 1);
    heavy.set(png(4_000, 3_000));
    await expect(happyAgentProfilePhotoSourceCheck(blob(heavy))).resolves.toBe(undefined);
    await expect(happyAgentProfilePhotoSourceCheck(blob(jpeg(10_000, 5_001)))).rejects.toThrow(
        "Choose a picture no larger than 50 megapixels.",
    );
    await expect(
        happyAgentProfilePhotoSourceCheck(
            blob(new Uint8Array(HAPPY_AGENT_PROFILE_PHOTO_SOURCE_MAX_BYTES + 1)),
        ),
    ).rejects.toThrow("Choose a picture no larger than 50 MiB.");
    await expect(
        happyAgentProfilePhotoSourceCheck(blob(new TextEncoder().encode("GIF89a"), "image/gif")),
    ).rejects.toThrow("The profile photo must be a PNG, JPEG, or WebP image.");
    // A file with the right signature that the engine still cannot decode.
    expect(
        happyAgentProfilePhotoSourceError(new DOMException("bad", "InvalidStateError")).message,
    ).toBe("Happy could not read this picture. Try a different PNG, JPEG, or WebP file.");
    const own = new UserError("Already displayable.");
    expect(happyAgentProfilePhotoSourceError(own)).toBe(own);
});

it("explains each refusal in words the reader can act on", () => {
    const refused = (status: number, message = "daemon words") =>
        new HappyAgentApiError(status, message, null, null);
    expect(happyAgentProfilePhotoError(refused(409), "upload").message).toBe(
        "The profile changed somewhere else in the meantime. Try again.",
    );
    expect(happyAgentProfilePhotoError(refused(413), "upload").message).toBe(
        "The profile photo must be no larger than 8 MiB.",
    );
    expect(happyAgentProfilePhotoError(refused(401), "upload").message).toBe(
        "Happy Agent has no saved profile for you yet. Save your name first.",
    );
    expect(happyAgentProfilePhotoError(refused(500), "upload").message).toBe(
        "Happy Agent could not read this image. Try a different PNG, JPEG, or WebP file.",
    );
    expect(happyAgentProfilePhotoError(refused(500), "removal").message).toBe(
        "Happy Agent could not remove the photo.",
    );
    // The daemon's own words already say what was wrong with the request.
    expect(
        happyAgentProfilePhotoError(
            refused(400, "The profile photo must be a PNG, JPEG, or WebP image."),
            "upload",
        ).message,
    ).toBe("The profile photo must be a PNG, JPEG, or WebP image.");
    expect(happyAgentProfilePhotoError(new TypeError("Failed to fetch"), "removal").message).toBe(
        "Happy Agent is unreachable. Try again once it is back.",
    );
    const own = new UserError("Already displayable.");
    expect(happyAgentProfilePhotoError(own, "upload")).toBe(own);
});
