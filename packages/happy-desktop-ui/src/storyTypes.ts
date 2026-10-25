import type { happyAgentProtocol } from "happy-desktop-state";

/*
 * The story model is the daemon's own contract, taken from the client as it
 * is: components draw exactly what a story says, with no copy of its types.
 */
export type Story = happyAgentProtocol.Story;
export type StoryFrame = happyAgentProtocol.StoryFrame;
export type StoryOverlay = happyAgentProtocol.StoryOverlay;
export type StoryTextOverlay = happyAgentProtocol.StoryTextOverlay;
export type StoryLinkOverlay = happyAgentProtocol.StoryLinkOverlay;
export type StoryStickerOverlay = happyAgentProtocol.StoryStickerOverlay;
export type StoryEmojiOverlay = happyAgentProtocol.StoryEmojiOverlay;
export type StoryReactionOverlay = happyAgentProtocol.StoryReactionOverlay;
export type StoryTransform = happyAgentProtocol.StoryTransform;
export type StoryTextFont = happyAgentProtocol.StoryTextFont;
export type StoryTextFill = happyAgentProtocol.StoryTextFill;
export type StoryLinkStyle = happyAgentProtocol.StoryLinkStyle;
export type StoryReactionCount = happyAgentProtocol.StoryReactionCount;
export type StoryFeedAuthor = happyAgentProtocol.StoryFeedAuthor;
export type StoryViewer = happyAgentProtocol.StoryViewer;
export type StoryMediaItem = happyAgentProtocol.StoryMediaItem;
export type Sticker = happyAgentProtocol.Sticker;
export type StickerPack = happyAgentProtocol.StickerPack;
export type StickerRef = happyAgentProtocol.StickerRef;
export type StickerPackKind = happyAgentProtocol.StickerPackKind;

/** The canvas every frame is drawn on, in canvas units: a 9:16 portrait. */
export const STORY_CANVAS_WIDTH = 1080;
export const STORY_CANVAS_HEIGHT = 1920;
/** An image's time on screen; a video plays its length, at most a minute. */
export const STORY_IMAGE_MS = 5000;
export const STORY_VIDEO_MAX_MS = 60_000;
