import type {
    ConversationMediaItem,
    ConversationToolCall,
    HappyAgentArtifactId,
} from "happy-desktop-state";
import type { MessageReferences } from "../../src/messageReferences";
import { videoClipWide } from "./videoClips";

/*
 * Deterministic, offline presented files: inline SVG pictures, the workbench's
 * own encoded clip, and ThumbHashes encoded from the same palettes, so a
 * screenshot never waits on the network and every run paints the same pixels.
 */
function svg(width: number, height: number, body: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">${body}</svg>`,
    )}`;
}

export const mediaSquareUrl = svg(
    1024,
    1024,
    `<rect width="1024" height="1024" fill="#283c6e"/>
     <rect width="1024" height="614" fill="#f0a868"/>
     <circle cx="512" cy="560" r="180" fill="#ffd27a"/>
     <path d="M0 640 L300 460 L620 680 L1024 420 L1024 1024 L0 1024 Z" fill="#283c6e"/>`,
);
export const mediaSquareThumbhash = "nzgOXxCHh4d/eHiGiGiImIeIlvhoh48J";

export const mediaWideUrl = svg(
    1600,
    900,
    `<rect width="1600" height="900" fill="#1f2a44"/>
     <circle cx="480" cy="380" r="220" fill="#2baccc"/>
     <rect x="760" y="520" width="640" height="300" rx="28" fill="#e0a458"/>`,
);
export const mediaWideThumbhash = "E8cFDIiFh4eAiIiHeHdwf0j4eA==";

export const mediaTallUrl = svg(
    900,
    1600,
    `<rect width="900" height="1600" fill="#3c8278"/>
     <rect y="800" width="900" height="800" fill="#b48ca0"/>
     <circle cx="450" cy="520" r="200" fill="#f2e6c8"/>`,
);
export const mediaTallThumbhash = "3+cFJAxzB4iIh4eHeIePgogIeA==";

/** An address no image decodes from, so the tile settles into its failure. */
export const mediaBrokenUrl = "data:image/png;base64,AAAA";

export const mediaImageSquare: ConversationMediaItem = {
    kind: "image",
    name: "dithered-sunset.png",
    mimeType: "image/png",
    size: 1_482_112,
    width: 1024,
    height: 1024,
    thumbhash: mediaSquareThumbhash,
    url: mediaSquareUrl,
};

export const mediaImageWide: ConversationMediaItem = {
    kind: "image",
    name: "relay-field.png",
    mimeType: "image/png",
    size: 2_204_901,
    width: 1600,
    height: 900,
    thumbhash: mediaWideThumbhash,
    url: mediaWideUrl,
};

export const mediaImageTall: ConversationMediaItem = {
    kind: "image",
    name: "poster-draft.webp",
    mimeType: "image/webp",
    size: 318_440,
    width: 900,
    height: 1600,
    thumbhash: mediaTallThumbhash,
    url: mediaTallUrl,
};

export const mediaVideo: ConversationMediaItem = {
    kind: "video",
    name: "onboarding-walkthrough.webm",
    mimeType: "video/webm",
    size: 4_812_330,
    url: videoClipWide,
};

export const mediaDocument: ConversationMediaItem = {
    kind: "document",
    name: "Q3 launch readiness review.pdf",
    mimeType: "application/pdf",
    size: 1_784_220,
    url: "data:application/pdf;base64,",
};

export const mediaFile: ConversationMediaItem = {
    kind: "file",
    name: "release-assets.zip",
    mimeType: "application/zip",
    size: 42_118_000,
    url: "data:application/zip;base64,",
};

function presentedTool(
    toolCallId: string,
    toolName: string,
    items: readonly ConversationMediaItem[],
): ConversationToolCall {
    return {
        toolCallId,
        toolName,
        arguments: {},
        status: "success",
        failed: false,
        presentation: { type: "media", items },
    };
}

export const generatedImageTool = presentedTool("tool-imagegen", "codex_imagegen", [
    mediaImageWide,
]);
export const generatedImagesTool = presentedTool("tool-imagegen-grid", "gemini_imagegen", [
    mediaImageSquare,
    mediaImageWide,
    mediaImageTall,
]);
export const presentedVideoTool = presentedTool("tool-present-video", "present_files", [
    mediaVideo,
]);
export const presentedFilesTool = presentedTool("tool-present-files", "present_files", [
    mediaDocument,
    mediaFile,
]);

export const artifactId = "a7k2m9q4r8t1v5w3x6y0z2b4" as HappyAgentArtifactId;

export const createdArtifactTool: ConversationToolCall = {
    toolCallId: "tool-create-artifact",
    toolName: "create_artifact",
    arguments: {},
    status: "success",
    failed: false,
    presentation: {
        type: "artifact",
        artifactId,
        version: 1,
        artifactType: "html",
        title: "Relay flagship landing page",
    },
};

export const updatedArtifactTool: ConversationToolCall = {
    toolCallId: "tool-update-artifact",
    toolName: "update_artifact",
    arguments: {},
    status: "success",
    failed: false,
    presentation: {
        type: "artifact",
        artifactId,
        version: 4,
        artifactType: "document",
        title: "Q3 launch readiness review",
    },
};

/** Live titles as the window would have them: the artifact was renamed since. */
export const artifactReferences: MessageReferences = {
    view: (reference) =>
        reference.kind === "artifact"
            ? { type: "link", label: "Relay flagship — final", busy: false }
            : { type: "text", label: reference.id },
    open: () => undefined,
};
