import type { HappyAgentStoriesScreenStore } from "./storiesScreenStore.js";
import type { HappyAgentStoriesFeed, HappyAgentStoriesStore } from "./storiesStore.js";

export interface HappyAgentStoriesRowSnapshot {
    /** The row is folded into the compact strip of overlapping photos. */
    readonly collapsed: boolean;
}

/**
 * Whether the stories row is open or folded, as Telegram decides it: folded
 * at every launch whatever is unseen, opened only by the person, folded again
 * when they fold it or scroll on, and by itself once everything that was new
 * in it is seen and the viewer has closed. New stories never open it: stories
 * never push themselves on anyone. Memory-only, like the window's other state.
 */
export interface HappyAgentStoriesRowStore {
    get(): HappyAgentStoriesRowSnapshot;
    subscribe(listener: () => void): () => void;
    rowCollapse(): void;
    rowExpand(): void;
    [Symbol.dispose](): void;
}

const OPEN: HappyAgentStoriesRowSnapshot = { collapsed: false };
const FOLDED: HappyAgentStoriesRowSnapshot = { collapsed: true };

/** Nothing in the row waits to be seen; the person's own stories never do. */
function allSeen(feed: HappyAgentStoriesFeed): boolean {
    return (
        feed.status === "ready" &&
        feed.authors.every((author) => author.isSelf || author.unseenCount === 0)
    );
}

export function happyAgentStoriesRowStoreCreate(
    stories: HappyAgentStoriesStore,
    screen: HappyAgentStoriesScreenStore,
): HappyAgentStoriesRowStore {
    const listeners = new Set<() => void>();
    let disposed = false;
    let stop: (() => void) | undefined;
    let snapshot = FOLDED;
    /**
     * Something was new while the row was open. Seeing it all folds the row;
     * opening a row whose stories are all seen, to look again, does not.
     */
    let watching = false;

    const publish = (next: HappyAgentStoriesRowSnapshot): void => {
        if (next === snapshot) return;
        snapshot = next;
        for (const listener of [...listeners]) listener();
    };
    const follow = (): void => {
        if (snapshot.collapsed) return;
        const feed = stories.get().feed;
        if (feed.status !== "ready") return;
        // An empty row folds, so the next story arrives into the strip
        // rather than opening the row by itself.
        if (feed.authors.every((author) => author.storyIds.length === 0)) {
            watching = false;
            publish(FOLDED);
            return;
        }
        // Watching starts once the person looks at something new.
        if (!allSeen(feed)) {
            if (screen.get().viewer) watching = true;
        }
        // Everything seen, and the viewer gone so the person sees it happen.
        else if (watching && !screen.get().viewer) {
            watching = false;
            publish(FOLDED);
        }
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (!stop) {
                const stopStories = stories.subscribe(follow);
                const stopScreen = screen.subscribe(follow);
                stop = () => {
                    stopStories();
                    stopScreen();
                };
                // Catch up on whatever changed while nobody listened.
                follow();
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                stop?.();
                stop = undefined;
            };
        },
        rowCollapse() {
            if (disposed) return;
            watching = false;
            publish(FOLDED);
        },
        rowExpand() {
            if (disposed) return;
            const feed = stories.get().feed;
            watching = feed.status === "ready" && !allSeen(feed);
            publish(OPEN);
            follow();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop?.();
            stop = undefined;
            listeners.clear();
        },
    };
}
