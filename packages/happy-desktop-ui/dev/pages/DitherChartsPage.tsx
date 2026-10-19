import { DitherChart } from "../../src/dither/DitherChart";
import { DitherSparkline } from "../../src/dither/DitherSparkline";
import { ComponentPage, Specimen } from "../kit";
export const componentNumber = "C-300";
const first = 1791974340000;
const points = Array.from({ length: 60 }, (_, index) => ({
    x: first + index * 1000,
    value: 25 + Math.sin(index / 4) * 12 + (index > 22 && index < 35 ? 30 : 0),
}));
const format = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);
const xFormat = (x: number) => new Date(x).toLocaleTimeString("en-US");
export function DitherChartsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Dither charts"
            contract="Props only"
            summary="An attributed Dither Kit port: theme-aware Bayer areas, monotone curves, keyboard and pointer scrubbing, finite sample transitions, and visibility-scoped sparklines."
        >
            <Specimen
                number="01"
                label="Area and scrub tooltip"
                detail="420 × 72. Pointer scrubbing and arrow keys show time and value. One entrance per mounted canvas; subsequent samples glide."
                stage="surface"
            >
                <div style={{ display: "flex", width: "420px", height: "72px" }}>
                    <DitherChart
                        label="CPU history"
                        series={[{ id: "cpu", label: "CPU", color: "blue", points }]}
                        maximum={100}
                        valueFormat={format}
                        xFormat={xFormat}
                    />
                </div>
            </Specimen>
            <Specimen
                number="02"
                label="Two series"
                detail="Read and write share one scale and one scrub tooltip."
                stage="surface"
            >
                <div style={{ display: "flex", width: "420px", height: "72px" }}>
                    <DitherChart
                        label="I/O history"
                        series={[
                            { id: "read", label: "Read", color: "blue", points },
                            {
                                id: "write",
                                label: "Write",
                                color: "orange",
                                points: points.map((point) => ({
                                    ...point,
                                    value: point.value / 3,
                                })),
                            },
                        ]}
                        valueFormat={(value) => (value === null ? "—" : `${value.toFixed(1)} MB/s`)}
                        xFormat={xFormat}
                    />
                </div>
            </Specimen>
            <Specimen
                number="03"
                label="Sparkline"
                detail="150 × 20. Process rows reuse the same painter and shared visibility observer."
                stage="surface"
            >
                <div style={{ display: "flex", width: "150px" }}>
                    <DitherSparkline
                        label="Process CPU history"
                        values={points.map((point) => point.value)}
                        color="blue"
                    />
                </div>
            </Specimen>
            <Specimen
                number="04"
                label="Unavailable and missing samples"
                detail="Missing values preserve gaps. An empty chart paints only a quiet guide."
                stage="surface"
            >
                <div style={{ display: "flex", gap: "24px" }}>
                    <div style={{ display: "flex", width: "240px" }}>
                        <DitherChart
                            label="Partial history"
                            series={[
                                {
                                    id: "cpu",
                                    label: "CPU",
                                    color: "blue",
                                    points: points.map((point, index) => ({
                                        ...point,
                                        value: index > 20 && index < 35 ? null : point.value,
                                    })),
                                },
                            ]}
                            maximum={100}
                            valueFormat={format}
                            xFormat={xFormat}
                        />
                    </div>
                    <div style={{ display: "flex", width: "240px" }}>
                        <DitherChart label="Loading history" series={[]} valueFormat={format} />
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
