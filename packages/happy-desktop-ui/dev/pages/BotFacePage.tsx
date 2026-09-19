import { BotFace, botFaceCredit } from "../../src/BotFace";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-282";

/** Fixed seeds, so the faces on the blueprint are the same every time. */
const SEEDS = ["blueprint1", "blueprint2", "blueprint3", "blueprint4", "blueprint5", "blueprint6"];

const row: Record<string, string> = {
    display: "flex",
    alignItems: "flex-end",
    gap: "16px",
};

export function BotFacePage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A bot's face drawn from a seed: DiceBear's Adventurer Neutral, bundled, deterministic, and credited."
            title="BotFace"
        >
            <Specimen
                detail="six seeds at the size the creation page offers them · the same seed always draws the same face"
                label="Faces"
                number="01"
                stage="app"
            >
                <div style={row}>
                    {SEEDS.map((seed) => (
                        <BotFace key={seed} seed={seed} size={56} />
                    ))}
                </div>
                <DimensionRule label="56px square · corner radius 10px" />
            </Specimen>
            <Specimen
                detail="one seed at every size a face is shown: the sidebar row, the tab, the creation page, the painted raster"
                label="Sizes"
                number="02"
                stage="app"
            >
                <div style={row}>
                    <BotFace seed="blueprint1" size={20} />
                    <BotFace seed="blueprint1" size={28} />
                    <BotFace seed="blueprint1" size={36} />
                    <BotFace seed="blueprint1" size={56} />
                    <BotFace seed="blueprint1" size={96} />
                </div>
                <DimensionRule label="20 · 28 · 36 · 56 · 96" />
            </Specimen>
            <Specimen
                detail={`the credit the creation page prints, read from the style definition: "${botFaceCredit.pack} by ${botFaceCredit.artist}"`}
                label="Credit"
                number="03"
                stage="app"
            >
                <p
                    style={{
                        color: "var(--text-secondary)",
                        font: "400 12px/18px var(--happy-font-ui)",
                        margin: 0,
                    }}
                >
                    {botFaceCredit.pack} by{" "}
                    <span style={{ color: "var(--text-link)" }}>{botFaceCredit.artist}</span>
                    {" · "}
                    {botFaceCredit.artistUrl}
                </p>
            </Specimen>
        </ComponentPage>
    );
}
