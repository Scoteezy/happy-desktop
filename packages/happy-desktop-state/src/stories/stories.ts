import {
    endpointUrl,
    type HappyAgentClient,
    type Story,
    type StoryAsset,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentStickersStoreCreate, type HappyAgentStickersStore } from "./stickersStore.js";
import { happyAgentStoriesStoreCreate, type HappyAgentStoriesStore } from "./storiesStore.js";
import {
    happyAgentStoriesSettingsStoreCreate,
    type HappyAgentStoriesHintPersistence,
    type HappyAgentStoriesSettingsStore,
} from "./storiesSettingsStore.js";
import {
    happyAgentStoriesScreenStoreCreate,
    type HappyAgentStoriesScreenStore,
} from "./storiesScreenStore.js";
import {
    happyAgentStoryEditorStoreCreate,
    type HappyAgentStoryEditorStore,
} from "./storyEditorStore.js";

/** Where the bytes of a story's media and stickers are read, through the connection's transport. */
export interface HappyAgentStoryUrls {
    frame(storyId: string, frameId: string): string;
    /** Media chosen for a story before it is one of its frames. */
    asset(asset: StoryAsset): string;
    /** A sticker's file; `lottie` reads a `tgs` sticker as plain Lottie JSON. */
    sticker(packId: string, stickerId: string, lottie: boolean): string;
    /** An author's photo, from the daemon-relative path the feed names. */
    photo(path: string): string;
}

/**
 * Stories on one connection: the experiment's setting, the row and the
 * stories it shows, the sticker catalog, and editing sessions. Every store is
 * materialized on first access and opens nothing until it is subscribed.
 */
export interface HappyAgentStories {
    settings(): HappyAgentStoriesSettingsStore;
    stories(): HappyAgentStoriesStore;
    stickers(): HappyAgentStickersStore;
    /** Which full-window Stories screen is open. */
    screen(): HappyAgentStoriesScreenStore;
    /** A new editing session: on `story` when given, otherwise on a new draft. */
    editorCreate(story?: Story): HappyAgentStoryEditorStore;
    readonly urls: HappyAgentStoryUrls;
    [Symbol.dispose](): void;
}

export interface HappyAgentStoriesCreateDeps {
    readonly client: HappyAgentClient;
    readonly sync: HappyAgentSync;
    readonly hintPersistence?: HappyAgentStoriesHintPersistence;
}

export function happyAgentStoriesCreate(deps: HappyAgentStoriesCreateDeps): HappyAgentStories {
    const client = deps.client;
    let settings: HappyAgentStoriesSettingsStore | undefined;
    let stories: HappyAgentStoriesStore | undefined;
    let stickers: HappyAgentStickersStore | undefined;
    let screen: HappyAgentStoriesScreenStore | undefined;
    let screenRelease: (() => void) | undefined;
    const editorCreate = (story?: Story) =>
        happyAgentStoryEditorStoreCreate({ client, ...(story ? { story } : {}) });
    const settingsGet = (): HappyAgentStoriesSettingsStore => {
        settings ??= happyAgentStoriesSettingsStoreCreate(
            { client, sync: deps.sync },
            deps.hintPersistence,
        );
        return settings;
    };
    return {
        settings: settingsGet,
        stories() {
            stories ??= happyAgentStoriesStoreCreate({ client, sync: deps.sync });
            return stories;
        },
        stickers() {
            stickers ??= happyAgentStickersStoreCreate({ client, sync: deps.sync });
            return stickers;
        },
        screen() {
            if (screen) return screen;
            const created = happyAgentStoriesScreenStoreCreate(editorCreate);
            screen = created;
            // Turning Stories off closes whatever Stories screen is open, so
            // turning it on again never brings back a stale one, and an open
            // editor stops its uploads.
            const setting = settingsGet();
            screenRelease = setting.subscribe(() => {
                const current = setting.get();
                if (current.status === "ready" && !current.storiesEnabled) {
                    created.viewerClose();
                    created.editorClose();
                }
            });
            return created;
        },
        editorCreate,
        urls: {
            frame: (storyId, frameId) => client.storyFrameUrl(storyId, frameId),
            asset: (asset) =>
                asset.type === "chat_media"
                    ? client.toolCallMediaUrl(asset.agentId, asset.toolCallId, asset.index)
                    : client.artifactFileUrl(asset.artifactId, asset.version, asset.path),
            sticker: (packId, stickerId, lottie) =>
                client.stickerFileUrl(packId, stickerId, lottie),
            photo: (path) => endpointUrl(client.endpoint, path),
        },
        [Symbol.dispose]() {
            screenRelease?.();
            screenRelease = undefined;
            settings?.[Symbol.dispose]();
            stories?.[Symbol.dispose]();
            stickers?.[Symbol.dispose]();
            screen?.[Symbol.dispose]();
            settings = stories = stickers = screen = undefined;
        },
    };
}
