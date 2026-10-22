import { partitionComponentProps } from "./componentProps";
import {
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefCallback,
} from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Spinner } from "./Spinner";
import { Ionicon, Octicon } from "./vectorIcons/VectorIcon";

/** What the viewer is looking at, once the caller has resolved the picture. */
export type ImageViewerContent =
    | { readonly type: "loading" }
    | { readonly type: "error"; readonly message: string }
    /** An address the browser can fetch: an app-served asset or an object URL. */
    | { readonly type: "url"; readonly url: string }
    /** Nothing to show — the bytes are not a picture this surface can render. */
    | { readonly type: "unavailable" };

/** A picture already displayed by the browser, such as a composer thumbnail. */
export type ImageViewerLoadedImage = {
    readonly url: string;
    readonly width: number;
    readonly height: number;
};

export type ImageViewerProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    content: ImageViewerContent;
    /** Show this already loaded source immediately when its URL matches the content. */
    loadedImage?: ImageViewerLoadedImage;
    /** Keep both neighboring pictures fetched and decoded while this viewer is open. */
    adjacentImages?: { readonly previous?: string; readonly next?: string };
    /** Accessible name of the picture — usually the file's name. */
    name: string;
    /** Leading controls in the tool bar, e.g. Open in a window of its own. */
    actions?: ReactNode;
    /**
     * `panel` (default) paints the viewer's own room: a grouped frame and a
     * ruled tool bar, for a viewer set into a page or a side panel. `immersive`
     * paints no surface at all, for a viewer hung on something that is already
     * the room — the full-window lightbox, or an artifact's slot — so the
     * picture sits on that one flat room instead of on three stacked bands of
     * surface.
     */
    tone?: "panel" | "immersive";
    /**
     * Takes keyboard focus on mount. For a surface that is only this picture — a
     * window of its own — so its zoom and pan keys work without a click first.
     */
    autoFocus?: boolean;
    /** Delay decode feedback by 500ms, then keep it visible for at least 500ms. */
    deferLoading?: boolean;
    /** Already available thumbnail for this content, shown until full decode. */
    thumbnail?: { readonly url: string; readonly width?: number; readonly height?: number };
    /** Reported once the picture decodes, so the caller can state its real size. */
    onNaturalSize?: (size: { readonly width: number; readonly height: number }) => void;
    /**
     * Pixels per point, for a high-density picture such as a Retina capture.
     * Its actual size — 100%, and the most "fit" ever shows — is then its
     * point size, the size it had on the screen it was taken from.
     */
    density?: number;
};

/**
 * Zoom ladder the buttons and the keyboard step through. A continuous gesture is
 * deliberately not snapped to it: a trackpad pinch is a continuous instrument,
 * and a viewer that quantized it would feel like it was fighting the hand.
 */
const ZOOM_STEPS: readonly number[] = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const ZOOM_MIN = ZOOM_STEPS[0]!;
const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;
/** How far an arrow key moves the picture under the frame, in CSS pixels. */
const PAN_STEP = 48;
/**
 * Wheel travel that doubles the magnification. Chromium reports a trackpad pinch
 * as a `ctrlKey` wheel in small increments, so the constant has to be gentle
 * enough that a pinch reads as continuous rather than as a jump per tick.
 */
const WHEEL_ZOOM_DIVISOR = 320;
/** Below this, two magnifications are the same rung and not worth telling apart. */
const SCALE_EPSILON = 0.0001;
const LOADING_DELAY_MS = 500;
const LOADING_MINIMUM_MS = 500;

interface ImageSize {
    readonly width: number;
    readonly height: number;
}

interface DecodedImage {
    readonly image: HTMLImageElement;
    readonly decoded: Promise<void>;
    ready: boolean;
}

function imageDecode(url: string): DecodedImage {
    const image = new Image();
    image.src = url;
    const entry: DecodedImage = {
        image,
        ready: false,
        decoded: image.decode().then(() => {
            entry.ready = true;
        }),
    };
    // A neighbor may fail before it is opened; only opening it reports failure.
    void entry.decoded.catch(() => undefined);
    return entry;
}

/** Where the picture sits: contained in the frame, or placed by the reader. */
type ImageView =
    | { readonly kind: "fit" }
    | { readonly kind: "manual"; readonly scale: number; readonly x: number; readonly y: number };

