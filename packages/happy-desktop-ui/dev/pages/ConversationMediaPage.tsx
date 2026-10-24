import type { ConversationMediaItem, ConversationMediaLayout } from "happy-desktop-state";
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
import {
    complaintConnect,
    complaintCreateProfile,
    generatedLandscape,
    generatedPortrait,
    generatedSquare,
    readFlat,
    readNarrow,
    readTall,
    readWide,
    readWideSecond,
    treeLayout,
    treeTool,
} from "./conversationMediaLayoutFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-294";

/** A tool row's measure at Happy's default window. */
const MEASURE = 720;
/** A tool row's measure at Happy's minimum window. */
const NARROW_MEASURE = 360;

function sized(
    items: readonly ConversationMediaItem[],
    measure: number,
    layout: ConversationMediaLayout | undefined,
) {
    return `${String(measure)}px measure · ${String(Math.round(conversationMediaHeight(items, measure, layout) * 100) / 100)}px reserved by the row model`;
}

const [general, models] = mediaScreenshots as [ConversationMediaItem, ConversationMediaItem];

const specimens: readonly {
    label: string;
    detail: string;
    items: readonly ConversationMediaItem[];
    layout?: ConversationMediaLayout;
    measure?: number;
}[] = [
    {
        label: "One picture",
        detail: "a lone picture at the full measure, never past its own pixels or 640 tall",
        items: [mediaImageWide],
    },
    {
        label: "The complaint's two screenshots",
        detail: "justified: one shared height, each at its true shape, nothing cropped",
        items: [complaintConnect, complaintCreateProfile],
    },
    {
        label: "Mixed shapes, automatic",
        detail: "a 7:1 strip and a 1:3 crop are extreme and take rows of their own; the rest justify",
        items: [readWide, readNarrow, generatedSquare, readFlat, readWideSecond],
    },
    {
        label: "Seven pictures",
        detail: "linear partition: the rows whose heights land closest to the target",
        items: [
            general,
            models,
            mediaImagePortrait,
            mediaImageSquare,
            mediaImageTall,
            mediaImageWide,
            mediaImagePanorama,
        ],
    },
    {
        label: "Two columns",
        detail: "image reads: a grid at the full measure; each row is as tall as its taller picture",
        items: [readWide, readFlat, readNarrow, readWideSecond],
        layout: { type: "columns", columns: 2 },
    },
    {
        label: "A page-tall capture",
        detail: "capped at 480 in a cell; past 200 wide it letterboxes instead of cropping",
        items: [readTall, readWide],
        layout: { type: "columns", columns: 2 },
    },
    {
        label: "One column",
        detail: "generated images, stacked at full width",
        items: [generatedLandscape, generatedSquare, generatedPortrait],
        layout: { type: "columns", columns: 1 },
    },
    {
        label: "A tree the agent wrote",
        detail: "captions and a two-up grid, drawn from typed nodes and measured off-screen",
        items: treeTool.presentation?.type === "media" ? treeTool.presentation.items : [],
        layout: treeLayout,
    },
    {
        label: "Missing dimensions",
        detail: "no size: the ThumbHash gives the shape, and without one it is 4:3",
        items: [mediaImageHashedOnly, mediaImageUnsized, mediaImageWide],
    },
    {
        label: "Two columns in a narrow column",
        detail: "the same grid at Happy's minimum window",
        items: [readWide, readFlat, readNarrow, readWideSecond],
        layout: { type: "columns", columns: 2 },
        measure: NARROW_MEASURE,
    },
    {
        label: "Mixed presentation",
        detail: "picture and inline recording share a row · PDF card · file card, 8px apart",
        items: [mediaImageSquare, mediaVideo, mediaDocument, mediaFile],
    },
];

export function ConversationMediaPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The files one tool call presented, beneath its transcript line: an agent-written tree, or pictures and recordings first as one uncropped flow (the producer's column grid, else justified rows), then a card per document or file."
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
                            data-reserved={conversationMediaHeight(
                                specimen.items,
                                measure,
                                specimen.layout,
                            )}
                            data-testid={`conversation-media-${String(index + 1)}`}
                            style={{ width: `${String(measure)}px` }}
                        >
                            <ConversationMedia
                                items={specimen.items}
                                {...(specimen.layout ? { layout: specimen.layout } : {})}
                                onItemOpen={() => {}}
                            />
                        </div>
                        <DimensionRule label={sized(specimen.items, measure, specimen.layout)} />
                    </Specimen>
                );
            })}
        </ComponentPage>
    );
}
