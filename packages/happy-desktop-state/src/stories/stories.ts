import { endpointUrl, type HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentStickersStoreCreate, type HappyAgentStickersStore } from "./stickersStore.js";
import { happyAgentStoriesStoreCreate, type HappyAgentStoriesStore } from "./storiesStore.js";
import {
    happyAgentStoriesSettingsStoreCreate,
    type HappyAgentStoriesHintPersistence,
    type HappyAgentStoriesSettingsStore,
} from "./storiesSettingsStore.js";
import {
    happyAgentStoriesRowStoreCreate,
    type HappyAgentStoriesRowStore,
} from "./storiesRowStore.js";
import {
    happyAgentStoriesScreenStoreCreate,
    type HappyAgentStoriesScreenStore,
} from "./storiesScreenStore.js";

/** Where the bytes of a story's media and stickers are read, through the connection's transport. */
export interface HappyAgentStoryUrls {
    frame(storyId: string, frameId: string): string;
    /** A sticker's file; `lottie` reads a `tgs` sticker as plain Lottie JSON. */
    sticker(packId: string, stickerId: string, lottie: boolean): string;
    /** An author's photo, from the daemon-relative path the feed names. */
    photo(path: string): string;
}

/**
 * Stories on one connection: the experiment's setting, the row and the
 * stories it shows, the stickers they draw, and the viewer. Every store is
 * materialized on first access and opens nothing until it is subscribed.
 */
export interface HappyAgentStories {
    settings(): HappyAgentStoriesSettingsStore;
    stories(): HappyAgentStoriesStore;
    /** Whether the row above the sidebar is open or folded. */
    row(): HappyAgentStoriesRowStore;
    stickers(): HappyAgentStickersStore;
    /** Whether the full-window viewer is open. */
    screen(): HappyAgentStoriesScreenStore;
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
    let row: HappyAgentStoriesRowStore | undefined;
    let screen: HappyAgentStoriesScreenStore | undefined;
    let screenRelease: (() => void) | undefined;
    const settingsGet = (): HappyAgentStoriesSettingsStore => {
        settings ??= happyAgentStoriesSettingsStoreCreate(
            { client, sync: deps.sync },
            deps.hintPersistence,
        );
        return settings;
    };
    const storiesGet = (): HappyAgentStoriesStore => {
        stories ??= happyAgentStoriesStoreCreate({ client, sync: deps.sync });
        return stories;
    };
    const screenGet = (): HappyAgentStoriesScreenStore => {
        if (screen) return screen;
        const created = happyAgentStoriesScreenStoreCreate();
        screen = created;
        // Turning Stories off closes the viewer and folds the row, so
        // turning it on again never brings back a stale one.
        const setting = settingsGet();
        screenRelease = setting.subscribe(() => {
            const current = setting.get();
            if (current.status === "ready" && !current.storiesEnabled) {
                created.viewerClose();
                row?.rowCollapse();
            }
        });
        return created;
    };
    return {
        settings: settingsGet,
        stories: storiesGet,
        row() {
            row ??= happyAgentStoriesRowStoreCreate(storiesGet(), screenGet());
            return row;
        },
        stickers() {
            stickers ??= happyAgentStickersStoreCreate({ client, sync: deps.sync });
            return stickers;
        },
        screen: screenGet,
        urls: {
            frame: (storyId, frameId) => client.storyFrameUrl(storyId, frameId),
            sticker: (packId, stickerId, lottie) =>
                client.stickerFileUrl(packId, stickerId, lottie),
            photo: (path) => endpointUrl(client.endpoint, path),
        },
        [Symbol.dispose]() {
            screenRelease?.();
            screenRelease = undefined;
            settings?.[Symbol.dispose]();
            row?.[Symbol.dispose]();
            stories?.[Symbol.dispose]();
            stickers?.[Symbol.dispose]();
            screen?.[Symbol.dispose]();
            settings = stories = stickers = screen = row = undefined;
        },
    };
}
