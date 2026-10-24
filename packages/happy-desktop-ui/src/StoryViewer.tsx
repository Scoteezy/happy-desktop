import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "./Icon";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { ModalOverlay } from "./ModalOverlay";
import { ScrollArea } from "./Scrollbar";
import { StoryCanvas } from "./StoryCanvas";
import type { StorySticker } from "./StickerView";
import { storyHaptic } from "./storyHaptics";
import {
    STORY_IMAGE_MS,
    STORY_VIDEO_MAX_MS,
    type Story,
    type StoryFrame,
    type StoryLinkOverlay,
    type StoryViewer as StoryViewerEntry,
} from "./storyTypes";

/** One author's circle, as the viewer walks it. */
export interface StoryViewerAuthor {
    readonly id: string;
    readonly name: string;
    readonly photoUrl?: string;
    readonly initials: string;
    readonly self: boolean;
    /** Posted stories in viewing order, oldest first. */
    readonly stories: readonly Story[];
}

export type StoryViewerViewers =
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly viewers: readonly StoryViewerEntry[] }
    | { readonly status: "failed"; readonly message: string };

export interface StoryViewerProps {
    readonly authors: readonly StoryViewerAuthor[];
    readonly startAuthorId: string;
    /** A story to start on; otherwise the author's first unseen, or their first. */
    readonly startStoryId?: string;
    readonly frameUrl: (storyId: string, frameId: string) => string;
    readonly sticker: (packId: string, stickerId: string) => StorySticker | undefined;
    /** "2h", "just now": when the story was posted, relative to now. */
    readonly postedLabel: (story: Story) => string;
    readonly viewers?: (storyId: string) => StoryViewerViewers | undefined;
    readonly viewerPhotoUrl?: (viewer: StoryViewerEntry) => string | undefined;
    /** The first frame of a story is on screen. */
    onSeen(storyId: string): void;
    /** One of the person's own stories is on screen, so its view count is read again. */
    onOwnStoryShown?(storyId: string): void;
    onReact(storyId: string, emoji: string): void;
    onViewersRequest?(storyId: string): void;
    /** Opens a link the person confirmed. */
    onLinkOpen(url: string): void;
    /** Deletes the person's own story; rejects when the daemon refuses. */
    onDelete?(storyId: string): Promise<void>;
    /** Opens the conversation a story was drafted in, where the person may read it. */
    onSourceOpen?(story: Story): void;
    onClose(): void;
}

/** The emoji held-heart offers, the heart first. */
export const STORY_QUICK_REACTIONS = ["❤️", "🔥", "👍", "😂", "😮", "😢", "🎉", "👏"] as const;

const HOLD_MS = 200;
const SWIPE_CLOSE_PX = 120;

type Sheet =
    | { readonly kind: "link"; readonly overlay: StoryLinkOverlay }
    | { readonly kind: "viewers" }
    | { readonly kind: "reactions" }
    | { readonly kind: "delete"; readonly deleting: boolean; readonly error?: string };

interface Position {
    readonly authorId: string;
    readonly storyId: string;
    readonly frameIndex: number;
}

function frameMs(frame: StoryFrame, measured: number | undefined): number | undefined {
    if (frame.kind === "image") return STORY_IMAGE_MS;
    const ms = measured ?? frame.durationMs ?? undefined;
    return ms === undefined ? undefined : Math.min(ms, STORY_VIDEO_MAX_MS);
}

function startStory(author: StoryViewerAuthor, storyId?: string): Story | undefined {
    return (
        (storyId ? author.stories.find((story) => story.id === storyId) : undefined) ??
        author.stories.find((story) => !story.seen) ??
        author.stories[0]
    );
}

/**
 * The full-window story viewer, in Telegram's manner: one progress segment per
 * frame of the author's stories, the right of the frame advances and the left
 * goes back, holding pauses and hides the chrome, and dragging down or Escape
 * closes. After the author's last story it moves to the next author, in the
 * order the row had when it opened.
 */
