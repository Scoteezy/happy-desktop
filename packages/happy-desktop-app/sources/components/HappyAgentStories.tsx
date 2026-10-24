import type {
    HappyAgentStickersSnapshot,
    HappyAgentStickersStore,
    HappyAgentStories,
    HappyAgentStoriesSnapshot,
    HappyAgentStoryEditorStore,
    happyAgentProtocol,
} from "happy-desktop-state";
import {
    StickerPicker,
    StoriesRow,
    StoryEditor,
    StoryInlineCard,
    StoryViewer,
    storyHaptic,
    type InlinePageFit,
    type StoriesRowAuthor,
    type StorySticker,
    type StoryViewerAuthor,
} from "happy-desktop-ui";
import { useCallback, useSyncExternalStore } from "react";

type Story = happyAgentProtocol.Story;
type StoryFeedAuthor = happyAgentProtocol.StoryFeedAuthor;
type Sticker = happyAgentProtocol.Sticker;

function initialsOf(name: string): string {
    const words = name.trim().split(/\s+/u).filter(Boolean);
    const letters =
        words.length > 1
            ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`
            : (words[0] ?? "?").slice(0, 2);
    return letters.toUpperCase();
}

function firstName(name: string): string {
    return name.trim().split(/\s+/u)[0] ?? name;
}

/** "now", "5m", "3h": how long ago a story was posted, as Telegram writes it. */
function postedLabel(story: Story): string {
    const at = story.postedAt ?? story.updatedAt;
    const minutes = Math.max(0, Math.floor((Date.now() - at) / 60_000));
    if (story.status === "draft") return "Draft";
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${String(minutes)}m`;
    return `${String(Math.floor(minutes / 60))}h`;
}

/**
 * The feed's author key: "self" for the person, whose circle stands before the
 * daemon answers and must keep its identity when it does, else their user ID.
 */
function authorKey(author: StoryFeedAuthor): string {
    return author.isSelf ? "self" : (author.userId ?? "self");
}

/**
 * How a sticker overlay or picker cell draws, from the catalog. A pack not
 * read yet is asked for, and the sticker draws once it arrives.
 */
function stickerSourceOf(
    hub: HappyAgentStories,
    store: HappyAgentStickersStore,
    snapshot: HappyAgentStickersSnapshot,
): {
    readonly byId: (packId: string, stickerId: string) => StorySticker | undefined;
    readonly of: (sticker: Sticker) => StorySticker;
} {
    const of = (sticker: Sticker): StorySticker => ({
        format: sticker.format,
        url: hub.urls.sticker(sticker.packId, sticker.id, sticker.format === "tgs"),
        width: sticker.width,
        height: sticker.height,
    });
    return {
        of,
        byId: (packId, stickerId) => {
            const stickers = snapshot.stickers.get(packId);
            if (!stickers) {
                // Records what is wanted; the read starts after this render.
                store.packsRequest([packId]);
                return undefined;
            }
            const sticker = stickers.find((each) => each.id === stickerId);
            return sticker ? of(sticker) : undefined;
        },
    };
}

export interface HappyAgentStoriesRowProps {
    readonly hub: HappyAgentStories;
}

/** The stories row above the sidebar, from the feed, in the daemon's order. */
export function HappyAgentStoriesRow(props: HappyAgentStoriesRowProps) {
    const store = props.hub.stories();
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const screen = props.hub.screen();
    const feed = snapshot.feed;
    // A daemon without Stories has no row to show.
    if (feed.status === "unavailable") return null;
    const authors: readonly StoriesRowAuthor[] =
        feed.status === "ready"
            ? feed.authors.map((author) => ({
                  id: authorKey(author),
                  name: firstName(author.name),
                  ...(author.photo ? { photoUrl: props.hub.urls.photo(author.photo) } : {}),
                  initials: initialsOf(author.name),
                  self: author.isSelf,
                  stories: {
                      total: author.storyIds.length,
                      unseen: author.isSelf ? 0 : author.unseenCount,
                  },
                  ring: author.isSelf
                      ? author.storyIds.length > 0
                          ? "seen"
                          : "none"
                      : author.unseenCount > 0
                        ? "unseen"
                        : "seen",
              }))
            : // The person's own circle stands from the first frame, so the
              // band's height and its first circle are there before the daemon answers.
              [{ id: "self", name: "My Story", initials: "", self: true, ring: "none" }];
    return (
        <StoriesRow
            authors={authors}
            data-testid="stories-row"
            onAuthorOpen={(authorId) => {
                storyHaptic("story.open");
                screen.viewerOpen({ kind: "row", authorId });
            }}
            onCreate={() => screen.editorOpen({})}
        />
    );
}

