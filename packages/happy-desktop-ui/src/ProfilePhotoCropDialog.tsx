import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Banner } from "./Banner";
import { Box } from "./Box";
import { Button } from "./Button";
import { Icon } from "./Icon";
import {
    IMAGE_CROP_MAX_ZOOM,
    imageCropInitial,
    imageCropPan,
    imageCropRegion,
    imageCropZoom,
    type ImageCropRegion,
    type ImageCropSize,
    type ImageCropView,
} from "./imageCrop";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

/** The picture being cropped: where to draw it from and its size the right way up. */
export interface ProfilePhotoCropSource extends ImageCropSize {
    readonly imageUrl: string;
}

export interface ProfilePhotoCropDialogProps {
    readonly source: ProfilePhotoCropSource;
    /** True while the confirmed crop is being sent; the dialog holds until it is stored. */
    readonly saving?: boolean;
    /** Why the last confirmed crop was not stored. */
    readonly error?: string;
    onCancel(): void;
    /** The square chosen, in the picture's own pixels. */
    onConfirm(region: ImageCropRegion): void;
}

/** The stage the picture is moved on, and the square crop frame inset within it. */
export const PROFILE_PHOTO_CROP_STAGE = 312;
export const PROFILE_PHOTO_CROP_FRAME = 248;
const INSET = (PROFILE_PHOTO_CROP_STAGE - PROFILE_PHOTO_CROP_FRAME) / 2;
/** One arrow press moves the picture this far; with Shift, four times as far. */
const ARROW_STEP = 8;
/** One +/- press zooms by this factor. */
const ZOOM_STEP = 1.15;
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * C-290 ProfilePhotoCropDialog — choose the square of a picture that becomes a
 * profile photo, seen through the same circle the avatar draws.
 *
 * The picture starts centred at the smallest zoom that fills the square, and
 * can never be moved or zoomed so far that the square shows anything but the
 * picture. It is dragged to move, and zoomed with the slider, the wheel, or a
 * trackpad pinch around the pointer. From the keyboard the arrows move it, +
 * and − zoom, Enter confirms, and Escape cancels; Tab stays inside the dialog.
 *
 * Confirming does not close the dialog: it holds, with Save spinning, until
 * the owner reports the photo stored or why it was not, so a refusal is said
 * here, beside the crop the reader can adjust and try again. Where the square
 * sits is this dialog's own state; the owner keys it by the picture, so a new
 * picture starts afresh.
 */
