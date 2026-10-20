import { partitionComponentProps } from "./componentProps";
import {
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
    useRef,
    useState,
} from "react";
import { Button } from "./Button";
import { ContextMenu } from "./ContextMenu";
import { ImageViewer, type ImageViewerProps } from "./ImageViewer";
import { commandShortcut, commandShortcutMatches } from "./keyboardShortcut";
import type { MenuItem } from "./Menu";
import { VideoViewer } from "./VideoViewer";
import { thumbhashDataUrl } from "./thumbhashDataUrl";
import { Ionicon } from "./vectorIcons/VectorIcon";

type LightboxSharedProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    alt?: string;
    /** Primary label above the viewer — usually the file name. */
    caption?: string;
    /** Secondary meta above the frame — usually size / dimensions. */
    detail?: string;
    /** Trailing controls in the header, after the copy and download actions. */
    actions?: ReactNode;
    /**
     * Puts the picture on the clipboard. Given for an image, the header offers
     * it and Command-C does the same; the promise settles the button's
     * copied or failed state.
     */
    onCopy?: () => Promise<void>;
    /** Saves the media to the reader's machine; a rejection marks the button failed. */
    onDownload?: () => Promise<void>;
    /**
     * Where this media sits in the set it was opened from, counted from zero.
     * Given together with `onPrevious`/`onNext`, it is stated in the header so
     * the reader knows how much of the set is behind and ahead of them.
     */
    position?: { readonly index: number; readonly total: number };
    adjacentImages?: ImageViewerProps["adjacentImages"];
    loadedImage?: ImageViewerProps["loadedImage"];
    /** The selected image's existing thumbnail and intrinsic dimensions. */
    imageThumbnail?: {
        readonly url?: string;
        readonly thumbhash?: string;
        readonly width?: number;
        readonly height?: number;
    };
    /** Wire both to step through a set; the header then carries its controls. */
    onPrevious?: () => void;
    onNext?: () => void;
    /** Singular noun used by the previous/next controls. Defaults to "image". */
    navigationLabel?: string;
    onClose?: () => void;
    closeLabel?: string;
};

/** How long a finished copy or a failed action keeps its mark on the button. */
const OUTCOME_MS = 1_600;

const COPY_SHORTCUT = commandShortcut("c");

type LightboxAction = "copy" | "download";

type LightboxActionStatus = "pending" | "done" | "failed";

/** The parts of the shared viewer that are the picture itself, for its menu. */
const PICTURE_PARTS = new Set(["image-viewer-image", "image-viewer-thumbnail"]);

/**
 * How each action last went, for the media it was pressed on: stepping to
 * another picture leaves a mark that belongs to the previous one.
 */
type LightboxActionStates = {
    readonly [action in LightboxAction]?: {
        readonly mediaUrl: string;
        readonly status: LightboxActionStatus;
    };
};

export type LightboxProps = LightboxSharedProps &
    ({ imageUrl: string; videoUrl?: never } | { imageUrl?: never; videoUrl: string });
/**
 * C-046 Lightbox — full image or video preview shown inside a web modal (never
 * a new browser tab). It is not a card on a dim: hosted on `ModalOverlay`'s
 * `fill` placement it takes the whole app window and paints one flat surface over
 * it, so looking at media is a mode the window enters rather than a panel that
 * floats above a half-legible copy of the app. The root `.happy-lightbox`
 * still declares no scrim and no fixed position of its own, so it renders as a
 * screenshot-safe specimen in whatever box it is given; the measured surface
 * is the inner `data-happy-desktop-ui="lightbox-dialog"`: an optional
 * caption/detail + actions header above the shared viewer.
 *
 * The surface, caption, controls, and viewer inherit the surrounding app's
 * resolved appearance. Theme tokens keep them current when the app or system
 * changes between light and dark while a picture is open.
 *
 * The media inside uses the same image and video viewers as file preview and
 * the separate preview window. Images keep the `immersive` tone because the
 * room is already this one; videos keep their own floating transport.
 *
 * A picture opened from a set is one of several: wire `onPrevious`/`onNext` and
 * the header carries controls for the set, its place in it, and the left and
 * right arrow keys. Those keys reach the viewer inside first, which keeps them
 * only while it has somewhere to pan — so an arrow moves within a magnified
 * picture and between pictures once the whole of one is on screen.
 */
