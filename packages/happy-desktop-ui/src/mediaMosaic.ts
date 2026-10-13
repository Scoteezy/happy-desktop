import type { CSSProperties } from "react";
import { thumbhashAspectRatio } from "./thumbhashDataUrl";

/**
 * Where several pictures shown together go: one aspect-aware mosaic, laid out
 * the way a messenger lays out a photo album, instead of a grid of squares
 * that crops every screenshot into a thumbnail of its middle.
 *
 * This is the single source of that geometry. `ConversationMedia` and
 * `Message` paint their tiles from it and `conversationRowHeight` reserves the
 * row from it, so the box the transcript holds open is exactly the box that
 * fills it. It is pure arithmetic on the pictures' intrinsic sizes — no
 * element is mounted or measured.
 *
 * The mosaic is decided once, at full size, in whole pixels; it is at most
 * `MEDIA_MOSAIC_MAX_WIDTH` wide. A narrower column scales the whole of it
 * down uniformly: the function multiplies every frame by the same factor, and
 * the painted mosaic does the same by drawing its frame at the column's width
 * and its tiles at fixed fractions of it. Neither side needs the other's
 * measure to agree.
 */

/** What the mosaic knows about one picture before its bytes arrive. */
export type MediaMosaicImage = {
    /** Intrinsic pixel size, when the producer stated it. */
    readonly width?: number;
    readonly height?: number;
    /** The placeholder hash, whose header carries an approximate shape when the size is absent. */
    readonly thumbhash?: string;
};
/** Which outer edges of the whole mosaic one tile lies on. */
export type MediaMosaicSides = {
    readonly top: boolean;
    readonly right: boolean;
    readonly bottom: boolean;
    readonly left: boolean;
};
export type MediaMosaicTile = {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly sides: MediaMosaicSides;
};
export type MediaMosaicLayout = {
    readonly width: number;
    readonly height: number;
    /** One frame per picture, in the order the pictures were given. */
    readonly tiles: readonly MediaMosaicTile[];
};

/** The gap between neighbouring tiles. */
export const MEDIA_MOSAIC_GAP = 4;
/**
 * The mosaic's full width. Pictures shown together are usually screenshots,
 * which need the room to stay legible; this is about the measure a tool row
 * has at Happy's default window, and a wider transcript does not widen it.
 */
export const MEDIA_MOSAIC_MAX_WIDTH = 560;
/**
 * The height a mosaic aims for: the hand-tuned arrangements stay within it,
 * and justified rows choose the split that lands closest to it. A messenger
 * aims a phone album at 4:3 portrait; a desktop transcript of mostly
 * landscape screenshots reads best square, which also keeps a whole mosaic
 * inside the transcript's viewport at Happy's default window.
 */
const MOSAIC_TARGET_HEIGHT = 560;
/** The smallest a tile is drawn, so nothing collapses into an unreadable sliver. */
const MOSAIC_MIN_WIDTH = 96;
const MOSAIC_MIN_HEIGHT = 96;
/**
 * The shortest justified row that is not penalised. A row of many wide
 * pictures below it is a strip of thumbnails, and choosing it usually leaves
 * one picture alone on a row of its own, blown up to the full width.
 */
const MOSAIC_MIN_ROW_HEIGHT = 120;
/** The shape assumed for a picture that states neither a size nor a ThumbHash: 4:3. */
const MOSAIC_FALLBACK_RATIO = 4 / 3;
/** Ratios that classify a picture as wide or narrow; between them it is square. */
const WIDE_RATIO = 1.2;
const NARROW_RATIO = 0.8;
/** Past this ratio a picture is too extreme for the hand-tuned two-to-four layouts. */
const HAND_TUNED_MAX_RATIO = 2;
/** The most pictures one album lays out; a longer run stacks as several albums. */
const ALBUM_MAX = 10;

/** The most photos a message shows inline. */
export const MESSAGE_MEDIA_MAX = 4;

