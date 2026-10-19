/** Ported from https://github.com/Boring-Software-Inc/dither-kit at
 * 1e7faee9aa252e499651e6736ed65f7a07d9a6bd. MIT per its package.json.
 * area-chart.tsx, cartesian-root.tsx, area.tsx and tooltip.tsx consolidated for
 * Happy's typed, props-only canvas boundary. No registry, motion, or d3. */
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { ditherCanvasControllerCreate } from "./ditherCanvas";
import { ditherNearestIndex } from "./ditherGeometry";
import type { DitherSeries } from "./ditherTypes";

export interface DitherChartProps {
    series: readonly DitherSeries[];
    maximum?: number;
    label: string;
    className?: string;
    interactive?: boolean;
    animate?: boolean;
    valueFormat: (value: number | null) => string;
    xFormat?: (value: number) => string;
}

export function DitherChart(props: DitherChartProps) {
    // The controller is the canvas lifetime anchor. Retaining it across samples
    // preserves observers, the displayed surface, and the one-time entrance.
    const controller = useMemo(() => ditherCanvasControllerCreate(), []);
    const attach = useCallback(
        (canvas: HTMLCanvasElement | null) => (canvas ? controller.attach(canvas) : undefined),
        [controller],
    );
    const [hover, setHover] = useState<{ index: number; left: number } | null>(null);
    const animate = props.animate ?? true;
    // eslint-disable-next-line happy-react/no-layout-effect -- new series must update the mounted canvas after commit; ref callbacks alone cannot observe prop changes, and cleanup cancels the finite animation
    useLayoutEffect(() => {
        controller.frameUpdate({ series: props.series, maximum: props.maximum, animate });
        return controller.animationStop;
    }, [controller, props.series, props.maximum, animate]);
    const points = props.series[0]?.points ?? [];
    const interactive = props.interactive !== false;
    const scrub = (fraction: number): void => {
        const first = points[0]?.x ?? 0;
        const last = points.at(-1)?.x ?? first;
        const index = ditherNearestIndex(points, first + fraction * (last - first));
        const snapped = last === first ? 0 : ((points[index]?.x ?? first) - first) / (last - first);
        setHover({ index, left: Math.max(0, Math.min(100, fraction * 100)) });
        controller.scrubUpdate(snapped);
    };
    const clear = (): void => {
        setHover(null);
        controller.scrubUpdate(null);
    };
    const point = hover === null ? undefined : points[hover.index];
    const activePoint = point ?? points.at(-1);
    return (
        <div
            className={["happy-dither-chart", props.className].filter(Boolean).join(" ")}
            role={interactive ? "slider" : "img"}
            aria-label={props.label}
            aria-valuemin={interactive ? 0 : undefined}
            aria-valuemax={interactive ? Math.max(0, points.length - 1) : undefined}
            aria-valuenow={
                interactive ? (hover?.index ?? Math.max(0, points.length - 1)) : undefined
            }
            aria-valuetext={
                interactive && activePoint
                    ? `${props.xFormat ? props.xFormat(activePoint.x) : activePoint.x}: ${props.series.map((series) => `${series.label} ${props.valueFormat(series.points[ditherNearestIndex(series.points, activePoint.x)]?.value ?? null)}`).join(", ")}`
                    : undefined
            }
            tabIndex={interactive ? 0 : undefined}
            onPointerMove={
                interactive
                    ? (event) => {
                          const rect = event.currentTarget.getBoundingClientRect();
                          scrub(
                              Math.max(
                                  0,
                                  Math.min(
                                      1,
                                      (event.clientX - rect.left) / Math.max(1, rect.width),
                                  ),
                              ),
                          );
                      }
                    : undefined
            }
            onPointerLeave={clear}
            onBlur={clear}
            onKeyDown={
                interactive
                    ? (event) => {
                          if (
                              !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
                              !points.length
                          )
                              return;
                          event.preventDefault();
                          const index =
                              event.key === "Home"
                                  ? 0
                                  : event.key === "End"
                                    ? points.length - 1
                                    : Math.max(
                                          0,
                                          Math.min(
                                              points.length - 1,
                                              (hover?.index ?? points.length - 1) +
                                                  (event.key === "ArrowLeft" ? -1 : 1),
                                          ),
                                      );
                          const first = points[0]?.x ?? 0;
                          const span = (points.at(-1)?.x ?? first) - first;
                          scrub(span > 0 ? ((points[index]?.x ?? first) - first) / span : 0);
                      }
                    : undefined
            }
        >
            <canvas ref={attach} className="happy-dither-chart__canvas" aria-hidden="true" />
            {hover !== null && point ? (
                <div
                    className="happy-dither-chart__tooltip"
                    role="status"
                    style={{ left: `${Math.max(20, Math.min(80, hover.left))}%` }}
                >
                    <span>{props.xFormat ? props.xFormat(point.x) : String(point.x)}</span>
                    {props.series.map((series) => (
                        <div key={series.id}>
                            <span className="happy-dither-chart__key" data-color={series.color} />
                            <span>{series.label}</span>
                            <strong>
                                {props.valueFormat(
                                    series.points[ditherNearestIndex(series.points, point.x)]
                                        ?.value ?? null,
                                )}
                            </strong>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
