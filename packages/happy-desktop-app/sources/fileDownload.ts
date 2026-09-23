/**
 * Saves one workspace file to the reader's machine under its own name.
 *
 * The bytes are handed to the anchor as a same-document object URL rather than
 * as the address they are served from: a `download` attribute is ignored for a
 * cross-origin address, and the browser would then navigate the whole app to
 * the file instead of saving it. A text source is the copy already in hand; an
 * address is read once, the same way the preview itself reads it.
 */
export async function fileDownload(
    path: string,
    source:
        | { readonly type: "text"; readonly text: string }
        | { readonly type: "url"; readonly url: string },
): Promise<void> {
    let blob: Blob;
    if (source.type === "text") blob = new Blob([source.text], { type: "text/plain" });
    else {
        const response = await fetch(source.url);
        if (!response.ok)
            throw new Error(`The file could not be downloaded (${String(response.status)}).`);
        blob = await response.blob();
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = path.slice(path.lastIndexOf("/") + 1);
    anchor.click();
    // The save may read the blob after the click returns, so the URL outlives
    // the call by a margin instead of being revoked the moment it is used.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