/**
 * Everything the viewer knows about one address. It is keyed by the address so a
 * different picture starts from a fresh view without an effect to reset it: the
 * state that does not belong to this URL is simply not this URL's state.
 */
interface ImageViewerState {
    readonly url: string;
    readonly status: "loading" | "ready" | "error";
    readonly natural?: ImageSize;
    readonly view: ImageView;
}

/** The measured picture and frame one gesture is resolved against. */
interface ImageGeometry {
    readonly naturalWidth: number;
    readonly naturalHeight: number;
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly fitScale: number;
    readonly scale: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly limitX: number;
    readonly limitY: number;
}

/** What one native gesture in the reader's hand is being resolved against. */
interface ImageGesture {
    geometry: ImageGeometry;
    ready: boolean;
    url: string;
}

const VIEW_FIT: ImageView = { kind: "fit" };

function stateInitial(url: string, loadedImage?: ImageViewerLoadedImage): ImageViewerState {
    if (loadedImage?.url === url && loadedImage.width > 0 && loadedImage.height > 0)
        return {
            url,
            status: "ready",
            natural: { width: loadedImage.width, height: loadedImage.height },
            view: VIEW_FIT,
        };
    return { url, status: "loading", view: VIEW_FIT };
}

/**
 * The magnification that contains the picture in the frame, never above 1.
 *
 * Fitting deliberately does not magnify: a 24px icon blown up to the size of the
 * window is a blurry lie about the file, and a reader who wants it that large
 * can say so. So "fit" means "all of it, at most life size".
 */
function fitScaleOf(natural: ImageSize | undefined, frame: ImageSize | undefined): number {
    if (!natural || !frame) return 1;
    if (natural.width <= 0 || natural.height <= 0) return 1;
    if (frame.width <= 0 || frame.height <= 0) return 1;
    return Math.min(1, frame.width / natural.width, frame.height / natural.height);
}

/**
 * The next rung of the ladder in one direction, from wherever the reader is.
 *
 * `floor` is the smallest magnification this picture may be shown at, which is
 * the fit for anything the ladder's own bottom rung would already magnify. A
 * step down below the bottom rung lands on the floor rather than on that rung —
 * otherwise zooming out of a picture already smaller than 5% would enlarge it.
 */
function zoomStep(scale: number, direction: 1 | -1, floor: number): number {
    if (direction === 1)
        return ZOOM_STEPS.find((step) => step > scale + SCALE_EPSILON) ?? Math.min(ZOOM_MAX, scale);
    const below = ZOOM_STEPS.filter((step) => step < scale - SCALE_EPSILON && step > floor);
    return below.length > 0 ? below[below.length - 1]! : Math.min(floor, scale);
}

function clamp(value: number, limit: number): number {
    return limit <= 0 ? 0 : Math.min(limit, Math.max(-limit, value));
}

/** The smallest magnification a picture may be shown at in a given frame. */
function zoomFloorOf(fitScale: number): number {
    return Math.min(ZOOM_MIN, fitScale);
}

/**
 * A magnification held to the ladder's ends. Applied on the way out rather than
 * only where the reader chooses it, because the frame can be resized afterwards:
 * a magnification that was legal in a small frame can be under the floor of a
 * larger one, and the picture must not stay there.
 */
function scaleClamped(scale: number, floor: number): number {
    return Math.min(ZOOM_MAX, Math.max(floor, scale));
}

/**
 * How far the picture may travel from the middle of the frame on one axis. Zero
 * once it fits, which is what keeps a contained picture centred and makes
 * dragging it meaningless rather than merely ineffective.
 */
function panLimit(natural: number, frame: number, scale: number): number {
    return Math.max(0, (natural * scale - frame) / 2);
}

/**
 * The view that magnifies to `next` while keeping the content under `anchor` —
 * measured from the middle of the frame — exactly where it already was.
 */
function viewZoomed(
    geometry: ImageGeometry,
    next: number,
    anchorX: number,
    anchorY: number,
): ImageView {
    const at = scaleClamped(next, zoomFloorOf(geometry.fitScale));
    const ratio = at / geometry.scale;
    return {
        kind: "manual",
        scale: at,
        x: clamp(
            anchorX - (anchorX - geometry.offsetX) * ratio,
            panLimit(geometry.naturalWidth, geometry.frameWidth, at),
        ),
        y: clamp(
            anchorY - (anchorY - geometry.offsetY) * ratio,
            panLimit(geometry.naturalHeight, geometry.frameHeight, at),
        ),
    };
}

