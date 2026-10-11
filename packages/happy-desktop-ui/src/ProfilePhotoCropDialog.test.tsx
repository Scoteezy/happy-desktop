import { useState, type ReactNode } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import {
    IMAGE_CROP_MAX_ZOOM,
    imageCropClamp,
    imageCropInitial,
    imageCropOpen,
    imageCropPan,
    imageCropRegion,
    imageCropZoom,
    type ImageCropRegion,
} from "./imageCrop";
import { HappyAgentProfileSettings } from "./pages/settings/HappyAgentProfileSettings";
import { ProfilePhotoCropDialog, type ProfilePhotoCropSource } from "./ProfilePhotoCropDialog";
import { createRenderer } from "./testing";

/*
 * C-290 ProfilePhotoCropDialog. The square is kept in the picture's own pixels
 * and can never show anything but the picture; the dialog moves and zooms it
 * from the pointer, the wheel, the slider, and the keyboard, and reports the
 * square only when it is confirmed. The cut itself honours EXIF orientation and
 * comes out as a fixed-size WebP (or PNG where an engine cannot write WebP).
 */

const noop = () => undefined;
const FRAME = 248;
const INSET = 32;

/** A drawn 300×200 picture: red, green, and blue thirds from left to right. */
function thirds(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 200;
    const context = canvas.getContext("2d")!;
    for (const [index, color] of [
        "rgb(220, 30, 30)",
        "rgb(30, 200, 30)",
        "rgb(30, 30, 220)",
    ].entries()) {
        context.fillStyle = color;
        context.fillRect(index * 100, 0, 100, 200);
    }
    return canvas;
}

const source: ProfilePhotoCropSource = {
    imageUrl: thirds().toDataURL("image/png"),
    width: 300,
    height: 200,
};

/**
 * A JPEG stored 40×20 — a blue square left of a red one — with EXIF
 * orientation 6, so the right way up it is 20×40 with the blue square on top.
 */
const EXIF_ROTATED_JPEG =
    "/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAABgAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAACgAAAADoAQAAQAAABQAAAAAAAAA/+IB8ElDQ19QUk9GSUxFAAEBAAAB4GxjbXMEIAAAbW50clJHQiBYWVogB+IAAwAUAAkADgAdYWNzcE1TRlQAAAAAc2F3c2N0cmwAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1oYW5keem/Vlo+AbaDI4VVRvdPqgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKZGVzYwAAAPwAAAAkY3BydAAAASAAAAAid3RwdAAAAUQAAAAUY2hhZAAAAVgAAAAsclhZWgAAAYQAAAAUZ1hZWgAAAZgAAAAUYlhZWgAAAawAAAAUclRSQwAAAcAAAAAgZ1RSQwAAAcAAAAAgYlRSQwAAAcAAAAAgbWx1YwAAAAAAAAABAAAADGVuVVMAAAAIAAAAHABzAFIARwBCbWx1YwAAAAAAAAABAAAADGVuVVMAAAAGAAAAHABDAEMAMAAAWFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDD8AAAXd///zJgAAB5AAAP2S///7of///aIAAAPcAADAcVhZWiAAAAAAAABvoAAAOPIAAAOPWFlaIAAAAAAAAGKWAAC3iQAAGNpYWVogAAAAAAAAJKAAAA+FAAC2xHBhcmEAAAAAAAMAAAACZmkAAPKnAAANWQAAE9AAAApb/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8AAEQgAFAAoAwEiAAIRAQMRAf/EABcAAQEBAQAAAAAAAAAAAAAAAAAGBwj/xAAYEAEAAwEAAAAAAAAAAAAAAAAABkSCwv/EABcBAQEBAQAAAAAAAAAAAAAAAAgGBwn/xAAbEQABBQEBAAAAAAAAAAAAAAAAAgQ2grMGB//aAAwDAQACEQMRAD8A5EANUnCohN3HSoS8Ju46VAU+iyh3TNAuuDjra+igAzgvjLwHR0A5UQm7jpUAFPosod0zQLrg462vooAM4L4//9k=";

function blobOf(base64: string, type: string): Blob {
    return new Blob([Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))], { type });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no blob"))), "image/png"),
    );
}

