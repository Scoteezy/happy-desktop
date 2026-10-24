import type { StickerPickerPack, StorySticker } from "../../src";
import type { Sticker, Story, StoryFrame, StoryOverlay } from "../../src/storyTypes";

/*
 * Network-free story fixtures for the Stories blueprint pages. Every picture
 * and sticker is an SVG drawn here, so no real photo or sticker art is ever
 * bundled; the shapes stand in for the media a daemon would serve.
 */

const svg = (width: number, height: number, body: string) =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}">${body}</svg>`,
    )}`;

/** A landscape-ish "photo": a sky gradient, a sun, and two hills. */
export function storyPhoto(top: string, bottom: string, sun: string): string {
    return svg(
        1080,
        1440,
        `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` +
            `<rect width="1080" height="1440" fill="url(#g)"/>` +
            `<circle cx="760" cy="420" r="150" fill="${sun}"/>` +
            `<path d="M0 1100 Q300 860 620 1080 T1080 1000 V1440 H0Z" fill="#1d3b2a" opacity="0.85"/>` +
            `<path d="M0 1240 Q420 1060 1080 1220 V1440 H0Z" fill="#10241a"/>`,
    );
}

export const STORY_PHOTOS = [
    storyPhoto("#ffb36b", "#ff5f6d", "#fff3c4"),
    storyPhoto("#4facfe", "#00f2fe", "#ffffff"),
    storyPhoto("#7f53ac", "#647dee", "#ffd6ff"),
    storyPhoto("#43e97b", "#38f9d7", "#fffbe0"),
] as const;

/** A round avatar photo of one flat colour with a face-ish mark. */
export function storyAvatar(fill: string): string {
    return svg(
        96,
        96,
        `<rect width="96" height="96" fill="${fill}"/><circle cx="48" cy="40" r="18" fill="#ffffff" opacity="0.85"/><path d="M16 96 Q48 54 80 96Z" fill="#ffffff" opacity="0.85"/>`,
    );
}

function stickerArt(fill: string, mark: string): string {
    return svg(
        512,
        512,
        `<circle cx="256" cy="256" r="230" fill="${fill}"/><circle cx="186" cy="210" r="30" fill="#1b1b1b"/><circle cx="326" cy="210" r="30" fill="#1b1b1b"/><path d="${mark}" stroke="#1b1b1b" stroke-width="26" fill="none" stroke-linecap="round"/>`,
    );
}

const STICKER_FILLS = ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#f4a261", "#9b5de5"];
const STICKER_MARKS = [
    "M160 320 Q256 400 352 320",
    "M170 350 L342 350",
    "M170 360 Q256 290 342 360",
];

function packStickers(packId: string, count: number, offset: number): Sticker[] {
    return Array.from({ length: count }, (_, index) => ({
        packId,
        id: `${packId}-${String(index)}`,
        emoji: [["😀", "😢", "😡", "❤️", "👍", "🔥"][(index + offset) % 6] ?? "😀"],
        format: "webp",
        width: 512,
        height: 512,
        size: 1024,
        sha256: `${packId}-${String(index)}`,
    }));
}

export const STICKER_PACKS: readonly StickerPickerPack[] = [
    {
        pack: {
            id: "ducks",
            title: "Pond ducks",
            kind: "stickers",
            thumbnail: "ducks-0",
            stickerCount: 9,
            version: "1",
        },
        stickers: packStickers("ducks", 9, 0),
    },
    {
        pack: {
            id: "blobs",
            title: "Little blobs",
            kind: "stickers",
            thumbnail: "blobs-0",
            stickerCount: 6,
            version: "1",
        },
        stickers: packStickers("blobs", 6, 2),
    },
    {
        pack: {
            id: "faces",
            title: "Faces",
            kind: "emoji",
            thumbnail: "faces-0",
            stickerCount: 16,
            version: "1",
        },
        stickers: packStickers("faces", 16, 4),
    },
];

const stickerIndex = new Map(
    STICKER_PACKS.flatMap((entry) => entry.stickers ?? []).map((sticker, index) => [
        `${sticker.packId}/${sticker.id}`,
        {
            format: "webp" as const,
            url: stickerArt(
                STICKER_FILLS[index % STICKER_FILLS.length] ?? "#ffd166",
                STICKER_MARKS[index % STICKER_MARKS.length] ?? "",
            ),
            width: sticker.width,
            height: sticker.height,
        },
    ]),
);

export function fixtureSticker(packId: string, stickerId: string): StorySticker | undefined {
    return stickerIndex.get(`${packId}/${stickerId}`);
}

export function fixtureStickerOf(sticker: Sticker): StorySticker {
    return (
        fixtureSticker(sticker.packId, sticker.id) ?? {
            format: "webp",
            url: stickerArt("#cccccc", ""),
            width: 512,
            height: 512,
        }
    );
}

const at = (x: number, y: number, scale: number, rotation = 0) => ({ x, y, scale, rotation });

export function storyFrame(
    id: string,
    overlays: readonly StoryOverlay[],
    options: { readonly available?: boolean; readonly background?: readonly [string, string] } = {},
): StoryFrame {
    return {
        id,
        kind: "image",
        width: 1080,
        height: 1440,
        thumbhash: null,
        durationMs: null,
        asset: { type: "artifact_file", artifactId: "fixture", version: 1, path: `${id}.png` },
        available: options.available ?? true,
        placement: at(0.5, 0.5, 1),
        background: [...(options.background ?? ["#2b1f3a", "#0d0d14"])] as [string, string],
        overlays: [...overlays],
    };
}

export const OVERLAYS_ALL: readonly StoryOverlay[] = [
    {
        id: "t1",
        type: "text",
        text: "Golden hour",
        style: {
            font: "snellRoundhand",
            fill: "regular",
            color: "#FFFFFF",
            align: "center",
            width: 0.8,
        },
        transform: at(0.5, 0.14, 1.2),
    },
    {
        id: "t2",
        type: "text",
        text: "Shipped it",
        style: {
            font: "typewriter",
            fill: "filled",
            color: "#FFD60A",
            align: "center",
            width: 0.7,
        },
        transform: at(0.32, 0.3, 0.7, -0.14),
    },
    {
        id: "l1",
        type: "link",
        url: "https://happy.engineering/stories",
        label: "Read more",
        style: "white",
        transform: at(0.5, 0.62, 1),
    },
    {
        id: "s1",
        type: "sticker",
        packId: "ducks",
        stickerId: "ducks-1",
        transform: at(0.78, 0.4, 0.3, 0.2),
    },
    { id: "e1", type: "emoji", emoji: "🌅", transform: at(0.2, 0.46, 0.16, -0.3) },
    { id: "r1", type: "reaction", emoji: "❤️", transform: at(0.76, 0.8, 0.26) },
];

const HOUR = 60 * 60 * 1000;
/** A fixed "now", so the posted labels never drift between captures. */
export const FIXTURE_NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

export function fixtureStory(
    id: string,
    frames: readonly StoryFrame[],
    options: Partial<
        Pick<Story, "status" | "caption" | "seen" | "viewCount" | "myReaction" | "reactions">
    > & {
        readonly hoursAgo?: number;
        readonly author?: string;
    } = {},
): Story {
    const status = options.status ?? "posted";
    const postedAt = status === "posted" ? FIXTURE_NOW - (options.hoursAgo ?? 2) * HOUR : null;
    return {
        id,
        status,
        authorUserId: options.author ?? "me",
        createdBy: { kind: "user", userId: options.author ?? "me" },
        source: null,
        caption: options.caption ?? null,
        frames: [...frames],
        audience: "team",
        artifactVersion: 1,
        createdAt: FIXTURE_NOW - 3 * HOUR,
        updatedAt: FIXTURE_NOW - 3 * HOUR,
        postedAt,
        expiresAt: postedAt === null ? null : postedAt + 24 * HOUR,
        seen: options.seen ?? false,
        viewCount: options.viewCount ?? null,
        myReaction: options.myReaction ?? null,
        reactions: [...(options.reactions ?? [])],
        version: "1",
    };
}

/** Where each fixture frame's picture is read, by frame ID. */
const framePhotos = new Map<string, string>();
export function fixtureFrameUrl(_storyId: string, frameId: string): string {
    return framePhotos.get(frameId) ?? STORY_PHOTOS[0];
}
export function fixtureFrameMedia(frame: StoryFrame): string | undefined {
    return frame.available ? fixtureFrameUrl("", frame.id) : undefined;
}

function photoFrame(id: string, photo: number, overlays: readonly StoryOverlay[] = []): StoryFrame {
    framePhotos.set(id, STORY_PHOTOS[photo % STORY_PHOTOS.length] ?? STORY_PHOTOS[0]);
    return storyFrame(id, overlays);
}

export const STORY_SUNSET = fixtureStory(
    "story-sunset",
    [photoFrame("f-sunset", 0, OVERLAYS_ALL)],
    {
        caption: "Evening walk after the release.",
        reactions: [
            { emoji: "❤️", count: 4 },
            { emoji: "🔥", count: 2 },
        ],
        myReaction: "❤️",
    },
);
export const STORY_SKY = fixtureStory(
    "story-sky",
    [
        photoFrame("f-sky-1", 1, [
            {
                id: "sky-t",
                type: "text",
                text: "Two frames",
                style: {
                    font: "avenirNext",
                    fill: "semi",
                    color: "#FFFFFF",
                    align: "center",
                    width: 0.7,
                },
                transform: at(0.5, 0.2, 1),
            },
        ]),
        photoFrame("f-sky-2", 2),
    ],
    { author: "ana", hoursAgo: 5 },
);
export const STORY_MINT = fixtureStory("story-mint", [photoFrame("f-mint", 3)], {
    author: "sam",
    hoursAgo: 9,
    seen: true,
});
export const STORY_MINE = fixtureStory(
    "story-mine",
    [
        photoFrame("f-mine", 2, [
            {
                id: "mine-r",
                type: "reaction",
                emoji: "👍",
                transform: at(0.3, 0.75, 0.26),
                dark: true,
            },
        ]),
    ],
    { hoursAgo: 1, viewCount: 3, reactions: [{ emoji: "👍", count: 2 }] },
);
export const STORY_DRAFT = fixtureStory(
    "story-draft",
    [
        photoFrame("f-draft", 0, [
            {
                id: "d-t",
                type: "text",
                text: "New build is out",
                style: {
                    font: "sanFrancisco",
                    fill: "filled",
                    color: "#0A84FF",
                    align: "center",
                    width: 0.8,
                },
                transform: at(0.5, 0.22, 1),
            },
            {
                id: "d-s",
                type: "sticker",
                packId: "blobs",
                stickerId: "blobs-2",
                transform: at(0.7, 0.72, 0.32),
            },
        ]),
    ],
    { status: "draft", caption: "Release notes are in the thread." },
);
export const STORY_GONE_MEDIA = fixtureStory(
    "story-gone",
    [storyFrame("f-gone", [], { available: false })],
    { status: "draft" },
);

export function fixturePostedLabel(story: Story): string {
    if (story.postedAt === null) return "Draft";
    const hours = Math.round((FIXTURE_NOW - story.postedAt) / HOUR);
    return hours < 1 ? "just now" : `${String(hours)}h`;
}
