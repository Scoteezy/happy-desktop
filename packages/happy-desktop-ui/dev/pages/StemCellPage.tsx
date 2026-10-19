import { StemCell } from "../../src/StemCell";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-298";
const ids = ["window-navigation", "release-note-ideas", "shortcut-ideas"];
const sizes = [16, 20, 64] as const;

export function StemCellPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Stem cell"
            summary="An item’s identity before it takes shape. The seeded core is placed first, then a smooth membrane is scaled to contain it. Optional phase drift is held still in the Blueprint."
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
        </ComponentPage>
    );
}