/** The colour at a point of a decoded picture. */
async function pixel(blob: Blob, x: number, y: number): Promise<readonly number[]> {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return Array.from(context.getImageData(x, y, 1, 1).data.subarray(0, 3));
}

function rect(element: Element, stage: Element) {
    const box = element.getBoundingClientRect();
    const origin = stage.getBoundingClientRect();
    return {
        x: box.left - origin.left,
        y: box.top - origin.top,
        width: box.width,
        height: box.height,
    };
}

/** Gives the fixed overlay a bounded, measurable window. */
function Window(props: { children: ReactNode; testId: string }) {
    return (
        <div
            data-testid={props.testId}
            style={{
                height: "600px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "720px",
            }}
        >
            {props.children}
        </div>
    );
}

it("starts centred at the zoom that fills the square, and never leaves the square uncovered", () => {
    const landscape = { width: 960, height: 540 };
    const initial = imageCropInitial(landscape);
    expect(imageCropRegion(landscape, initial)).toEqual({ x: 210, y: 0, size: 540 });
    expect(
        imageCropRegion({ width: 480, height: 640 }, imageCropInitial({ width: 480, height: 640 })),
    ).toEqual({
        x: 0,
        y: 80,
        size: 480,
    });

    // Panning stops at the picture's edges, and does nothing where there is no slack.
    expect(imageCropRegion(landscape, imageCropPan(landscape, initial, FRAME, 10_000, 0)).x).toBe(
        0,
    );
    expect(imageCropRegion(landscape, imageCropPan(landscape, initial, FRAME, -10_000, 0)).x).toBe(
        420,
    );
    expect(imageCropPan(landscape, initial, FRAME, 0, 500)).toBe(initial);
    expect(imageCropZoom(landscape, initial, 0.5, FRAME)).toBe(initial);
    // One screen pixel of drag is one frame pixel of the picture.
    expect(imageCropPan(landscape, initial, FRAME, 62, 0).cx).toBeCloseTo(480 - 135, 6);

    // Zoom stays between filling the square and an eighth of the shorter side.
    expect(imageCropZoom(landscape, initial, 0.25, FRAME).zoom).toBe(1);
    expect(imageCropZoom(landscape, initial, 100, FRAME).zoom).toBe(IMAGE_CROP_MAX_ZOOM);
    expect(imageCropRegion(landscape, imageCropZoom(landscape, initial, 100, FRAME)).size).toBe(
        67.5,
    );
    // The picture point under the anchor holds still: here the frame's top-left corner.
    expect(
        imageCropRegion(landscape, imageCropZoom(landscape, initial, 2, FRAME, { x: 0, y: 0 })),
    ).toEqual({
        x: 210,
        y: 0,
        size: 270,
    });
    // Zooming back out near an edge pulls the square back onto the picture.
    const corner = imageCropPan(
        landscape,
        imageCropZoom(landscape, initial, 4, FRAME),
        FRAME,
        -10_000,
        -10_000,
    );
    expect(imageCropRegion(landscape, corner)).toEqual({ x: 960 - 135, y: 540 - 135, size: 135 });
    expect(imageCropRegion(landscape, imageCropZoom(landscape, corner, 1, FRAME))).toEqual({
        x: 420,
        y: 0,
        size: 540,
    });
    expect(imageCropClamp(landscape, { cx: Number.NaN, cy: -5, zoom: Number.NaN })).toEqual(
        initial,
    );

    // A tiny square picture fills the frame as it is, and only zooms.
    const tiny = { width: 40, height: 40 };
    expect(
        imageCropRegion(tiny, imageCropPan(tiny, imageCropInitial(tiny), FRAME, 50, 50)),
    ).toEqual({
        x: 0,
        y: 0,
        size: 40,
    });
    expect(imageCropRegion(tiny, imageCropZoom(tiny, imageCropInitial(tiny), 8, FRAME)).size).toBe(
        5,
    );
});