function viewerAuthors(
    hub: HappyAgentStories,
    snapshot: HappyAgentStoriesSnapshot,
): StoryViewerAuthor[] {
    if (snapshot.feed.status !== "ready") return [];
    return snapshot.feed.authors.map((author) => ({
        id: authorKey(author),
        name: author.name,
        ...(author.photo ? { photoUrl: hub.urls.photo(author.photo) } : {}),
        initials: initialsOf(author.name),
        self: author.isSelf,
        stories: author.storyIds.flatMap((storyId) => {
            const entry = snapshot.stories.get(storyId);
            return entry?.type === "ready" && entry.story.status === "posted" ? [entry.story] : [];
        }),
    }));
}

export interface HappyAgentStoriesScreensProps {
    readonly hub: HappyAgentStories;
    /** The conversation on screen, whose media the editor offers when opened from the row. */
    readonly agentId?: string;
    onLinkOpen(url: string): void;
    onSourceOpen(agentId: string): void;
}

/** The viewer and the editor, mounted once beside whatever the window shows. */
export function HappyAgentStoriesScreens(props: HappyAgentStoriesScreensProps) {
    const screenStore = props.hub.screen();
    const screen = useSyncExternalStore(screenStore.subscribe, screenStore.get, screenStore.get);
    if (screen.editor)
        return (
            <HappyAgentStoryEditorScreen
                agentId={screen.editor.agentId ?? props.agentId}
                editor={screen.editor.store}
                hub={props.hub}
            />
        );
    if (screen.viewer)
        return (
            <HappyAgentStoryViewerScreen
                hub={props.hub}
                onLinkOpen={props.onLinkOpen}
                onSourceOpen={props.onSourceOpen}
                target={screen.viewer}
            />
        );
    return null;
}

function HappyAgentStoryViewerScreen(props: {
    readonly hub: HappyAgentStories;
    readonly target: NonNullable<
        ReturnType<ReturnType<HappyAgentStories["screen"]>["get"]>["viewer"]
    >;
    onLinkOpen(url: string): void;
    onSourceOpen(agentId: string): void;
}) {
    const { hub, target } = props;
    const store = hub.stories();
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const stickersStore = hub.stickers();
    const stickers = useSyncExternalStore(
        stickersStore.subscribe,
        stickersStore.get,
        stickersStore.get,
    );
    const source = stickerSourceOf(hub, stickersStore, stickers);
    const screen = hub.screen();
    let authors: StoryViewerAuthor[];
    let startAuthorId: string;
    let startStoryId: string | undefined;
    if (target.kind === "row") {
        authors = viewerAuthors(hub, snapshot);
        startAuthorId = target.authorId;
    } else {
        const entry = snapshot.stories.get(target.storyId);
        const story = entry?.type === "ready" ? entry.story : undefined;
        const feedAuthor =
            story && snapshot.feed.status === "ready"
                ? snapshot.feed.authors.find((author) => author.userId === story.authorUserId)
                : undefined;
        startAuthorId = "story";
        startStoryId = target.storyId;
        authors = story
            ? [
                  {
                      id: "story",
                      name: feedAuthor?.name ?? "Story",
                      ...(feedAuthor?.photo ? { photoUrl: hub.urls.photo(feedAuthor.photo) } : {}),
                      initials: initialsOf(feedAuthor?.name ?? "Story"),
                      // Only its author reads a draft or a story's view count.
                      self:
                          feedAuthor?.isSelf ??
                          (story.status === "draft" || story.viewCount !== null),
                      stories: [story],
                  },
              ]
            : [];
    }
    return (
        <StoryViewer
            authors={authors}
            frameUrl={hub.urls.frame}
            onClose={() => screen.viewerClose()}
            onDelete={(storyId) => store.storyDelete(storyId)}
            onLinkOpen={props.onLinkOpen}
            onOwnStoryShown={(storyId) => store.storyRefresh(storyId)}
            onReact={(storyId, emoji) => store.storyReactionToggle(storyId, emoji)}
            onSeen={(storyId) => store.storySeen(storyId)}
            onSourceOpen={(story) => {
                if (!story.source) return;
                screen.viewerClose();
                props.onSourceOpen(story.source.agentId);
            }}
            onViewersRequest={(storyId) => store.storyViewersRequest(storyId)}
            postedLabel={postedLabel}
            startAuthorId={startAuthorId}
            {...(startStoryId ? { startStoryId } : {})}
            sticker={source.byId}
            viewerPhotoUrl={(viewer) => (viewer.photo ? hub.urls.photo(viewer.photo) : undefined)}
            viewers={(storyId) => {
                const entry = snapshot.viewers.get(storyId);
                return entry?.status === "failed"
                    ? { status: "failed", message: entry.error.message }
                    : entry;
            }}
        />
    );
}