export function Lightbox(props: LightboxProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "style",
        "imageUrl",
        "videoUrl",
        "alt",
        "caption",
        "detail",
        "actions",
        "onCopy",
        "onDownload",
        "position",
        "adjacentImages",
        "loadedImage",
        "imageThumbnail",
        "onPrevious",
        "onNext",
        "navigationLabel",
        "onClose",
        "closeLabel",
    ]);
    const stepping = Boolean(local.onPrevious && local.onNext);
    const navigationLabel = local.navigationLabel ?? "image";
    const thumbnailUrl =
        (local.imageThumbnail?.thumbhash
            ? thumbhashDataUrl(local.imageThumbnail.thumbhash)
            : undefined) ?? local.imageThumbnail?.url;
    const mediaName = local.alt ?? local.caption ?? (local.videoUrl ? "Video" : "Image");
    const mediaNoun = local.videoUrl ? "video" : "image";
    const mediaUrl = local.imageUrl ?? local.videoUrl;
    const [actionStates, setActionStates] = useState<LightboxActionStates>({});
    const outcomeTimers = useRef<{ [action in LightboxAction]?: ReturnType<typeof setTimeout> }>(
        {},
    );
    const statusOf = (action: LightboxAction): LightboxActionStatus | undefined => {
        const state = actionStates[action];
        return state !== undefined && state.mediaUrl === mediaUrl ? state.status : undefined;
    };
    const copyStatus = statusOf("copy");
    const downloadStatus = statusOf("download");
    const canCopy = Boolean(local.onCopy && local.imageUrl !== undefined);
    const [menuAt, setMenuAt] = useState<{ readonly x: number; readonly y: number }>();
    // The picture's frame had focus before the menu took it; it gets it back so
    // Escape, the arrows, and Command-C keep working on the picture afterwards.
    const menuReturn = useRef<HTMLElement | null>(null);
    const menuItems: MenuItem[] = [
        ...(canCopy
            ? [
                  {
                      kind: "item" as const,
                      id: "copy",
                      label: "Copy image",
                      shortcut: COPY_SHORTCUT.caps,
                  },
              ]
            : []),
        ...(local.onDownload && local.imageUrl !== undefined
            ? [{ kind: "item" as const, id: "download", label: "Download image" }]
            : []),
    ];
    const menuClose = (): void => {
        menuReturn.current?.focus();
        menuReturn.current = null;
        setMenuAt(undefined);
    };
    /**
     * A right-click on the picture offers what the header offers for it, in
     * place of the browser's own menu. The room around the picture keeps the
     * browser's behaviour; only the picture is the thing being acted on.
     */
    const contextMenu = (event: ReactMouseEvent<HTMLDivElement>): void => {
        if (menuItems.length === 0 || !(event.target instanceof HTMLElement)) return;
        if (!PICTURE_PARTS.has(event.target.dataset.happyDesktopUi ?? "")) return;
        event.preventDefault();
        menuReturn.current = event.target.closest<HTMLElement>(
            '[data-happy-desktop-ui="image-viewer-frame"]',
        );
        setMenuAt({ x: event.clientX, y: event.clientY });
    };
    const run = (action: LightboxAction, work: (() => Promise<void>) | undefined): void => {
        if (!work || mediaUrl === undefined || statusOf(action) === "pending") return;
        clearTimeout(outcomeTimers.current[action]);
        // A later press on another picture replaces this one's state, so a
        // settling press only writes over the state it set itself.
        const update = (status: LightboxActionStatus | undefined): void =>
            setActionStates((current) =>
                current[action]?.mediaUrl === mediaUrl
                    ? { ...current, [action]: status && { mediaUrl, status } }
                    : current,
            );
        setActionStates((current) => ({ ...current, [action]: { mediaUrl, status: "pending" } }));
        const settle = (status: "done" | "failed"): void => {
            update(status);
            outcomeTimers.current[action] = setTimeout(() => update(undefined), OUTCOME_MS);
        };
        work().then(
            () => settle("done"),
            () => settle("failed"),
        );
    };
    const hasHeader = () =>
        Boolean(
            local.caption ||
            local.detail ||
            local.actions ||
            canCopy ||
            local.onDownload ||
            local.onClose ||
            stepping,
        );
    /**
     * The space around the picture is the way out, as it is in every viewer that
     * takes the window: with the overlay's gutter gone, this surface is what a
     * click outside the card used to land on. Only the viewer's own frame counts
     * — the picture, the caption, and the controls are not "outside" — and only
     * while it has nothing to pan, because then the same press is a grip on a
     * magnified picture rather than a click on the room around it.
     */
    const click = (event: ReactMouseEvent<HTMLDivElement>): void => {
        if (!(event.target instanceof HTMLElement)) return;
        if (event.target.dataset.happyDesktopUi !== "image-viewer-frame") return;
        if (event.target.hasAttribute("data-pannable")) return;
        local.onClose?.();
    };
    const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        // Command-C (Ctrl-C off the Mac) copies the picture unless the reader
        // selected text to copy.
        if (canCopy && commandShortcutMatches(event.nativeEvent, COPY_SHORTCUT)) {
            if (!(window.getSelection()?.isCollapsed ?? true)) return;
            event.preventDefault();
            run("copy", local.onCopy);
            return;
        }
        // Not the viewer's key, and not a shortcut of the window's: only a bare
        // arrow the picture underneath had no use for steps through the set.
        if (!stepping || event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
        if (event.key === "ArrowLeft") local.onPrevious?.();
        else if (event.key === "ArrowRight") local.onNext?.();
        else return;
        event.preventDefault();
    };
    return (
        <div
            {...rest}
            className={["happy-lightbox", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="lightbox"
            style={local.style}
        >
            <div
                aria-label={local.caption ?? local.alt ?? `${mediaName} preview`}
                aria-modal="true"
                className="happy-lightbox__dialog"
                data-happy-desktop-ui="lightbox-dialog"
                onClick={click}
                onKeyDown={keyDown}
                role="dialog"
            >
                {hasHeader() ? (
                    <header
                        className="happy-lightbox__header"
                        data-happy-desktop-ui="lightbox-header"
                    >
                        <div
                            className="happy-lightbox__caption"
                            data-happy-desktop-ui="lightbox-caption"
                        >
                            {local.caption ? (
                                <span
                                    className="happy-lightbox__caption-title"
                                    data-happy-desktop-ui="lightbox-caption-title"
                                >
                                    {local.caption}
                                </span>
                            ) : null}
                            {local.detail ? (
                                <span
                                    className="happy-lightbox__caption-detail"
                                    data-happy-desktop-ui="lightbox-caption-detail"
                                >
                                    {local.detail}
                                </span>
                            ) : null}
                        </div>
                        <div
                            className="happy-lightbox__tools"
                            data-happy-desktop-ui="lightbox-tools"
                        >
                            {stepping ? (
                                <Button
                                    aria-label={`Previous ${navigationLabel}`}
                                    iconOnly
                                    onClick={() => local.onPrevious?.()}
                                    size="small"
                                    variant="ghost"
                                >
                                    <Ionicon name="chevron-back-outline" size={14} />
                                </Button>
                            ) : null}
                            {stepping && local.position ? (
                                <span
                                    className="happy-lightbox__position"
                                    data-happy-desktop-ui="lightbox-position"
                                >
                                    {`${String(local.position.index + 1)} of ${String(local.position.total)}`}
                                </span>
                            ) : null}
                            {stepping ? (
                                <Button
                                    aria-label={`Next ${navigationLabel}`}
                                    iconOnly
                                    onClick={() => local.onNext?.()}
                                    size="small"
                                    variant="ghost"
                                >
                                    <Ionicon name="chevron-forward-outline" size={14} />
                                </Button>
                            ) : null}
                            {canCopy ? (
                                <Button
                                    aria-label={
                                        copyStatus === "done"
                                            ? "Copied"
                                            : copyStatus === "failed"
                                              ? "Couldn't copy image"
                                              : "Copy image"
                                    }
                                    data-testid="lightbox-copy"
                                    icon={
                                        copyStatus === "done"
                                            ? "check"
                                            : copyStatus === "failed"
                                              ? "alert"
                                              : "copy"
                                    }
                                    iconOnly
                                    loading={copyStatus === "pending"}
                                    onClick={() => run("copy", local.onCopy)}
                                    shortcut={COPY_SHORTCUT}
                                    size="small"
                                    variant="ghost"
                                />
                            ) : null}
                            {local.onDownload ? (
                                <Button
                                    aria-label={
                                        downloadStatus === "failed"
                                            ? `Couldn't download ${mediaNoun}`
                                            : `Download ${mediaNoun}`
                                    }
                                    data-testid="lightbox-download"
                                    iconOnly
                                    loading={downloadStatus === "pending"}
                                    onClick={() => run("download", local.onDownload)}
                                    size="small"
                                    title={`Download ${mediaNoun}`}
                                    variant="ghost"
                                >
                                    {downloadStatus === "failed" ? (
                                        <Ionicon name="alert-circle-outline" size={14} />
                                    ) : (
                                        <Ionicon name="download-outline" size={14} />
                                    )}
                                </Button>
                            ) : null}
                            {local.actions}
                            {local.onClose ? (
                                <Button
                                    aria-label={local.closeLabel ?? "Close"}
                                    icon="close"
                                    iconOnly
                                    onClick={() => local.onClose?.()}
                                    size="small"
                                    variant="ghost"
                                />
                            ) : null}
                        </div>
                    </header>
                ) : null}
                <div
                    className="happy-lightbox__frame"
                    data-happy-desktop-ui="lightbox-frame"
                    onContextMenu={contextMenu}
                >
                    {local.videoUrl ? (
                        <VideoViewer
                            autoFocus
                            content={{ type: "url", url: local.videoUrl }}
                            name={mediaName}
                        />
                    ) : local.imageUrl !== undefined ? (
                        <ImageViewer
                            adjacentImages={local.adjacentImages}
                            autoFocus
                            content={{ type: "url", url: local.imageUrl }}
                            loadedImage={local.loadedImage}
                            deferLoading
                            name={mediaName}
                            thumbnail={
                                thumbnailUrl
                                    ? {
                                          url: thumbnailUrl,
                                          width: local.imageThumbnail?.width,
                                          height: local.imageThumbnail?.height,
                                      }
                                    : undefined
                            }
                            tone="immersive"
                        />
                    ) : null}
                </div>
            </div>
            {menuAt !== undefined && menuItems.length > 0 ? (
                <ContextMenu
                    data-testid="lightbox-image-menu"
                    items={menuItems}
                    onClose={menuClose}
                    onSelect={(id) => {
                        menuClose();
                        if (id === "copy") run("copy", local.onCopy);
                        else if (id === "download") run("download", local.onDownload);
                    }}
                    x={menuAt.x}
                    y={menuAt.y}
                />
            ) : null}
        </div>
    );
}