it("draws the picture under a centred 248px circle and reports the square it shows", async () => {
    const confirmed: ImageCropRegion[] = [];
    let cancels = 0;
    const view = createRenderer().render(
        () => (
            <Window testId="window">
                <ProfilePhotoCropDialog
                    onCancel={() => (cancels += 1)}
                    onConfirm={(region) => confirmed.push(region)}
                    source={source}
                />
            </Window>
        ),
        { width: 760, height: 640, padding: 20 },
    );
    await view.ready();

    const stage = view.$('[data-testid="photo-crop-stage"]');
    expect(stage.bounds().width).toBe(312);
    expect(stage.bounds().height).toBe(312);
    expect(stage.computedStyle("overflow")).toBe("hidden");
    const mask = rect(view.$('[data-happy-desktop-ui="photo-crop-mask"]').element, stage.element);
    expect(mask).toEqual({ x: INSET, y: INSET, width: FRAME, height: FRAME });
    expect(
        parseFloat(
            view
                .$('[data-happy-desktop-ui="photo-crop-mask"]')
                .computedStyle("border-top-left-radius"),
        ),
    ).toBeGreaterThanOrEqual(FRAME / 2);
    expect(
        rect(view.$('[data-happy-desktop-ui="photo-crop-frame"]').element, stage.element),
    ).toEqual(mask);
    // 300×200 at the zoom that fills the square: its 200px height spans the frame.
    const image = rect(view.$('[data-happy-desktop-ui="photo-crop-image"]').element, stage.element);
    expect(image.width).toBeCloseTo(372, 1);
    expect(image.height).toBeCloseTo(FRAME, 1);
    expect(image.x).toBeCloseTo(INSET - 50 * 1.24, 1);
    expect(image.y).toBeCloseTo(INSET, 1);
    // Focus starts on the picture, so the keyboard moves it at once.
    expect(document.activeElement).toBe(stage.element);

    await userEvent.click(view.$('[data-testid="photo-crop-cancel"]').element);
    expect(cancels).toBe(1);
    expect(confirmed).toEqual([]);
    await userEvent.click(view.$('[data-testid="photo-crop-confirm"]').element);
    expect(confirmed).toEqual([{ x: 50, y: 0, size: 200 }]);
    expect(cancels).toBe(1);
});

it("moves with a drag and the arrows, and zooms with the wheel, the slider, and +/−, within the picture", async () => {
    const confirmed: ImageCropRegion[] = [];
    const view = createRenderer().render(
        () => (
            <Window testId="window">
                <ProfilePhotoCropDialog
                    onCancel={noop}
                    onConfirm={(region) => confirmed.push(region)}
                    source={source}
                />
            </Window>
        ),
        { width: 760, height: 640, padding: 20 },
    );
    await view.ready();
    const stage = view.$('[data-testid="photo-crop-stage"]').element as HTMLDivElement;
    const image = () => rect(view.$('[data-happy-desktop-ui="photo-crop-image"]').element, stage);
    const slider = view.$('[data-testid="photo-crop-zoom"]').element as HTMLInputElement;
    const start = image();

    // A drag moves the picture with the pointer.
    await userEvent.dragAndDrop(stage, stage, {
        sourcePosition: { x: 156, y: 156 },
        targetPosition: { x: 136, y: 156 },
    });
    expect(image().x).toBeCloseTo(start.x - 20, 1);
    // An arrow moves it 8px; with Shift, 32px; never past the frame's edge.
    stage.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(image().x).toBeCloseTo(start.x - 12, 1);
    await userEvent.keyboard("{ArrowUp}");
    expect(image().y).toBeCloseTo(INSET, 1);
    await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}");
    expect(image().x).toBeCloseTo(INSET, 1);

    // + and − zoom about the centre of the frame.
    await userEvent.keyboard("+");
    expect(image().width).toBeCloseTo(372 * 1.15, 1);
    expect(Number(slider.value)).toBeCloseTo(Math.log2(1.15), 2);
    await userEvent.keyboard("-");
    expect(image().width).toBeCloseTo(372, 1);

    // The wheel zooms about the pointer, and the page does not scroll with it.
    const box = stage.getBoundingClientRect();
    const wheel = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + INSET,
        clientY: box.top + INSET,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        deltaY: -100,
    });
    stage.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    // A wheel is a continuous event, so React renders its zoom a moment later.
    await expect.poll(() => image().width).toBeCloseTo(372 * Math.exp(0.2), 0);
    // The picture under the pointer — the frame's top-left corner — held still.
    expect(image().x).toBeCloseTo(INSET, 1);
    expect(image().y).toBeCloseTo(INSET, 1);

    // The slider runs from filling the square to eight times closer.
    expect(slider.min).toBe("0");
    expect(Number(slider.max)).toBe(3);
    slider.focus();
    await userEvent.keyboard("{End}");
    expect(image().width).toBeCloseTo(372 * 8, 0);
    expect(image().height).toBeCloseTo(FRAME * 8, 0);
    expect(image().x).toBeLessThanOrEqual(INSET + 0.05);
    expect(image().x + image().width).toBeGreaterThanOrEqual(INSET + FRAME - 0.05);

    // Enter confirms the square shown.
    stage.focus();
    await userEvent.keyboard("{Enter}");
    expect(confirmed).toHaveLength(1);
    const shown = image();
    const region = confirmed[0]!;
    expect(region.size).toBeCloseTo(25, 6);
    expect(region.x).toBeCloseTo(((INSET - shown.x) * 300) / shown.width, 1);
    expect(region.y).toBeCloseTo(((INSET - shown.y) * 200) / shown.height, 1);
});

