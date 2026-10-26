import { useState } from "react";
import { Button } from "./Button";
import { StoryCanvas } from "./StoryCanvas";
import { Tooltip } from "./Tooltip";
import type { StorySticker } from "./StickerView";
import type { Story } from "./storyTypes";

export type StoryInlineCardState =
    | { readonly type: "loading" }
    | { readonly type: "missing" }
    | {
          readonly type: "ready";
          readonly story: Story;
          /** The person reading is the story's author. */
          readonly mine: boolean;
          readonly posting?: boolean;
          /** Why the last Post was refused, until the next press. */
          readonly error?: string;
      };

export interface StoryInlineCardProps {
    readonly state: StoryInlineCardState;
    readonly frameUrl: (storyId: string, frameId: string) => string;
    readonly sticker: (packId: string, stickerId: string) => StorySticker | undefined;
    onPost(story: Story): void;
    /** Opens the story in the viewer; a draft opens there as a preview. */
    onOpen(story: Story): void;
    /** Holds Edit's hint open, so a fixture can show it. */
    readonly editHintOpen?: boolean;
    readonly "data-testid"?: string;
}

/** The card's canvas: 9:16 in whole pixels, at most iOS's 200 wide. */
export const STORY_INLINE_WIDTH = 180;
export const STORY_INLINE_HEIGHT = 320;

/** What Edit says: stories are not edited on desktop. */
const STORY_INLINE_EDIT_HINT = "On desktop, ask an agent to edit it, or use your phone.";

/**
 * A story an agent drafted, in its chat, as on iOS: the story itself, drawn
 * from its latest version, and under it a 32px bar with Post and Edit while it
 * is the reader's draft, or what became of it. There is no story editor on
 * desktop, so Edit only says where a story is changed: by an agent, or on the
 * phone. Others see it labelled "Draft"; once posted it reads "Posted". The
 * story itself opens the viewer, a draft as its author's preview. It is always
 * the same height, so nothing in the chat moves when the story loads, changes
 * version, or is posted.
 */
export function StoryInlineCard(props: StoryInlineCardProps) {
    const state = props.state;
    const story = state.type === "ready" ? state.story : undefined;
    const frame = story?.frames[0];
    const deleted = story?.status === "deleted";
    // A story another person has not posted is not readable to anyone else:
    // what reaches them is that it exists, as a draft.
    const label = deleted
        ? "Deleted"
        : state.type === "missing"
          ? "Draft"
          : story === undefined
            ? ""
            : story.status === "posted"
              ? "Posted"
              : "Draft";
    const actionable =
        state.type === "ready" && state.mine && story?.status === "draft" && !deleted;
    const posting = state.type === "ready" && state.posting === true;
    // Edit's hint stays up from the press until the pointer or focus leaves.
    const [editHintOpen, setEditHintOpen] = useState(false);
    return (
        <div
            className="happy-story-inline"
            data-happy-desktop-ui="story-inline"
            data-status={deleted ? "deleted" : story?.status}
            data-testid={props["data-testid"]}
            // The bar and its error stay within the card's column.
            style={{ width: STORY_INLINE_WIDTH }}
        >
            <button
                aria-label={
                    story
                        ? `${story.status === "draft" ? "Preview story draft" : "Open story"}${story.caption ? `: ${story.caption}` : ""}`
                        : "Story"
                }
                className="happy-story-inline__frame"
                // Only its author reads a draft, and not mid-post.
                disabled={!story || deleted || posting || (story.status === "draft" && !actionable)}
                onClick={() => {
                    if (story) props.onOpen(story);
                }}
                style={{ width: STORY_INLINE_WIDTH, height: STORY_INLINE_HEIGHT }}
                type="button"
            >
                {story && frame && !deleted ? (
                    <StoryCanvas
                        animate={false}
                        caption={story.caption}
                        className="happy-story-inline__canvas"
                        frame={frame}
                        mediaUrl={props.frameUrl(story.id, frame.id)}
                        playing={false}
                        reactions={story.reactions}
                        sticker={props.sticker}
                    />
                ) : null}
            </button>
            <div className="happy-story-inline__bar">
                {actionable && story ? (
                    <>
                        <Button
                            data-testid="story-inline-post"
                            loading={posting}
                            onClick={() => props.onPost(story)}
                            size="small"
                            variant="ghost"
                        >
                            Post
                        </Button>
                        <Tooltip
                            align="start"
                            label={STORY_INLINE_EDIT_HINT}
                            open={props.editHintOpen === true || editHintOpen}
                        >
                            <Button
                                data-testid="story-inline-edit"
                                disabled={posting}
                                onBlur={() => setEditHintOpen(false)}
                                onClick={() => setEditHintOpen((open) => !open)}
                                onMouseLeave={() => setEditHintOpen(false)}
                                size="small"
                                variant="ghost"
                            >
                                Edit
                            </Button>
                        </Tooltip>
                    </>
                ) : (
                    <span className="happy-story-inline__label" data-testid="story-inline-label">
                        {label}
                    </span>
                )}
                {state.type === "ready" && state.error ? (
                    <span className="happy-story-inline__error" role="alert">
                        {state.error}
                    </span>
                ) : null}
            </div>
        </div>
    );
}
