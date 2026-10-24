import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ModalOverlay } from "./ModalOverlay";
import { ScrollArea } from "./Scrollbar";
import { STORY_FONTS, StoryCanvas, storyContrastInk } from "./StoryCanvas";
import type { StorySticker } from "./StickerView";
import { storyHaptic } from "./storyHaptics";
import { STORY_QUICK_REACTIONS } from "./StoryViewer";
import {
    STORY_CANVAS_HEIGHT,
    STORY_CANVAS_WIDTH,
    type Sticker,
    type Story,
    type StoryFrame,
    type StoryLinkOverlay,
    type StoryLinkStyle,
    type StoryMediaItem,
    type StoryOverlay,
    type StoryTextFill,
    type StoryTextFont,
    type StoryTextOverlay,
    type StoryTransform,
} from "./storyTypes";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** Telegram's eight story fonts, in its order. */
export const STORY_TEXT_FONTS: readonly { readonly font: StoryTextFont; readonly label: string }[] =
    [
        { font: "sanFrancisco", label: "San Francisco" },
        { font: "typewriter", label: "Typewriter" },
        { font: "avenirNext", label: "Avenir Next" },
        { font: "courierNew", label: "Courier New" },
        { font: "noteworthy", label: "Noteworthy" },
        { font: "georgia", label: "Georgia" },
        { font: "papyrus", label: "Papyrus" },
        { font: "snellRoundhand", label: "Snell Roundhand" },
    ];
/** Telegram's five ways to use a text colour, in the order its button cycles them. */
export const STORY_TEXT_FILLS: readonly StoryTextFill[] = [
    "regular",
    "filled",
    "semi",
    "stroke",
    "blur",
];
/** The swatches text and links offer. */
export const STORY_COLORS = [
    "#FFFFFF",
    "#000000",
    "#FF453A",
    "#FF9F0A",
    "#FFD60A",
    "#32D74B",
    "#0A84FF",
    "#BF5AF2",
] as const;
const LINK_STYLES: readonly StoryLinkStyle[] = ["white", "black", "transparent", "blur", "custom"];
const FILL_LABELS: Record<StoryTextFill, string> = {
    regular: "Plain",
    filled: "Filled",
    semi: "Tinted",
    stroke: "Outline",
    blur: "Frosted",
};

/** How far from a guide, in canvas widths, an overlay's centre snaps to it, and twice that holds. */
const SNAP = 0.02;
const ROTATION_SNAP = (2 * Math.PI) / 180;
const ASPECT = STORY_CANVAS_HEIGHT / STORY_CANVAS_WIDTH;

export interface StoryEditorPickerHandlers {
    onSticker(sticker: Sticker): void;
    onEmoji(emoji: string): void;
    onClose(): void;
}

export interface StoryEditorProps {
    readonly frames: readonly StoryFrame[];
    readonly frameIndex: number;
    readonly caption: string;
    readonly uploading: number;
    readonly saving: boolean;
    readonly posting: boolean;
    readonly dirty: boolean;
    /** The draft is on the daemon, so closing keeps it. */
    readonly saved: boolean;
    readonly error?: string;
    readonly frameUrl: (frame: StoryFrame) => string | undefined;
    readonly sticker: (packId: string, stickerId: string) => StorySticker | undefined;
    /** Media from the conversation the editor was opened from. */
    readonly media?:
        | { readonly status: "loading" }
        | { readonly status: "ready"; readonly items: readonly StoryMediaItem[] }
        | { readonly status: "failed"; readonly message: string };
    readonly mediaOffered: boolean;
    readonly mediaUrl: (item: StoryMediaItem) => string;
    readonly drafts?: { readonly loading: boolean; readonly drafts: readonly Story[] };
    readonly draftUrl: (story: Story) => string | undefined;
    readonly stickerPicker: (handlers: StoryEditorPickerHandlers) => ReactNode;
    readonly overlayIdCreate: () => string;
    onFilesAdd(files: readonly File[]): void;
    onMediaRequest(): void;
    onMediaAdd(item: StoryMediaItem): void;
    onDraftsRequest(): void;
    onDraftOpen(storyId: string): void;
    onFrameSelect(index: number): void;
    onFrameRemove(frameId: string): void;
    onCaptionChange(caption: string): void;
    onOverlayAdd(overlay: StoryOverlay): void;
    onOverlayUpdate(overlay: StoryOverlay): void;
    onOverlayRemove(overlayId: string): void;
    onPost(): void;
    onClose(): void;
}

type Panel = "stickers" | "reaction" | "media" | "drafts";

interface TextDraft {
    readonly overlay: StoryTextOverlay;
    readonly isNew: boolean;
}

interface LinkDraft {
    readonly id?: string;
    readonly transform?: StoryTransform;
    readonly url: string;
    readonly label: string;
    readonly style: StoryLinkStyle;
    readonly color: string;
}

type Drag =
    | {
          readonly kind: "move";
          readonly overlay: StoryOverlay;
          readonly pointerX: number;
          readonly pointerY: number;
          readonly box: DOMRect;
          readonly snapX: number | undefined;
          readonly snapY: number | undefined;
          readonly trash: boolean;
          readonly moved: boolean;
      }
    | {
          readonly kind: "turn";
          readonly overlay: StoryOverlay;
          readonly centerX: number;
          readonly centerY: number;
          readonly distance: number;
          readonly angle: number;
          readonly snapAngle: number | undefined;
      };