/** The view that moves the picture under the frame, without letting it escape. */
function viewPanned(geometry: ImageGeometry, dx: number, dy: number): ImageView {
    return {
        kind: "manual",
        scale: geometry.scale,
        x: clamp(geometry.offsetX + dx, geometry.limitX),
        y: clamp(geometry.offsetY + dy, geometry.limitY),
    };
}

/**
 * The same picture and frame, measured as `view` leaves them. It is what a
 * gesture still in the reader's hand resolves its next event against: several
 * wheel events can arrive before React commits the first one, and each has to be
 * measured against what the ones before it did rather than all against the
 * picture as it stood when the gesture began.
 */
function geometryPlaced(geometry: ImageGeometry, view: ImageView): ImageGeometry {
    const scale =
        view.kind === "fit"
            ? geometry.fitScale
            : scaleClamped(view.scale, zoomFloorOf(geometry.fitScale));
    const limitX = panLimit(geometry.naturalWidth, geometry.frameWidth, scale);
    const limitY = panLimit(geometry.naturalHeight, geometry.frameHeight, scale);
    return {
        ...geometry,
        scale,
        offsetX: view.kind === "fit" ? 0 : clamp(view.x, limitX),
        offsetY: view.kind === "fit" ? 0 : clamp(view.y, limitY),
        limitX,
        limitY,
    };
}

/**
 * C-235 ImageViewer — one picture, looked at properly.
 *
 * The single image surface in the product: the file viewer's picture branch, the
 * chat lightbox, and the desktop's separate preview window are all this
 * component, so zooming, panning, and the keyboard behave the same wherever a
 * picture is opened. It fills whatever region it is given and never fetches —
 * the caller resolves the address and owns the loading and failure states.
 *
 * Magnification is deterministic. The buttons and the keyboard step a fixed
 * ladder, a pinch is continuous and anchored under the fingers, and the bar
 * always states the percentage being shown, so nothing about the picture's size
 * is left to be guessed from how it looks.
 */
