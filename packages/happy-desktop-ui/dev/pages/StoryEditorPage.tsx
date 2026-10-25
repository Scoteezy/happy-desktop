import { useState, type ReactNode } from "react";
import { StickerPicker, StoryEditor, type StoryEditorProps } from "../../src";
import type { StoryFrame, StoryOverlay } from "../../src/storyTypes";
import { ComponentPage, Specimen } from "../kit";
import {
    STICKER_PACKS,
    STORY_DRAFT,
    STORY_SUNSET,
    fixtureFrameMedia,
    fixtureSticker,
    fixtureStickerOf,
} from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-317";

const noop = () => {};

let overlaySequence = 0;
const overlayIdCreate = () => `overlay-${String((overlaySequence += 1))}`;

const fixed: Omit<
    StoryEditorProps,
    | "frames"
    | "frameIndex"
    | "caption"
    | "onFrameSelect"
    | "onFrameRemove"
    | "onCaptionChange"
    | "onOverlayAdd"
    | "onOverlayUpdate"
    | "onOverlayRemove"
> = {
    uploading: 0,
    saving: false,
    posting: false,
    dirty: false,
    saved: true,
    frameUrl: fixtureFrameMedia,
    sticker: fixtureSticker,
    drafts: { loading: false, drafts: [STORY_DRAFT] },
    draftUrl: (story) => (story.frames[0] ? fixtureFrameMedia(story.frames[0]) : undefined),
    stickerPicker: (handlers) => (
        <StickerPicker
            onClose={handlers.onClose}
            onEmojiSelect={handlers.onEmoji}
            onQueryChange={noop}
            onRecentsClear={noop}
            onStickerSelect={handlers.onSticker}
            packs={STICKER_PACKS}
            query=""
            recents={[]}
            stickerOf={fixtureStickerOf}
        />
    ),
    overlayIdCreate,
    onFilesAdd: noop,
    onDraftsRequest: noop,
    onDraftOpen: noop,
    onPost: noop,
    onClose: noop,
};

/** A working editor over local frames: overlays can be added, moved, scaled, rotated, and trashed. */
function LiveEditor(props: { readonly frames: readonly StoryFrame[]; readonly caption: string }) {
    const [frames, setFrames] = useState(props.frames);
    const [frameIndex, setFrameIndex] = useState(0);
    const [caption, setCaption] = useState(props.caption);
    const overlays = (change: (list: readonly StoryOverlay[]) => readonly StoryOverlay[]) =>
        setFrames((list) =>
            list.map((frame, index) =>
                index === frameIndex ? { ...frame, overlays: [...change(frame.overlays)] } : frame,
            ),
        );
    return (
        <StoryEditor
            {...fixed}
            caption={caption}
            frameIndex={frameIndex}
            frames={frames}
            onCaptionChange={setCaption}
            onFrameRemove={(id) => setFrames((list) => list.filter((frame) => frame.id !== id))}
            onFrameSelect={setFrameIndex}
            onOverlayAdd={(overlay) => overlays((list) => [...list, overlay])}
            onOverlayRemove={(id) =>
                overlays((list) => list.filter((overlay) => overlay.id !== id))
            }
            onOverlayUpdate={(overlay) =>
                overlays((list) => list.map((entry) => (entry.id === overlay.id ? overlay : entry)))
            }
        />
    );
}

/** See the viewer page: a transformed, window-sized frame holds the fixed overlay. */
function Window(props: { readonly children: ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                position: "relative",
                width: "1024px",
                height: "704px",
                overflow: "hidden",
                transform: "translateZ(0)",
            }}
        >
            {props.children}
        </div>
    );
}

export function StoryEditorPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The full-window story editor: frames on the left, the 9:16 canvas in the middle, and tools on the right — text, link, stickers, reaction, and drafts; photos and videos come from files. Overlays drag with centre and edge snapping, scale and rotate from a corner knob with 45° detents, and drop onto the trash."
            title="Story editor"
            width={1104}
        >
            <div className="specimen-grid">
                <Specimen
                    detail="1024×704 window · live: drag, scale, rotate, add, trash"
                    label="Editing a draft"
                    number="SE-01"
                    stage="surface"
                >
                    <Window>
                        <LiveEditor
                            caption={STORY_SUNSET.caption ?? ""}
                            frames={STORY_SUNSET.frames}
                        />
                    </Window>
                </Specimen>
                <Specimen
                    detail="1024×704 window · before any media is added"
                    label="New story"
                    number="SE-02"
                    stage="surface"
                >
                    <Window>
                        <LiveEditor caption="" frames={[]} />
                    </Window>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
