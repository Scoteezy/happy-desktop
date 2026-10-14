import { type CSSProperties, type KeyboardEvent, type MouseEvent, useId } from "react";
import {
    FLOW_CHIP,
    FLOW_DOT,
    FLOW_DOT_GAP,
    FLOW_MIN_SCALE,
    FLOW_NODE_HEIGHT,
    FLOW_NODE_PADDING,
    FLOW_PAD,
    flowLayout,
    flowParse,
    type FlowNodeMark,
} from "./flowDiagramLayout";
import { ScrollArea } from "./Scrollbar";

export type FlowDiagramProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The fence's text: one part or one arrow per line. */
    source: string;
    /** Goes to the chapter a part's chip names; without it the chips only label. */
    onChapterOpen?: (chapter: number, chip: Element) => void;
};

const MARK_LABELS: Readonly<Record<FlowNodeMark, string>> = {
    new: "New",
    changed: "Changed",
    gone: "Removed",
};

const MARKS: readonly FlowNodeMark[] = ["new", "changed", "gone"];

/**
 * The parts of a system a change touches and how they connect, drawn the
 * way a review reads: names in the code face, curves from each part to the
 * next with what passes along them, the parts this change added, changed, or
 * took out marked with the colours the file list uses for the same thing,
 * the rest quiet. A part a chapter is about wears that chapter's number,
 * which goes to the chapter when there is one to go to. A legend says only
 * the marks the picture uses.
 */
export function FlowDiagram(props: FlowDiagramProps) {
    const id = useId();
    const parsed = flowParse(props.source);
    if (parsed.type === "invalid")
        return (
            <div
                className={["happy-flow", props.className].filter(Boolean).join(" ")}
                data-happy-desktop-ui="flow-diagram"
                data-render-state="invalid"
                data-testid={props["data-testid"]}
                style={props.style}
            >
                <p className="happy-flow__reason">This flow could not be drawn: {parsed.reason}</p>
            </div>
        );
    const layout = flowLayout(parsed.graph);
    const used = MARKS.filter((mark) => parsed.graph.nodes.some((node) => node.mark === mark));
    const arrow = `${id}-arrow`;
    const pad = FLOW_PAD;
    const width = layout.width + pad * 2;
    const height = layout.height + pad * 2;
    // At its own size when the column holds it, else shrunk to the column
    // down to `FLOW_MIN_SCALE`, then scrolled; the row model reads the same.
    const size: CSSProperties = {
        aspectRatio: `${String(width)} / ${String(height)}`,
        width: `clamp(${String(width * FLOW_MIN_SCALE)}px, 100%, ${String(width)}px)`,
    };
    return (
        <div
            className={["happy-flow", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="flow-diagram"
            data-render-state="ready"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {used.length === 0 ? null : (
                <div className="happy-flow__legend">
                    {used.map((mark) => (
                        <span className="happy-flow__legend-item" data-mark={mark} key={mark}>
                            {MARK_LABELS[mark]}
                        </span>
                    ))}
                </div>
            )}
            <ScrollArea
                axes="horizontal"
                className="happy-flow__scroll"
                viewportClassName="happy-flow__scroll-viewport"
            >
                <svg
                    aria-label="Flow diagram"
                    className="happy-flow__canvas"
                    role="img"
                    style={size}
                    viewBox={`${String(-pad)} ${String(-pad)} ${String(width)} ${String(height)}`}
                >
                    <defs>
                        <marker
                            id={arrow}
                            markerHeight="7"
                            markerUnits="userSpaceOnUse"
                            markerWidth="7"
                            orient="auto"
                            refX="7"
                            refY="3.5"
                        >
                            <path className="happy-flow__arrowhead" d="M0,0 L7,3.5 L0,7 z" />
                        </marker>
                    </defs>
                    {layout.edges.map((edge, index) => (
                        <path
                            className="happy-flow__edge"
                            d={edge.d}
                            data-back={edge.back ? "" : undefined}
                            key={`${edge.source}-${edge.target}-${String(index)}`}
                            markerEnd={`url(#${arrow})`}
                        />
                    ))}
                    {layout.edges.map((edge, index) =>
                        edge.label === undefined || edge.labelAt === undefined ? null : (
                            <text
                                className="happy-flow__edge-label"
                                dominantBaseline="central"
                                key={`label-${String(index)}`}
                                textAnchor={edge.labelAt.anchor}
                                x={edge.labelAt.x}
                                y={edge.labelAt.y}
                            >
                                {edge.label}
                            </text>
                        ),
                    )}
                    {layout.nodes.map((node) => {
                        const middle = node.y + FLOW_NODE_HEIGHT / 2;
                        const chipX = node.x + node.width - FLOW_NODE_PADDING - FLOW_CHIP / 2;
                        const chapter = node.chapter;
                        return (
                            <g
                                className="happy-flow__node"
                                data-mark={node.mark ?? "none"}
                                key={node.id}
                            >
                                <rect
                                    className="happy-flow__box"
                                    height={FLOW_NODE_HEIGHT - 1}
                                    rx="8"
                                    width={node.width - 1}
                                    x={node.x + 0.5}
                                    y={node.y + 0.5}
                                />
                                {node.mark === undefined ? null : (
                                    <circle
                                        className="happy-flow__dot"
                                        cx={node.x + FLOW_NODE_PADDING + FLOW_DOT / 2}
                                        cy={middle}
                                        r={FLOW_DOT / 2}
                                    />
                                )}
                                <text
                                    className="happy-flow__name"
                                    dominantBaseline="central"
                                    x={
                                        node.x +
                                        FLOW_NODE_PADDING +
                                        (node.mark === undefined ? 0 : FLOW_DOT + FLOW_DOT_GAP)
                                    }
                                    y={middle}
                                >
                                    {node.id}
                                </text>
                                {chapter === undefined ? null : (
                                    <g
                                        aria-label={`Chapter ${String(chapter)}`}
                                        className="happy-flow__chip"
                                        {...(props.onChapterOpen === undefined
                                            ? {}
                                            : {
                                                  "data-openable": "",
                                                  onClick: (event: MouseEvent<SVGGElement>) => {
                                                      props.onChapterOpen?.(
                                                          chapter,
                                                          event.currentTarget,
                                                      );
                                                  },
                                                  onKeyDown: (
                                                      event: KeyboardEvent<SVGGElement>,
                                                  ) => {
                                                      if (
                                                          event.key !== "Enter" &&
                                                          event.key !== " "
                                                      )
                                                          return;
                                                      event.preventDefault();
                                                      props.onChapterOpen?.(
                                                          chapter,
                                                          event.currentTarget,
                                                      );
                                                  },
                                                  role: "button",
                                                  tabIndex: 0,
                                              })}
                                    >
                                        <title>{`Go to chapter ${String(chapter)}`}</title>
                                        <circle cx={chipX} cy={middle} r={FLOW_CHIP / 2} />
                                        <text
                                            dominantBaseline="central"
                                            textAnchor="middle"
                                            x={chipX}
                                            y={middle}
                                        >
                                            {chapter}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </ScrollArea>
        </div>
    );
}
