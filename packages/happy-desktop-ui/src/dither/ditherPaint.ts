/** Ported from https://github.com/Boring-Software-Inc/dither-kit at
 * 1e7faee9aa252e499651e6736ed65f7a07d9a6bd. MIT per its package.json.
 * Adapted from dither-paint.ts; preserves its Bayer thresholds, alpha tiers,
 * gradient fill, feathered border, and two-CSS-pixel backing cells. */
const BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
].map((row) => row.map((value) => (value + 0.5) / 16));
export const ditherEase = (t: number): number => 1 - (1 - t) ** 3;
export function ditherBackingSize(width: number, height: number): { cols: number; rows: number } {
    return {
        cols: Math.min(520, Math.max(8, Math.round(width / 2))),
        rows: Math.min(200, Math.max(8, Math.round(height / 2))),
    };
}
export function ditherPaintColumn(
    context: CanvasRenderingContext2D,
    x: number,
    top: number,
    floor: number,
    color: string,
    sparse: number,
): void {
    const start = Math.round(top);
    const end = Math.round(floor);
    const depth = end - start;
    context.fillStyle = color;
    for (let y = start; y < end; y++) {
        const density = (y - start) / Math.max(1, depth);
        const threshold = BAYER[y & 3]?.[x & 3] ?? 0.5;
        const lit = density > threshold + sparse;
        const strength = 0.3 + density * 0.7;
        context.globalAlpha = Math.min(1, lit ? strength : strength * 0.4);
        context.fillRect(x, y, 1, 1);
    }
    context.globalAlpha = 0.72;
    context.fillRect(x, start, 1, 1);
    if (depth > 1) {
        context.globalAlpha = 0.36;
        context.fillRect(x, start + 1, 1, 1);
    }
    context.globalAlpha = 1;
}