export function ImageViewer(props: ImageViewerProps) {
    const [local, rest] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "content",
        "loadedImage",
        "adjacentImages",
        "name",
        "actions",
        "tone",
        "autoFocus",
        "deferLoading",
        "thumbnail",
        "onNaturalSize",
        "density",
    ]);
    const frameElement = useRef<HTMLDivElement>(null);
    const decodedImages = useRef(new Map<string, DecodedImage>());
    const [frame, setFrame] = useState<ImageSize>();
    const [state, setState] = useState<ImageViewerState>(() =>
        stateInitial(local.content.type === "url" ? local.content.url : "", local.loadedImage),
    );
    const [loadingVisible, setLoadingVisible] = useState(false);
    const url = local.content.type === "url" ? local.content.url : "";
    const alreadyLoaded =
        local.loadedImage?.url === url &&
        local.loadedImage.width > 0 &&
        local.loadedImage.height > 0;
    const [failedThumbnail, setFailedThumbnail] = useState<{
        imageUrl: string;
        thumbnailUrl: string;
    }>();
    const density = local.density !== undefined && local.density > 1 ? local.density : 1;
    const thumbnail =
        failedThumbnail?.imageUrl === url && failedThumbnail.thumbnailUrl === local.thumbnail?.url
            ? undefined
            : local.thumbnail?.width && local.thumbnail.height && density > 1
              ? {
                    ...local.thumbnail,
                    width: local.thumbnail.width / density,
                    height: local.thumbnail.height / density,
                }
              : local.thumbnail;
    const thumbnailUrl = thumbnail?.url;
    // Shared across URL lifetimes so navigation cannot cut a visible notice short.
    const loadingShownAt = useRef<number | undefined>(undefined);
    // Stable ref identity measures the notice's DOM mount once, rather than
    // restarting its minimum duration on unrelated viewer renders.
    const loadingMounted = useCallback((element: HTMLDivElement | null): void => {
        if (element) loadingShownAt.current = performance.now();
    }, []);
    // The magnification a deliberate command settled on, said out loud once. The
    // percentage on the bar is not itself a live region: under a pinch it changes
    // dozens of times a second, and announcing every one of them would leave a
    // screen reader still talking long after the hand stopped.
    const [spoken, setSpoken] = useState("");
    if ((!url || thumbnailUrl || alreadyLoaded) && loadingVisible) setLoadingVisible(false);
    // State from a previous address is not this address's state. Comparing here
    // rather than resetting in an effect keeps the first frame of a new picture
    // correct instead of showing the previous one's magnification for a beat.
    const live = state.url === url ? state : stateInitial(url, local.loadedImage);
    // Deferred viewers show only the selected picture or its thumbnail. Panel
    // viewers keep the last decoded picture until its replacement is ready.
    const displayed =
        !local.deferLoading &&
        local.content.type === "url" &&
        live.status === "loading" &&
        state.status === "ready"
            ? { ...state, view: VIEW_FIT }
            : live;
    const natural =
        displayed.natural && density > 1
            ? {
                  width: displayed.natural.width / density,
                  height: displayed.natural.height / density,
              }
            : displayed.natural;
    const fitScale = fitScaleOf(natural, frame);
    const zoomFloor = zoomFloorOf(fitScale);
    // Held to the ladder's ends here rather than only where it was chosen: the
    // frame resizes under a magnification the reader picked, and what was legal
    // in a small frame can be below the floor of a larger one.
    const scale =
        displayed.view.kind === "fit" ? fitScale : scaleClamped(displayed.view.scale, zoomFloor);
    const naturalWidth = natural?.width ?? 0;
    const naturalHeight = natural?.height ?? 0;
    const frameWidth = frame?.width ?? 0;
    const frameHeight = frame?.height ?? 0;
    const limitX = panLimit(naturalWidth, frameWidth, scale);
    const limitY = panLimit(naturalHeight, frameHeight, scale);
    const offsetX = displayed.view.kind === "fit" ? 0 : clamp(displayed.view.x, limitX);
    const offsetY = displayed.view.kind === "fit" ? 0 : clamp(displayed.view.y, limitY);
    const pannable = limitX > 0 || limitY > 0;
    // Nothing is magnified, panned, or reset until there is a decoded picture to
    // do it to: a gesture made while one is still opening would otherwise decide
    // where it lands, and it would not land fitted.
    const showing =
        local.content.type === "url" && live.status === "ready" && natural !== undefined;
    const geometry: ImageGeometry = {
        naturalWidth,
        naturalHeight,
        frameWidth,
        frameHeight,
        fitScale,
        scale,
        offsetX,
        offsetY,
        limitX,
        limitY,
    };
    // The gesture is remembered with the picture it started on: a URL replaced
    // mid-drag would otherwise place the new picture with the old one's grip.
    const drag = useRef<{ pointerId: number; url: string; x: number; y: number }>(null);
    const [dragging, setDragging] = useState(false);

    const viewSet = (view: ImageView): void => {
        setState((previous) => ({
            ...(previous.url === url ? previous : live),
            view,
        }));
    };

    /** A view a button or a key asked for: it lands, and it is announced. */
    const viewCommand = (view: ImageView): void => {
        viewSet(view);
        setSpoken(`${String(Math.round(geometryPlaced(geometry, view).scale * 100))}%`);
    };

    const wanted = local.autoFocus === true;
    const previousUrl = local.adjacentImages?.previous;
    const nextUrl = local.adjacentImages?.next;
    const deferLoading = local.deferLoading === true;
    // eslint-disable-next-line happy-react/no-layout-effect -- retain browser image resources for the current picture and its neighbors; a decoded neighbor becomes visible before paint and cleanup discards late results after navigation
    useLayoutEffect(() => {
        const images = decodedImages.current;
        const keep = new Set(url ? [url, previousUrl, nextUrl].filter(Boolean) : []);
        for (const [heldUrl, entry] of images) {
            if (keep.has(heldUrl)) continue;
            entry.image.removeAttribute("src");
            images.delete(heldUrl);
        }
        if (!url) return;
        for (const address of [url, previousUrl, nextUrl]) {
            if (address && !images.has(address)) images.set(address, imageDecode(address));
        }
    }, [url, previousUrl, nextUrl]);

    // eslint-disable-next-line happy-react/no-layout-effect -- browser decode and feedback timers belong to the committed address; cleanup cancels timers and ignores late decode results on navigation or close
    useLayoutEffect(() => {
        if (!url) {
            loadingShownAt.current = undefined;
            return;
        }
        const entry = decodedImages.current.get(url);
        if (!entry) return;
        if (thumbnailUrl || alreadyLoaded) loadingShownAt.current = undefined;
        const image = entry.image;
        let active = true;
        let showTimer: ReturnType<typeof setTimeout> | undefined;
        let settleTimer: ReturnType<typeof setTimeout> | undefined;
        const settle = (publish: () => void): void => {
            if (!active) return;
            clearTimeout(showTimer);
            const finish = (): void => {
                if (!active) return;
                const remaining =
                    deferLoading &&
                    !thumbnailUrl &&
                    !alreadyLoaded &&
                    loadingShownAt.current !== undefined
                        ? LOADING_MINIMUM_MS - (performance.now() - loadingShownAt.current)
                        : 0;
                if (remaining > 0) {
                    settleTimer = setTimeout(finish, Math.ceil(remaining));
                    return;
                }
                loadingShownAt.current = undefined;
                setLoadingVisible(false);
                publish();
            };
            finish();
        };
        const ready = (): void => {
            settle(() => {
                setState((previous) => ({
                    ...(previous.url === url ? previous : stateInitial(url)),
                    natural: { width: image.naturalWidth, height: image.naturalHeight },
                    status: "ready",
                }));
            });
        };
        const failed = (): void => {
            settle(() => setState({ ...stateInitial(url), status: "error" }));
        };
        if (entry.ready) ready();
        else {
            if (
                deferLoading &&
                !thumbnailUrl &&
                !alreadyLoaded &&
                loadingShownAt.current === undefined
            ) {
                showTimer = setTimeout(() => {
                    loadingShownAt.current = performance.now();
                    setLoadingVisible(true);
                }, LOADING_DELAY_MS);
            }
            void entry.decoded.then(ready, failed);
        }
        return () => {
            active = false;
            clearTimeout(showTimer);
            clearTimeout(settleTimer);
        };
    }, [url, deferLoading, thumbnailUrl, alreadyLoaded]);

    // eslint-disable-next-line happy-react/no-layout-effect -- release the retained decoded browser resources when the viewer closes
    useLayoutEffect(() => {
        const images = decodedImages.current;
        return () => {
            for (const entry of images.values()) entry.image.removeAttribute("src");
            images.clear();
        };
    }, []);

    // eslint-disable-next-line happy-react/no-layout-effect -- move real keyboard focus to the frame on mount
    useLayoutEffect(() => {
        if (wanted) frameElement.current?.focus({ preventScroll: true });
    }, [wanted]);

    // eslint-disable-next-line happy-react/no-layout-effect -- measure the committed frame before its first paint so an already loaded picture opens fitted, then observe its live box and disconnect on unmount
    useLayoutEffect(() => {
        const element = frameElement.current;
        if (!element) return;
        const { width, height } = element.getBoundingClientRect();
        setFrame({ width, height });
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const box = entry.contentRect;
            setFrame((previous) =>
                previous && previous.width === box.width && previous.height === box.height
                    ? previous
                    : { width: box.width, height: box.height },
            );
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    // What a native wheel gesture resolves against. It is a ref rather than the
    // listener's closure so the listener can be bound once: a trackpad reports a
    // pinch at wheel frequency, and rebinding a non-passive listener per event
    // would churn the element while the hand is still moving.
    const gesture = useRef<ImageGesture>({ geometry, ready: showing, url });
    // eslint-disable-next-line happy-react/no-layout-effect -- the committed picture is what the bound-once wheel listener below must see; assigning it here rather than during render leaves render itself pure
    useLayoutEffect(() => {
        gesture.current = { geometry, ready: showing, url };
    });

    // eslint-disable-next-line happy-react/no-layout-effect -- a pinch and a modified wheel must cancel the page's own zoom, which a React wheel handler cannot do because React attaches wheel passively at the root
    useLayoutEffect(() => {
        const element = frameElement.current;
        if (!element) return;
        const wheel = (event: WheelEvent): void => {
            const hold = gesture.current;
            if (!hold.ready) return;
            const place = (view: ImageView): void => {
                // The gesture's own picture advances now, so the next event of
                // the same gesture is measured against what this one did instead
                // of against the frame React has not committed yet.
                hold.geometry = geometryPlaced(hold.geometry, view);
                setState((previous) => ({
                    ...(previous.url === hold.url
                        ? previous
                        : stateInitial(hold.url, {
                              url: hold.url,
                              width: hold.geometry.naturalWidth,
                              height: hold.geometry.naturalHeight,
                          })),
                    view,
                }));
                // A continuous gesture says nothing out loud; only the value it
                // settles on is worth a screen reader's time.
                setSpoken("");
            };
            // A pinch on a trackpad and a held modifier both mean "magnify".
            // Everything else is scrolling, which here moves the picture under
            // the frame — and only when there is somewhere for it to move.
            if (event.ctrlKey || event.metaKey) {
                const rect = element.getBoundingClientRect();
                event.preventDefault();
                place(
                    viewZoomed(
                        hold.geometry,
                        hold.geometry.scale * Math.pow(2, -event.deltaY / WHEEL_ZOOM_DIVISOR),
                        event.clientX - rect.left - rect.width / 2,
                        event.clientY - rect.top - rect.height / 2,
                    ),
                );
                return;
            }
            if (hold.geometry.limitX <= 0 && hold.geometry.limitY <= 0) return;
            event.preventDefault();
            place(viewPanned(hold.geometry, -event.deltaX, -event.deltaY));
        };
        element.addEventListener("wheel", wheel, { passive: false });
        return () => element.removeEventListener("wheel", wheel);
    }, []);

    const zoomBy = (direction: 1 | -1): void => {
        if (!showing) return;
        viewCommand(viewZoomed(geometry, zoomStep(scale, direction, zoomFloor), 0, 0));
    };
    const actualSize = (): void => {
        if (!showing) return;
        viewCommand(viewZoomed(geometry, 1, 0, 0));
    };
    const panBy = (dx: number, dy: number): void => {
        if (!showing || !pannable) return;
        viewSet(viewPanned(geometry, dx, dy));
    };

    const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
        if (event.metaKey || event.ctrlKey || event.altKey || !showing) return;
        const key = event.key;
        // An arrow is only the viewer's key while the picture has somewhere to
        // go. With the whole of it on screen there is nothing to pan, so the key
        // is left to whatever hosts the viewer — in a set, the next picture.
        if ((key === "ArrowLeft" || key === "ArrowRight") && limitX <= 0) return;
        if ((key === "ArrowUp" || key === "ArrowDown") && limitY <= 0) return;
        if (key === "+" || key === "=") zoomBy(1);
        else if (key === "-" || key === "_") zoomBy(-1);
        else if (key === "0") fitToView();
        else if (key === "1") actualSize();
        else if (key === "ArrowLeft") panBy(PAN_STEP, 0);
        else if (key === "ArrowRight") panBy(-PAN_STEP, 0);
        else if (key === "ArrowUp") panBy(0, PAN_STEP);
        else if (key === "ArrowDown") panBy(0, -PAN_STEP);
        else return;
        event.preventDefault();
    };

    const fitToView = (): void => {
        if (!showing) return;
        viewCommand(VIEW_FIT);
    };

    const pointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (!showing || !pannable || event.button !== 0 || drag.current) return;
        drag.current = {
            pointerId: event.pointerId,
            url,
            x: event.clientX - offsetX,
            y: event.clientY - offsetY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
    };

    const pointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
        const held = drag.current;
        if (!held || held.pointerId !== event.pointerId || held.url !== url) return;
        viewSet({
            kind: "manual",
            scale,
            x: clamp(event.clientX - held.x, limitX),
            y: clamp(event.clientY - held.y, limitY),
        });
    };

    const pointerRelease = (event: ReactPointerEvent<HTMLDivElement>): void => {
        if (drag.current?.pointerId !== event.pointerId) return;
        drag.current = null;
        setDragging(false);
    };

    // Life size and back, at the point that was double-clicked: the two
    // magnifications anyone actually alternates between while reading a picture.
    const doubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
        if (scale > 1 - SCALE_EPSILON) {
            viewCommand(VIEW_FIT);
            return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        viewCommand(
            viewZoomed(
                geometry,
                1,
                event.clientX - rect.left - rect.width / 2,
                event.clientY - rect.top - rect.height / 2,
            ),
        );
    };

    return (
        <div
            {...rest}
            className={["happy-image-viewer", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="image-viewer"
            data-testid={local["data-testid"]}
            data-tone={local.tone === "immersive" ? "immersive" : undefined}
            style={local.style}
        >
            <div
                aria-busy={local.content.type === "url" && live.status === "loading"}
                aria-label={`${local.name}, image`}
                className="happy-image-viewer__frame"
                data-dragging={dragging ? "" : undefined}
                data-happy-desktop-ui="image-viewer-frame"
                data-pannable={pannable ? "" : undefined}
                onDoubleClick={showing ? doubleClick : undefined}
                onKeyDown={keyDown}
                onLostPointerCapture={pointerRelease}
                onPointerCancel={pointerRelease}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerRelease}
                ref={frameElement}
                role="group"
                // The frame is where zooming and panning happen, so it must take
                // keyboard focus for the +/-/0/1 and arrow commands to be
                // reachable without a pointer at all.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable pan and zoom surface
                tabIndex={0}
            >
                <ImageViewerStage
                    content={local.content}
                    frame={frame}
                    deferLoading={deferLoading}
                    loadingVisible={loadingVisible}
                    loadingMounted={loadingMounted}
                    name={local.name}
                    onThumbnailError={() => {
                        if (thumbnail)
                            setFailedThumbnail({ imageUrl: url, thumbnailUrl: thumbnail.url });
                    }}
                    thumbnail={thumbnail}
                    offsetX={offsetX}
                    offsetY={offsetY}
                    onError={() => {
                        if (displayed.url !== url) return;
                        setState((previous) => ({
                            ...(previous.url === url ? previous : stateInitial(url)),
                            status: "error",
                        }));
                    }}
                    onReady={(size) => {
                        if (displayed.url === url) local.onNaturalSize?.(size);
                    }}
                    scale={scale}
                    state={natural === displayed.natural ? displayed : { ...displayed, natural }}
                />
            </div>
            <div className="happy-image-viewer__tools" data-happy-desktop-ui="image-viewer-tools">
                {local.actions}
                <Button
                    aria-label="Zoom out"
                    disabled={!showing || scale <= zoomFloor + SCALE_EPSILON}
                    iconOnly
                    onClick={() => zoomBy(-1)}
                    size="small"
                    variant="ghost"
                >
                    <Octicon name="zoom-out" size={14} />
                </Button>
                <span
                    className="happy-image-viewer__zoom"
                    data-happy-desktop-ui="image-viewer-zoom"
                >
                    {displayed.status === "ready" ? `${String(Math.round(scale * 100))}%` : "—"}
                </span>
                <Button
                    aria-label="Zoom in"
                    disabled={!showing || scale >= ZOOM_MAX - SCALE_EPSILON}
                    iconOnly
                    onClick={() => zoomBy(1)}
                    size="small"
                    variant="ghost"
                >
                    <Octicon name="zoom-in" size={14} />
                </Button>
                <span className="happy-image-viewer__divider" />
                <Button
                    aria-label="Fit to view"
                    aria-pressed={live.view.kind === "fit"}
                    disabled={!showing}
                    iconOnly
                    onClick={fitToView}
                    size="small"
                    variant="ghost"
                >
                    <Ionicon name="scan-outline" size={14} />
                </Button>
                <Button
                    aria-label="Actual size"
                    aria-pressed={
                        live.view.kind === "manual" && Math.abs(scale - 1) < SCALE_EPSILON
                    }
                    disabled={!showing}
                    iconOnly
                    onClick={actualSize}
                    size="small"
                    variant="ghost"
                >
                    <Ionicon name="expand-outline" size={14} />
                </Button>
            </div>
            {/* Said out loud, never drawn: the magnification a command settled
                on is the one fact about the picture a reader cannot see for
                themselves, and the only one worth interrupting them with. */}
            <span
                aria-live="polite"
                className="happy-image-viewer__announcement"
                data-happy-desktop-ui="image-viewer-announcement"
                role="status"
            >
                {spoken}
            </span>
        </div>
    );
}

