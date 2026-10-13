import { messageMediaSingleBox } from "../../src/mediaMosaic";
import { MediaImageTile } from "../../src/ConversationMedia";
import { thumbhashDataUrl } from "../../src/thumbhashDataUrl";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    mediaBrokenUrl,
    mediaImageSquare,
    mediaImageTall,
    mediaImageWide,
    mediaSquareThumbhash,
    mediaWideThumbhash,
} from "./conversationMediaFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-292";

const row: Record<string, string> = {
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: "16px",
};

export function MediaImageTilePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One picture whose bytes are still on their way: its final box and ThumbHash placeholder at once, the picture fading in over it once decoded."
            title="MediaImageTile"
        >
            <Specimen
                detail="square, wide, and tall pictures at the shared 380 × 320 cap · zoom-in cursor"
                label="Loaded"
                number="01"
                stage="surface"
            >
                <div style={row}>
                    {[mediaImageSquare, mediaImageWide, mediaImageTall].map((item) => {
                        const box = messageMediaSingleBox(item);
                        return (
                            <MediaImageTile
                                alt={item.name}
                                height={box.height}
                                key={item.name}
                                onOpen={() => {}}
                                placeholderUrl={thumbhashDataUrl(item.thumbhash!)}
                                url={item.url}
                                width={box.width}
                            />
                        );
                    })}
                </div>
                <DimensionRule label="box from the producer's dimensions · nothing moves when the bytes land" />
            </Specimen>
            <Specimen
                detail="the ThumbHash stays in the reserved box; a quiet glyph says the picture did not come"
                label="Placeholder and failure"
                number="02"
                stage="surface"
            >
                <div style={row}>
                    <MediaImageTile
                        alt="Square picture that failed"
                        height={320}
                        placeholderUrl={thumbhashDataUrl(mediaSquareThumbhash)}
                        url={mediaBrokenUrl}
                        width={320}
                    />
                    <MediaImageTile
                        alt="Wide picture that failed"
                        height={214}
                        placeholderUrl={thumbhashDataUrl(mediaWideThumbhash)}
                        url={mediaBrokenUrl}
                        width={380}
                    />
                    <MediaImageTile
                        alt="Picture with no placeholder"
                        height={180}
                        url={mediaBrokenUrl}
                        width={240}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