export function ProfilePhotoCropDialog(props: ProfilePhotoCropDialogProps) {
    const { source } = props;
    const [view, setView] = useState<ImageCropView>(() => imageCropInitial(source));
    const stage = useRef<HTMLDivElement>(null);
    const drag = useRef<{ readonly id: number; x: number; y: number } | undefined>(undefined);
    const saving = props.saving === true;

    const confirm = () => {
        if (saving) return;
        // Keep focus inside the dialog: Save is disabled while the crop is
        // sent, and a disabled control gives its focus back to the document.
        stage.current?.focus();
        props.onConfirm(imageCropRegion(source, view));
    };
    const zoomTo = (zoom: number, anchor?: { readonly x: number; readonly y: number }) =>
        setView((current) =>
            imageCropZoom(source, current, zoom, PROFILE_PHOTO_CROP_FRAME, anchor),
        );
    const zoomBy = (factor: number, anchor?: { readonly x: number; readonly y: number }) =>
        setView((current) =>
            imageCropZoom(source, current, current.zoom * factor, PROFILE_PHOTO_CROP_FRAME, anchor),
        );
    const panBy = (dx: number, dy: number) =>
        setView((current) => imageCropPan(source, current, PROFILE_PHOTO_CROP_FRAME, dx, dy));

    const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (event.key === "Tab") {
            const focusables = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)];
            const first = focusables[0];
            const last = focusables.at(-1);
            if (!first || !last) return;
            if (event.shiftKey && (target === first || !focusables.includes(target))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (target === last || !focusables.includes(target))) {
                event.preventDefault();
                first.focus();
            }
            return;
        }
        // A focused button answers Enter and Space itself.
        if (target instanceof HTMLButtonElement) return;
        if (saving) return;
        if (event.key === "Enter") {
            event.preventDefault();
            confirm();
            return;
        }
        if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoomBy(ZOOM_STEP);
            return;
        }
        if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            zoomBy(1 / ZOOM_STEP);
            return;
        }
        // On the slider the arrows are the slider's own zoom.
        if (target instanceof HTMLInputElement) return;
        const step = event.shiftKey ? ARROW_STEP * 4 : ARROW_STEP;
        const arrows: Record<string, readonly [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
        };
        const move = arrows[event.key];
        if (move === undefined) return;
        event.preventDefault();
        panBy(move[0], move[1]);
    };

    const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (saving || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        if (current === undefined || current.id !== event.pointerId) return;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        current.x = event.clientX;
        current.y = event.clientY;
        panBy(dx, dy);
    };
    const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.id === event.pointerId) drag.current = undefined;
    };

    // React listens to wheel passively, so a wheel or pinch over the stage
    // would also zoom or scroll the page. Only a native listener can claim it.
    const wheelListen = (element: HTMLDivElement | null) => {
        if (!element) return;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE;
            const factor = Math.exp(-event.deltaY * (lines ? 0.05 : 0.002));
            const box = element.getBoundingClientRect();
            zoomBy(factor, {
                x: event.clientX - box.left - INSET,
                y: event.clientY - box.top - INSET,
            });
        };
        element.addEventListener("wheel", wheel, { passive: false });
        return () => element.removeEventListener("wheel", wheel);
    };

    const region = imageCropRegion(source, view);
    const scale = PROFILE_PHOTO_CROP_FRAME / region.size;
    return (
        <ModalOverlay onDismiss={saving ? undefined : props.onCancel}>
            <div
                className="happy-photo-crop-dialog"
                data-happy-desktop-ui="photo-crop-dialog"
                onKeyDown={keyDown}
            >
                <Modal
                    data-testid="photo-crop-dialog"
                    footer={
                        <>
                            <Button
                                data-testid="photo-crop-cancel"
                                disabled={saving}
                                onClick={props.onCancel}
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button
                                data-testid="photo-crop-confirm"
                                loading={saving}
                                onClick={confirm}
                                variant="primary"
                            >
                                Save photo
                            </Button>
                        </>
                    }
                    size="small"
                    title="Crop photo"
                >
                    <Box className="happy-photo-crop">
                        {props.error ? (
                            <Banner
                                data-testid="photo-crop-error"
                                tone="danger"
                                title="Photo not changed"
                            >
                                {props.error}
                            </Banner>
                        ) : null}
                        <div
                            aria-label="Photo crop. Drag or use the arrow keys to move the photo, and plus or minus to zoom."
                            aria-roledescription="crop area"
                            className="happy-photo-crop__stage"
                            data-happy-desktop-ui="photo-crop-stage"
                            data-testid="photo-crop-stage"
                            onLostPointerCapture={pointerEnd}
                            onPointerCancel={pointerEnd}
                            onPointerDown={pointerDown}
                            onPointerMove={pointerMove}
                            onPointerUp={pointerEnd}
                            ref={(element) => {
                                stage.current = element;
                                return wheelListen(element);
                            }}
                            role="group"
                            // The stage is where the picture moves and zooms, so it
                            // takes keyboard focus for the arrows and +/- to reach it.
                            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable pan and zoom surface
                            tabIndex={0}
                        >
                            <img
                                alt=""
                                className="happy-photo-crop__image"
                                data-happy-desktop-ui="photo-crop-image"
                                draggable={false}
                                src={source.imageUrl}
                                style={{
                                    width: `${source.width * scale}px`,
                                    height: `${source.height * scale}px`,
                                    transform: `translate(${INSET - region.x * scale}px, ${INSET - region.y * scale}px)`,
                                }}
                            />
                            <span
                                aria-hidden="true"
                                className="happy-photo-crop__mask"
                                data-happy-desktop-ui="photo-crop-mask"
                            />
                            <span
                                aria-hidden="true"
                                className="happy-photo-crop__frame"
                                data-happy-desktop-ui="photo-crop-frame"
                            />
                        </div>
                        <Box className="happy-photo-crop__zoom">
                            <Icon name="image" size={14} />
                            <input
                                aria-label="Zoom"
                                className="happy-photo-crop__slider"
                                data-happy-desktop-ui="photo-crop-zoom"
                                data-testid="photo-crop-zoom"
                                disabled={saving}
                                max={Math.log2(IMAGE_CROP_MAX_ZOOM)}
                                min={0}
                                onChange={(event) => zoomTo(2 ** Number(event.currentTarget.value))}
                                step={0.01}
                                type="range"
                                value={Math.log2(view.zoom)}
                            />
                            <Icon name="image" size={20} />
                        </Box>
                    </Box>
                </Modal>
            </div>
        </ModalOverlay>
    );
}