/** `.happy-message__media` lone photo: the box it is scaled into. */
export const MEDIA_SINGLE_MAX_W = 380;
const MEDIA_SINGLE_MAX_H = 320;
/**
 * The narrowest a lone photo is drawn once its height is capped. A page-tall
 * screenshot scaled whole would arrive as an unreadable 90px sliver, so past this
 * ratio the box keeps a usable width and the image crops — the click that opens
 * it full size is right there.
 */
const MEDIA_SINGLE_MIN_W = 240;
/** Box for a lone image whose format hid its dimensions: 240 × 4:3. */
const MEDIA_FALLBACK_W = 240;
const MEDIA_FALLBACK_H = 180;

/**
 * The box a lone photo is drawn in, from its intrinsic pixel size alone.
 *
 * Scaling down is the only transform: an image smaller than the cap keeps its own
 * size rather than being blown up past its detail. Larger, it scales to
 * `MEDIA_SINGLE_MAX_W`, and if that leaves it taller than `MEDIA_SINGLE_MAX_H` the
 * height is capped — by scaling further down, or, once that would take the width
 * below `MEDIA_SINGLE_MIN_W`, by holding that width and letting the painted image
 * crop into it.
 */
export function messageMediaSingleBox(image: {
    readonly width?: number;
    readonly height?: number;
}): { readonly width: number; readonly height: number } {
    if (!image.width || !image.height) return { width: MEDIA_FALLBACK_W, height: MEDIA_FALLBACK_H };
    const ratio = image.width / image.height;
    const width = Math.min(image.width, MEDIA_SINGLE_MAX_W);
    const height = width / ratio;
    if (height <= MEDIA_SINGLE_MAX_H)
        return { width: Math.round(width), height: Math.round(height) };
    return {
        width: Math.round(
            Math.min(Math.max(MEDIA_SINGLE_MAX_H * ratio, MEDIA_SINGLE_MIN_W), width),
        ),
        height: MEDIA_SINGLE_MAX_H,
    };
}

/** A tile's frame before the mosaic knows which of its edges are outer ones. */
type Frame = { x: number; y: number; width: number; height: number };
type Block = { width: number; height: number; frames: Frame[] };

const clamp = (value: number, low: number, high: number) =>
    Math.min(Math.max(value, low), Math.max(low, high));

/** A picture's width-to-height ratio: its stated size, else its ThumbHash, else 4:3. */
function mosaicRatio(image: MediaMosaicImage): number {
    if (image.width && image.height) return image.width / image.height;
    const hashed = image.thumbhash ? thumbhashAspectRatio(image.thumbhash) : undefined;
    return hashed ?? MOSAIC_FALLBACK_RATIO;
}

/**
 * Splits `total` whole pixels between `weights` in proportion, giving each at
 * least `min` where the total allows; the last part absorbs the rounding so
 * the parts always add up to `total` exactly.
 */
function proportionalSplit(total: number, weights: readonly number[], min: number): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    const floor = Math.min(min, Math.floor(total / weights.length));
    const parts: number[] = [];
    let used = 0;
    for (const [index, weight] of weights.entries()) {
        const after = weights.length - 1 - index;
        if (after === 0) {
            parts.push(total - used);
            break;
        }
        const part = clamp(Math.round((total * weight) / sum), floor, total - used - after * floor);
        parts.push(part);
        used += part;
    }
    return parts;
}

/** One picture over a row of the rest, which share one height across the full width. */
function topOverRow(ratios: readonly number[], width: number, height: number): Block {
    const [first, ...rest] = ratios as [number, ...number[]];
    const gaps = (rest.length - 1) * MEDIA_MOSAIC_GAP;
    const top = Math.round(Math.min(width / first, (height - MEDIA_MOSAIC_GAP) * 0.66));
    const row = clamp(
        Math.round((width - gaps) / rest.reduce((a, b) => a + b, 0)),
        MOSAIC_MIN_HEIGHT,
        height - top - MEDIA_MOSAIC_GAP,
    );
    const widths = proportionalSplit(width - gaps, rest, MOSAIC_MIN_WIDTH);
    const frames: Frame[] = [{ x: 0, y: 0, width, height: top }];
    let x = 0;
    for (const tileWidth of widths) {
        frames.push({ x, y: top + MEDIA_MOSAIC_GAP, width: tileWidth, height: row });
        x += tileWidth + MEDIA_MOSAIC_GAP;
    }
    return { width, height: top + MEDIA_MOSAIC_GAP + row, frames };
}