/** An overlay's box at the scale it was measured, in fractions of the canvas. */
interface Box {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly scale: number;
}

function center(): StoryTransform {
    return { x: 0.5, y: 0.5, scale: 1, rotation: 0 };
}

function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}

function rotationNormalize(value: number): number {
    let angle = value;
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

/** Snaps `raw` to the nearest of `guides` within `threshold`, holding a snap until twice that. */
function snapAxis(
    raw: number,
    guides: readonly number[],
    threshold: number,
    held: number | undefined,
): number | undefined {
    if (held !== undefined && Math.abs(raw - held) < threshold * 2) return held;
    let best: number | undefined;
    for (const guide of guides)
        if (
            Math.abs(raw - guide) < threshold &&
            (best === undefined || Math.abs(raw - guide) < Math.abs(raw - best))
        )
            best = guide;
    return best;
}

/** The http(s) address a link overlay may carry, or nothing when the typed one is not one. */
function linkUrl(typed: string): string | undefined {
    const value = typed.trim();
    if (value === "") return undefined;
    try {
        const parsed = new URL(/^[a-z]+:\/\//iu.test(value) ? value : `https://${value}`);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
        // An address carrying a login is how a link pretends to be another site.
        if (parsed.username !== "" || parsed.password !== "") return undefined;
        return parsed.href.length <= 2048 ? parsed.href : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The story editor, in Telegram's manner: the frame on its canvas with every
 * overlay where it will be seen, the frames beside it, and the tools above:
 * text with Telegram's fills and fonts, links, stickers and emoji, and
 * reaction bubbles. Overlays are dragged, scaled and turned by the handle on
 * their corner or the trackpad, snap to the centre lines (and, for stickers,
 * the edge insets) and to 45°, and are dropped on the bin to delete them.
 */
export function StoryEditor(props: StoryEditorProps) {
    const [selectedId, setSelectedId] = useState<string | undefined>();
    const [panel, setPanel] = useState<Panel | undefined>();
    const [text, setText] = useState<TextDraft | undefined>();
    const [link, setLink] = useState<LinkDraft | undefined>();
    const [box, setBox] = useState<Box | undefined>();
    const [drag, setDrag] = useState<Drag | undefined>();
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const trashRef = useRef<HTMLDivElement | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const frame = props.frames[props.frameIndex];
    const overlays = frame?.overlays ?? [];
    const selected = overlays.find((overlay) => overlay.id === selectedId);
    const reactionCount = overlays.filter((overlay) => overlay.type === "reaction").length;
    const busy = props.uploading > 0;

    const measure = (overlay: StoryOverlay): Box | undefined => {
        const canvas = canvasRef.current;
        const element = canvas?.querySelector<HTMLElement>(`[data-overlay-id="${overlay.id}"]`);
        if (!canvas || !element) return undefined;
        const rect = canvas.getBoundingClientRect();
        const factor =
            overlay.type === "text" || overlay.type === "link" ? overlay.transform.scale : 1;
        return {
            id: overlay.id,
            width: (element.offsetWidth * factor) / rect.width,
            height: (element.offsetHeight * factor) / rect.height,
            scale: overlay.transform.scale,
        };
    };
    const select = (overlay: StoryOverlay | undefined): void => {
        setSelectedId(overlay?.id);
        setBox(overlay ? measure(overlay) : undefined);
    };
    const transformSet = (overlay: StoryOverlay, transform: StoryTransform): void => {
        props.onOverlayUpdate({ ...overlay, transform } as StoryOverlay);
    };
    /** Selects an overlay whose size just changed; it is drawn by the next frame, and its handles follow it. */
    const selectRedrawn = (overlay: StoryOverlay): void => {
        setSelectedId(overlay.id);
        setBox(undefined);
        requestAnimationFrame(() => setBox(measure(overlay)));
    };
    const addCentered = (overlay: StoryOverlay): void => {
        props.onOverlayAdd(overlay);
        selectRedrawn(overlay);
    };
    /** Another frame is on the canvas: what was being chosen or typed belonged to the last one. */
    const frameLeave = (): void => {
        select(undefined);
        setText(undefined);
        setLink(undefined);
    };

    const movePointerDown = (
        event: ReactPointerEvent<HTMLElement>,
        overlay: StoryOverlay,
    ): void => {
        if (event.button !== 0 || !canvasRef.current) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        select(overlay);
        setDrag({
            kind: "move",
            overlay,
            pointerX: event.clientX,
            pointerY: event.clientY,
            box: canvasRef.current.getBoundingClientRect(),
            snapX: undefined,
            snapY: undefined,
            trash: false,
            moved: false,
        });
    };
    const turnPointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
        if (event.button !== 0 || !selected || !canvasRef.current) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = canvasRef.current.getBoundingClientRect();
        const centerX = rect.left + selected.transform.x * rect.width;
        const centerY = rect.top + selected.transform.y * rect.height;
        setDrag({
            kind: "turn",
            overlay: selected,
            centerX,
            centerY,
            distance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
            angle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
            snapAngle: undefined,
        });
    };
    const dragMove = (event: ReactPointerEvent<HTMLElement>): void => {
        if (!drag) return;
        if (drag.kind === "move") {
            const start = drag.overlay.transform;
            const rawX = start.x + (event.clientX - drag.pointerX) / drag.box.width;
            const rawY = start.y + (event.clientY - drag.pointerY) / drag.box.height;
            const sticker = drag.overlay.type === "sticker" || drag.overlay.type === "emoji";
            const inset = 1 / 20;
            const snapX = snapAxis(
                rawX,
                sticker ? [0.5, inset, 1 - inset] : [0.5],
                SNAP,
                drag.snapX,
            );
            const snapY = snapAxis(
                rawY,
                sticker ? [0.5, inset / ASPECT, 1 - inset / ASPECT] : [0.5],
                SNAP / ASPECT,
                drag.snapY,
            );
            if (
                (snapX !== undefined && snapX !== drag.snapX) ||
                (snapY !== undefined && snapY !== drag.snapY)
            )
                storyHaptic("overlay.snap");
            const trashBox = trashRef.current?.getBoundingClientRect();
            const trash =
                trashBox !== undefined &&
                event.clientX >= trashBox.left - 8 &&
                event.clientX <= trashBox.right + 8 &&
                event.clientY >= trashBox.top - 8 &&
                event.clientY <= trashBox.bottom + 8;
            if (trash && !drag.trash) storyHaptic("overlay.trash");
            setDrag({
                ...drag,
                snapX,
                snapY,
                trash,
                moved: true,
            });
            transformSet(drag.overlay, {
                ...start,
                x: clamp(snapX ?? rawX, -0.5, 1.5),
                y: clamp(snapY ?? rawY, -0.5, 1.5),
            });
            return;
        }
        const start = drag.overlay.transform;
        const distance = Math.hypot(event.clientX - drag.centerX, event.clientY - drag.centerY);
        const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX);
        const raw = rotationNormalize(start.rotation + angle - drag.angle);
        const quarter = Math.PI / 4;
        const nearest = Math.round(raw / quarter) * quarter;
        // Angular distance, so a snap at π holds while the angle wraps to -π.
        const snapAngle =
            drag.snapAngle !== undefined &&
            Math.abs(rotationNormalize(raw - drag.snapAngle)) < ROTATION_SNAP * 2
                ? drag.snapAngle
                : Math.abs(rotationNormalize(raw - nearest)) < ROTATION_SNAP
                  ? nearest
                  : undefined;
        if (snapAngle !== undefined && snapAngle !== drag.snapAngle) storyHaptic("overlay.snap");
        setDrag({ ...drag, snapAngle });
        transformSet(drag.overlay, {
            ...start,
            scale: clamp((start.scale * distance) / drag.distance, 0.05, 10),
            rotation: rotationNormalize(snapAngle ?? raw),
        });
    };
    const dragEnd = (): void => {
        const ended = drag;
        setDrag(undefined);
        if (!ended) return;
        if (ended.kind === "move" && ended.trash) {
            props.onOverlayRemove(ended.overlay.id);
            select(undefined);
            return;
        }
        const current = overlays.find((overlay) => overlay.id === ended.overlay.id);
        if (current) setBox(measure(current));
    };

    const textBegin = (overlay?: StoryTextOverlay): void => {
        setPanel(undefined);
        setText(
            overlay
                ? { overlay, isNew: false }
                : {
                      isNew: true,
                      overlay: {
                          id: props.overlayIdCreate(),
                          type: "text",
                          text: "",
                          style: {
                              font: "sanFrancisco",
                              fill: "filled",
                              color: "#FFFFFF",
                              align: "center",
                              width: 0.8,
                          },
                          transform: { ...center(), y: 0.4 },
                      },
                  },
        );
    };
    const textDone = (): void => {
        if (!text) return;
        const value = text.overlay.text.trim() === "" ? "" : text.overlay.text;
        if (value === "") {
            if (!text.isNew) props.onOverlayRemove(text.overlay.id);
        } else if (text.isNew) addCentered({ ...text.overlay, text: value.slice(0, 2048) });
        else {
            const edited = { ...text.overlay, text: value.slice(0, 2048) };
            props.onOverlayUpdate(edited);
            selectRedrawn(edited);
        }
        setText(undefined);
    };
    const linkDone = (): void => {
        if (!link) return;
        const url = linkUrl(link.url);
        if (url === undefined) return;
        const overlay: StoryLinkOverlay = {
            id: link.id ?? props.overlayIdCreate(),
            type: "link",
            url,
            label: link.label.trim() === "" ? null : link.label.trim().slice(0, 64),
            style: link.style,
            ...(link.style === "custom" ? { color: link.color } : {}),
            transform: link.transform ?? { ...center(), y: 0.65 },
        };
        if (link.id) {
            props.onOverlayUpdate(overlay);
            selectRedrawn(overlay);
        } else addCentered(overlay);
        setLink(undefined);
    };

    const handle = (() => {
        if (
            !selected ||
            !box ||
            box.id !== selected.id ||
            drag?.kind === "move" ||
            text !== undefined ||
            link !== undefined
        )
            return undefined;
        const k = selected.transform.scale / box.scale;
        const halfWidth = (box.width * k) / 2;
        const halfHeight = (box.height * k * ASPECT) / 2;
        const rotation = selected.transform.rotation;
        const x = halfWidth * Math.cos(rotation) - halfHeight * Math.sin(rotation);
        const y = halfWidth * Math.sin(rotation) + halfHeight * Math.cos(rotation);
        return {
            outline: {
                left: `${String(selected.transform.x * 100)}%`,
                top: `${String(selected.transform.y * 100)}%`,
                width: `${String(box.width * k * 100)}%`,
                height: `${String(box.height * k * 100)}%`,
                transform: `translate(-50%, -50%) rotate(${String(rotation)}rad)`,
            },
            knob: {
                left: `${String((selected.transform.x + x) * 100)}%`,
                top: `${String((selected.transform.y + y / ASPECT) * 100)}%`,
            },
        };
    })();

    const status = busy
        ? props.uploading === 1
            ? "Adding 1 photo or video…"
            : `Adding ${String(props.uploading)} photos and videos…`
        : props.saving
          ? "Saving…"
          : props.dirty
            ? "Unsaved changes"
            : props.saved
              ? "Draft saved"
              : "";

    return (
        <ModalOverlay
            className="happy-story-editor"
            data-testid="story-editor"
            onEscape={() => {
                if (text) textDone();
                else if (link) setLink(undefined);
                else if (panel) setPanel(undefined);
                else if (selected) select(undefined);
                else props.onClose();
            }}
            placement="fill"
        >
            <div
                // Always a dark room, whatever the app appearance: its controls take
                // the dark palette, so a primary button reads on the dark sheets.
                className="happy-story-editor__room happy-theme-dark"
                data-happy-desktop-ui="story-editor"
                onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("Files")) event.preventDefault();
                }}
                onDrop={(event) => {
                    const files = [...event.dataTransfer.files];
                    if (files.length === 0) return;
                    event.preventDefault();
                    props.onFilesAdd(files);
                }}
                onKeyDown={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("input, textarea")) return;
                    if ((event.key === "Backspace" || event.key === "Delete") && selected) {
                        event.preventDefault();
                        props.onOverlayRemove(selected.id);
                        select(undefined);
                    }
                }}
            >
                <input
                    accept="image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/quicktime,video/webm"
                    className="happy-story-editor__file"
                    data-testid="story-editor-file"
                    multiple
                    onChange={(event) => {
                        const files = [...(event.currentTarget.files ?? [])];
                        event.currentTarget.value = "";
                        if (files.length > 0) props.onFilesAdd(files);
                    }}
                    ref={fileRef}
                    type="file"
                />
                <header className="happy-story-editor__bar">
                    <button
                        aria-label="Close editor"
                        className="happy-story-editor__tool"
                        data-testid="story-editor-close"
                        onClick={props.onClose}
                        title={props.saved ? "Close; the draft is kept" : "Close"}
                        type="button"
                    >
                        <Icon name="close" size={18} />
                    </button>
                    <button
                        className="happy-story-editor__tool"
                        data-label=""
                        onClick={() => {
                            props.onDraftsRequest();
                            setPanel(panel === "drafts" ? undefined : "drafts");
                        }}
                        type="button"
                    >
                        Drafts
                    </button>
                    {/* The error takes the status's slot, so nothing beside it moves. */}
                    <span
                        className="happy-story-editor__status"
                        data-error={props.error ? "" : undefined}
                        role={props.error ? "alert" : "status"}
                    >
                        {props.error ?? status}
                    </span>
                    <div
                        className="happy-story-editor__tools"
                        role="toolbar"
                        aria-label="Add to the frame"
                    >
                        <button
                            aria-label="Add text"
                            className="happy-story-editor__tool"
                            data-testid="story-editor-text"
                            disabled={!frame}
                            onClick={() => textBegin()}
                            title="Text"
                            type="button"
                        >
                            <Ionicon name="text-outline" size={18} />
                        </button>
                        <button
                            aria-label="Add sticker or emoji"
                            className="happy-story-editor__tool"
                            data-testid="story-editor-stickers"
                            disabled={!frame}
                            onClick={() => setPanel(panel === "stickers" ? undefined : "stickers")}
                            title="Stickers and emoji"
                            type="button"
                        >
                            <Icon name="smile" size={18} />
                        </button>
                        <button
                            aria-label="Add link"
                            className="happy-story-editor__tool"
                            data-testid="story-editor-link"
                            disabled={!frame}
                            onClick={() => {
                                setPanel(undefined);
                                setLink({
                                    url: "",
                                    label: "",
                                    style: "white",
                                    color: STORY_COLORS[6],
                                });
                            }}
                            title="Link"
                            type="button"
                        >
                            <Icon name="link" size={18} />
                        </button>
                        <button
                            aria-label="Add reaction"
                            className="happy-story-editor__tool"
                            data-testid="story-editor-reaction"
                            disabled={!frame || reactionCount >= 5}
                            onClick={() => setPanel(panel === "reaction" ? undefined : "reaction")}
                            title="Reaction"
                            type="button"
                        >
                            <Ionicon name="heart-outline" size={18} />
                        </button>
                    </div>
                </header>
                <div className="happy-story-editor__body">
                    <ScrollArea
                        className="happy-story-editor__frames"
                        viewportClassName="happy-story-editor__frames-viewport"
                    >
                        <div className="happy-story-editor__frames-list">
                            {props.frames.map((each, index) => (
                                <div
                                    className="happy-story-editor__thumb"
                                    data-selected={index === props.frameIndex ? "" : undefined}
                                    key={each.id}
                                >
                                    <button
                                        aria-label={`Frame ${String(index + 1)}`}
                                        className="happy-story-editor__thumb-frame"
                                        onClick={() => {
                                            frameLeave();
                                            props.onFrameSelect(index);
                                        }}
                                        type="button"
                                    >
                                        <StoryCanvas
                                            animate={false}
                                            className="happy-story-editor__thumb-canvas"
                                            frame={each}
                                            {...(props.frameUrl(each)
                                                ? { mediaUrl: props.frameUrl(each) }
                                                : {})}
                                            playing={false}
                                            sticker={props.sticker}
                                        />
                                    </button>
                                    {props.frames.length > 1 ? (
                                        <button
                                            aria-label={`Remove frame ${String(index + 1)}`}
                                            className="happy-story-editor__thumb-remove"
                                            onClick={() => {
                                                if (each.id === frame?.id) frameLeave();
                                                props.onFrameRemove(each.id);
                                            }}
                                            type="button"
                                        >
                                            <Icon name="close" size={12} />
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                            {props.frames.length > 0 &&
                            props.frames.length + props.uploading < 10 ? (
                                <button
                                    aria-label="Add photos or videos"
                                    className="happy-story-editor__thumb-add"
                                    onClick={() =>
                                        setPanel(panel === "media" ? undefined : "media")
                                    }
                                    type="button"
                                >
                                    <Icon name="plus" size={18} />
                                </button>
                            ) : null}
                        </div>
                    </ScrollArea>
                    <div className="happy-story-editor__stage">
                        {frame ? (
                            <div
                                className="happy-story-editor__canvas-host"
                                onPointerDown={(event) => {
                                    if (event.target === event.currentTarget) select(undefined);
                                }}
                                ref={canvasRef}
                            >
                                <StoryCanvas
                                    caption={props.caption}
                                    className="happy-story-editor__canvas"
                                    data-testid="story-editor-canvas"
                                    frame={frame}
                                    {...(props.frameUrl(frame)
                                        ? { mediaUrl: props.frameUrl(frame) }
                                        : {})}
                                    {...(text ? { overlayHidden: text.overlay.id } : {})}
                                    overlayAttributes={(overlay) => ({
                                        "data-selected": overlay.id === selectedId ? "" : undefined,
                                        "data-trashing":
                                            drag?.kind === "move" &&
                                            drag.trash &&
                                            drag.overlay.id === overlay.id
                                                ? ""
                                                : undefined,
                                        "data-editable": "",
                                        onPointerDown: (event) => movePointerDown(event, overlay),
                                        onPointerMove: dragMove,
                                        onPointerUp: dragEnd,
                                        onPointerCancel: dragEnd,
                                        onDoubleClick: () => {
                                            if (overlay.type === "text") textBegin(overlay);
                                            else if (overlay.type === "link")
                                                setLink({
                                                    id: overlay.id,
                                                    transform: overlay.transform,
                                                    url: overlay.url,
                                                    label: overlay.label ?? "",
                                                    style: overlay.style,
                                                    color: overlay.color ?? STORY_COLORS[6],
                                                });
                                        },
                                        onWheel: (event) => {
                                            if (overlay.id !== selectedId) return;
                                            const t = overlay.transform;
                                            transformSet(
                                                overlay,
                                                event.shiftKey || event.altKey
                                                    ? {
                                                          ...t,
                                                          rotation: rotationNormalize(
                                                              t.rotation + event.deltaY * 0.01,
                                                          ),
                                                      }
                                                    : {
                                                          ...t,
                                                          scale: clamp(
                                                              t.scale *
                                                                  Math.exp(-event.deltaY * 0.01),
                                                              0.05,
                                                              10,
                                                          ),
                                                      },
                                            );
                                        },
                                    })}
                                    sticker={props.sticker}
                                >
                                    {drag?.kind === "move" && drag.snapX !== undefined ? (
                                        <span
                                            className="happy-story-editor__guide"
                                            data-axis="x"
                                            style={{ left: `${String(drag.snapX * 100)}%` }}
                                        />
                                    ) : null}
                                    {drag?.kind === "move" && drag.snapY !== undefined ? (
                                        <span
                                            className="happy-story-editor__guide"
                                            data-axis="y"
                                            style={{ top: `${String(drag.snapY * 100)}%` }}
                                        />
                                    ) : null}
                                    {drag?.kind === "turn" &&
                                    drag.snapAngle !== undefined &&
                                    selected ? (
                                        <span
                                            className="happy-story-editor__guide"
                                            data-axis="angle"
                                            style={{
                                                left: `${String(selected.transform.x * 100)}%`,
                                                top: `${String(selected.transform.y * 100)}%`,
                                                transform: `translate(-50%, -50%) rotate(${String(drag.snapAngle)}rad)`,
                                            }}
                                        />
                                    ) : null}
                                    {handle ? (
                                        <>
                                            <span
                                                className="happy-story-editor__selection"
                                                style={handle.outline}
                                            />
                                            <span
                                                aria-label="Scale and rotate"
                                                className="happy-story-editor__knob"
                                                data-testid="story-editor-knob"
                                                onPointerCancel={dragEnd}
                                                onPointerDown={turnPointerDown}
                                                onPointerMove={dragMove}
                                                onPointerUp={dragEnd}
                                                role="slider"
                                                aria-valuenow={selected?.transform.scale}
                                                style={handle.knob}
                                            />
                                        </>
                                    ) : null}
                                    <div
                                        aria-hidden={drag?.kind !== "move" || !drag.moved}
                                        className="happy-story-editor__trash"
                                        data-active={
                                            drag?.kind === "move" && drag.trash ? "" : undefined
                                        }
                                        data-shown={
                                            drag?.kind === "move" && drag.moved ? "" : undefined
                                        }
                                        ref={trashRef}
                                    >
                                        <Icon name="trash" size={20} />
                                    </div>
                                    {text ? (
                                        <div className="happy-story-editor__text-room">
                                            <textarea
                                                aria-label="Story text"
                                                autoFocus
                                                className="happy-story-editor__text-input"
                                                data-fill={text.overlay.style.fill}
                                                data-testid="story-editor-text-input"
                                                onChange={(event) =>
                                                    setText({
                                                        ...text,
                                                        overlay: {
                                                            ...text.overlay,
                                                            text: event.currentTarget.value,
                                                        },
                                                    })
                                                }
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key === "Enter" &&
                                                        (event.metaKey || event.ctrlKey)
                                                    ) {
                                                        event.preventDefault();
                                                        textDone();
                                                    }
                                                }}
                                                placeholder="Type something"
                                                style={{
                                                    fontFamily:
                                                        STORY_FONTS[text.overlay.style.font],
                                                    textAlign: text.overlay.style.align,
                                                    color:
                                                        text.overlay.style.fill === "regular"
                                                            ? text.overlay.style.color
                                                            : text.overlay.style.fill === "filled"
                                                              ? storyContrastInk(
                                                                    text.overlay.style.color,
                                                                )
                                                              : "var(--story-ink)",
                                                    ...(text.overlay.style.fill === "filled" ||
                                                    text.overlay.style.fill === "semi"
                                                        ? {
                                                              backgroundColor:
                                                                  text.overlay.style.fill === "semi"
                                                                      ? `${text.overlay.style.color}80`
                                                                      : text.overlay.style.color,
                                                          }
                                                        : {}),
                                                    ...(text.overlay.style.fill === "stroke"
                                                        ? {
                                                              WebkitTextStroke: `0.14em ${text.overlay.style.color}`,
                                                          }
                                                        : {}),
                                                }}
                                                value={text.overlay.text}
                                            />
                                        </div>
                                    ) : null}
                                </StoryCanvas>
                            </div>
                        ) : (
                            <div className="happy-story-editor__empty">
                                <span className="happy-story-editor__empty-title">
                                    {busy
                                        ? "Adding your photos and videos…"
                                        : "Add photos or videos"}
                                </span>
                                <span className="happy-story-editor__empty-detail">
                                    Up to 10. Drop files here, or choose them.
                                </span>
                                <div className="happy-story-editor__empty-actions">
                                    <Button
                                        data-testid="story-editor-choose"
                                        icon="image"
                                        loading={busy}
                                        onClick={() => fileRef.current?.click()}
                                        variant="primary"
                                    >
                                        Choose files
                                    </Button>
                                    {props.mediaOffered ? (
                                        <Button
                                            data-testid="story-editor-from-chat"
                                            icon="chat"
                                            onClick={() => {
                                                props.onMediaRequest();
                                                setPanel("media");
                                            }}
                                            variant="secondary"
                                        >
                                            From this conversation
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="happy-story-editor__side">
                        {text ? (
                            <div
                                className="happy-story-editor__panel"
                                data-testid="story-editor-text-panel"
                            >
                                <span className="happy-story-editor__panel-title">Text</span>
                                <div className="happy-story-editor__chips">
                                    {STORY_TEXT_FONTS.map((entry) => (
                                        <button
                                            aria-pressed={text.overlay.style.font === entry.font}
                                            className="happy-story-editor__chip"
                                            key={entry.font}
                                            onClick={() =>
                                                setText({
                                                    ...text,
                                                    overlay: {
                                                        ...text.overlay,
                                                        style: {
                                                            ...text.overlay.style,
                                                            font: entry.font,
                                                        },
                                                    },
                                                })
                                            }
                                            style={{ fontFamily: STORY_FONTS[entry.font] }}
                                            type="button"
                                        >
                                            {entry.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="happy-story-editor__chips">
                                    {STORY_TEXT_FILLS.map((fill) => (
                                        <button
                                            aria-pressed={text.overlay.style.fill === fill}
                                            className="happy-story-editor__chip"
                                            key={fill}
                                            onClick={() =>
                                                setText({
                                                    ...text,
                                                    overlay: {
                                                        ...text.overlay,
                                                        style: { ...text.overlay.style, fill },
                                                    },
                                                })
                                            }
                                            type="button"
                                        >
                                            {FILL_LABELS[fill]}
                                        </button>
                                    ))}
                                </div>
                                <div className="happy-story-editor__chips">
                                    {(["left", "center", "right"] as const).map((align) => (
                                        <button
                                            aria-pressed={text.overlay.style.align === align}
                                            className="happy-story-editor__chip"
                                            key={align}
                                            onClick={() =>
                                                setText({
                                                    ...text,
                                                    overlay: {
                                                        ...text.overlay,
                                                        style: { ...text.overlay.style, align },
                                                    },
                                                })
                                            }
                                            type="button"
                                        >
                                            {align === "left"
                                                ? "Left"
                                                : align === "center"
                                                  ? "Center"
                                                  : "Right"}
                                        </button>
                                    ))}
                                </div>
                                <div className="happy-story-editor__swatches">
                                    {STORY_COLORS.map((color) => (
                                        <button
                                            aria-label={`Colour ${color}`}
                                            aria-pressed={text.overlay.style.color === color}
                                            className="happy-story-editor__swatch"
                                            key={color}
                                            onClick={() =>
                                                setText({
                                                    ...text,
                                                    overlay: {
                                                        ...text.overlay,
                                                        style: { ...text.overlay.style, color },
                                                    },
                                                })
                                            }
                                            style={{ backgroundColor: color }}
                                            type="button"
                                        />
                                    ))}
                                </div>
                                <Button
                                    data-testid="story-editor-text-done"
                                    onClick={textDone}
                                    variant="primary"
                                >
                                    Done
                                </Button>
                            </div>
                        ) : link ? (
                            <div
                                className="happy-story-editor__panel"
                                data-testid="story-editor-link-panel"
                            >
                                <span className="happy-story-editor__panel-title">Link</span>
                                <input
                                    aria-label="Link address"
                                    autoFocus
                                    className="happy-story-editor__input"
                                    data-testid="story-editor-link-url"
                                    onChange={(event) =>
                                        setLink({ ...link, url: event.currentTarget.value })
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") linkDone();
                                    }}
                                    placeholder="https://"
                                    type="url"
                                    value={link.url}
                                />
                                <input
                                    aria-label="Link label"
                                    className="happy-story-editor__input"
                                    maxLength={64}
                                    onChange={(event) =>
                                        setLink({ ...link, label: event.currentTarget.value })
                                    }
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") linkDone();
                                    }}
                                    placeholder="Label (optional)"
                                    value={link.label}
                                />
                                <div className="happy-story-editor__chips">
                                    {LINK_STYLES.map((style) => (
                                        <button
                                            aria-pressed={link.style === style}
                                            className="happy-story-editor__chip"
                                            key={style}
                                            onClick={() => setLink({ ...link, style })}
                                            type="button"
                                        >
                                            {style === "custom"
                                                ? "Colour"
                                                : style.slice(0, 1).toUpperCase() + style.slice(1)}
                                        </button>
                                    ))}
                                </div>
                                {link.style === "custom" ? (
                                    <div className="happy-story-editor__swatches">
                                        {STORY_COLORS.map((color) => (
                                            <button
                                                aria-label={`Colour ${color}`}
                                                aria-pressed={link.color === color}
                                                className="happy-story-editor__swatch"
                                                key={color}
                                                onClick={() => setLink({ ...link, color })}
                                                style={{ backgroundColor: color }}
                                                type="button"
                                            />
                                        ))}
                                    </div>
                                ) : null}
                                <div className="happy-story-editor__row">
                                    <Button onClick={() => setLink(undefined)} variant="ghost">
                                        Cancel
                                    </Button>
                                    <Button
                                        data-testid="story-editor-link-done"
                                        disabled={linkUrl(link.url) === undefined}
                                        onClick={linkDone}
                                        variant="primary"
                                    >
                                        Done
                                    </Button>
                                </div>
                            </div>
                        ) : panel === "stickers" ? (
                            // eslint-disable-next-line react-hooks/refs -- the handlers given to the picker read the canvas only when a sticker is chosen, never while rendering
                            props.stickerPicker({
                                onSticker: (sticker) => {
                                    storyHaptic("sticker.drop");
                                    addCentered({
                                        id: props.overlayIdCreate(),
                                        type: "sticker",
                                        packId: sticker.packId,
                                        stickerId: sticker.id,
                                        transform: { ...center(), scale: 0.4 },
                                    });
                                    setPanel(undefined);
                                },
                                onEmoji: (emoji) => {
                                    storyHaptic("sticker.drop");
                                    addCentered({
                                        id: props.overlayIdCreate(),
                                        type: "emoji",
                                        emoji,
                                        transform: { ...center(), scale: 0.3 },
                                    });
                                    setPanel(undefined);
                                },
                                onClose: () => setPanel(undefined),
                            })
                        ) : panel === "reaction" ? (
                            <div
                                className="happy-story-editor__panel"
                                data-testid="story-editor-reaction-panel"
                            >
                                <span className="happy-story-editor__panel-title">Reaction</span>
                                <span className="happy-story-editor__panel-detail">
                                    Viewers tap the bubble to react with its emoji.
                                </span>
                                <div className="happy-story-editor__reactions">
                                    {STORY_QUICK_REACTIONS.map((emoji) => (
                                        <button
                                            aria-label={`Reaction ${emoji}`}
                                            className="happy-story-editor__reaction"
                                            key={emoji}
                                            onClick={() => {
                                                addCentered({
                                                    id: props.overlayIdCreate(),
                                                    type: "reaction",
                                                    emoji,
                                                    transform: {
                                                        ...center(),
                                                        x: 0.7,
                                                        y: 0.75,
                                                        scale: 0.24,
                                                    },
                                                });
                                                setPanel(undefined);
                                            }}
                                            type="button"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : panel === "media" ? (
                            <div
                                className="happy-story-editor__panel"
                                data-testid="story-editor-media-panel"
                            >
                                <span className="happy-story-editor__panel-title">
                                    Add photos or videos
                                </span>
                                <Button
                                    icon="image"
                                    onClick={() => fileRef.current?.click()}
                                    variant="secondary"
                                >
                                    Choose files
                                </Button>
                                {props.mediaOffered ? (
                                    props.media === undefined ? (
                                        <Button
                                            icon="chat"
                                            onClick={props.onMediaRequest}
                                            variant="secondary"
                                        >
                                            From this conversation
                                        </Button>
                                    ) : props.media.status === "ready" ? (
                                        props.media.items.length === 0 ? (
                                            <span className="happy-story-editor__panel-detail">
                                                This conversation has no photos or videos yet.
                                            </span>
                                        ) : (
                                            <ScrollArea
                                                className="happy-story-editor__media-scroll"
                                                viewportClassName="happy-story-editor__media-viewport"
                                            >
                                                <div className="happy-story-editor__media">
                                                    {props.media.items.map((item, index) => (
                                                        <button
                                                            aria-label={`Add ${item.name}`}
                                                            className="happy-story-editor__media-item"
                                                            data-testid="story-editor-media-item"
                                                            key={`${String(index)}:${item.name}`}
                                                            onClick={() => {
                                                                props.onMediaAdd(item);
                                                                setPanel(undefined);
                                                            }}
                                                            type="button"
                                                        >
                                                            {item.kind === "video" ? (
                                                                <video
                                                                    muted
                                                                    preload="metadata"
                                                                    src={props.mediaUrl(item)}
                                                                />
                                                            ) : (
                                                                <img
                                                                    alt=""
                                                                    draggable={false}
                                                                    src={props.mediaUrl(item)}
                                                                />
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        )
                                    ) : props.media.status === "failed" ? (
                                        <span className="happy-story-editor__panel-detail">
                                            {props.media.message}
                                        </span>
                                    ) : (
                                        <span className="happy-story-editor__panel-detail">
                                            Loading…
                                        </span>
                                    )
                                ) : null}
                            </div>
                        ) : panel === "drafts" ? (
                            <div
                                className="happy-story-editor__panel"
                                data-testid="story-editor-drafts"
                            >
                                <span className="happy-story-editor__panel-title">Drafts</span>
                                {props.drafts === undefined || props.drafts.loading ? (
                                    <span className="happy-story-editor__panel-detail">
                                        Loading…
                                    </span>
                                ) : props.drafts.drafts.length === 0 ? (
                                    <span className="happy-story-editor__panel-detail">
                                        No drafts.
                                    </span>
                                ) : (
                                    <ScrollArea
                                        className="happy-story-editor__media-scroll"
                                        viewportClassName="happy-story-editor__media-viewport"
                                    >
                                        <div className="happy-story-editor__media">
                                            {props.drafts.drafts.map((draft) => {
                                                const url = props.draftUrl(draft);
                                                return (
                                                    <button
                                                        aria-label={`Open draft ${draft.caption ?? ""}`}
                                                        className="happy-story-editor__media-item"
                                                        key={draft.id}
                                                        onClick={() => {
                                                            frameLeave();
                                                            props.onDraftOpen(draft.id);
                                                            setPanel(undefined);
                                                        }}
                                                        type="button"
                                                    >
                                                        {!url ? null : draft.frames[0]?.kind ===
                                                          "video" ? (
                                                            <video
                                                                muted
                                                                preload="metadata"
                                                                src={url}
                                                            />
                                                        ) : (
                                                            <img
                                                                alt=""
                                                                draggable={false}
                                                                src={url}
                                                            />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </ScrollArea>
                                )}
                            </div>
                        ) : selected ? (
                            <div
                                className="happy-story-editor__panel"
                                data-testid="story-editor-selection"
                            >
                                <span className="happy-story-editor__panel-title">
                                    {selected.type === "text"
                                        ? "Text"
                                        : selected.type === "link"
                                          ? "Link"
                                          : selected.type === "reaction"
                                            ? "Reaction"
                                            : selected.type === "emoji"
                                              ? "Emoji"
                                              : "Sticker"}
                                </span>
                                <span className="happy-story-editor__panel-detail">
                                    Drag to move, drag the corner to scale and turn, or drop it on
                                    the bin.
                                </span>
                                {selected.type === "text" ? (
                                    <Button
                                        icon="edit"
                                        onClick={() => textBegin(selected)}
                                        variant="secondary"
                                    >
                                        Edit text
                                    </Button>
                                ) : null}
                                {selected.type === "reaction" ? (
                                    <div className="happy-story-editor__row">
                                        <Button
                                            onClick={() =>
                                                props.onOverlayUpdate({
                                                    ...selected,
                                                    dark: !selected.dark,
                                                })
                                            }
                                            variant="secondary"
                                        >
                                            {selected.dark ? "Light bubble" : "Dark bubble"}
                                        </Button>
                                        <Button
                                            onClick={() =>
                                                props.onOverlayUpdate({
                                                    ...selected,
                                                    flipped: !selected.flipped,
                                                })
                                            }
                                            variant="secondary"
                                        >
                                            Flip tail
                                        </Button>
                                    </div>
                                ) : null}
                                <Button
                                    icon="trash"
                                    onClick={() => {
                                        props.onOverlayRemove(selected.id);
                                        select(undefined);
                                    }}
                                    variant="danger"
                                >
                                    Delete
                                </Button>
                            </div>
                        ) : null}
                    </div>
                </div>
                <footer className="happy-story-editor__footer">
                    <input
                        aria-label="Caption"
                        className="happy-story-editor__caption"
                        data-testid="story-editor-caption"
                        disabled={!frame}
                        maxLength={1024}
                        onChange={(event) => props.onCaptionChange(event.currentTarget.value)}
                        placeholder="Add a caption…"
                        value={props.caption}
                    />
                    <Button
                        data-testid="story-editor-post"
                        disabled={!frame || busy}
                        loading={props.posting}
                        onClick={props.onPost}
                        variant="primary"
                    >
                        Post
                    </Button>
                </footer>
            </div>
        </ModalOverlay>
    );
}