/** The settings row with a picked picture opening and closing the crop. */
function Picker(props: { onCancel(): void; onConfirm(region: ImageCropRegion): void }) {
    const [crop, setCrop] = useState<{ saving?: boolean; error?: string } | undefined>(undefined);
    return (
        <Window testId="window">
            <HappyAgentProfileSettings
                email="ada@example.com"
                name="Ada Lovelace"
                onEmailChange={noop}
                onNameChange={noop}
                onPhotoChoose={() => setCrop({})}
                onPhotoCropCancel={() => {
                    props.onCancel();
                    setCrop(undefined);
                }}
                onPhotoCropConfirm={(region) => {
                    props.onConfirm(region);
                    setCrop({ saving: true });
                }}
                onPhotoRemove={noop}
                onRevert={noop}
                onSave={noop}
                {...(crop ? { photoCrop: { source, ...crop } } : {})}
            />
            {/* The owner's answers to a confirmed crop. */}
            <button
                data-testid="refused"
                onClick={() =>
                    setCrop({ error: "Happy Agent is unreachable. Try again once it is back." })
                }
                type="button"
            />
            <button data-testid="stored" onClick={() => setCrop(undefined)} type="button" />
        </Window>
    );
}

it("keeps focus inside, cancels with Escape, holds while saving, and hands focus back to the picker", async () => {
    let cancels = 0;
    const confirmed: ImageCropRegion[] = [];
    const view = createRenderer().render(
        () => (
            <Picker
                onCancel={() => (cancels += 1)}
                onConfirm={(region) => confirmed.push(region)}
            />
        ),
        { width: 760, height: 640, padding: 20 },
    );
    await view.ready();
    const choose = view.$('[data-testid="happy-agent-profile-photo-choose"]')
        .element as HTMLButtonElement;
    const input = view.$('[data-testid="happy-agent-profile-photo-input"]')
        .element as HTMLInputElement;
    const pick = async () => {
        choose.focus();
        const transfer = new DataTransfer();
        transfer.items.add(new File([await canvasBlob(thirds())], "me.png", { type: "image/png" }));
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        await view.ready();
    };

    await pick();
    const stage = view.$('[data-testid="photo-crop-stage"]').element;
    const slider = view.$('[data-testid="photo-crop-zoom"]').element;
    const cancel = view.$('[data-testid="photo-crop-cancel"]').element as HTMLButtonElement;
    const save = view.$('[data-testid="photo-crop-confirm"]').element as HTMLButtonElement;
    expect(document.activeElement).toBe(stage);
    // Tab walks the dialog's controls and wraps around at both ends.
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(slider);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(cancel);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(save);
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement).toBe(stage);
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(save);

    // Escape cancels: nothing is confirmed, and focus is back on the picker.
    await userEvent.keyboard("{Escape}");
    await view.ready();
    expect(cancels).toBe(1);
    expect(confirmed).toEqual([]);
    expect(view.container.querySelector('[data-testid="photo-crop-dialog"]')).toBeNull();
    expect(document.activeElement).toBe(choose);

    // Enter confirms, and the dialog holds while the photo is sent.
    await pick();
    await userEvent.keyboard("{Enter}");
    await view.ready();
    expect(confirmed).toEqual([{ x: 50, y: 0, size: 200 }]);
    const holding = view.$('[data-testid="photo-crop-confirm"]').element as HTMLButtonElement;
    expect(holding.disabled).toBe(true);
    expect(holding.hasAttribute("data-loading")).toBe(true);
    expect(
        (view.$('[data-testid="photo-crop-cancel"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((view.$('[data-testid="photo-crop-zoom"]').element as HTMLInputElement).disabled).toBe(
        true,
    );
    const dialog = view.$('[data-testid="photo-crop-dialog"]').element;
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Enter}");
    expect(cancels).toBe(1);
    expect(confirmed).toHaveLength(1);
    // The picker underneath stays enabled, so focus has somewhere to return to.
    expect(choose.disabled).toBe(false);

    // A refusal is said in the dialog, which stays open to try again.
    (view.$('[data-testid="refused"]').element as HTMLButtonElement).click();
    await view.ready();
    const error = view.$('[data-testid="photo-crop-error"]').element;
    expect(error.textContent).toContain("Photo not changed");
    expect(error.textContent).toContain("Happy Agent is unreachable. Try again once it is back.");
    expect(
        (view.$('[data-testid="photo-crop-confirm"]').element as HTMLButtonElement).disabled,
    ).toBe(false);

    // Stored: the dialog closes and focus returns to the picker.
    (view.$('[data-testid="stored"]').element as HTMLButtonElement).click();
    await view.ready();
    expect(view.container.querySelector('[data-testid="photo-crop-dialog"]')).toBeNull();
    expect(document.activeElement).toBe(choose);
});