/**
 * One picture at full height on the left, the rest stacked in a column on the
 * right. The column is as wide as lets both sides keep their shapes, within
 * `[minColumn, maxColumn]`.
 */
function leftBesideColumn(
    ratios: readonly number[],
    width: number,
    height: number,
    minColumn: number,
    maxColumn: number,
): Block {
    const [first, ...rest] = ratios as [number, ...number[]];
    const gaps = (rest.length - 1) * MEDIA_MOSAIC_GAP;
    const inverse = rest.reduce((sum, ratio) => sum + 1 / ratio, 0);
    /* The column width at which the left picture, at the column's natural
       height, exactly fills the remaining width. */
    const natural = (width - MEDIA_MOSAIC_GAP - gaps * first) / (1 + first * inverse);
    const column = clamp(Math.round(natural), minColumn, maxColumn);
    const total = clamp(
        Math.round(column * inverse + gaps),
        rest.length * MOSAIC_MIN_HEIGHT + gaps,
        height,
    );
    const heights = proportionalSplit(
        total - gaps,
        rest.map((ratio) => 1 / ratio),
        MOSAIC_MIN_HEIGHT,
    );
    const left = width - MEDIA_MOSAIC_GAP - column;
    const frames: Frame[] = [{ x: 0, y: 0, width: left, height: total }];
    let y = 0;
    for (const tileHeight of heights) {
        frames.push({ x: left + MEDIA_MOSAIC_GAP, y, width: column, height: tileHeight });
        y += tileHeight + MEDIA_MOSAIC_GAP;
    }
    return { width, height: total, frames };
}

/** Two to four pictures, none extreme, each count with its own few arrangements. */
function handTuned(ratios: readonly number[], width: number, height: number): Block {
    const shape = ratios
        .map((ratio) => (ratio > WIDE_RATIO ? "w" : ratio < NARROW_RATIO ? "n" : "q"))
        .join("");
    const average = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const inner = width - MEDIA_MOSAIC_GAP;
    if (ratios.length === 2) {
        const [a, b] = ratios as [number, number];
        /* Two wide pictures much wider than the box itself: stacked, at the
           width that lets both keep their whole shape within the height. */
        if (shape === "ww" && average > (1.4 * width) / height && Math.abs(a - b) < 0.2) {
            const inverse = 1 / a + 1 / b;
            const stacked = Math.min(width, Math.floor((height - MEDIA_MOSAIC_GAP) / inverse));
            const [upper, lower] = proportionalSplit(
                Math.round(stacked * inverse),
                [1 / a, 1 / b],
                MOSAIC_MIN_HEIGHT,
            ) as [number, number];
            return {
                width: stacked,
                height: upper + MEDIA_MOSAIC_GAP + lower,
                frames: [
                    { x: 0, y: 0, width: stacked, height: upper },
                    { x: 0, y: upper + MEDIA_MOSAIC_GAP, width: stacked, height: lower },
                ],
            };
        }
        /* Two of a kind: side by side at equal widths. Otherwise each takes
           the width its shape asks for at one shared height, the narrower
           keeping at least two fifths of the row. */
        const sameKind = shape === "ww" || shape === "qq";
        const [left, right] = sameKind
            ? proportionalSplit(inner, [1, 1], 0)
            : proportionalSplit(inner, [a, b], Math.max(MOSAIC_MIN_WIDTH, Math.round(inner * 0.4)));
        const shared = Math.round(
            sameKind ? Math.min(height, left! / a, right! / b) : Math.min(height, inner / (a + b)),
        );
        return {
            width,
            height: shared,
            frames: [
                { x: 0, y: 0, width: left!, height: shared },
                { x: left! + MEDIA_MOSAIC_GAP, y: 0, width: right!, height: shared },
            ],
        };
    }
    if (ratios.length === 3)
        return shape.startsWith("n")
            ? leftBesideColumn(ratios, width, height, MOSAIC_MIN_WIDTH, Math.floor(inner / 2))
            : topOverRow(ratios, width, height);
    return shape.startsWith("w")
        ? topOverRow(ratios, width, height)
        : leftBesideColumn(
              ratios,
              width,
              height,
              Math.max(MOSAIC_MIN_WIDTH, inner - Math.round(width * 0.6)),
              Math.floor(inner / 2),
          );
}

