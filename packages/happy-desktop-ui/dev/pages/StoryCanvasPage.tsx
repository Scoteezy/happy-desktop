import { StoryCanvas } from "../../src";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    STORY_DRAFT,
    STORY_GONE_MEDIA,
    STORY_SUNSET,
    fixtureFrameMedia,
    fixtureSticker,
    storyFrame,
} from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-313";

const sunset = STORY_SUNSET.frames[0];
const draft = STORY_DRAFT.frames[0];
const gone = STORY_GONE_MEDIA.frames[0];
const blank = storyFrame("blank", [
    {
        id: "fills-1",
        type: "text",
        text: "Plain",
        style: {
            font: "sanFrancisco",
            fill: "regular",
            color: "#FFFFFF",
            align: "center",
            width: 0.8,
        },
        transform: { x: 0.5, y: 0.14, scale: 0.8, rotation: 0 },
    },
    {
        id: "fills-2",
        type: "text",
        text: "Filled",
        style: { font: "georgia", fill: "filled", color: "#FF453A", align: "center", width: 0.8 },
        transform: { x: 0.5, y: 0.3, scale: 0.8, rotation: 0 },
    },
    {
        id: "fills-3",
        type: "text",
        text: "Semi",
        style: { font: "noteworthy", fill: "semi", color: "#32D74B", align: "center", width: 0.8 },
        transform: { x: 0.5, y: 0.46, scale: 0.8, rotation: 0 },
    },
    {
        id: "fills-4",
        type: "text",
        text: "Stroke",
        style: {
            font: "courierNew",
            fill: "stroke",
            color: "#FFD60A",
            align: "center",
            width: 0.8,
        },
        transform: { x: 0.5, y: 0.62, scale: 0.8, rotation: 0 },
    },
    {
        id: "fills-5",
        type: "text",
        text: "Blur",
        style: { font: "papyrus", fill: "blur", color: "#FFFFFF", align: "center", width: 0.8 },
        transform: { x: 0.5, y: 0.78, scale: 0.8, rotation: 0 },
    },
]);

function Canvas(props: { readonly width: number; readonly children: React.ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                width: `${String(props.width)}px`,
            }}
        >
            <DimensionRule label={`width ${String(props.width)}`} />
            {props.children}
        </div>
    );
}

export function StoryCanvasPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One 9:16 story frame: the background gradient, the placed media, and every overlay — text in five fills and eight fonts, link, sticker, emoji, and reaction bubble. Overlays are sized in container units, so a thumbnail and the full viewer draw the same frame."
            title="Story canvas"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="Viewer size · every overlay kind · reaction count"
                    label="All overlays"
                    number="SC-01"
                    stage="surface"
                >
                    <Canvas width={360}>
                        {sunset ? (
                            <StoryCanvas
                                caption={STORY_SUNSET.caption}
                                frame={sunset}
                                mediaUrl={fixtureFrameMedia(sunset)}
                                myReaction={STORY_SUNSET.myReaction}
                                reactions={STORY_SUNSET.reactions}
                                sticker={fixtureSticker}
                            />
                        ) : null}
                    </Canvas>
                </Specimen>
                <Specimen
                    detail="The five text fills, each in another font"
                    label="Text fills"
                    number="SC-02"
                    stage="surface"
                >
                    <Canvas width={240}>
                        <StoryCanvas frame={blank} sticker={fixtureSticker} />
                    </Canvas>
                </Specimen>
                <Specimen
                    detail="Thumbnail size · stickers held still"
                    label="Thumbnail"
                    number="SC-03"
                    stage="surface"
                >
                    <Canvas width={120}>
                        {draft ? (
                            <StoryCanvas
                                animate={false}
                                frame={draft}
                                mediaUrl={fixtureFrameMedia(draft)}
                                sticker={fixtureSticker}
                            />
                        ) : null}
                    </Canvas>
                </Specimen>
                <Specimen
                    detail="The media was deleted with its conversation"
                    label="Media unavailable"
                    number="SC-04"
                    stage="surface"
                >
                    <Canvas width={240}>
                        {gone ? <StoryCanvas frame={gone} sticker={fixtureSticker} /> : null}
                    </Canvas>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
