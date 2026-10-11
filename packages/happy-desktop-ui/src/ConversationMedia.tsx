import { useState, type CSSProperties } from "react";
import type { ConversationMediaItem } from "happy-desktop-state";
import { artifactSizeText } from "./pages/artifacts/artifactPresentation";
import { conversationMediaVideoBox, messageMediaSingleBox } from "./conversationRowHeight";
import { FileTreeFamilyIcon, fileTreeFamily } from "./FileTree";
import { Icon } from "./Icon";
import { ResultCard } from "./ResultCard";
import { thumbhashDataUrl } from "./thumbhashDataUrl";

export type MediaImageTileProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Where the full picture is read from. */
    url: string;
    /** Decoded placeholder painted at the picture's aspect ratio until its bytes arrive. */
    placeholderUrl?: string;
    /** What the picture is, for assistive technology and the open control. */
    alt: string;
    /**
     * The box the tile reserves; the picture covers it once it loads. Absent,
     * the tile fills the box its container gives it, as a grid square does.
     */
    width?: number;
    height?: number;
    /** Opens the picture full size. Absent leaves the tile a picture, not a fake button. */
    onOpen?: () => void;
};

/**
 * C-291 MediaImageTile — one picture whose bytes are still on their way.
 *
 * The tile takes its final box at once and paints the ThumbHash placeholder in
 * it, so nothing moves when the picture arrives: the real image is laid over
 * the placeholder and fades in the moment it has decoded. A picture that fails
 * keeps its placeholder and says so with a quiet glyph rather than a broken
 * image. Which address has loaded is the tile's own state, so a new address
 * starts from its placeholder again.
 */
export function MediaImageTile(props: MediaImageTileProps) {
    const [settled, setSettled] = useState<{ url: string; state: "loaded" | "failed" }>();
    const state = settled?.url === props.url ? settled.state : "loading";
    const content = (
        <>
            <span
                aria-hidden="true"
                className="happy-media-image-tile__placeholder"
                data-happy-desktop-ui="media-image-tile-placeholder"
                style={
                    props.placeholderUrl
                        ? { backgroundImage: `url("${props.placeholderUrl}")` }
                        : undefined
                }
            />
            <img
                alt={props.alt}
                className="happy-media-image-tile__image"
                data-happy-desktop-ui="media-image-tile-image"
                decoding="async"
                draggable={false}
                height={props.height}
                onError={() => setSettled({ url: props.url, state: "failed" })}
                onLoad={() => setSettled({ url: props.url, state: "loaded" })}
                // A row scrolled back into view finds its picture in the
                // cache, already decoded: shown in the same frame instead of
                // flashing its placeholder first.
                ref={(image) => {
                    if (image?.complete && image.naturalWidth > 0 && state === "loading")
                        setSettled({ url: props.url, state: "loaded" });
                }}
                src={props.url}
                width={props.width}
            />
            {state === "failed" ? (
                <span
                    aria-hidden="true"
                    className="happy-media-image-tile__failure"
                    data-happy-desktop-ui="media-image-tile-failure"
                >
                    <Icon name="image" size={20} />
                </span>
            ) : null}
        </>
    );
    const shared = {
        className: ["happy-media-image-tile", props.className].filter(Boolean).join(" "),
        "data-happy-desktop-ui": "media-image-tile",
        "data-state": state,
        "data-testid": props["data-testid"],
        style:
            props.width === undefined || props.height === undefined
                ? props.style
                : { ...props.style, width: `${props.width}px`, height: `${props.height}px` },
    } as const;
    return props.onOpen ? (
        <button {...shared} aria-label={`Open ${props.alt}`} onClick={props.onOpen} type="button">
            {content}
        </button>
    ) : (
        <span {...shared}>{content}</span>
    );
}

export type MediaVideoTileProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** Where the recording is streamed from; the server answers ranges. */
    url: string;
    /** A still shown before playback starts, such as a decoded placeholder. */
    posterUrl?: string;
    /** What the recording is, for assistive technology. */
    name: string;
    width: number;
    height: number;
};

