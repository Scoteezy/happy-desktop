/** Ported from https://github.com/Boring-Software-Inc/dither-kit at
 * 1e7faee9aa252e499651e6736ed65f7a07d9a6bd. MIT per its package.json.
 * Adapted from scales.ts and dither-paint.ts resampling. Local linear scales
 * and monotone Hermite interpolation replace d3. Null measurements stay gaps. */
import type { DitherPoint, DitherSeries, DitherSurface } from "./ditherTypes";

export function ditherNearestIndex(points: readonly DitherPoint[], x: number): number {
    let low = 0;
    let high = points.length - 1;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if ((points[middle]?.x ?? Infinity) < x) low = middle + 1;
        else high = middle;
    }
    return low > 0 && Math.abs((points[low - 1]?.x ?? 0) - x) < Math.abs((points[low]?.x ?? 0) - x)
        ? low - 1
        : low;
}

/** Weighted harmonic tangents cannot overshoot a monotone pair of samples. */
function tangent(points: readonly DitherPoint[], index: number): number {
    const left = points[index - 1];
    const point = points[index];
    const right = points[index + 1];
    if (!point || point.value === null) return 0;
    const before =
        left?.value == null || point.x <= left.x
            ? null
            : (point.value - left.value) / (point.x - left.x);
    const after =
        right?.value == null || right.x <= point.x
            ? null
            : (right.value - point.value) / (right.x - point.x);
    if (before === null) return after ?? 0;
    if (after === null) return before;
    if (before * after <= 0) return 0;
    const leftSpan = point.x - (left?.x ?? point.x);
    const rightSpan = (right?.x ?? point.x) - point.x;
    const a = 2 * rightSpan + leftSpan;
    const b = rightSpan + 2 * leftSpan;
    return (a + b) / (a / before + b / after);
}

function resample(
    points: readonly DitherPoint[],
    columns: number,
    first: number,
    duration: number,
): readonly (number | null)[] {
    if (points.length === 0) return Array.from({ length: columns }, () => null);
    const tangents = points.map((_, index) => tangent(points, index));
    let cursor = 0;
    return Array.from({ length: columns }, (_, column) => {
        const x = first + (column / Math.max(1, columns - 1)) * duration;
        while (cursor + 1 < points.length && (points[cursor + 1]?.x ?? Infinity) <= x) cursor++;
        const a = points[cursor];
        const b = points[cursor + 1];
        if (!a || a.value === null || x < a.x) return null;
        if (!b) return a.value;
        if (b.value === null) return x === a.x ? a.value : null;
        const span = b.x - a.x;
        if (span <= 0) return b.value;
        const t = Math.max(0, Math.min(1, (x - a.x) / span));
        const t2 = t * t;
        const t3 = t2 * t;
        const value =
            (2 * t3 - 3 * t2 + 1) * a.value +
            (t3 - 2 * t2 + t) * span * (tangents[cursor] ?? 0) +
            (-2 * t3 + 3 * t2) * b.value +
            (t3 - t2) * span * (tangents[cursor + 1] ?? 0);
        return Math.min(Math.max(a.value, b.value), Math.max(Math.min(a.value, b.value), value));
    });
}

export function ditherSurfaces(
    series: readonly DitherSeries[],
    maximum: number | undefined,
    columns: number,
    rows: number,
): readonly DitherSurface[] {
    const populated = series.filter((entry) => entry.points.length > 0);
    const first = populated.length
        ? Math.min(...populated.map((entry) => entry.points[0]?.x ?? 0))
        : 0;
    const last = populated.length
        ? Math.max(...populated.map((entry) => entry.points.at(-1)?.x ?? 0))
        : 0;
    const max = Math.max(
        1,
        maximum ??
            Math.max(
                1,
                ...series.flatMap((entry) =>
                    entry.points.flatMap((point) => (point.value === null ? [] : [point.value])),
                ),
            ),
    );
    return series.map((entry) => ({
        id: entry.id,
        color: entry.color,
        top: resample(entry.points, columns, first, Math.max(0, last - first)).map((value) =>
            value === null ? null : (1 - Math.max(0, Math.min(1, value / max))) * (rows - 1),
        ),
    }));
}
