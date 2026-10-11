/**
 * Square crops of a picture, as geometry and as pixels.
 *
 * The geometry is kept in the picture's own pixels, independent of how large it
 * is drawn: `cx`/`cy` are the centre of the crop and `zoom` divides the
 * picture's shorter side into the crop's edge. Zoom 1 is the largest square the
 * picture can fill, so the crop is always covered by the picture as long as
 * the centre stays half an edge inside it.
 */

/** A picture's oriented size, in its own pixels. */
export interface ImageCropSize {
    readonly width: number;
    readonly height: number;
}

/** Where the crop sits on the picture. */
export interface ImageCropView {
    readonly cx: number;
    readonly cy: number;
    readonly zoom: number;
}

/** The square to cut out, in the picture's own pixels. */
export interface ImageCropRegion {
    readonly x: number;
    readonly y: number;
    readonly size: number;
}

/** How far in a crop may zoom: to an eighth of the shorter side. */
export const IMAGE_CROP_MAX_ZOOM = 8;

/** Centred, at the smallest zoom that fills the crop. */
export function imageCropInitial(image: ImageCropSize): ImageCropView {
    return { cx: image.width / 2, cy: image.height / 2, zoom: 1 };
}

/** The edge of the crop in picture pixels at a zoom. */
export function imageCropEdge(image: ImageCropSize, zoom: number): number {
    return Math.min(image.width, image.height) / zoom;
}

/** Keeps the zoom in range and the crop entirely on the picture. */
export function imageCropClamp(image: ImageCropSize, view: ImageCropView): ImageCropView {
    const zoom = Math.min(
        IMAGE_CROP_MAX_ZOOM,
        Math.max(1, Number.isFinite(view.zoom) ? view.zoom : 1),
    );
    const half = imageCropEdge(image, zoom) / 2;
    const clamp = (value: number, extent: number): number =>
        Math.min(extent - half, Math.max(half, Number.isFinite(value) ? value : extent / 2));
    return unchanged(view, {
        cx: clamp(view.cx, image.width),
        cy: clamp(view.cy, image.height),
        zoom,
    });
}

/** `before` itself when `after` puts the crop in the same place, so a move that cannot happen is no change. */
function unchanged(before: ImageCropView, after: ImageCropView): ImageCropView {
    return after.cx === before.cx && after.cy === before.cy && after.zoom === before.zoom
        ? before
        : after;
}

/** The square a view cuts out. */
export function imageCropRegion(image: ImageCropSize, view: ImageCropView): ImageCropRegion {
    const size = imageCropEdge(image, view.zoom);
    return { x: view.cx - size / 2, y: view.cy - size / 2, size };
}

/**
 * Moves the picture under a crop drawn `frame` pixels wide by a drag of
 * `dx`/`dy` screen pixels. Dragging the picture right shows more of its left.
 */
export function imageCropPan(
    image: ImageCropSize,
    view: ImageCropView,
    frame: number,
    dx: number,
    dy: number,
): ImageCropView {
    const perPixel = imageCropEdge(image, view.zoom) / frame;
    return unchanged(
        view,
        imageCropClamp(image, {
            ...view,
            cx: view.cx - dx * perPixel,
            cy: view.cy - dy * perPixel,
        }),
    );
}

/**
 * Zooms to `zoom`, holding still the picture point under `anchor` — a point in
 * the crop frame, from its top-left corner, `frame` pixels wide. Without an
 * anchor the centre holds still.
 */
export function imageCropZoom(
    image: ImageCropSize,
    view: ImageCropView,
    zoom: number,
    frame: number,
    anchor: { readonly x: number; readonly y: number } = { x: frame / 2, y: frame / 2 },
): ImageCropView {
    const before = imageCropEdge(image, view.zoom) / frame;
    const target = Math.min(IMAGE_CROP_MAX_ZOOM, Math.max(1, zoom));
    const after = imageCropEdge(image, target) / frame;
    const offsetX = anchor.x - frame / 2;
    const offsetY = anchor.y - frame / 2;
    return unchanged(
        view,
        imageCropClamp(image, {
            cx: view.cx + offsetX * (before - after),
            cy: view.cy + offsetY * (before - after),
            zoom: target,
        }),
    );
}

/** A picked file, decoded the right way up, ready to be shown and cut. */
export interface ImageCropSource extends ImageCropSize {
    /** An address the picture can be drawn from while the source is open. */
    readonly imageUrl: string;
    /** Draws `region` into a `size`-pixel square and encodes it, WebP where the engine can. */
    crop(region: ImageCropRegion, size: number): Promise<Blob>;
    /** Lets the decoded picture and its address go. */
    close(): void;
}

/**
 * Decodes a picked file, honouring its EXIF orientation, or rejects when the
 * engine cannot decode it. The picture is drawn from an object URL of the same
 * file, which `<img>` also orients from the image by default, so what is shown
 * and what is cut have the same size and the same way up.
 */
export async function imageCropOpen(file: Blob): Promise<ImageCropSource> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const imageUrl = URL.createObjectURL(file);
    let closed = false;
    return {
        imageUrl,
        width: bitmap.width,
        height: bitmap.height,
        async crop(region, size) {
            if (closed) throw new Error("The picture was already closed.");
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("The picture could not be drawn.");
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";
            context.drawImage(
                bitmap,
                region.x,
                region.y,
                region.size,
                region.size,
                0,
                0,
                size,
                size,
            );
            // An engine that cannot write WebP writes PNG instead, which is just
            // as acceptable; the caller reads the format from the bytes.
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/webp", 0.9),
            );
            if (!blob) throw new Error("The picture could not be encoded.");
            return blob;
        },
        close() {
            if (closed) return;
            closed = true;
            bitmap.close();
            URL.revokeObjectURL(imageUrl);
        },
    };
}
