import type { ConversationMediaItem } from "happy-desktop-state";
import { ConversationMedia } from "../../src/ConversationMedia";
import { conversationMediaHeight } from "../../src/conversationRowHeight";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    mediaDocument,
    mediaFile,
    mediaImageHashedOnly,
    mediaImagePanorama,
    mediaImagePortrait,
    mediaImageSquare,
    mediaImageTall,
    mediaImageUnsized,
    mediaImageWide,
    mediaScreenshots,
    mediaVideo,
} from "./conversationMediaFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-294";

/** A tool row's measure at a wide window: wider than the mosaic, which stops at 560. */
const MEASURE = 640;
/** A tool row's measure at Happy's minimum window, where the mosaic scales down. */
const NARROW_MEASURE = 360;

function sized(items: readonly ConversationMediaItem[], measure: number) {
    return `${String(measure)}px measure · ${String(Math.round(conversationMediaHeight(items, measure) * 100) / 100)}px reserved by the row model`;
}

const [general, models, secrets, about] = mediaScreenshots as [
    ConversationMediaItem,
    ConversationMediaItem,
    ConversationMediaItem,
    ConversationMediaItem,
];

const specimens: readonly {
    label: string;
    detail: string;
    items: readonly ConversationMediaItem[];
    measure?: number;
}[] = [
    {
        label: "One picture",
        detail: "a lone picture keeps its own box, at most 380 × 320",
        items: [mediaImageWide],
    },
    {
        label: "Two pictures, landscape and portrait",
        detail: "side by side at one shared height, widths from their shapes",
        items: [mediaImageWide, mediaImagePortrait],
    },
    {
        label: "Two screenshots",
        detail: "two wide pictures much wider than the mosaic stack at full width",
        items: [general, models],
    },
    {
        label: "Three pictures",
        detail: "the first across the top, the other two beneath it",
        items: [mediaImageSquare, mediaImageWide, mediaImageTall],
    },
    {
        label: "Three pictures, portrait first",
        detail: "a narrow first picture takes the full height on the left",
        items: [mediaImageTall, mediaImageWide, mediaImageSquare],
    },
    {
        label: "Four 16:10 screenshots",
        detail: "the first across the top, three in one row beneath it",
        items: mediaScreenshots,
    },
    {
        label: "Four pictures, portrait first",
        detail: "the first at full height on the left, three stacked on the right",
        items: [mediaImagePortrait, mediaImageWide, mediaImageSquare, mediaImageTall],
    },
    {
        label: "Five mixed pictures",
        detail: "justified rows: the split whose height lands closest to the target",
        items: [mediaImageWide, mediaImagePortrait, mediaImageSquare, general, mediaImageTall],
    },
    {
        label: "Seven pictures",
        detail: "justified rows, every row flush at both edges",
        items: [
            general,
            models,
            mediaImagePortrait,
            secrets,
            mediaImageSquare,
            about,
            mediaImageWide,
        ],
    },
    {
        label: "A very wide picture",
        detail: "a ratio past 2:1 sends even three pictures to justified rows",
        items: [mediaImagePanorama, mediaImageSquare, mediaImageWide],
    },
    {
        label: "Missing dimensions",
        detail: "no size: the ThumbHash gives the shape, and without one it is 4:3",
        items: [mediaImageHashedOnly, mediaImageUnsized, mediaImageWide],
    },
    {
        label: "Four screenshots in a narrow column",
        detail: "the whole mosaic scales down uniformly below its 560px width",
        items: mediaScreenshots,
        measure: NARROW_MEASURE,
    },
    {
        label: "Mixed presentation",
        detail: "picture · inline recording · PDF card · file card, 8px apart",
        items: [mediaImageSquare, mediaVideo, mediaDocument, mediaFile],
    },
];

export function ConversationMediaPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The files one tool call presented, beneath its transcript line: pictures first as one aspect-aware mosaic, then recordings, then a card per document or file."
            title="ConversationMedia"
        >
            {specimens.map((specimen, index) => {
                const measure = specimen.measure ?? MEASURE;
                return (
                    <Specimen
                        detail={specimen.detail}
                        key={specimen.label}
                        label={specimen.label}
                        number={String(index + 1).padStart(2, "0")}
                        stage="surface"
                    >
                        <div
                            data-reserved={conversationMediaHeight(specimen.items, measure)}
                            data-testid={`conversation-media-${String(index + 1)}`}
                            style={{ width: `${String(measure)}px` }}
                        >
                            <ConversationMedia items={specimen.items} onItemOpen={() => {}} />
                        </div>
                        <DimensionRule label={sized(specimen.items, measure)} />
                    </Specimen>
                );
            })}
        </ComponentPage>
    );
}
