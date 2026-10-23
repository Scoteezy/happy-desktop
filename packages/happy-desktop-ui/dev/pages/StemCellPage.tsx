import { useState } from "react";
import crashLarge from "../../src/assets/clay-icons/crash@64.png";
import { Button } from "../../src/Button";
import { clayIconMark } from "../../src/clayIcons";
import { MakeStuffIntro, type MakeStuffOption } from "../../src/MakeStuffView";
import { StemCell } from "../../src/StemCell";
import { StemCellGrowth, type ImageMark } from "../../src/StemCellGrowth";
import { stemCellPaletteOf } from "../../src/stemCellGrowth";
import { createStemCellEngine, stemCellVariantFor } from "../../src/stemCellEngine";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-298";
const ids = ["window-navigation", "release-note-ideas", "shortcut-ideas"];
const sizes = [16, 20, 64] as const;
const options: readonly MakeStuffOption[] = [
    { id: "todos", icon: "tasks", label: "New todo list" },
    { id: "document", icon: "doc", label: "New document" },
    { id: "calendar", icon: "calendar", label: "New calendar" },
    { id: "monitor", icon: "pulse", label: "New system monitor" },
    { id: "chat", icon: "users", label: "New chat" },
    { id: "bot", icon: "agents", label: "New bot" },
];
const growthId = "window-navigation";
const crash = clayIconMark("crash");
/** The picture each size grows into: the @40 clay PNG in a 20px lane, the @64 one at 64px. */
const growthImages: Record<20 | 64, ImageMark> = {
    20: { ...crash, growsFromStemCell: true },
    64: { src: crashLarge, alt: "", growsFromStemCell: true },
};
/** Fixed moments of the 2.5 s growth, so the strip is the same in every capture. */
const frameTimes = [0, 300, 600, 900, 1200, 1550, 1900, 2200, 2500];

/**
 * Draws fixed moments of the growth with the engine itself, on whatever
 * WebGL2 this browser has, software included. Nothing here moves.
 */
function GrowthFrames(props: { size: 20 | 64 }) {
    const draw = (strip: HTMLDivElement | null) => {
        if (!strip) return;
        const image = new Image();
        image.src = growthImages[props.size].src;
        void image
            .decode()
            .then(() => {
                const pixelRatio = 2;
                const device = props.size * pixelRatio;
                const source = document.createElement("canvas");
                const engine = createStemCellEngine(source, {
                    id: growthId,
                    size: device,
                    palette: stemCellPaletteOf(strip),
                    variant: stemCellVariantFor(props.size),
                    allowSoftware: true,
                });
                engine.assign(image);
                for (const target of strip.querySelectorAll("canvas")) {
                    engine.render(Number(target.dataset.ms));
                    target.width = target.height = device;
                    target.getContext("2d")?.drawImage(source, 0, 0);
                }
                engine.destroy();
            })
            .catch(() => {
                // No WebGL2 at all: the strip stays empty rather than guessing.
            });
    };
    return (
        <div ref={draw} style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>
            {frameTimes.map((ms) => (
                <div
                    key={ms}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <canvas
                        data-ms={ms}
                        style={{ display: "block", width: props.size, height: props.size }}
                    />
                    <DimensionRule label={`${ms} ms`} />
                </div>
            ))}
        </div>
    );
}

/** The real mark, grown on request: the stem cell until Grow, the clay icon after. */
function GrowthLive(props: { software: boolean; grown: boolean }) {
    return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
            {([20, 64] as const).map((size) => (
                <div
                    key={size}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                    }}
                >
                    <div style={{ display: "flex", width: size, height: size }}>
                        <StemCellGrowth
                            imageClassName="blueprint-stem-cell-growth-image"
                            {...(props.grown
                                ? { imageMark: growthImages[size] }
                                : { stemCell: { id: growthId } })}
                            size={size}
                            softwareRendering={props.software}
                        />
                    </div>
                    <DimensionRule label={`${size}`} />
                </div>
            ))}
        </div>
    );
}

export function StemCellPage() {
    const [grown, setGrown] = useState(false);
    const [software, setSoftware] = useState(false);
    return (
        <ComponentPage
            number={componentNumber}
            title="Stem cell"
            summary="An item’s identity before it takes shape. The seeded core is placed first, then a smooth membrane is scaled to contain it. Optional phase drift is held still in the Blueprint. When the item is given its clay icon on screen, the cell divides into the icon’s colours and converges onto its silhouette for 2.5 s, then hands over to the icon."
        >
            {(["light", "dark"] as const).map((mode, index) => (
                <Specimen
                    key={mode}
                    number={`0${index + 1}`}
                    label={`${mode} · 16 / 20 / 64`}
                    detail="Three stable identities at each supported size · optional wobble paused"
                    stage="app"
                >
                    <ThemeScope mode={mode}>
                        <div
                            style={{
                                display: "flex",
                                gap: 32,
                                padding: 24,
                                background: "var(--surface)",
                            }}
                        >
                            {ids.map((id) => (
                                <div
                                    key={id}
                                    style={{ display: "flex", alignItems: "flex-end", gap: 16 }}
                                >
                                    {sizes.map((size) => (
                                        <div
                                            key={size}
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: 8,
                                            }}
                                        >
                                            <StemCell id={id} size={size} wobble />
                                            <DimensionRule label={`${size}`} />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </ThemeScope>
                </Specimen>
            ))}
            <Specimen
                number="03"
                label="New work · create options"
                detail="Before its first message a stem cell offers the kinds of thing it can be made as at once; the chat under it stays, so saying what it is still works"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        width: 640,
                        padding: 24,
                        background: "var(--surface)",
                    }}
                >
                    <MakeStuffIntro
                        id="window-navigation"
                        options={options}
                        onOptionSelect={() => {}}
                    />
                    <DimensionRule label="options wrap at 480 px · 8 px gap" />
                </div>
            </Specimen>
            {(["light", "dark"] as const).map((mode, index) => (
                <Specimen
                    key={`frames-${mode}`}
                    number={`0${index + 4}`}
                    label={`${mode} · growth frames · 20 / 64`}
                    detail="Fixed moments of the growth into a clay icon, drawn by the engine · 8 cells at 20, 16 at 64"
                    stage="app"
                >
                    <ThemeScope mode={mode}>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 24,
                                padding: 24,
                                background: "var(--surface)",
                            }}
                        >
                            <GrowthFrames size={20} />
                            <GrowthFrames size={64} />
                        </div>
                    </ThemeScope>
                </Specimen>
            ))}
            <Specimen
                number="06"
                label="growth · live · 20 / 64"
                detail="The mark at rest until Grow; then it plays once and shows the icon. A software renderer shows the icon at once unless allowed"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 32,
                        padding: 24,
                        background: "var(--surface)",
                    }}
                >
                    <GrowthLive grown={grown} software={software} />
                    <div style={{ display: "flex", gap: 8 }}>
                        <Button size="small" onClick={() => setGrown(!grown)}>
                            {grown ? "Reset" : "Grow"}
                        </Button>
                        <Button size="small" onClick={() => setSoftware(!software)}>
                            {software ? "GPU only" : "Allow software"}
                        </Button>
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
