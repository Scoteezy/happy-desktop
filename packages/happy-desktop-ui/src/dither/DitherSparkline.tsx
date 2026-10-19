/** Ported from https://github.com/Boring-Software-Inc/dither-kit at
 * 1e7faee9aa252e499651e6736ed65f7a07d9a6bd. MIT per its package.json.
 * sparkline.tsx adapted to nullable measurements and Happy's shared controller. */
import { DitherChart } from "./DitherChart";
import type { DitherColor } from "./ditherTypes";
/** A percentage history shares a fixed scale across rows, including a first sample. */
export function DitherSparkline(props: {
    values: readonly (number | null)[];
    color: DitherColor;
    label: string;
}) {
    return (
        <DitherChart
            className="happy-dither-sparkline"
            label={props.label}
            interactive={false}
            maximum={100}
            series={[
                {
                    id: "value",
                    label: props.label,
                    color: props.color,
                    points: props.values.map((value, index) => ({ x: index, value })),
                },
            ]}
            valueFormat={(value) => (value === null ? "—" : `${value.toFixed(1)}%`)}
        />
    );
}