it("cuts the confirmed square into a 512px WebP or PNG, the right way up", async () => {
    const opened = await imageCropOpen(await canvasBlob(thirds()));
    expect([opened.width, opened.height]).toEqual([300, 200]);
    expect(opened.imageUrl.startsWith("blob:")).toBe(true);

    // The right two thirds as a square: green on its left half, blue on its right.
    const cut = await opened.crop({ x: 100, y: 0, size: 200 }, 512);
    const head = new Uint8Array(await cut.slice(0, 12).arrayBuffer());
    const encoding =
        String.fromCharCode(...head.subarray(8, 12)) === "WEBP"
            ? "image/webp"
            : String.fromCharCode(...head.subarray(1, 4)) === "PNG"
              ? "image/png"
              : "unknown";
    expect(["image/webp", "image/png"]).toContain(encoding);
    expect(cut.type).toBe(encoding);
    const decoded = await createImageBitmap(cut);
    expect([decoded.width, decoded.height]).toEqual([512, 512]);
    decoded.close();
    const [leftRed, leftGreen, leftBlue] = await pixel(cut, 64, 256);
    expect(leftGreen).toBeGreaterThan(150);
    expect(Math.max(leftRed!, leftBlue!)).toBeLessThan(90);
    const [rightRed, rightGreen, rightBlue] = await pixel(cut, 448, 256);
    expect(rightBlue).toBeGreaterThan(150);
    expect(Math.max(rightRed!, rightGreen!)).toBeLessThan(90);

    // Closed, the picture and its address are gone.
    opened.close();
    await expect(opened.crop({ x: 0, y: 0, size: 200 }, 512)).rejects.toThrow();
    await expect(fetch(opened.imageUrl)).rejects.toThrow();

    // EXIF orientation 6: stored 40×20, shown and cut 20×40 with blue on top.
    const rotated = await imageCropOpen(blobOf(EXIF_ROTATED_JPEG, "image/jpeg"));
    expect([rotated.width, rotated.height]).toEqual([20, 40]);
    const shown = new Image();
    shown.src = rotated.imageUrl;
    await shown.decode();
    expect([shown.naturalWidth, shown.naturalHeight]).toEqual([20, 40]);
    const top = await rotated.crop({ x: 0, y: 0, size: 20 }, 64);
    const bottom = await rotated.crop({ x: 0, y: 20, size: 20 }, 64);
    const [topRed, , topBlue] = await pixel(top, 32, 32);
    const [bottomRed, , bottomBlue] = await pixel(bottom, 32, 32);
    expect(topBlue).toBeGreaterThan(topRed!);
    expect(bottomRed).toBeGreaterThan(bottomBlue!);
    rotated.close();

    // A file that only looks like a picture is refused by the decoder.
    const garbage = new Blob(
        [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])],
        {
            type: "image/png",
        },
    );
    await expect(imageCropOpen(garbage)).rejects.toThrow();
});
