import type { ReactNode } from "react";
import {
    PROFILE_PHOTO_CROP_FRAME,
    PROFILE_PHOTO_CROP_STAGE,
    ProfilePhotoCropDialog,
    type ProfilePhotoCropSource,
} from "../../src/ProfilePhotoCropDialog";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-290";

/** Gives each fixed overlay a desktop-sized, clipping-safe specimen window. */
function frame(children: ReactNode, height = 600) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: `${height}px`,
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "760px",
            }}
        >
            {children}
        </div>
    );
}

const landscape: ProfilePhotoCropSource = {
    imageUrl: new URL("../assets/crop-landscape.webp", import.meta.url).href,
    width: 960,
    height: 540,
};
const portrait: ProfilePhotoCropSource = {
    imageUrl: new URL("../assets/crop-portrait.webp", import.meta.url).href,
    width: 480,
    height: 640,
};
const tiny: ProfilePhotoCropSource = {
    imageUrl: new URL("../assets/crop-tiny.png", import.meta.url).href,
    width: 40,
    height: 40,
};

const handlers = {
    onCancel: () => undefined,
    onConfirm: () => undefined,
};

const geometry = `${PROFILE_PHOTO_CROP_STAGE}px stage · ${PROFILE_PHOTO_CROP_FRAME}px crop square and circle`;

export function ProfilePhotoCropDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Choosing the square of a picked picture that becomes the profile photo, seen through the avatar's circle. Drag or arrow keys move it, the slider, wheel, pinch, or +/− zoom it, and it can never leave the square uncovered."
            title="ProfilePhotoCropDialog"
        >
            <Specimen
                detail={`960×540 picture · starts centred at the zoom that fills the square · ${geometry}`}
                label="Landscape"
                number="01"
                stage="app"
            >
                {frame(<ProfilePhotoCropDialog {...handlers} source={landscape} />)}
            </Specimen>

            <Specimen
                detail="480×640 picture · the square spans its width · moves only up and down at first"
                label="Portrait"
                number="02"
                stage="app"
            >
                {frame(<ProfilePhotoCropDialog {...handlers} source={portrait} />)}
            </Specimen>

            <Specimen
                detail="40×40 picture · already square, so it fills the frame and only zooms"
                label="Tiny"
                number="03"
                stage="app"
            >
                {frame(<ProfilePhotoCropDialog {...handlers} source={tiny} />)}
            </Specimen>

            <Specimen
                detail="confirmed crop in flight · Save spinning · Cancel, slider, and Escape inert"
                label="Saving"
                number="04"
                stage="app"
            >
                {frame(<ProfilePhotoCropDialog {...handlers} saving source={portrait} />)}
            </Specimen>

            <Specimen
                detail="the crop stays open with the reason, ready to adjust and try again"
                label="Refused"
                number="05"
                stage="app"
            >
                {frame(
                    <ProfilePhotoCropDialog
                        {...handlers}
                        error="Happy Agent could not read this image. Try a different PNG, JPEG, or WebP file."
                        source={landscape}
                    />,
                    700,
                )}
            </Specimen>
        </ComponentPage>
    );
}
