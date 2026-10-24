import { useCallback, type CSSProperties } from "react";
import { dotLottieRuntimeLoad, reducedMotionGet, scenePixelRatio } from "./lottie/dotLottieRuntime";

/** One sticker as it is drawn: its format and where its file is read. */
export interface StorySticker {
    readonly format: "webp" | "tgs" | "webm";
    /** The file; for `tgs`, its plain Lottie JSON. */
    readonly url: string;
    readonly width: number;
    readonly height: number;
}

export interface StickerViewProps {
    readonly sticker: StorySticker;
    /** Animated stickers play only while visible; off draws their first frame. */
    readonly animate?: boolean;
    readonly className?: string;
    readonly style?: CSSProperties;
    readonly "data-testid"?: string;
}

/** Stickers share one worker with the rest of the window's Lottie art. */
const STICKER_WORKER_ID = "happy-stickers";
/** A Lottie file read once per window, however many grids and frames show it. */
const lottieFiles = new Map<string, Promise<string>>();

function lottieRead(url: string): Promise<string> {
    let pending = lottieFiles.get(url);
    if (!pending) {
        pending = fetch(url).then((response) => {
            if (!response.ok) throw new Error(`Sticker ${String(response.status)}`);
            return response.text();
        });
        pending.catch(() => lottieFiles.delete(url));
        lottieFiles.set(url, pending);
    }
    return pending;
}

/** Calls `change` whenever `element` enters or leaves the viewport; returns the release. */
function visibilityFollow(element: Element, change: (visible: boolean) => void): () => void {
    if (typeof IntersectionObserver === "undefined") {
        change(true);
        return () => undefined;
    }
    const observer = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (entry) change(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
}

/**
 * A sticker from the daemon's catalog: a still WebP, a Lottie animation, or a
 * VP9 video with transparency. It fills its box and keeps its proportions;
 * animated ones loop while on screen and stop when scrolled away.
 */
export function StickerView(props: StickerViewProps) {
    const { sticker } = props;
    const animate = props.animate ?? true;
    // Identity contract: the ref callbacks below start a player or decoder for
    // one file; they must stay the same function across renders of the same
    // sticker, or every store notification would tear the player down.
    const lottieRef = useCallback(
        (canvas: HTMLCanvasElement | null) => {
            if (!canvas) return;
            let disposed = false;
            let player: { play(): unknown; pause(): unknown; destroy(): unknown } | undefined;
            let visible = false;
            let starting = false;
            const settle = () => {
                if (!player) return;
                void (visible && animate && !reducedMotionGet() ? player.play() : player.pause());
            };
            const start = () => {
                if (starting || player) return;
                starting = true;
                void Promise.all([dotLottieRuntimeLoad(), lottieRead(sticker.url)])
                    .then(([{ DotLottieWorker }, data]) => {
                        if (disposed) return;
                        const ratio = scenePixelRatio(canvas.ownerDocument.defaultView ?? window);
                        const box = canvas.getBoundingClientRect();
                        canvas.width = Math.max(1, Math.round(box.width * ratio));
                        canvas.height = Math.max(1, Math.round(box.height * ratio));
                        const instance = new DotLottieWorker({
                            autoplay: false,
                            canvas,
                            data,
                            layout: { align: [0.5, 0.5], fit: "contain" },
                            loop: true,
                            renderConfig: {
                                autoResize: true,
                                devicePixelRatio: ratio,
                                freezeOnOffscreen: true,
                            },
                            workerId: STICKER_WORKER_ID,
                        });
                        player = instance;
                        instance.addEventListener("load", settle);
                    })
                    // A failed read may be tried again the next time it shows.
                    .catch(() => {
                        starting = false;
                    });
            };
            const release = visibilityFollow(canvas, (next) => {
                visible = next;
                if (visible) start();
                settle();
            });
            return () => {
                disposed = true;
                release();
                void player?.destroy();
            };
        },
        [sticker.url, animate],
    );
    const videoRef = useCallback(
        (video: HTMLVideoElement | null) => {
            if (!video) return;
            // The file is only asked for once it is on screen: a grid of
            // hundreds of videos would otherwise open hundreds of decoders.
            return visibilityFollow(video, (visible) => {
                if (visible && !video.src) video.src = sticker.url;
                if (visible && animate && !reducedMotionGet())
                    void video.play().catch(() => undefined);
                else video.pause();
            });
        },
        [sticker.url, animate],
    );
    const className = ["happy-sticker", props.className].filter(Boolean).join(" ");
    return (
        <span
            className={className}
            data-format={sticker.format}
            data-happy-desktop-ui="sticker"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {sticker.format === "webp" ? (
                <img
                    alt=""
                    className="happy-sticker__media"
                    decoding="async"
                    draggable={false}
                    // A picker holds hundreds; each is read only near the screen.
                    loading="lazy"
                    src={sticker.url}
                />
            ) : sticker.format === "webm" ? (
                <video
                    className="happy-sticker__media"
                    loop
                    muted
                    playsInline
                    // Once its file is set, the first frame is drawn even when held still.
                    preload="metadata"
                    ref={videoRef}
                />
            ) : (
                <canvas className="happy-sticker__media" ref={lottieRef} />
            )}
        </span>
    );
}
