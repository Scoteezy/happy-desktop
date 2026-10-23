import { useState } from "react";
import { StemCell, type StemCellMark } from "./StemCell";
import { stemCellGrowthGate } from "./stemCellGate";
import {
    playStemCellToIcon,
    stemCellReducedMotion,
    stemCellSupportKnown,
    stemCellSupportProbe,
} from "./stemCellPlay";

/** Unframed artwork in an item's mark lane. */
export type ImageMark = {
    src: string;
    srcSet?: string;
    alt?: string;
    /**
     * This picture is what the item's stem cell grows into. When it replaces
     * the item's stem cell while the mark is on screen, the cell divides into
     * it instead of being swapped. Left out when the reader turned that off.
     */
    growsFromStemCell?: boolean;
};

export interface StemCellGrowthProps {
    stemCell?: StemCellMark;
    imageMark?: ImageMark;
    size: 20 | 64;
    /** The class the plain picture wears where this mark sits. */
    imageClassName: string;
    /** Grow on a software rasteriser too. For the Blueprint and verification only. */
    softwareRendering?: boolean;
}

interface Growth {
    /** The stem cell that is dividing, as it was on screen. */
    readonly id: string;
    /** The picture it grows into, at this mark's size. */
    readonly src: string;
}

/**
 * The first stem cell on screen asks whether this machine can grow one, so the
 * answer is in hand by the time a picture arrives and a machine that cannot
 * shows the picture at once.
 */
function supportWarm(node: SVGSVGElement | null): void {
    if (node && !stemCellReducedMotion()) void stemCellSupportProbe();
}

/** Canvases already handed to the worker; a canvas can only be transferred once. */
const runs = new WeakMap<HTMLCanvasElement, AbortController>();

/**
 * C-298 — an item's stem cell until it has a picture, then the picture. When
 * the picture replaces the stem cell while this mark is mounted, the cell
 * divides into the picture's colours and converges onto its silhouette for
 * 2.5 s, then hands over to the plain `<img>`. A mark that mounts with its
 * picture already there shows it as before.
 */
export function StemCellGrowth(props: StemCellGrowthProps) {
    const { stemCell, imageMark, size } = props;
    const allowSoftware = props.softwareRendering ?? false;
    // The stem cell this mark last showed. A change is observed here, during
    // render, so only a mounted mark that saw the cell can grow it.
    const [seen, setSeen] = useState(stemCell?.id);
    const [growth, setGrowth] = useState<Growth | undefined>(undefined);
    const [started, setStarted] = useState(false);
    if (stemCell?.id !== seen) {
        setSeen(stemCell?.id);
        const grows =
            seen !== undefined &&
            stemCell === undefined &&
            imageMark !== undefined &&
            stemCellGrowthGate({
                enabled: imageMark.growsFromStemCell === true,
                reducedMotion: stemCellReducedMotion(),
                support: stemCellSupportKnown(allowSoftware),
            }).kind !== "skip";
        setGrowth(grows ? { id: seen, src: imageMark.src } : undefined);
        setStarted(false);
    }

    if (stemCell) return <StemCell {...stemCell} ref={supportWarm} size={size} />;
    if (!imageMark) return null;
    const image = (
        <img
            alt={imageMark.alt ?? ""}
            className={props.imageClassName}
            src={imageMark.src}
            srcSet={imageMark.srcSet}
        />
    );
    if (!growth) return image;

    const grow = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return;
        if (!runs.has(canvas)) {
            const controller = new AbortController();
            runs.set(canvas, controller);
            void playStemCellToIcon(canvas, {
                id: growth.id,
                size,
                src: growth.src,
                allowSoftware,
                onStarted: () => setStarted(true),
                signal: controller.signal,
            }).then(
                () => setGrowth(undefined),
                () => setGrowth(undefined),
            );
        }
        return () => {
            // The canvas leaving the document is what frees its context: after
            // the swap, or when the mark goes away mid-growth. A ref that is
            // merely re-attached keeps the run going.
            queueMicrotask(() => {
                if (canvas.isConnected) return;
                runs.get(canvas)?.abort();
                runs.delete(canvas);
            });
        };
    };
    return (
        <span
            className="happy-stem-cell-growth"
            data-happy-desktop-ui="stem-cell-growth"
            data-size={size}
        >
            {started ? null : <StemCell id={growth.id} size={size} />}
            <canvas aria-hidden="true" className="happy-stem-cell-growth__canvas" ref={grow} />
        </span>
    );
}
