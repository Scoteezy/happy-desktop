import type { CSSProperties } from "react";
import { stemCellGeometry, stemCellSmoothPath } from "./stemCellGeometry";

export type StemCellMark = {
    /** Stable item identity, retained while the item takes shape. */
    id: string;
    /** Slowly drift the shape's phases. Static by default and in Blueprint captures. */
    wobble?: boolean;
};
export type StemCellProps = StemCellMark & { size: 16 | 20 | 64 };

/** C-298 — a seeded identity for work that has not become something yet. */
export function StemCell({ id, size, wobble = false }: StemCellProps) {
    const geometry = stemCellGeometry(id);
    const forward = wobble ? stemCellGeometry(id, 0.2) : undefined;
    const backward = wobble ? stemCellGeometry(id, -0.2) : undefined;
    const path = (part: "membrane" | "core") => {
        const d = stemCellSmoothPath(geometry[part], size);
        return (
            <path
                className={`happy-stem-cell__${part}`}
                d={d}
                style={
                    forward && backward
                        ? ({
                              "--happy-stem-cell-rest": `path("${d}")`,
                              "--happy-stem-cell-forward": `path("${stemCellSmoothPath(forward[part], size)}")`,
                              "--happy-stem-cell-backward": `path("${stemCellSmoothPath(backward[part], size)}")`,
                          } as CSSProperties)
                        : undefined
                }
            />
        );
    };
    return (
        <svg
            aria-hidden="true"
            className="happy-stem-cell"
            data-happy-desktop-ui="stem-cell"
            data-stem-cell-id={id}
            data-wobble={wobble ? "" : undefined}
            focusable="false"
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            width={size}
        >
            {path("membrane")}
            {path("core")}
        </svg>
    );
}
