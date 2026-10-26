import {
    mediaLayoutProject,
    type ConversationMediaItem,
    type ConversationMediaLayout,
} from "happy-desktop-state";
import { ConversationMedia } from "../../src/ConversationMedia";
import { conversationMediaHeight } from "../../src/conversationRowHeight";
import { MediaVideoTile } from "../../src/MediaVideoTile";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    mediaAspectRecordings,
    mediaAspectRecordingsUnsized,
    mediaDesktopRecording,
    mediaPhoneInbox,
    mediaPhoneProfile,
    mediaPhoneSettings,
} from "./conversationMediaFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-293";

/** A tool row's measure at Happy's default window. */
const MEASURE = 720;

const phones = [mediaPhoneInbox, mediaPhoneProfile, mediaPhoneSettings];

/** Three recordings an agent laid out in its reply as a three-column grid. */
const phoneGrid = mediaLayoutProject(
    {
        type: "tree",
        root: [
            {
                type: "element",
                tag: "div",
                style: {
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "12px",
                },
                children: phones.map((_, index) => ({ type: "item", index })),
            },
        ],
    },
    phones.length,
);
if (!phoneGrid) throw new Error("fixture layout did not project");

const aspectGrid = mediaLayoutProject(
    {
        type: "tree",
        root: [
            {
                type: "element",
                tag: "div",
                style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
                children: mediaAspectRecordings.map((_, index) => ({
                    type: "item",
                    index,
                    style: { width: "100%" },
                })),
            },
        ],
    },
    mediaAspectRecordings.length,
);
if (!aspectGrid) throw new Error("fixture layout did not project");

const specimens: readonly {
    label: string;
    detail: string;
    items: readonly ConversationMediaItem[];
    layout?: ConversationMediaLayout;
}[] = [
    {
        label: "One phone recording",
        detail: "a lone portrait recording at its own shape: no letterbox, 640 tall at most",
        items: [mediaPhoneInbox],
    },
    {
        label: "One landscape recording",
        detail: "a lone wide recording at the full measure",
        items: [mediaDesktopRecording],
    },
    {
        label: "Three phone recordings",
        detail: "one call presenting three: justified side by side, one shared height",
        items: phones,
    },
    {
        label: "A grid the agent wrote",
        detail: "a reply's three-column layout naming the recordings it showed",
        items: phones,
        layout: phoneGrid,
    },
    {
        label: "Awkward shapes",
        detail: "886 × 1920, 1170 × 2532, square, 32:9 — each at its own shape; the pink band is the picture's own edge",
        items: mediaAspectRecordings,
    },
    {
        label: "Awkward shapes, no stated size",
        detail: "as today's daemon presents recordings: each shape learned from its own metadata, once",
        items: mediaAspectRecordingsUnsized,
    },
    {
        label: "Awkward shapes in a grid the agent wrote",
        detail: "a two-column reply layout of the same four",
        items: mediaAspectRecordings,
        layout: aspectGrid,
    },
];

export function MediaVideoTilePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A recording played where it was presented, the way the system's inline player draws one: at its own shape, with a translucent play button and a timeline showing its length whenever it is not playing, the corners on hover, and only a thin progress line while it plays unwatched."
            title="MediaVideoTile"
        >
            <Specimen
                detail="play button and timeline at rest · hover for expand and mute · click to play; the controls rest while it plays"
                label="Inline player"
                number="01"
                stage="surface"
            >
                <MediaVideoTile
                    data-testid="media-video-tile-single"
                    height={480}
                    name={mediaPhoneInbox.name}
                    onOpen={() => {}}
                    url={mediaPhoneInbox.url}
                    width={222}
                />
                <DimensionRule label="222 × 480 · 8px corners · 48px play · 28px corners and timeline, 8px in" />
            </Specimen>
            {specimens.map((specimen, index) => (
                <Specimen
                    detail={specimen.detail}
                    key={specimen.label}
                    label={specimen.label}
                    number={String(index + 2).padStart(2, "0")}
                    stage="surface"
                >
                    <div
                        data-testid={`media-video-tile-${String(index + 2)}`}
                        style={{ width: `${String(MEASURE)}px` }}
                    >
                        <ConversationMedia
                            items={specimen.items}
                            {...(specimen.layout ? { layout: specimen.layout } : {})}
                            onItemOpen={() => {}}
                        />
                    </div>
                    <DimensionRule
                        label={`${String(MEASURE)}px measure · ${String(Math.round(conversationMediaHeight(specimen.items, MEASURE, specimen.layout)))}px reserved by the row model`}
                    />
                </Specimen>
            ))}
        </ComponentPage>
    );
}