function HappyAgentStoryEditorScreen(props: {
    readonly hub: HappyAgentStories;
    readonly editor: HappyAgentStoryEditorStore;
    readonly agentId: string | undefined;
}) {
    const { hub, editor } = props;
    const snapshot = useSyncExternalStore(editor.subscribe, editor.get, editor.get);
    const stickersStore = hub.stickers();
    const stickers = useSyncExternalStore(
        stickersStore.subscribe,
        stickersStore.get,
        stickersStore.get,
    );
    const source = stickerSourceOf(hub, stickersStore, stickers);
    const screen = hub.screen();
    const storyId = snapshot.story?.id;
    // Closing saves what changed first. When that save fails, its error shows
    // and the next close leaves anyway, as does one while a save is running.
    const close = () => {
        if (!snapshot.dirty || !snapshot.story || snapshot.error || snapshot.saving)
            return screen.editorClose();
        void editor.save().then(
            () => screen.editorClose(),
            () => undefined,
        );
    };
    const recentStickers = stickers.recents.flatMap((recent) => {
        const pack = stickers.stickers.get(recent.packId);
        if (!pack) stickersStore.packsRequest([recent.packId]);
        const sticker = pack?.find((each) => each.id === recent.stickerId);
        return sticker ? [sticker] : [];
    });
    return (
        <StoryEditor
            caption={snapshot.caption}
            dirty={snapshot.dirty}
            draftUrl={(draft) => {
                const frame = draft.frames[0];
                return frame ? hub.urls.frame(draft.id, frame.id) : undefined;
            }}
            {...(snapshot.drafts.status === "idle"
                ? {}
                : {
                      drafts: {
                          loading: snapshot.drafts.status === "loading",
                          drafts: snapshot.drafts.status === "ready" ? snapshot.drafts.drafts : [],
                      },
                  })}
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            frameIndex={snapshot.frameIndex}
            frameUrl={(frame) => (storyId ? hub.urls.frame(storyId, frame.id) : undefined)}
            frames={snapshot.frames}
            {...(snapshot.media
                ? {
                      media:
                          snapshot.media.status === "ready"
                              ? { status: "ready" as const, items: snapshot.media.items }
                              : snapshot.media.status === "failed"
                                ? {
                                      status: "failed" as const,
                                      message: snapshot.media.error.message,
                                  }
                                : { status: "loading" as const },
                  }
                : {})}
            mediaOffered={props.agentId !== undefined}
            mediaUrl={(item) => hub.urls.asset(item.asset)}
            onCaptionChange={editor.captionUpdate}
            onClose={close}
            onDraftOpen={editor.draftOpen}
            onDraftsRequest={editor.draftsRequest}
            onFilesAdd={editor.filesAdd}
            onFrameRemove={editor.frameRemove}
            onFrameSelect={editor.frameSelect}
            onMediaAdd={editor.mediaAdd}
            onMediaRequest={() => {
                if (props.agentId) editor.mediaRequest(props.agentId);
            }}
            onOverlayAdd={(overlay) => {
                editor.overlayAdd(overlay);
                if (overlay.type === "sticker")
                    stickersStore.stickerUse({
                        packId: overlay.packId,
                        stickerId: overlay.stickerId,
                    });
            }}
            onOverlayRemove={editor.overlayRemove}
            onOverlayUpdate={editor.overlayUpdate}
            onPost={() => {
                void editor.post().then(
                    () => {
                        storyHaptic("story.post");
                        screen.editorClose();
                    },
                    () => storyHaptic("error"),
                );
            }}
            overlayIdCreate={editor.idCreate}
            posting={snapshot.posting}
            saved={snapshot.story !== undefined}
            saving={snapshot.saving}
            sticker={source.byId}
            stickerPicker={(handlers) => {
                for (const pack of stickers.packs) source.byId(pack.id, pack.thumbnail);
                // The picker opens fresh each time: a search ends when it closes.
                const searchEnd = () => stickersStore.searchUpdate("", "stickers");
                return (
                    <StickerPicker
                        onClose={() => {
                            searchEnd();
                            handlers.onClose();
                        }}
                        onEmojiSelect={(emoji) => {
                            searchEnd();
                            handlers.onEmoji(emoji);
                        }}
                        onQueryChange={stickersStore.searchUpdate}
                        onRecentsClear={stickersStore.recentsClear}
                        onStickerSelect={(sticker) => {
                            searchEnd();
                            handlers.onSticker(sticker);
                        }}
                        packs={stickers.packs.map((pack) => {
                            const list = stickers.stickers.get(pack.id);
                            return list ? { pack, stickers: list } : { pack };
                        })}
                        query={stickers.search?.query ?? ""}
                        recents={recentStickers}
                        {...(stickers.search
                            ? {
                                  results: {
                                      loading: stickers.search.status === "loading",
                                      stickers: stickers.search.results,
                                  },
                              }
                            : {})}
                        stickerOf={source.of}
                    />
                );
            }}
            uploading={snapshot.uploading}
        />
    );
}