/**
 * The picture itself, or the reason there is none. Every state that cannot show
 * the image says so in the same centred notice, so a failed decode and an
 * unsupported format read as one kind of answer rather than two broken ones.
 */
function ImageViewerStage(props: {
    content: ImageViewerContent;
    frame: ImageSize | undefined;
    deferLoading: boolean;
    loadingVisible: boolean;
    loadingMounted: RefCallback<HTMLDivElement>;
    name: string;
    onThumbnailError: () => void;
    thumbnail: ImageViewerProps["thumbnail"];
    offsetX: number;
    offsetY: number;
    onError: () => void;
    onReady: (size: ImageSize) => void;
    scale: number;
    state: ImageViewerState;
}) {
    if (props.content.type === "error")
        return <ImageViewerFailure detail={props.content.message} name={props.name} />;
    if (props.content.type === "unavailable")
        return (
            <div
                className="happy-image-viewer__notice"
                data-happy-desktop-ui="image-viewer-unavailable"
            >
                <Icon name="image" size={20} />
                <span className="happy-image-viewer__notice-title">
                    {props.name} has no preview
                </span>
                <span className="happy-image-viewer__notice-detail">
                    This file is not a picture Happy can show.
                </span>
            </div>
        );
    const { natural, status } = props.state;
    if (status === "error")
        return <ImageViewerFailure detail="The picture could not be decoded." name={props.name} />;
    if ((props.content.type === "loading" || status === "loading") && props.thumbnail)
        return (
            <ImageViewerThumbnail
                frame={props.frame}
                key={props.thumbnail.url}
                name={props.name}
                onError={props.onThumbnailError}
                thumbnail={props.thumbnail}
            />
        );
    if (props.content.type === "loading") return <ImageViewerOpening name={props.name} />;
    if (props.deferLoading && props.loadingVisible)
        return <ImageViewerOpening name={props.name} noticeRef={props.loadingMounted} />;
    // The retained decoder owns readiness/failure. A second pending <img> would
    // let its error event bypass the minimum feedback duration.
    if (props.deferLoading && status === "loading") return null;
    return (
        <>
            {status === "loading" ? <ImageViewerOpening name={props.name} /> : null}
            <img
                alt={props.name}
                className="happy-image-viewer__image"
                data-happy-desktop-ui="image-viewer-image"
                draggable={false}
                onError={props.onError}
                onLoad={(event) =>
                    props.onReady({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                    })
                }
                src={status === "ready" ? props.state.url : props.content.url}
                style={{
                    // The exact size the magnification asks for, in style rather
                    // than in the width and height attributes, which are whole
                    // numbers: rounding each axis on its own would bend the
                    // picture's proportions through a continuous pinch and part
                    // it from the geometry the anchoring and clamping use. The
                    // file itself is the source, so the engine resamples once
                    // from the original raster at the device's own scale, with
                    // nothing drawn into a canvas and re-encoded on the way.
                    ...(natural
                        ? {
                              height: `${String(natural.height * props.scale)}px`,
                              width: `${String(natural.width * props.scale)}px`,
                          }
                        : null),
                    transform: `translate(${String(props.offsetX)}px, ${String(props.offsetY)}px)`,
                    ...(status === "ready" ? null : { visibility: "hidden" as const }),
                }}
            />
        </>
    );
}