/**
 * C-292 MediaVideoTile — a recording played where it was presented. The box is
 * reserved up front, the browser reads only what it needs to start, and the
 * native controls carry play, scrub, volume, and full screen.
 */
export function MediaVideoTile(props: MediaVideoTileProps) {
    return (
        <span
            className={["happy-media-video-tile", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="media-video-tile"
            data-testid={props["data-testid"]}
            style={{ ...props.style, width: `${props.width}px`, height: `${props.height}px` }}
        >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a presented file has no caption track to offer */}
            <video
                aria-label={props.name}
                className="happy-media-video-tile__video"
                controls
                data-happy-desktop-ui="media-video-tile-video"
                playsInline
                poster={props.posterUrl}
                preload="metadata"
                src={props.url}
            />
        </span>
    );
}

export type ConversationMediaProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    items: readonly ConversationMediaItem[];
    /** Opens one item by its position in `items`: a picture full size, a file in its preview. */
    onItemOpen?: (index: number) => void;
};

/** What kind of file a presented item is, in a word, from its declared media type. */
function mediaTypeLabel(item: ConversationMediaItem): string {
    if (item.mimeType === "application/pdf") return "PDF";
    if (item.kind === "document") return "Document";
    const [family, subtype] = item.mimeType.split("/");
    if (family === "image") return "Image";
    if (family === "video") return "Video";
    if (family === "audio") return "Audio";
    if (family === "text" && subtype) return subtype === "plain" ? "Text" : subtype.toUpperCase();
    return "File";
}

/**
 * C-293 ConversationMedia — the files one tool call put in front of the reader,
 * beneath its line in the transcript.
 *
 * Every picture comes first, together: one at its own box, several as a
 * two-column square grid. Each recording follows at its frame, then one full
 * width card per document or file. Every box is known before a byte arrives —
 * from the producer's dimensions, the grid's share of the row, and
 * `conversationRowHeight`'s arithmetic — so the transcript reserves exactly the
 * height this paints.
 */
export function ConversationMedia(props: ConversationMediaProps) {
    const indexed = props.items.map((item, index) => ({ item, index }));
    const images = indexed.filter(({ item }) => item.kind === "image");
    const grid = images.length > 1;
    const open = props.onItemOpen;
    return (
        <div
            className={["happy-conversation-media", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="conversation-media"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {images.length > 0 ? (
                <div
                    className="happy-conversation-media__images"
                    data-count={images.length}
                    data-happy-desktop-ui="conversation-media-images"
                >
                    {images.map(({ item, index }) => {
                        const box = grid ? undefined : messageMediaSingleBox(item);
                        const placeholderUrl = item.thumbhash
                            ? thumbhashDataUrl(item.thumbhash)
                            : undefined;
                        return (
                            <MediaImageTile
                                alt={item.name}
                                {...(box ? { height: box.height, width: box.width } : {})}
                                key={index}
                                {...(placeholderUrl ? { placeholderUrl } : {})}
                                {...(open ? { onOpen: () => open(index) } : {})}
                                url={item.url}
                            />
                        );
                    })}
                </div>
            ) : null}
            {indexed.map(({ item, index }) => {
                if (item.kind === "image") return null;
                if (item.kind === "video") {
                    const box = conversationMediaVideoBox(item);
                    const posterUrl = item.thumbhash ? thumbhashDataUrl(item.thumbhash) : undefined;
                    return (
                        <MediaVideoTile
                            height={box.height}
                            key={index}
                            name={item.name}
                            {...(posterUrl ? { posterUrl } : {})}
                            url={item.url}
                            width={box.width}
                        />
                    );
                }
                const family = fileTreeFamily({ kind: "file", name: item.name });
                return (
                    <ResultCard
                        detail={`${mediaTypeLabel(item)} · ${artifactSizeText(item.size)}`}
                        glyph={
                            <span className="happy-file-family-glyph" data-family={family}>
                                <FileTreeFamilyIcon family={family} size={20} />
                            </span>
                        }
                        key={index}
                        {...(open ? { onOpen: () => open(index) } : {})}
                        title={item.name}
                    />
                );
            })}
        </div>
    );
}
