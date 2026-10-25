import type { Story } from "@slopus/happy-agent-client";
import type { HappyAgentStoryEditorStore } from "./storyEditorStore.js";

/** What the viewer was opened on. */
export type HappyAgentStoriesViewerTarget =
    /** An author's circle in the row; the walk goes on through the row's order. */
    | { readonly kind: "row"; readonly authorId: string }
    /** One story, opened from its chat. */
    | { readonly kind: "story"; readonly storyId: string };

export interface HappyAgentStoriesScreenSnapshot {
    readonly viewer?: HappyAgentStoriesViewerTarget;
    readonly editor?: { readonly store: HappyAgentStoryEditorStore };
}

/**
 * Which full-window Stories screen the window shows: the viewer, the editor,
 * or neither. One editor at a time; closing it disposes its session.
 */
export interface HappyAgentStoriesScreenStore {
    get(): HappyAgentStoriesScreenSnapshot;
    subscribe(listener: () => void): () => void;
    viewerOpen(target: HappyAgentStoriesViewerTarget): void;
    viewerClose(): void;
    /** Opens the editor on a draft a conversation made. */
    editorOpen(story: Story): void;
    editorClose(): void;
    [Symbol.dispose](): void;
}

export function happyAgentStoriesScreenStoreCreate(
    editorCreate: (story: Story) => HappyAgentStoryEditorStore,
): HappyAgentStoriesScreenStore {
    const listeners = new Set<() => void>();
    let snapshot: HappyAgentStoriesScreenSnapshot = {};
    const publish = (next: HappyAgentStoriesScreenSnapshot): void => {
        snapshot = next;
        for (const listener of [...listeners]) listener();
    };
    const editorRelease = (): void => {
        snapshot.editor?.store[Symbol.dispose]();
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
        editorOpen(story) {
            editorRelease();
            const { viewer: _viewer, ...rest } = snapshot;
            publish({ ...rest, editor: { store: editorCreate(story) } });
        },
        editorClose() {
            if (!snapshot.editor) return;
            editorRelease();
            const { editor: _editor, ...rest } = snapshot;
            publish(rest);
        },
        [Symbol.dispose]() {
            editorRelease();
            listeners.clear();
            snapshot = {};
        },
    };
}
