import {
    HappyAgentApiError,
    type HappyAgentClient,
    type HappyAgentEvent,
    type Story,
    type StoryFeedAuthor,
    type StoryReactionCount,
    type StoryViewer,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { deepEqual, happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";

/** One story as a surface holds it, by ID. */
export type HappyAgentStoryEntry =
    | { readonly type: "loading" }
    /** Gone, another person's draft, or Stories off. */
    | { readonly type: "missing" }
    | {
          readonly type: "ready";
          readonly story: Story;
          /** Post was pressed and the daemon has not answered yet. */
          readonly posting?: boolean;
          /** Why the last Post was refused, until the next one. */
          readonly postError?: UserError;
      };

/** The stories row: one circle per author, in the daemon's order, the caller's first. */
export type HappyAgentStoriesFeed =
    | { readonly status: "loading" }
    /** The daemon has no Stories, or the person has them off. */
    | { readonly status: "unavailable" }
    | {
          readonly status: "ready";
          readonly authors: readonly StoryFeedAuthor[];
          /** Why the last read failed, while the row shows the one before it. */
          readonly error?: UserError;
      };

/** Who saw the author's own story, with their reactions. */
export type HappyAgentStoryViewers =
    | { readonly status: "loading" }
    | { readonly status: "ready"; readonly viewers: readonly StoryViewer[] }
    | { readonly status: "failed"; readonly error: UserError };

export interface HappyAgentStoriesSnapshot {
    readonly feed: HappyAgentStoriesFeed;
    readonly stories: ReadonlyMap<string, HappyAgentStoryEntry>;
    readonly viewers: ReadonlyMap<string, HappyAgentStoryViewers>;
}

/**
 * The person's stories surface: the row, every story a surface on screen asked
 * for, and the viewer lists of their own. Read when something subscribes and
 * kept current from `story.*`; the row is read again whenever its membership
 * or order may have changed, because the daemon owns the ranking.
 */
export interface HappyAgentStoriesStore {
    get(): HappyAgentStoriesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: the stories a surface shows. Starts reads; never publishes in this call. */
    storiesRequest(storyIds: readonly string[]): void;
    /** Reads one story again, for the author's view count. */
    storyRefresh(storyId: string): void;
    /** The viewer showed this story's first frame. */
    storySeen(storyId: string): void;
    /** Reacts with `emoji`, or takes the reaction back when it is already the person's. */
    storyReactionToggle(storyId: string, emoji: string): void;
    /** Posts exactly `artifactVersion`; rejects with a displayable `UserError`. */
    storyPost(storyId: string, artifactVersion: number): Promise<void>;
    /** Deletes the author's story; rejects with a displayable `UserError`. */
    storyDelete(storyId: string): Promise<void>;
    /** Reads who saw the author's own story. */
    storyViewersRequest(storyId: string): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentStoriesDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "getStoryFeed"
        | "getStory"
        | "markStorySeen"
        | "setStoryReaction"
        | "removeStoryReaction"
        | "postStory"
        | "deleteStory"
        | "listStoryViewers"
    >;
    readonly sync: HappyAgentSync;
    readonly now?: () => number;
}

const STORY_EVENT_TYPES = [
    "story.created",
    "story.updated",
    "story.posted",
    "story.deleted",
    "story.seen",
    "story.reacted",
] as const satisfies readonly HappyAgentEvent["type"][];

const LOADING_FEED: HappyAgentStoriesFeed = { status: "loading" };
const UNAVAILABLE_FEED: HappyAgentStoriesFeed = { status: "unavailable" };

function notFound(error: unknown): boolean {
    return error instanceof HappyAgentApiError && error.status === 404;
}

export function happyAgentStoriesStoreCreate(deps: HappyAgentStoriesDeps): HappyAgentStoriesStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const listeners = new Set<() => void>();
    const wanted = new Set<string>();
    let snapshot: HappyAgentStoriesSnapshot = {
        feed: LOADING_FEED,
        stories: new Map(),
        viewers: new Map(),
    };
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let feedReading = false;
    let feedAgain = false;
    let disposed = false;
    /** The latest reaction request for each story; an answer to an earlier one is dropped. */
    const reacting = new Map<string, string>();

    const publish = (next: HappyAgentStoriesSnapshot): void => {
        snapshot = next;
        for (const listener of [...listeners]) listener();
    };
    const feedSet = (feed: HappyAgentStoriesFeed): void => publish({ ...snapshot, feed });
    /** Puts stories in, keeping the object of any that did not change. */
    const storiesPut = (stories: readonly Story[]): void => {
        let next: Map<string, HappyAgentStoryEntry> | undefined;
        for (const story of stories) {
            const held = (next ?? snapshot.stories).get(story.id);
            if (held?.type === "ready" && deepEqual(held.story, story)) continue;
            next ??= new Map(snapshot.stories);
            next.set(story.id, {
                type: "ready",
                story,
                ...(held?.type === "ready" && held.posting ? { posting: true } : {}),
            });
        }
        if (next) publish({ ...snapshot, stories: next });
    };
    const entrySet = (storyId: string, entry: HappyAgentStoryEntry): void => {
        const stories = new Map(snapshot.stories);
        stories.set(storyId, entry);
        publish({ ...snapshot, stories });
    };
    const storyChange = (storyId: string, change: (story: Story) => Story): void => {
        const held = snapshot.stories.get(storyId);
        if (held?.type !== "ready") return;
        entrySet(storyId, { ...held, story: change(held.story) });
    };

    /**
     * A seen mark covers the story and every earlier one by its author
     * (API.md, Stories: seen), so their entries and the author's unseen count
     * change together, and the ring greys without waiting for a read.
     */
    const seenApply = (storyId: string): void => {
        const feed = snapshot.feed;
        const author =
            feed.status === "ready"
                ? feed.authors.find((each) => each.storyIds.includes(storyId))
                : undefined;
        const covered = author
            ? author.storyIds.slice(0, author.storyIds.indexOf(storyId) + 1)
            : [storyId];
        let stories: Map<string, HappyAgentStoryEntry> | undefined;
        for (const id of covered) {
            const held = (stories ?? snapshot.stories).get(id);
            if (held?.type !== "ready" || held.story.seen) continue;
            stories ??= new Map(snapshot.stories);
            stories.set(id, { ...held, story: { ...held.story, seen: true } });
        }
        const held = stories ?? snapshot.stories;
        const unseen = author
            ? author.storyIds.filter((id) => {
                  const entry = held.get(id);
                  return entry?.type !== "ready" || !entry.story.seen;
              }).length
            : 0;
        const authors =
            author && feed.status === "ready" && author.unseenCount !== unseen
                ? feed.authors.map((each) =>
                      each === author ? { ...each, unseenCount: unseen } : each,
                  )
                : undefined;
        if (!stories && !authors) return;
        publish({
            ...snapshot,
            stories: held,
            ...(authors && feed.status === "ready" ? { feed: { ...feed, authors } } : {}),
        });
    };

    /** A story leaves the row when its 24 hours are up; nothing announces it. */
    const expiryArm = (authors: readonly StoryFeedAuthor[]): void => {
        if (expiry) clearTimeout(expiry);
        expiry = undefined;
        let soonest = Infinity;
        for (const author of authors)
            for (const storyId of author.storyIds) {
                const entry = snapshot.stories.get(storyId);
                const at = entry?.type === "ready" ? entry.story.expiresAt : null;
                if (at !== null && at !== undefined && at < soonest) soonest = at;
            }
        if (soonest === Infinity) return;
        expiry = setTimeout(feedRead, Math.max(0, soonest - now()) + 500);
    };

    /** One read at a time; a change during it reads once more after it. */
    function feedRead(): void {
        if (disposed || !following) return;
        if (feedReading) {
            feedAgain = true;
            return;
        }
        feedReading = true;
        const signal = following.signal;
        void deps.client
            .getStoryFeed({ signal })
            .then((answer) => {
                if (disposed || signal.aborted) return;
                storiesPut(Object.values(answer.stories));
                const current = snapshot.feed;
                const authors =
                    current.status === "ready" && deepEqual(current.authors, answer.authors)
                        ? current.authors
                        : answer.authors;
                if (current.status !== "ready" || current.authors !== authors || current.error)
                    feedSet({ status: "ready", authors });
                expiryArm(authors);
            })
            .catch((error: unknown) => {
                if (disposed || signal.aborted) return;
                if (notFound(error)) feedSet(UNAVAILABLE_FEED);
                else if (snapshot.feed.status === "ready")
                    feedSet({ ...snapshot.feed, error: happyAgentUserError(error) });
            })
            .finally(() => {
                feedReading = false;
                if (feedAgain) {
                    feedAgain = false;
                    feedRead();
                }
            });
    }

    const storyRead = (storyId: string): void => {
        const active = following;
        if (disposed || !active) return;
        if (!snapshot.stories.has(storyId)) entrySet(storyId, { type: "loading" });
        void deps.client
            .getStory(storyId, { signal: active.signal })
            .then((answer) => {
                if (!disposed && !active.signal.aborted) storiesPut([answer.story]);
            })
            .catch((error: unknown) => {
                if (disposed || active.signal.aborted) return;
                const held = snapshot.stories.get(storyId);
                // A tombstone this store already holds outlives the 404 that
                // everyone but its author gets for it.
                if (notFound(error)) {
                    if (held?.type !== "ready" || held.story.status !== "deleted")
                        entrySet(storyId, { type: "missing" });
                    return;
                }
                // Anything else is passing: read once more shortly, as a
                // reconnect would.
                setTimeout(() => {
                    if (following === active && wanted.has(storyId)) storyRead(storyId);
                }, 3_000);
            });
    };

    const eventApply = (event: HappyAgentEvent): void => {
        switch (event.type) {
            case "story.created":
            case "story.posted":
                storiesPut([event.payload.story]);
                feedRead();
                return;
            case "story.updated": {
                const held = snapshot.stories.get(event.payload.storyId);
                if (held?.type === "ready" && held.story.version >= event.payload.version) return;
                storiesPut([event.payload.story]);
                return;
            }
            case "story.deleted": {
                // Everyone who could read it learns it is gone; only its author
                // may read the tombstone, so the entry becomes one here.
                const payload = event.payload;
                const held = snapshot.stories.get(payload.storyId);
                if (held?.type === "ready")
                    entrySet(payload.storyId, {
                        type: "ready",
                        story: {
                            ...held.story,
                            status: "deleted",
                            version: payload.version,
                            reactions: [],
                            myReaction: null,
                        },
                    });
                feedRead();
                return;
            }
            case "story.seen":
                seenApply(event.payload.storyId);
                feedRead();
                return;
            case "story.reacted": {
                const payload = event.payload;
                storyChange(payload.storyId, (story) => ({
                    ...story,
                    reactions: payload.reactions,
                    ...(payload.myReaction === undefined ? {} : { myReaction: payload.myReaction }),
                }));
                // The author's open viewers list carries each reaction.
                if (snapshot.viewers.has(payload.storyId)) viewersRead(payload.storyId);
                return;
            }
            default:
                return;
        }
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        let failed = false;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: [...STORY_EVENT_TYPES],
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    failed = false;
                    feedRead();
                    for (const storyId of wanted) storyRead(storyId);
                    for (const storyId of snapshot.viewers.keys()) viewersRead(storyId);
                    continue;
                }
                if (input.kind === "update" && input.update.kind === "event")
                    eventApply(input.update.event);
            }
        })()
            .catch(() => undefined)
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };
    const stop = (): void => {
        following?.abort();
        following = undefined;
        feedReading = false;
        feedAgain = false;
        if (retry) clearTimeout(retry);
        retry = undefined;
        if (expiry) clearTimeout(expiry);
        expiry = undefined;
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        storiesRequest(storyIds) {
            if (disposed) return;
            for (const storyId of storyIds) {
                if (wanted.has(storyId)) continue;
                wanted.add(storyId);
                if (snapshot.stories.get(storyId)?.type === "ready") continue;
                // Read after this call, so a surface may ask while it renders.
                queueMicrotask(() => storyRead(storyId));
            }
        },
        storyRefresh(storyId) {
            storyRead(storyId);
        },
        storySeen(storyId) {
            const held = snapshot.stories.get(storyId);
            if (disposed || held?.type !== "ready") return;
            const story = held.story;
            if (story.status !== "posted" || story.seen) return;
            // The person's own act: the ring greys at once.
            seenApply(storyId);
            void deps.client
                .markStorySeen(storyId)
                .then((answer) => storiesPut([answer.story]))
                // Refused, the daemon's own word replaces the guess.
                .catch(() => {
                    storyRead(storyId);
                    feedRead();
                });
        },
        storyReactionToggle(storyId, emoji) {
            const held = snapshot.stories.get(storyId);
            if (disposed || held?.type !== "ready" || held.story.status !== "posted") return;
            const removing = held.story.myReaction === emoji;
            const mutationId = idCreate();
            reacting.set(storyId, mutationId);
            storyChange(storyId, (story) => ({
                ...story,
                myReaction: removing ? null : emoji,
                reactions: reactionsShift(
                    story.reactions,
                    story.myReaction,
                    removing ? null : emoji,
                ),
            }));
            const request = removing
                ? deps.client.removeStoryReaction(storyId, { mutationId })
                : deps.client.setStoryReaction(storyId, { emoji, mutationId });
            // Reactions do not move a story's version, so only the answer to the
            // latest press may land; an earlier one would undo a later press.
            void request
                .then((answer) => {
                    if (reacting.get(storyId) === mutationId) storiesPut([answer.story]);
                })
                .catch(() => {
                    if (reacting.get(storyId) === mutationId) storyRead(storyId);
                })
                .finally(() => {
                    if (reacting.get(storyId) === mutationId) reacting.delete(storyId);
                });
        },
        async storyPost(storyId, artifactVersion) {
            const held = snapshot.stories.get(storyId);
            if (held?.type !== "ready") throw happyAgentUserError("This story is not loaded.");
            entrySet(storyId, { ...held, posting: true });
            try {
                const answer = await deps.client.postStory(storyId, {
                    artifactVersion,
                    mutationId: idCreate(),
                });
                const current = snapshot.stories.get(storyId);
                if (current?.type === "ready")
                    entrySet(storyId, { type: "ready", story: answer.story });
                feedRead();
            } catch (error) {
                const current = snapshot.stories.get(storyId);
                const conflict =
                    error instanceof HappyAgentApiError &&
                    error.status === 409 &&
                    (error.body as { story?: Story } | null)?.story;
                const failure = happyAgentUserError(error);
                const story = conflict || (current?.type === "ready" ? current.story : undefined);
                if (story) entrySet(storyId, { type: "ready", story, postError: failure });
                throw failure;
            }
        },
        async storyDelete(storyId) {
            const held = snapshot.stories.get(storyId);
            if (held?.type !== "ready") throw happyAgentUserError("This story is not loaded.");
            try {
                const answer = await deps.client.deleteStory(storyId, {
                    ifMatch: held.story.version,
                    mutationId: idCreate(),
                });
                storiesPut([answer.story]);
                feedRead();
            } catch (error) {
                storyRead(storyId);
                throw happyAgentUserError(error);
            }
        },
        storyViewersRequest(storyId) {
            viewersRead(storyId);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            listeners.clear();
        },
    };

    function viewersRead(storyId: string): void {
        const active = following;
        if (disposed || !active) return;
        const viewersSet = (entry: HappyAgentStoryViewers): void => {
            const viewers = new Map(snapshot.viewers);
            viewers.set(storyId, entry);
            publish({ ...snapshot, viewers });
        };
        if (!snapshot.viewers.has(storyId)) viewersSet({ status: "loading" });
        void deps.client
            .listStoryViewers(storyId, { limit: 100 }, { signal: active.signal })
            .then((answer) => {
                if (!active.signal.aborted)
                    viewersSet({ status: "ready", viewers: answer.viewers });
            })
            .catch((error: unknown) => {
                if (!active.signal.aborted)
                    viewersSet({ status: "failed", error: happyAgentUserError(error) });
            });
    }
}

/** Reaction counts after the caller's reaction moves from `from` to `to`, most first. */
function reactionsShift(
    reactions: readonly StoryReactionCount[],
    from: string | null,
    to: string | null,
): StoryReactionCount[] {
    const counts = new Map(reactions.map((each) => [each.emoji, each.count]));
    if (from !== null) counts.set(from, (counts.get(from) ?? 1) - 1);
    if (to !== null) counts.set(to, (counts.get(to) ?? 0) + 1);
    return [...counts]
        .filter(([, count]) => count > 0)
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((left, right) => right.count - left.count);
}
