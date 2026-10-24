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
];

export function MediaVideoTilePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A recording played where it was presented, the way the system's inline player draws one: the frame alone at rest, a translucent play button on hover, and once it plays the corners and a thin timeline."
            title="MediaVideoTile"
        >
            <Specimen
                detail="idle frame · hover for the play button · click to play, then hover for the corners and timeline"
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