/** Every way to cut `count` pictures, in order, into 2–4 rows. */
function rowSplits(count: number, average: number): number[][] {
    const splits: number[][] = [];
    const extend = (rows: number[], left: number, total: number) => {
        if (rows.length === total) {
            if (left === 0) splits.push(rows);
            return;
        }
        /* Narrow pictures may crowd four into the middle of three rows. */
        const most = total === 3 && rows.length === 1 && average < 0.85 ? 4 : 3;
        for (let size = 1; size <= Math.min(most, left); size += 1)
            extend([...rows, size], left - size, total);
    };
    for (let total = 2; total <= 4; total += 1) extend([], count, total);
    return splits;
}

/**
 * Justified rows: the pictures, in order, cut into the rows whose combined
 * height comes closest to the target, each row as tall as lets its pictures
 * fill the width at their own shapes. Shapes are first pulled toward square,
 * so one panorama or one page-tall capture cannot flatten the whole row.
 */
function justifiedRows(ratios: readonly number[], width: number, height: number): Block {
    const average = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const shapes = ratios.map((ratio) =>
        average > 1.1 ? clamp(ratio, 1, 2.75) : clamp(ratio, 2 / 3, 1),
    );
    let best: { rows: number[]; heights: number[]; score: number } | undefined;
    for (const rows of rowSplits(shapes.length, average)) {
        let start = 0;
        const heights = rows.map((size) => {
            const sum = shapes.slice(start, start + size).reduce((a, b) => a + b, 0);
            start += size;
            return (width - (size - 1) * MEDIA_MOSAIC_GAP) / sum;
        });
        const total = heights.reduce((a, b) => a + b, 0) + (rows.length - 1) * MEDIA_MOSAIC_GAP;
        let score = Math.abs(total - height);
        if (heights.some((rowHeight) => rowHeight < MOSAIC_MIN_ROW_HEIGHT)) score *= 1.5;
        if (rows.some((size, index) => index > 0 && size < rows[index - 1]!)) score *= 1.5;
        if (!best || score < best.score) best = { rows, heights, score };
    }
    const chosen = best!;
    const frames: Frame[] = [];
    let start = 0;
    let y = 0;
    for (const [index, size] of chosen.rows.entries()) {
        const rowHeight = Math.round(chosen.heights[index]!);
        const widths = proportionalSplit(
            width - (size - 1) * MEDIA_MOSAIC_GAP,
            shapes.slice(start, start + size),
            MOSAIC_MIN_WIDTH,
        );
        let x = 0;
        for (const tileWidth of widths) {
            frames.push({ x, y, width: tileWidth, height: rowHeight });
            x += tileWidth + MEDIA_MOSAIC_GAP;
        }
        start += size;
        y += rowHeight + MEDIA_MOSAIC_GAP;
    }
    return { width, height: y - MEDIA_MOSAIC_GAP, frames };
}

/** One album of up to `ALBUM_MAX` pictures at the mosaic's full size. */
function album(ratios: readonly number[]): Block {
    const handTunable =
        ratios.length <= 4 && ratios.every((ratio) => ratio <= HAND_TUNED_MAX_RATIO);
    return handTunable
        ? handTuned(ratios, MEDIA_MOSAIC_MAX_WIDTH, MOSAIC_TARGET_HEIGHT)
        : justifiedRows(ratios, MEDIA_MOSAIC_MAX_WIDTH, MOSAIC_TARGET_HEIGHT);
}