export interface HappyAgentStoryInlineProps {
    readonly hub: HappyAgentStories;
    readonly storyId: string;
    /** Where the chat learns the card's height, so it is drawn whole. */
    readonly fit: InlinePageFit;
}

/** A story an agent drafted, in its chat, with Post and Edit while it is the reader's draft. */
export function HappyAgentStoryInline(props: HappyAgentStoryInlineProps) {
    const { hub, storyId } = props;
    const store = hub.stories();
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const stickersStore = hub.stickers();
    const stickers = useSyncExternalStore(
        stickersStore.subscribe,
        stickersStore.get,
        stickersStore.get,
    );
    const source = stickerSourceOf(hub, stickersStore, stickers);
    // Records what is wanted; the read starts after this render.
    store.storiesRequest([storyId]);
    const entry = snapshot.stories.get(storyId);
    const screen = hub.screen();
    // Identity contract: one observer per card and chat fit, not one per
    // store notification.
    const fit = props.fit;
    const measuredRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (!node) return;
            const report = () => fit.heightChanged(node.getBoundingClientRect().height);
            const observer = new ResizeObserver(report);
            observer.observe(node);
            report();
            return () => observer.disconnect();
        },
        [fit],
    );
    return (
        // The frame lays its page out in a row, which would stretch a direct
        // child to the frame's own height; the column lets the measured card
        // keep its natural height.
        <div style={{ display: "flex", flexDirection: "column" }}>
            <div
                // The chat sizes this row from its model, so the card's height is
                // reported; it never changes once drawn.
                ref={measuredRef}
                style={{ display: "flex", flex: "none", flexDirection: "column" }}
            >
                <StoryInlineCard
                    data-testid="story-inline"
                    frameUrl={hub.urls.frame}
                    onEdit={(story) =>
                        screen.editorOpen({
                            story,
                            ...(story.source ? { agentId: story.source.agentId } : {}),
                        })
                    }
                    onOpen={(story) => {
                        storyHaptic("story.open");
                        screen.viewerOpen({ kind: "story", storyId: story.id });
                    }}
                    onPost={(story) => {
                        void store.storyPost(story.id, story.artifactVersion).then(
                            () => storyHaptic("story.post"),
                            () => storyHaptic("error"),
                        );
                    }}
                    state={
                        entry === undefined || entry.type === "loading"
                            ? { type: "loading" }
                            : entry.type === "missing"
                              ? { type: "missing" }
                              : {
                                    type: "ready",
                                    story: entry.story,
                                    // Only its author may read a draft.
                                    mine: entry.story.status === "draft",
                                    ...(entry.posting ? { posting: true } : {}),
                                    ...(entry.postError ? { error: entry.postError.message } : {}),
                                }
                    }
                    sticker={source.byId}
                />
            </div>
        </div>
    );
}
