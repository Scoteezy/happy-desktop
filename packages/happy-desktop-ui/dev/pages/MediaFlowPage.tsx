import type { ConversationMediaItem } from "happy-desktop-state";
import { MediaImageTile } from "../../src/ConversationMedia";
import { MediaFlow } from "../../src/MediaFlow";
import {
    MESSAGE_MEDIA_LIMITS,
    MESSAGE_MEDIA_MAX_WIDTH,
    mediaColumnsPlan,
    mediaFlowHeight,
    mediaJustifiedPlan,
    type MediaFlowPlan,
} from "../../src/mediaLayout";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    complaintConnect,
    complaintCreateProfile,
    generatedPortrait,
    generatedSquare,
    readFlat,
    readNarrow,
    readTall,
    readWide,
} from "./conversationMediaLayoutFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-303";

const MEASURE = 720;

const specimens: readonly {
    label: string;
    detail: string;
    items: readonly ConversationMediaItem[];
    plan: MediaFlowPlan;
    maxWidth?: number;
    align?: "start" | "end";
}[] = [
    {
        label: "Cells, two columns",
        detail: "fixed columns; a tile is its column's width at its shape, under a 480 cap",
        items: [readWide, readNarrow, readFlat, readTall],
        plan: mediaColumnsPlan([readWide, readNarrow, readFlat, readTall], 2),
    },
    {
        label: "Cells, one column",
        detail: "full width, at most 640 tall, never past the picture's own pixels",
        items: [generatedSquare, generatedPortrait],
        plan: mediaColumnsPlan([generatedSquare, generatedPortrait], 1),
    },
    {
        label: "Justified",
        detail: "one shared height per row; extreme shapes take their own row",
        items: [complaintConnect, complaintCreateProfile, readFlat, readWide, generatedSquare],
        plan: mediaJustifiedPlan([
            complaintConnect,
            complaintCreateProfile,
            readFlat,
            readWide,
            generatedSquare,
        ]),
    },
    {
        label: "Message photos, own",
        detail: "a bubble-width box (560) aligned to the end, with the message limits",
        items: [complaintConnect, generatedSquare],
        plan: mediaJustifiedPlan([complaintConnect, generatedSquare], MESSAGE_MEDIA_LIMITS),
        maxWidth: MESSAGE_MEDIA_MAX_WIDTH,
        align: "end",
    },
];

export function MediaFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Rows of pictures at their own shapes, sized by flexbox from a width-independent plan; mediaFlowGeometry is the same layout in arithmetic."
            title="MediaFlow"
        >
            {specimens.map((specimen, index) => (
                <Specimen
                    detail={specimen.detail}
                    key={specimen.label}
                    label={specimen.label}
                    number={String(index + 1).padStart(2, "0")}
                    stage="surface"
                >
                    <div style={{ width: `${String(MEASURE)}px` }}>
                        <MediaFlow
                            {...(specimen.align ? { align: specimen.align } : {})}
                            {...(specimen.maxWidth ? { maxWidth: specimen.maxWidth } : {})}
                            plan={specimen.plan}
                            renderTile={(position, style) => (
                                <MediaImageTile
                                    alt={specimen.items[position]!.name}
                                    key={position}
                                    style={style}
                                    url={specimen.items[position]!.url}
                                />
                            )}
                        />
                    </div>
                    <DimensionRule
                        label={`${String(MEASURE)}px measure · ${String(Math.round(mediaFlowHeight(specimen.plan, Math.min(MEASURE, specimen.maxWidth ?? MEASURE)) * 100) / 100)}px modeled`}
                    />
                </Specimen>
            ))}
        </ComponentPage>
    );
}