/**
 * The frame of every picture shown together, at the measure their column
 * gives them. One picture keeps `messageMediaSingleBox` at any measure. Two or
 * more form a mosaic at most `MEDIA_MOSAIC_MAX_WIDTH` wide, scaled down
 * uniformly when the measure is narrower than it; a run longer than one album
 * stacks as several albums of near-equal size. Deterministic: the same pictures at the same
 * measure always give the same frames.
 */
export function mediaMosaicLayout(
    images: readonly MediaMosaicImage[],
    measure: number,
): MediaMosaicLayout {
    if (images.length === 0) return { width: 0, height: 0, tiles: [] };
    if (images.length === 1) {
        const box = messageMediaSingleBox(images[0]!);
        return {
            ...box,
            tiles: [
                {
                    x: 0,
                    y: 0,
                    ...box,
                    sides: { top: true, right: true, bottom: true, left: true },
                },
            ],
        };
    }
    const ratios = images.map(mosaicRatio);
    const albums = Math.ceil(ratios.length / ALBUM_MAX);
    const frames: Frame[] = [];
    const blocks: number[] = [];
    let height = 0;
    let start = 0;
    for (let index = 0; index < albums; index += 1) {
        /* Near-equal albums: 13 pictures are 7 and 6, not 10 and a stray 3. */
        const size = Math.ceil((ratios.length - start) / (albums - index));
        const block = album(ratios.slice(start, start + size));
        blocks.push(block.width);
        if (index > 0) height += MEDIA_MOSAIC_GAP;
        for (const frame of block.frames) frames.push({ ...frame, y: frame.y + height });
        height += block.height;
        start += size;
    }
    const width = Math.max(...blocks);
    const scale = clamp(measure / width, 0, 1);
    return {
        width: width * scale,
        height: height * scale,
        tiles: frames.map((frame) => ({
            x: frame.x * scale,
            y: frame.y * scale,
            width: frame.width * scale,
            height: frame.height * scale,
            sides: {
                top: frame.y === 0,
                right: frame.x + frame.width === width,
                bottom: frame.y + frame.height === height,
                left: frame.x === 0,
            },
        })),
    };
}

/**
 * The mosaic's own box. A lone photo is its fixed box; a mosaic is drawn at
 * its column's width up to its full one, its height following from its shape,
 * which is the uniform scale `mediaMosaicLayout` applies to a narrower measure.
 */
export function mediaMosaicStyle(layout: MediaMosaicLayout): CSSProperties {
    if (layout.tiles.length === 1)
        return { width: `${String(layout.width)}px`, height: `${String(layout.height)}px` };
    return {
        width: `min(100%, ${String(layout.width)}px)`,
        aspectRatio: `${String(layout.width)} / ${String(layout.height)}`,
    };
}

/**
 * One tile's place in its mosaic, as fractions of the mosaic's box so it
 * scales with it. A corner on the mosaic's outer edge takes the full radius;
 * one between tiles takes the small inner radius. Both radii are custom
 * properties the surface's own stylesheet sets.
 */
export function mediaMosaicTileStyle(
    layout: MediaMosaicLayout,
    tile: MediaMosaicTile,
): CSSProperties {
    const across = (value: number) => `calc(100% * ${String(value)} / ${String(layout.width)})`;
    const down = (value: number) => `calc(100% * ${String(value)} / ${String(layout.height)})`;
    const corner = (outer: boolean) =>
        outer ? "var(--happy-media-mosaic-radius)" : "var(--happy-media-mosaic-inner-radius)";
    const { top, right, bottom, left } = tile.sides;
    return {
        left: across(tile.x),
        top: down(tile.y),
        width: across(tile.width),
        height: down(tile.height),
        borderRadius: [
            corner(top && left),
            corner(top && right),
            corner(bottom && right),
            corner(bottom && left),
        ].join(" "),
    };
}
