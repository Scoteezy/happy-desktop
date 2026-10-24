import type { ReactNode } from "react";
import { StoryViewer, type StoryViewerAuthor, type StoryViewerViewers } from "../../src";
import { ComponentPage, Specimen } from "../kit";
import {
    FIXTURE_NOW,
    STORY_MINE,
    STORY_MINT,
    STORY_SKY,
    STORY_SUNSET,
    fixtureFrameUrl,
    fixturePostedLabel,
    fixtureSticker,
    storyAvatar,
} from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-315";

const noop = () => {};

const authors: readonly StoryViewerAuthor[] = [
    {
        id: "me",
        name: "My Story",
        initials: "KD",
        self: true,
        photoUrl: storyAvatar("#5b6cff"),
        stories: [STORY_MINE],
    },
    {
        id: "ana",
        name: "Ana",
        initials: "AN",
        self: false,
        photoUrl: storyAvatar("#ff7a59"),
        stories: [STORY_SKY, STORY_SUNSET],
    },
    { id: "sam", name: "Sam", initials: "SA", self: false, stories: [STORY_MINT] },
];

const viewers: StoryViewerViewers = {
    status: "ready",
    viewers: [
        {
            userId: "ana",
            name: "Ana",
            photo: null,
            thumbhash: null,
            reaction: "👍",
            reactedAt: FIXTURE_NOW,
        },
        {
            userId: "sam",
            name: "Sam",
            photo: null,
            thumbhash: null,
            reaction: "👍",
            reactedAt: FIXTURE_NOW,
        },
        {
            userId: "lee",
            name: "Leonardo",
            photo: null,
            thumbhash: null,
            reaction: null,
            reactedAt: null,
        },
    ],
};

/**
 * The viewer fills its window, so each specimen hosts it in a window-sized,
 * transformed frame: the transform makes the frame the overlay's containing
 * block, keeping the fixed overlay inside the card.
 */
function Window(props: { readonly children: ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                position: "relative",
                width: "1024px",
                height: "704px",
                overflow: "hidden",
                transform: "translateZ(0)",
            }}
        >
            {props.children}
        </div>
    );
}

export function StoryViewerPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The full-window story viewer: progress segments, the author's name and time, the 9:16 frame between previous and next author buttons, and a reply bar of quick reactions. Click the left or right third to step, hold to pause, Escape or swipe down to close."
            title="Story viewer"
            width={1104}
        >
            <div className="specimen-grid">
                <Specimen
                    detail="1024×704 window · a teammate's two-frame story"
                    label="Someone's story"
                    number="SV-01"
                    stage="surface"
                >
                    <Window>
                        <StoryViewer
                            authors={authors}
                            frameUrl={fixtureFrameUrl}
                            onClose={noop}
                            onLinkOpen={noop}
                            onReact={noop}
                            onSeen={noop}
                            postedLabel={fixturePostedLabel}
                            startAuthorId="ana"
                            sticker={fixtureSticker}
                        />
                    </Window>
                </Specimen>
                <Specimen
                    detail="1024×704 window · view count and the viewers list"
                    label="My story"
                    number="SV-02"
                    stage="surface"
                >
                    <Window>
                        <StoryViewer
                            authors={authors}
                            frameUrl={fixtureFrameUrl}
                            onClose={noop}
                            onDelete={() => Promise.resolve()}
                            onLinkOpen={noop}
                            onOwnStoryShown={noop}
                            onReact={noop}
                            onSeen={noop}
                            onViewersRequest={noop}
                            postedLabel={fixturePostedLabel}
                            startAuthorId="me"
                            sticker={fixtureSticker}
                            viewers={() => viewers}
                        />
                    </Window>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
