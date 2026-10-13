import { thumbHashToApproximateAspectRatio, thumbHashToDataURL } from "thumbhash";

/** The hash's bytes, from base64 in either alphabet; undefined when it does not decode. */
function thumbhashBytes(hash: string): Uint8Array | undefined {
    try {
        const normalized = hash.replace(/-/gu, "+").replace(/_/gu, "/");
        const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
        return undefined;
    }
}

/**
 * Decodes a daemon-issued ThumbHash placeholder, base64 in either alphabet,
 * into a data URL. Undefined for a hash that does not decode, so a caller shows
 * nothing rather than a broken image.
 */
export function thumbhashDataUrl(hash: string): string | undefined {
    const bytes = thumbhashBytes(hash);
    if (!bytes) return undefined;
    try {
        return thumbHashToDataURL(bytes);
    } catch {
        return undefined;
    }
}

/**
 * The picture's approximate width-to-height ratio, which a ThumbHash encodes
 * in its header. Undefined for a hash that does not decode to a usable ratio.
 */
export function thumbhashAspectRatio(hash: string): number | undefined {
    const bytes = thumbhashBytes(hash);
    if (!bytes || bytes.length < 5) return undefined;
    const ratio = thumbHashToApproximateAspectRatio(bytes);
    return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
}
