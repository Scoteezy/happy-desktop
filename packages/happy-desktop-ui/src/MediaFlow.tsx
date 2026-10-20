import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
    MEDIA_FLOW_GAP,
    type MediaFlowPlan,
    type MediaFlowRow,
    type MediaFlowTile,
} from "./mediaLayout";

export type MediaFlowProps = {
    className?: string;
    "data-testid"?: string;
    plan: MediaFlowPlan;
    /**
     * The widest the flow is drawn. Absent, it takes its container's full
     * width; either way the row model lays it out at the same width.
     */
    maxWidth?: number;
    /** Which edge rows that stop short of the width keep to. */
    align?: "start" | "end";
    /** One tile, given the box style that sizes it. */
    renderTile: (index: number, style: CSSProperties) => ReactNode;
};

/**
 * C-303 MediaFlow — pictures shown together, as rows of tiles at their own
 * shapes. `mediaFlowGeometry` is the same layout in arithmetic; the row model
 * reserves its height, so nothing here is measured.
 *
 * Every box is flexbox: a column of rows; a `cells` row of fixed-width
 * columns, each holding a tile no wider than its column or its own bound and
 * as tall as its aspect ratio and the row's cap allow; a `justified` row of
 * tiles that grow in proportion to their ratios, so they share one height.
 */
export function MediaFlow(props: MediaFlowProps) {
    return (
        <div
            className={["happy-media-flow", props.className].filter(Boolean).join(" ")}
            data-align={props.align ?? "start"}
            data-happy-desktop-ui="media-flow"
            data-testid={props["data-testid"]}
            style={
                props.maxWidth === undefined
                    ? undefined
                    : { width: `min(100%, ${String(props.maxWidth)}px)` }
            }
        >
            {props.plan.rows.map((row, index) => (
                <div
                    className="happy-media-flow__row"
                    data-happy-desktop-ui="media-flow-row"
                    data-type={row.type}
                    key={index}
                >
                    {row.type === "cells"
                        ? row.tiles.map((tile) => (
                              <div
                                  className="happy-media-flow__cell"
                                  data-happy-desktop-ui="media-flow-cell"
                                  key={tile.index}
                                  style={{ flexBasis: cellBasis(row.columns) }}
                              >
                                  {props.renderTile(tile.index, cellTileStyle(row, tile))}
                              </div>
                          ))
                        : row.tiles.map((tile) => (
                              <Fragment key={tile.index}>
                                  {props.renderTile(tile.index, justifiedTileStyle(tile))}
                              </Fragment>
                          ))}
                </div>
            ))}
        </div>
    );
}

function justifiedTileStyle(tile: MediaFlowTile): CSSProperties {
    return {
        /* Grow factors are scaled up so a row whose ratios sum below one
           still distributes all of its width, as flexbox otherwise would not. */
        flex: `${String(tile.ratio * 100)} 0 0px`,
        maxWidth: `${String(tile.maxWidth)}px`,
        aspectRatio: String(tile.ratio),
    };
}

/** One column of `columns`, after the gaps between them. */
function cellBasis(columns: number): string {
    return columns === 1
        ? "100%"
        : `calc((100% - ${String((columns - 1) * MEDIA_FLOW_GAP)}px) / ${String(columns)})`;
}

function cellTileStyle(row: MediaFlowRow, tile: MediaFlowTile): CSSProperties {
    return {
        width: Number.isFinite(tile.maxWidth) ? `min(100%, ${String(tile.maxWidth)}px)` : "100%",
        maxHeight: `${String(row.maxHeight)}px`,
        aspectRatio: String(tile.ratio),
    };
}
