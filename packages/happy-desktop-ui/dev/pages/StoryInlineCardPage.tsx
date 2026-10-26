import { STORY_INLINE_WIDTH, StoryInlineCard, type StoryInlineCardState } from "../../src";
import { ComponentPage, DimensionRule, Specimen } from "../kit";
import {
    STORY_DRAFT,
    STORY_MINE,
    fixtureFrameUrl,
    fixtureSticker,
    fixtureStory,
} from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-314";

const noop = () => {};

const states: readonly {
    readonly number: string;
    readonly label: string;
    readonly detail: string;
    readonly state: StoryInlineCardState;
    readonly editHintOpen?: boolean;
}[] = [
    {
        number: "SI-01",
        label: "My draft",
        detail: "The author reads it: Post, and Edit, which says where to change it",
        state: { type: "ready", story: STORY_DRAFT, mine: true },
    },
    {
        number: "SI-08",
        label: "Edit pressed",
        detail: "No editor on desktop: the hint says where to change it",
        state: { type: "ready", story: STORY_DRAFT, mine: true },
        editHintOpen: true,
    },
    {
        number: "SI-02",
        label: "Posting",
        detail: "Post pressed, waiting for the daemon",
        state: { type: "ready", story: STORY_DRAFT, mine: true, posting: true },
    },
    {
        number: "SI-03",
        label: "Post refused",
        detail: "The daemon refused the last Post",
        state: {
            type: "ready",
            story: STORY_DRAFT,
            mine: true,
            error: "This story changed since it was drafted.",
        },
    },
    {
        number: "SI-04",
        label: "Posted",
        detail: "After Post · the card stays where it was",
        state: { type: "ready", story: STORY_MINE, mine: true },
    },
    {
        number: "SI-05",
        label: "Someone else's draft",
        detail: "Read by another member: no buttons",
        state: { type: "missing" },
    },
    {
        number: "SI-06",
        label: "Deleted",
        detail: "The author deleted it",
        state: {
            type: "ready",
            story: fixtureStory("story-deleted", STORY_DRAFT.frames, { status: "deleted" }),
            mine: true,
        },
    },
    {
        number: "SI-07",
        label: "Loading",
        detail: "Before the story is read",
        state: { type: "loading" },
    },
];

export function StoryInlineCardPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The story an agent drafted, shown inline in the conversation as a compact 9:16 card with plain Post and Edit buttons. There is no editor on desktop: Edit says to ask an agent or use the phone. Every state keeps the same footprint, so posting never moves the transcript."
            title="Story inline card"
        >
            <div className="specimen-grid">
                {states.map((entry) => (
                    <Specimen
                        detail={entry.detail}
                        key={entry.number}
                        label={entry.label}
                        number={entry.number}
                        stage="surface"
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ width: `${String(STORY_INLINE_WIDTH)}px` }}>
                                <DimensionRule label={`canvas ${String(STORY_INLINE_WIDTH)}`} />
                            </div>
                            <StoryInlineCard
                                frameUrl={fixtureFrameUrl}
                                onOpen={noop}
                                onPost={noop}
                                {...(entry.editHintOpen ? { editHintOpen: true } : {})}
                                state={entry.state}
                                sticker={fixtureSticker}
                            />
                        </div>
                    </Specimen>
                ))}
            </div>
        </ComponentPage>
    );
}
