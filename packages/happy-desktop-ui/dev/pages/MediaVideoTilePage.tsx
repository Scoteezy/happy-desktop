import { conversationMediaVideoBox } from "../../src/conversationRowHeight";
import { MediaVideoTile } from "../../src/ConversationMedia";
import { thumbhashDataUrl } from "../../src/thumbhashDataUrl";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import { mediaWideThumbhash } from "./conversationMediaFixtures";
import { videoClipPortrait, videoClipWide } from "./videoClips";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-293";

export function MediaVideoTilePage() {
    const fallback = conversationMediaVideoBox({});
    const portrait = conversationMediaVideoBox({ width: 720, height: 1280 });
    return (
        <ComponentPage
            number={componentNumber}
            summary="A recording played where it was presented: a reserved box, metadata-only preload, and the native transport."
            title="MediaVideoTile"
        >
            <Specimen
                detail="no stated frame → 16:9 at the 380px cap · stated frame → the photo box"
                label="Inline player"
                number="01"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "row",
                        alignItems: "flex-start",
                        gap: "16px",
                    }}
                >
                    <MediaVideoTile
                        height={fallback.height}
                        name="onboarding-walkthrough.webm"
                        url={videoClipWide}
                        width={fallback.width}
                    />
                    <MediaVideoTile
                        height={portrait.height}
                        name="handheld.webm"
                        posterUrl={thumbhashDataUrl(mediaWideThumbhash)}
                        url={videoClipPortrait}
                        width={portrait.width}
                    />
                </div>
                <DimensionRule
                    label={`${String(fallback.width)} × ${String(fallback.height)} fallback · ${String(portrait.width)} × ${String(portrait.height)} portrait`}
                />
            </Specimen>
        </ComponentPage>
    );
}
