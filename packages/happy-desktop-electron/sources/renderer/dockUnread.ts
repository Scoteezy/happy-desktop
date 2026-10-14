import type {
    HappyAgentAttentionSnapshot,
    HappyAgentAttentionStore,
    ProjectsVisibilitySnapshot,
    ProjectsVisibilityStore,
} from "happy-desktop-state";
import type {
    HappyAgentDirectoryEntry,
    HappyAgentDirectorySnapshot,
    HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";
import { happyAgentNotifyingConversations } from "./happyAgentListed";

/** The rail and Dock count the same listed conversations, excluding muted and hidden bots. */
export function happyAgentEntryUnreadCount(
    entry: HappyAgentDirectoryEntry,
    visibility: ProjectsVisibilitySnapshot,
    attention: HappyAgentAttentionSnapshot,
): number {
    let count = 0;
    for (const conversation of happyAgentNotifyingConversations(entry, visibility, attention))
        if (conversation.unread) count += 1;
    return count;
}

export function happyAgentDirectoryUnreadCount(
    snapshot: HappyAgentDirectorySnapshot,
    visibility: ProjectsVisibilitySnapshot,
    attention: HappyAgentAttentionSnapshot,
): number {
    let count = 0;
    for (const entry of snapshot.happyAgents)
        count += happyAgentEntryUnreadCount(entry, visibility, attention);
    return count;
}

/** Reconciles the Dock when the directory, listing visibility, or attention choices change. */
export function dockUnreadPublish(
    directory: HappyAgentDirectoryStore,
    projectsVisibility: ProjectsVisibilityStore,
    attention: HappyAgentAttentionStore,
    report: (count: number) => void,
): () => void {
    let published: number | undefined;
    const publish = (): void => {
        const count = happyAgentDirectoryUnreadCount(
            directory.get(),
            projectsVisibility.get(),
            attention.get(),
        );
        if (count === published) return;
        published = count;
        report(count);
    };
    const directoryUnsubscribe = directory.subscribe(publish);
    const visibilityUnsubscribe = projectsVisibility.subscribe(publish);
    const attentionUnsubscribe = attention.subscribe(publish);
    publish();
    return () => {
        directoryUnsubscribe();
        visibilityUnsubscribe();
        attentionUnsubscribe();
    };
}
