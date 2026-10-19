/** Ported from https://github.com/Boring-Software-Inc/dither-kit at
 * 1e7faee9aa252e499651e6736ed65f7a07d9a6bd. MIT per its package.json.
 * Adapted from chart-context.tsx: explicit series replace registry/context registration. */
export type DitherColor = "blue" | "green" | "orange" | "red" | "grey";
export interface DitherPoint {
    readonly x: number;
    readonly value: number | null;
}
export interface DitherSeries {
    readonly id: string;
    readonly label: string;
    readonly color: DitherColor;
    readonly points: readonly DitherPoint[];
}
export interface DitherFrame {
    readonly series: readonly DitherSeries[];
    readonly maximum: number | undefined;
    readonly animate: boolean;
}
export interface DitherSurface {
    readonly id: string;
    readonly color: DitherColor;
    readonly top: readonly (number | null)[];
}
