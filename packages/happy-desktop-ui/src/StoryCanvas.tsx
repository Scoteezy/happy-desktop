import { useCallback, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";
import { StickerView, type StorySticker } from "./StickerView";
import type {
    StoryFrame,
    StoryLinkOverlay,
    StoryOverlay,
    StoryReactionCount,
    StoryReactionOverlay,
    StoryTextFont,
    StoryTextOverlay,
    StoryTransform,
} from "./storyTypes";

/**
 * The system font each story font names, as every client draws it; a Mac has
 * them all, and anything missing falls back to the platform's sans-serif.
 */
export const STORY_FONTS: Readonly<Record<StoryTextFont, string>> = {
    sanFrancisco: '-apple-system, "SF Pro Text", system-ui, sans-serif',
    typewriter: '"American Typewriter", "Courier New", monospace',
    avenirNext: '"Avenir Next", "Avenir", sans-serif',
    courierNew: '"Courier New", monospace',
    noteworthy: '"Noteworthy", "Marker Felt", cursive',
    georgia: 'Georgia, "Times New Roman", serif',
    papyrus: '"Papyrus", fantasy',
    snellRoundhand: '"Snell Roundhand", "Apple Chancery", cursive',
};

/** Black or white, whichever reads on `color`. */
export function storyContrastInk(color: string): string {
    const hex = /^#([0-9a-f]{6})$/iu.exec(color)?.[1];
    if (!hex) return "#ffffff";
    const channel = (at: number) => {
        const value = parseInt(hex.slice(at, at + 2), 16) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
    return luminance > 0.45 ? "#000000" : "#ffffff";
}

/** The host a link overlay shows without a label. */
export function storyLinkHost(url: string): string {
    try {
        return new URL(url).host.replace(/^www\./u, "");
    } catch {
        return url;
    }
}

function placed(transform: StoryTransform, scaled: boolean): CSSProperties {
    return {
        left: `${String(transform.x * 100)}%`,
        top: `${String(transform.y * 100)}%`,
        transform: `translate(-50%, -50%) rotate(${String(transform.rotation)}rad)${
            scaled ? ` scale(${String(transform.scale)})` : ""
        }`,
    };
}

function TextOverlay(props: { overlay: StoryTextOverlay }) {
    const { style } = props.overlay;
    const boxed = style.fill === "filled" || style.fill === "semi";
    const ink =
        style.fill === "regular"
            ? style.color
            : style.fill === "filled"
              ? storyContrastInk(style.color)
              : "#ffffff";
    const run: CSSProperties = {
        color: ink,
        ...(boxed
            ? {
                  backgroundColor: style.fill === "semi" ? `${style.color}80` : style.color,
              }
            : {}),
        ...(style.fill === "stroke" ? { WebkitTextStroke: `0.14em ${style.color}` } : {}),
    };
    return (
        <span
            className="happy-story-text"
            data-align={style.align}
            data-fill={style.fill}
            style={{
                width: `${String(style.width * 100)}cqw`,
                fontFamily: STORY_FONTS[style.font],
                textAlign: style.align,
            }}
        >
            <span className="happy-story-text__run" style={run}>
                {props.overlay.text}
            </span>
        </span>
    );
}

function LinkOverlay(props: { overlay: StoryLinkOverlay }) {
    const { overlay } = props;
    const custom = overlay.style === "custom" ? (overlay.color ?? "#2baccc") : undefined;
    return (
        <span
            className="happy-story-link"
            data-style={overlay.style}
            style={
                custom ? { backgroundColor: custom, color: storyContrastInk(custom) } : undefined
            }
        >
            <Icon name="link" size={16} />
            <span className="happy-story-link__label">
                {overlay.label ?? storyLinkHost(overlay.url)}
            </span>
        </span>
    );
}

function ReactionOverlay(props: { overlay: StoryReactionOverlay; count: number; mine: boolean }) {
    const { overlay } = props;
    return (
        <span
            className="happy-story-reaction"
            data-dark={overlay.dark ? "" : undefined}
            data-flipped={overlay.flipped ? "" : undefined}
            data-mine={props.mine ? "" : undefined}
            style={{
                width: `${String(overlay.transform.scale * 100)}cqw`,
                fontSize: `${String(overlay.transform.scale * 20)}cqw`,
            }}
        >
            <span className="happy-story-reaction__tail" aria-hidden="true" />
            <span className="happy-story-reaction__bubble">
                <span className="happy-story-reaction__emoji">{overlay.emoji}</span>
                {props.count > 0 ? (
                    <span className="happy-story-reaction__count">{String(props.count)}</span>
                ) : null}
            </span>
        </span>
    );
}

export interface StoryOverlayViewProps {
    readonly overlay: StoryOverlay;
    readonly sticker: (packId: string, stickerId: string) => StorySticker | undefined;
    readonly reactions?: readonly StoryReactionCount[];
    readonly myReaction?: string | null;
    readonly animate?: boolean;
    readonly attributes?: HTMLAttributes<HTMLElement> & {
        readonly [data: `data-${string}`]: string | undefined;
    };
}

/** One overlay, drawn live over its frame where its transform puts it. */
export function StoryOverlayView(props: StoryOverlayViewProps) {
    const { overlay } = props;
    const transform = overlay.transform;
    const content = (() => {
        switch (overlay.type) {
            case "text":
                return <TextOverlay overlay={overlay} />;
            case "link":
                return <LinkOverlay overlay={overlay} />;
            case "sticker": {
                const sticker = props.sticker(overlay.packId, overlay.stickerId);
                const size = `${String(transform.scale * 100)}cqw`;
                // A sticker the daemon no longer serves is left out; the overlay stays.
                return sticker ? (
                    <StickerView
                        animate={props.animate ?? true}
                        sticker={sticker}
                        style={{ width: size, height: size }}
                    />
                ) : (
                    <span style={{ display: "flex", width: size, height: size }} />
                );
            }
            case "emoji": {
                const size = `${String(transform.scale * 100)}cqw`;
                return (
                    <span
                        className="happy-story-emoji"
                        style={{ width: size, height: size, fontSize: `calc(${size} * 0.86)` }}
                    >
                        {overlay.emoji}
                    </span>
                );
            }
            case "reaction":
                return (
                    <ReactionOverlay
                        count={
                            props.reactions?.find((entry) => entry.emoji === overlay.emoji)
                                ?.count ?? 0
                        }
                        mine={props.myReaction === overlay.emoji}
                        overlay={overlay}
                    />
                );
            default:
                return null;
        }
    })();
    if (content === null) return null;
    const scaled = overlay.type === "text" || overlay.type === "link";
    return (
        <div
            {...props.attributes}
            className={["happy-story-overlay", props.attributes?.className]
                .filter(Boolean)
                .join(" ")}
            data-happy-desktop-ui="story-overlay"
            data-overlay-id={overlay.id}
            data-type={overlay.type}
            style={{ ...placed(transform, scaled), ...props.attributes?.style }}
        >
            {content}
        </div>
    );
}

export interface StoryCanvasProps {
    readonly frame: StoryFrame;
    /** Where the frame's media is read; absent while it has none to show. */
    readonly mediaUrl?: string;
    readonly caption?: string | null;
    readonly sticker: (packId: string, stickerId: string) => StorySticker | undefined;
    readonly reactions?: readonly StoryReactionCount[];
    readonly myReaction?: string | null;
    /** Whether a video frame plays; stills ignore it. */
    readonly playing?: boolean;
    readonly muted?: boolean;
    /** Animated stickers and emoji play; off holds them still, as a thumbnail does. */
    readonly animate?: boolean;
    readonly onVideoDuration?: (ms: number) => void;
    readonly onVideoEnded?: () => void;
    /** A link or reaction overlay was pressed, in the viewer. */
    readonly onOverlayActivate?: (overlay: StoryLinkOverlay | StoryReactionOverlay) => void;
    /** Drawn above the overlays: the viewer's progress, header and controls. */
    readonly children?: ReactNode;
    readonly className?: string;
    readonly style?: CSSProperties;
    readonly "data-testid"?: string;
}

/**
 * One frame on the story canvas: a 9:16 portrait the frame's media sits on,
 * over its two-colour background, with its overlays drawn over both. Every
 * position is a fraction of the canvas, so a frame looks the same at any size;
 * the caller sets the width and the canvas takes its height from it.
 */
export function StoryCanvas(props: StoryCanvasProps) {
    const { frame } = props;
    const [top, bottom] = frame.background;
    const placement = frame.placement;
    const media = !frame.available || props.mediaUrl === undefined ? undefined : props.mediaUrl;
    // Identity contract: the video is told to play or pause only when that or
    // its file changes; a new ref each render would poke it on every notification.
    const playing = props.playing ?? true;
    const videoRef = useCallback(
        (video: HTMLVideoElement | null) => {
            if (!video) return;
            if (playing) void video.play().catch(() => undefined);
            else video.pause();
        },
        // A new file is a new video to start.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [playing, media],
    );
    return (
        <div
            className={["happy-story-canvas", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="story-canvas"
            data-testid={props["data-testid"]}
            style={{ background: `linear-gradient(to bottom, ${top}, ${bottom})`, ...props.style }}
        >
            {media ? (
                <div className="happy-story-canvas__media" style={placed(placement, true)}>
                    {frame.kind === "video" ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption -- a story's video has no caption track; its caption is drawn over it
                        <video
                            className="happy-story-canvas__media-element"
                            muted={props.muted ?? true}
                            onEnded={props.onVideoEnded}
                            onLoadedMetadata={(event) => {
                                const seconds = event.currentTarget.duration;
                                if (Number.isFinite(seconds))
                                    props.onVideoDuration?.(seconds * 1000);
                            }}
                            playsInline
                            ref={videoRef}
                            src={media}
                        />
                    ) : (
                        <img
                            alt=""
                            className="happy-story-canvas__media-element"
                            draggable={false}
                            src={media}
                        />
                    )}
                </div>
            ) : !frame.available ? (
                <span className="happy-story-canvas__unavailable">
                    {frame.kind === "video"
                        ? "This video is no longer available"
                        : "This photo is no longer available"}
                </span>
            ) : null}
            {frame.overlays.map((overlay) => (
                <StoryOverlayView
                    key={overlay.id}
                    overlay={overlay}
                    sticker={props.sticker}
                    {...(props.animate === undefined ? {} : { animate: props.animate })}
                    {...(props.reactions ? { reactions: props.reactions } : {})}
                    {...(props.myReaction === undefined ? {} : { myReaction: props.myReaction })}
                    {...(props.onOverlayActivate &&
                    (overlay.type === "link" || overlay.type === "reaction")
                        ? {
                              attributes: {
                                  role: "button",
                                  tabIndex: 0,
                                  "aria-label":
                                      overlay.type === "link"
                                          ? `Link: ${overlay.label ?? storyLinkHost(overlay.url)}`
                                          : `React with ${overlay.emoji}`,
                                  "data-activatable": "",
                                  onPointerDown: (event) => event.stopPropagation(),
                                  onPointerUp: (event) => event.stopPropagation(),
                                  onClick: (event) => {
                                      event.stopPropagation();
                                      props.onOverlayActivate?.(overlay);
                                  },
                                  onKeyDown: (event) => {
                                      if (event.key !== "Enter" && event.key !== " ") return;
                                      event.preventDefault();
                                      event.stopPropagation();
                                      props.onOverlayActivate?.(overlay);
                                  },
                              },
                          }
                        : {})}
                />
            ))}
            {props.caption ? (
                <div className="happy-story-canvas__caption">
                    <span className="happy-story-canvas__caption-text">{props.caption}</span>
                </div>
            ) : null}
            {props.children}
        </div>
    );
}
