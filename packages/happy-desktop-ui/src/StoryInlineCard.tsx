import { Button } from "./Button";
import { StoryCanvas } from "./StoryCanvas";
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
    onEdit(story: Story): void;
    /** Opens the story in the viewer. */
    onOpen(story: Story): void;
    readonly "data-testid"?: string;
}

/** The card's canvas: 9:16 in whole pixels. */
export const STORY_INLINE_WIDTH = 162;
export const STORY_INLINE_HEIGHT = 288;

/**
 * A story an agent drafted, in its chat: the story itself, drawn from its
 * latest version, with Post and Edit beside it while it is the reader's draft.
 * Others see it labelled "Draft"; once posted it reads "Posted" and opens the
 * viewer. It is always the same height, so nothing in the chat moves when the
 * story loads, changes version, or is posted.
 */
export function StoryInlineCard(props: StoryInlineCardProps) {
    const state = props.state;
    const story = state.type === "ready" ? state.story : undefined;
    const frame = story?.frames[0];
    const deleted = story?.status === "deleted";
    // A story another person has not posted is not readable to anyone else:
    // what reaches them is that it exists, as a draft.
    const label = deleted
        ? "This story was deleted"
        : state.type === "missing"
          ? "Draft"
          : story === undefined
            ? "Loading story…"
            : story.status === "posted"
              ? "Posted"
              : "Draft";
    const actionable =
        state.type === "ready" && state.mine && story?.status === "draft" && !deleted;
    return (
        <div
            className="happy-story-inline"
            data-happy-desktop-ui="story-inline"
            data-status={deleted ? "deleted" : story?.status}
            data-testid={props["data-testid"]}
        >
            <button
                aria-label={
                    story ? `Open story${story.caption ? `: ${story.caption}` : ""}` : "Story"
                }
                className="happy-story-inline__frame"
                // A draft is not in the viewer yet: its author edits it.
                disabled={!story || deleted || (story.status === "draft" && !actionable)}
                onClick={() => {
                    if (!story) return;
                    if (story.status !== "draft") props.onOpen(story);
                    else if (actionable) props.onEdit(story);
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
            <div className="happy-story-inline__side">
                <span className="happy-story-inline__label" data-testid="story-inline-label">
                    {label}
                </span>
                {story && !deleted ? (
                    <span className="happy-story-inline__detail">
                        {story.frames.length === 1
                            ? story.frames[0]?.kind === "video"
                                ? "1 video"
                                : "1 photo"
                            : `${String(story.frames.length)} photos and videos`}
                    </span>
                ) : null}
                {actionable && story ? (
                    <div className="happy-story-inline__actions">
                        <Button
                            data-testid="story-inline-post"
                            loading={state.type === "ready" && state.posting === true}
                            onClick={() => props.onPost(story)}
                            size="small"
                            variant="ghost"
                        >
                            Post
                        </Button>
                        <Button
                            data-testid="story-inline-edit"
                            disabled={state.type === "ready" && state.posting === true}
                            onClick={() => props.onEdit(story)}
                            size="small"
                            variant="ghost"
                        >
                            Edit
                        </Button>
                    </div>
                ) : null}
                {state.type === "ready" && state.error ? (
                    <span className="happy-story-inline__error" role="alert">
                        {state.error}
                    </span>
                ) : null}
            </div>
        </div>
    );
}