export function StoryViewer(props: StoryViewerProps) {
    // The walk keeps the order the row had when it opened: a story seen here
    // moves its author in the row, and must not move them in this walk.
    const [order] = useState(() => props.authors.map((author) => author.id));
    const [position, setPosition] = useState<Position | undefined>(() => {
        const author = props.authors.find((each) => each.id === props.startAuthorId);
        const story = author ? startStory(author, props.startStoryId) : undefined;
        return author && story
            ? { authorId: author.id, storyId: story.id, frameIndex: 0 }
            : undefined;
    });
    const [held, setHeld] = useState(false);
    const [sheet, setSheet] = useState<Sheet | undefined>();
    const [muted, setMuted] = useState(true);
    const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(new Map());
    const press = useRef<{
        readonly x: number;
        readonly y: number;
        readonly timer: ReturnType<typeof setTimeout>;
        holding: boolean;
    } | null>(null);
    const heartPress = useRef<{ timer: ReturnType<typeof setTimeout>; offered: boolean } | null>(
        null,
    );
    /** The frame whose end already advanced; its other clock ending must not advance again. */
    const ended = useRef<string | undefined>(undefined);

    const authorsById = new Map(props.authors.map((author) => [author.id, author]));
    const walk = order.flatMap((id) => {
        const author = authorsById.get(id);
        return author && author.stories.length > 0 ? [author] : [];
    });
    const author = position ? authorsById.get(position.authorId) : undefined;
    const story =
        author && position
            ? (author.stories.find((each) => each.id === position.storyId) ?? author.stories[0])
            : undefined;
    const frameIndex =
        story && position && story.id === position.storyId
            ? Math.min(position.frameIndex, story.frames.length - 1)
            : 0;
    const frame = story?.frames[frameIndex];

    const go = (next: Position | undefined): void => {
        ended.current = undefined;
        setSheet(undefined);
        if (!next) {
            props.onClose();
            return;
        }
        storyHaptic("story.advance");
        setPosition(next);
    };
    const authorStep = (step: 1 | -1): Position | undefined => {
        if (!author) return undefined;
        const at = walk.findIndex((each) => each.id === author.id);
        const target = walk[at + step];
        if (!target) return undefined;
        const first = step === 1 ? startStory(target) : target.stories[target.stories.length - 1];
        return first ? { authorId: target.id, storyId: first.id, frameIndex: 0 } : undefined;
    };
    const next = (): void => {
        if (!author || !story) return props.onClose();
        if (frameIndex + 1 < story.frames.length)
            return go({ authorId: author.id, storyId: story.id, frameIndex: frameIndex + 1 });
        const at = author.stories.findIndex((each) => each.id === story.id);
        const following = author.stories[at + 1];
        if (following) return go({ authorId: author.id, storyId: following.id, frameIndex: 0 });
        go(authorStep(1));
    };
    const previous = (): void => {
        if (!author || !story) return;
        if (frameIndex > 0)
            return go({ authorId: author.id, storyId: story.id, frameIndex: frameIndex - 1 });
        const at = author.stories.findIndex((each) => each.id === story.id);
        const before = author.stories[at - 1];
        if (before)
            return go({
                authorId: author.id,
                storyId: before.id,
                frameIndex: before.frames.length - 1,
            });
        const previousAuthor = authorStep(-1);
        if (previousAuthor) go(previousAuthor);
    };

    // A story counts as seen the moment its first frame shows, once per story.
    const storyId = story?.id;
    const storySelf = author?.self === true;
    const shownRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (!node || !storyId) return;
            if (storySelf) props.onOwnStoryShown?.(storyId);
            else props.onSeen(storyId);
        },
        // Only a new story is a new showing; the handlers are the owner's.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [storyId, storySelf],
    );

    const frameKey = story && frame ? `${story.id}:${frame.id}` : undefined;
    // A video ends twice, by its own end and by its bar's; the first one counts.
    const frameEnd = (): void => {
        if (frameKey === undefined || ended.current === frameKey) return;
        next();
        ended.current = frameKey;
    };
    // Focus starts on the room, so the arrow keys, Space, and Escape work at
    // once and survive buttons that disable or leave as the walk moves on.
    const roomRef = useCallback((node: HTMLDivElement | null) => {
        node?.focus();
    }, []);

    const paused = held || sheet !== undefined;
    const duration = frame ? frameMs(frame, measured.get(frame.id)) : undefined;
    const segments = author?.stories.flatMap((each) =>
        each.frames.map((eachFrame, index) => ({ story: each, frame: eachFrame, index })),
    );
    const current = segments?.findIndex(
        (segment) => segment.story.id === story?.id && segment.index === frameIndex,
    );

    const stagePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (event.button !== 0 || sheet) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const timer = setTimeout(() => {
            if (press.current) press.current.holding = true;
            setHeld(true);
        }, HOLD_MS);
        press.current = { x: event.clientX, y: event.clientY, timer, holding: false };
    };
    const stagePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
        const started = press.current;
        press.current = null;
        if (!started) return;
        clearTimeout(started.timer);
        setHeld(false);
        if (event.clientY - started.y > SWIPE_CLOSE_PX) return props.onClose();
        if (started.holding) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX - box.left < box.width / 3) previous();
        else next();
    };
    const stagePointerCancel = (): void => {
        if (press.current) clearTimeout(press.current.timer);
        press.current = null;
        setHeld(false);
    };

    const heartRelease = (): void => {
        if (heartPress.current) clearTimeout(heartPress.current.timer);
        heartPress.current = null;
    };
    const react = (emoji: string): void => {
        if (!story) return;
        storyHaptic("story.react");
        props.onReact(story.id, emoji);
    };

    const viewers = story && sheet?.kind === "viewers" ? props.viewers?.(story.id) : undefined;
    const reactedEmoji = story?.myReaction ?? null;

    return (
        <ModalOverlay
            className="happy-story-viewer"
            data-testid="story-viewer"
            onDismiss={props.onClose}
            onEscape={() => (sheet ? setSheet(undefined) : props.onClose())}
            placement="fill"
        >
            <div
                // Always a dark room; its sheets and buttons take the dark palette.
                className="happy-story-viewer__room happy-theme-dark"
                data-happy-desktop-ui="story-viewer"
                onClick={(event) => {
                    if (event.target === event.currentTarget) props.onClose();
                }}
                onKeyDown={(event) => {
                    // Space and Enter belong to a focused control.
                    const control =
                        event.target instanceof HTMLElement &&
                        event.target !== event.currentTarget &&
                        event.target.closest("button, [role='button'], input, textarea") !== null;
                    if (event.key === "ArrowRight") next();
                    else if (event.key === "ArrowLeft") previous();
                    else if (event.key === " " && !control) setHeld((value) => !value);
                    else return;
                    event.preventDefault();
                }}
                ref={roomRef}
                tabIndex={-1}
            >
                <button
                    aria-label="Previous"
                    className="happy-story-viewer__step"
                    data-side="previous"
                    disabled={!authorStep(-1)}
                    onClick={() => go(authorStep(-1))}
                    title="Previous person"
                    type="button"
                >
                    <Icon name="chevron-left" size={20} />
                </button>
                {author && story && frame ? (
                    <div
                        className="happy-story-viewer__stage"
                        data-held={held ? "" : undefined}
                        onPointerCancel={stagePointerCancel}
                        onPointerDown={stagePointerDown}
                        onPointerUp={stagePointerUp}
                        ref={shownRef}
                    >
                        <StoryCanvas
                            caption={story.caption}
                            className="happy-story-viewer__canvas"
                            data-testid="story-viewer-canvas"
                            frame={frame}
                            mediaUrl={props.frameUrl(story.id, frame.id)}
                            muted={muted}
                            myReaction={story.myReaction}
                            onOverlayActivate={(overlay) => {
                                if (overlay.type === "link") setSheet({ kind: "link", overlay });
                                else if (!author.self) react(overlay.emoji);
                            }}
                            onVideoDuration={(ms) =>
                                setMeasured((map) => new Map(map).set(frame.id, ms))
                            }
                            onVideoEnded={frameEnd}
                            playing={!paused}
                            reactions={story.reactions}
                            sticker={props.sticker}
                        >
                            <div className="happy-story-viewer__chrome" data-part="top">
                                <div className="happy-story-viewer__progress" role="presentation">
                                    {segments?.map((segment, index) => (
                                        <span
                                            className="happy-story-viewer__segment"
                                            key={`${segment.story.id}:${segment.frame.id}`}
                                        >
                                            <span
                                                className="happy-story-viewer__segment-fill"
                                                data-state={
                                                    index < (current ?? 0)
                                                        ? "done"
                                                        : index === current
                                                          ? "playing"
                                                          : "waiting"
                                                }
                                                // The bar is the frame's clock: when its fill
                                                // ends, the frame does.
                                                key={
                                                    index === current
                                                        ? `${story.id}:${frame.id}`
                                                        : undefined
                                                }
                                                onAnimationEnd={
                                                    index === current ? frameEnd : undefined
                                                }
                                                style={
                                                    index === current
                                                        ? {
                                                              animationDuration: `${String(duration ?? STORY_VIDEO_MAX_MS)}ms`,
                                                              animationPlayState:
                                                                  paused || duration === undefined
                                                                      ? "paused"
                                                                      : "running",
                                                          }
                                                        : undefined
                                                }
                                            />
                                        </span>
                                    ))}
                                </div>
                                <div className="happy-story-viewer__header">
                                    <span className="happy-story-viewer__avatar" aria-hidden="true">
                                        {author.photoUrl ? (
                                            <img alt="" draggable={false} src={author.photoUrl} />
                                        ) : (
                                            author.initials
                                        )}
                                    </span>
                                    <span className="happy-story-viewer__who">
                                        <span className="happy-story-viewer__name">
                                            {author.self ? "My Story" : author.name}
                                        </span>
                                        <span className="happy-story-viewer__when">
                                            {props.postedLabel(story)}
                                        </span>
                                    </span>
                                    {story.source && props.onSourceOpen ? (
                                        <button
                                            className="happy-story-viewer__icon"
                                            aria-label="Open conversation"
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onPointerUp={(event) => event.stopPropagation()}
                                            onClick={() => props.onSourceOpen?.(story)}
                                            title="Open conversation"
                                            type="button"
                                        >
                                            <Icon name="chat" size={18} />
                                        </button>
                                    ) : null}
                                    {frame.kind === "video" ? (
                                        <button
                                            className="happy-story-viewer__icon"
                                            aria-label={muted ? "Unmute" : "Mute"}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onPointerUp={(event) => event.stopPropagation()}
                                            onClick={() => setMuted((value) => !value)}
                                            type="button"
                                        >
                                            <Ionicon
                                                name={
                                                    muted
                                                        ? "volume-mute-outline"
                                                        : "volume-high-outline"
                                                }
                                                size={18}
                                            />
                                        </button>
                                    ) : null}
                                    <button
                                        className="happy-story-viewer__icon"
                                        aria-label="Close"
                                        data-testid="story-viewer-close"
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onPointerUp={(event) => event.stopPropagation()}
                                        onClick={props.onClose}
                                        type="button"
                                    >
                                        <Icon name="close" size={18} />
                                    </button>
                                </div>
                            </div>
                            <div
                                className="happy-story-viewer__chrome"
                                data-part="bottom"
                                onPointerDown={(event) => event.stopPropagation()}
                                onPointerUp={(event) => event.stopPropagation()}
                            >
                                {author.self ? (
                                    <>
                                        <button
                                            className="happy-story-viewer__pill"
                                            data-testid="story-viewer-views"
                                            onClick={() => {
                                                props.onViewersRequest?.(story.id);
                                                setSheet({ kind: "viewers" });
                                            }}
                                            type="button"
                                        >
                                            <Icon name="eye" size={16} />
                                            <span>
                                                {story.viewCount === null
                                                    ? "Views"
                                                    : `${String(story.viewCount)} ${story.viewCount === 1 ? "view" : "views"}`}
                                            </span>
                                            {story.reactions.length > 0 ? (
                                                <span className="happy-story-viewer__reaction-tally">
                                                    {story.reactions
                                                        .slice(0, 3)
                                                        .map(
                                                            (each) =>
                                                                `${each.emoji} ${String(each.count)}`,
                                                        )
                                                        .join("  ")}
                                                </span>
                                            ) : null}
                                        </button>
                                        {props.onDelete ? (
                                            <button
                                                className="happy-story-viewer__icon"
                                                aria-label="Delete story"
                                                onClick={() =>
                                                    setSheet({ kind: "delete", deleting: false })
                                                }
                                                title="Delete story"
                                                type="button"
                                            >
                                                <Icon name="trash" size={18} />
                                            </button>
                                        ) : null}
                                    </>
                                ) : (
                                    <button
                                        aria-label={
                                            reactedEmoji
                                                ? `Reacted ${reactedEmoji}`
                                                : "React with ❤️"
                                        }
                                        aria-pressed={reactedEmoji !== null}
                                        className="happy-story-viewer__heart"
                                        data-testid="story-viewer-heart"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            const pressed = heartPress.current;
                                            heartPress.current = null;
                                            if (pressed) clearTimeout(pressed.timer);
                                            if (!pressed?.offered) react(reactedEmoji ?? "❤️");
                                        }}
                                        onContextMenu={(event) => {
                                            event.preventDefault();
                                            heartRelease();
                                            setSheet({ kind: "reactions" });
                                        }}
                                        onPointerCancel={heartRelease}
                                        onPointerDown={(event) => {
                                            event.stopPropagation();
                                            if (event.button !== 0) return;
                                            heartRelease();
                                            const timer = setTimeout(() => {
                                                if (heartPress.current)
                                                    heartPress.current.offered = true;
                                                setSheet({ kind: "reactions" });
                                            }, 400);
                                            heartPress.current = { timer, offered: false };
                                        }}
                                        onPointerLeave={() => {
                                            // Leaving before the hold completes is no hold.
                                            if (heartPress.current && !heartPress.current.offered)
                                                heartRelease();
                                        }}
                                        onPointerUp={(event) => event.stopPropagation()}
                                        title="React; hold or right-click for more"
                                        type="button"
                                    >
                                        {reactedEmoji && reactedEmoji !== "❤️" ? (
                                            <span className="happy-story-viewer__heart-emoji">
                                                {reactedEmoji}
                                            </span>
                                        ) : (
                                            <span
                                                className="happy-story-viewer__heart-emoji"
                                                data-off={reactedEmoji ? undefined : ""}
                                            >
                                                ❤️
                                            </span>
                                        )}
                                    </button>
                                )}
                            </div>
                            {sheet ? (
                                <div
                                    className="happy-story-viewer__sheet-scrim"
                                    role="presentation"
                                    onKeyDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (event.target === event.currentTarget)
                                            setSheet(undefined);
                                    }}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onPointerUp={(event) => event.stopPropagation()}
                                >
                                    <div
                                        className="happy-story-viewer__sheet"
                                        data-kind={sheet.kind}
                                        data-testid="story-viewer-sheet"
                                    >
                                        {sheet.kind === "link" ? (
                                            <>
                                                <span className="happy-story-viewer__sheet-title">
                                                    Open this link?
                                                </span>
                                                <span className="happy-story-viewer__url">
                                                    {sheet.overlay.url}
                                                </span>
                                                <div className="happy-story-viewer__sheet-actions">
                                                    <button
                                                        className="happy-story-viewer__sheet-button"
                                                        onClick={() => setSheet(undefined)}
                                                        type="button"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        className="happy-story-viewer__sheet-button"
                                                        data-primary=""
                                                        onClick={() => {
                                                            setSheet(undefined);
                                                            props.onLinkOpen(sheet.overlay.url);
                                                        }}
                                                        type="button"
                                                    >
                                                        Open
                                                    </button>
                                                </div>
                                            </>
                                        ) : sheet.kind === "reactions" ? (
                                            <div className="happy-story-viewer__reaction-row">
                                                {STORY_QUICK_REACTIONS.map((emoji) => (
                                                    <button
                                                        aria-label={`React with ${emoji}`}
                                                        aria-pressed={reactedEmoji === emoji}
                                                        className="happy-story-viewer__reaction-choice"
                                                        key={emoji}
                                                        onClick={() => {
                                                            setSheet(undefined);
                                                            react(emoji);
                                                        }}
                                                        type="button"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : sheet.kind === "delete" ? (
                                            <>
                                                <span className="happy-story-viewer__sheet-title">
                                                    Delete this story?
                                                </span>
                                                {sheet.error ? (
                                                    <span className="happy-story-viewer__url">
                                                        {sheet.error}
                                                    </span>
                                                ) : null}
                                                <div className="happy-story-viewer__sheet-actions">
                                                    <button
                                                        className="happy-story-viewer__sheet-button"
                                                        onClick={() => setSheet(undefined)}
                                                        type="button"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        className="happy-story-viewer__sheet-button"
                                                        data-danger=""
                                                        disabled={sheet.deleting}
                                                        onClick={() => {
                                                            setSheet({
                                                                kind: "delete",
                                                                deleting: true,
                                                            });
                                                            // Where the walk goes once the story
                                                            // is gone, while it is still here.
                                                            const at = author.stories.findIndex(
                                                                (each) => each.id === story.id,
                                                            );
                                                            const following =
                                                                author.stories[at + 1];
                                                            const after = following
                                                                ? {
                                                                      authorId: author.id,
                                                                      storyId: following.id,
                                                                      frameIndex: 0,
                                                                  }
                                                                : authorStep(1);
                                                            void props.onDelete?.(story.id).then(
                                                                () => {
                                                                    storyHaptic("story.delete");
                                                                    go(after);
                                                                },
                                                                (error: unknown) => {
                                                                    storyHaptic("error");
                                                                    setSheet({
                                                                        kind: "delete",
                                                                        deleting: false,
                                                                        error:
                                                                            error instanceof Error
                                                                                ? error.message
                                                                                : String(error),
                                                                    });
                                                                },
                                                            );
                                                        }}
                                                        type="button"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <span className="happy-story-viewer__sheet-title">
                                                    {story.viewCount === null
                                                        ? "Viewers"
                                                        : `Viewed by ${String(story.viewCount)}`}
                                                </span>
                                                <ScrollArea
                                                    className="happy-story-viewer__viewers-scroll"
                                                    viewportClassName="happy-story-viewer__viewers-viewport"
                                                >
                                                    <ul className="happy-story-viewer__viewers">
                                                        {viewers?.status === "ready" ? (
                                                            viewers.viewers.length === 0 ? (
                                                                <li className="happy-story-viewer__viewer-empty">
                                                                    Nobody has seen it yet.
                                                                </li>
                                                            ) : (
                                                                viewers.viewers.map((viewer) => {
                                                                    const photo =
                                                                        props.viewerPhotoUrl?.(
                                                                            viewer,
                                                                        );
                                                                    return (
                                                                        <li
                                                                            className="happy-story-viewer__viewer"
                                                                            key={viewer.userId}
                                                                        >
                                                                            <span className="happy-story-viewer__avatar">
                                                                                {photo ? (
                                                                                    <img
                                                                                        alt=""
                                                                                        src={photo}
                                                                                    />
                                                                                ) : (
                                                                                    viewer.name
                                                                                        .slice(0, 1)
                                                                                        .toUpperCase()
                                                                                )}
                                                                            </span>
                                                                            <span className="happy-story-viewer__viewer-name">
                                                                                {viewer.name}
                                                                            </span>
                                                                            <span className="happy-story-viewer__viewer-reaction">
                                                                                {viewer.reaction ??
                                                                                    ""}
                                                                            </span>
                                                                        </li>
                                                                    );
                                                                })
                                                            )
                                                        ) : viewers?.status === "failed" ? (
                                                            <li className="happy-story-viewer__viewer-empty">
                                                                {viewers.message}
                                                            </li>
                                                        ) : (
                                                            <li className="happy-story-viewer__viewer-empty">
                                                                Loading…
                                                            </li>
                                                        )}
                                                    </ul>
                                                </ScrollArea>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </StoryCanvas>
                    </div>
                ) : (
                    <div className="happy-story-viewer__stage">
                        <span className="happy-story-viewer__gone">
                            This story is no longer available.
                        </span>
                    </div>
                )}
                <button
                    aria-label="Next"
                    className="happy-story-viewer__step"
                    data-side="next"
                    // After the last person there is no one left: it closes.
                    onClick={() => go(authorStep(1))}
                    title="Next person"
                    type="button"
                >
                    <Icon name="chevron-right" size={20} />
                </button>
            </div>
        </ModalOverlay>
    );
}
