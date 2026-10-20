/**
 * Puts one picture on the clipboard as a PNG.
 *
 * The system clipboard takes pictures only as PNG, so any other format is drawn
 * once onto a canvas and re-encoded. The picture is read through a same-document
 * object URL, as `fileDownload` reads a file, so a cross-origin address cannot
 * taint the canvas. The clipboard item is handed a pending blob rather than
 * awaited first: the write then starts inside the press that asked for it, and
 * the clipboard keeps its permission while the bytes are still arriving.
 */
export async function imageCopy(url: string): Promise<void> {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": imagePng(url) })]);
}

async function imagePng(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`The image could not be copied (${String(response.status)}).`);
    const blob = await response.blob();
    if (blob.type === "image/png") return blob;
    const source = URL.createObjectURL(blob);
    try {
        const image = new Image();
        image.src = source;
        await image.decode();
        if (image.naturalWidth === 0 || image.naturalHeight === 0)
            throw new Error("The image has no size to copy.");
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("The image could not be drawn for copying.");
        context.drawImage(image, 0, 0);
        return await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
                (png) =>
                    png ? resolve(png) : reject(new Error("The image could not be encoded.")),
                "image/png",
            ),
        );
    } finally {
        URL.revokeObjectURL(source);
    }
}
