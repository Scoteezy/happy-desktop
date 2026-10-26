/** What the viewer was opened on. */
export type HappyAgentStoriesViewerTarget =
    /** An author's circle in the row; the walk goes on through the row's order. */
    | { readonly kind: "row"; readonly authorId: string }
    /** One story, opened from its chat. */
    | { readonly kind: "story"; readonly storyId: string };

export interface HappyAgentStoriesScreenSnapshot {
    readonly viewer?: HappyAgentStoriesViewerTarget;
}

/**
 * Whether the window shows the full-window story viewer. Stories are not
 * edited on desktop, so the viewer is the only Stories screen.
 */
export interface HappyAgentStoriesScreenStore {
    get(): HappyAgentStoriesScreenSnapshot;
    subscribe(listener: () => void): () => void;
    viewerOpen(target: HappyAgentStoriesViewerTarget): void;
    viewerClose(): void;
    [Symbol.dispose](): void;
}

export function happyAgentStoriesScreenStoreCreate(): HappyAgentStoriesScreenStore {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentStoriesScreenSnapshot = {};
    const publish = (next: HappyAgentStoriesScreenSnapshot): void => {
        snapshot = next;
        for (const listener of [...listeners]) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        viewerOpen(target) {
            publish({ ...snapshot, viewer: target });
        },
        viewerClose() {
            if (!snapshot.viewer) return;
            const { viewer: _viewer, ...rest } = snapshot;
            publish(rest);
        },
        [Symbol.dispose]() {
            listeners.clear();
            snapshot = {};
        },
    };
}