function ImageViewerThumbnail(props: {
    frame: ImageSize | undefined;
    name: string;
    onError: () => void;
    thumbnail: NonNullable<ImageViewerProps["thumbnail"]>;
}) {
    const [decodedSize, setDecodedSize] = useState<ImageSize>();
    const { width, height } = props.thumbnail;
    const size = width && height ? { width, height } : decodedSize;
    const scale = fitScaleOf(size, props.frame);
    return (
        <img
            alt={props.name}
            className="happy-image-viewer__thumbnail"
            data-happy-desktop-ui="image-viewer-thumbnail"
            draggable={false}
            onError={props.onError}
            onLoad={(event) =>
                setDecodedSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                })
            }
            src={props.thumbnail.url}
            style={
                size
                    ? {
                          width: `${String(size.width * scale)}px`,
                          height: `${String(size.height * scale)}px`,
                      }
                    : undefined
            }
        />
    );
}

function ImageViewerOpening({
    name,
    noticeRef,
}: {
    name: string;
    noticeRef?: RefCallback<HTMLDivElement>;
}) {
    return (
        <div
            className="happy-image-viewer__notice"
            data-happy-desktop-ui="image-viewer-loading"
            ref={noticeRef}
        >
            <Spinner size={16} />
            <span className="happy-image-viewer__notice-title">Opening {name}…</span>
        </div>
    );
}

function ImageViewerFailure(props: { detail: string; name: string }) {
    return (
        <div
            className="happy-image-viewer__notice"
            data-happy-desktop-ui="image-viewer-error"
            data-tone="danger"
        >
            <Icon name="close" size={20} />
            <span className="happy-image-viewer__notice-title">
                {props.name} could not be opened
            </span>
            <span className="happy-image-viewer__notice-detail">{props.detail}</span>
        </div>
    );
}
