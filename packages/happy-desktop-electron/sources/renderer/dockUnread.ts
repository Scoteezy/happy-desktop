import type { ProjectsVisibilityStore, ProjectsVisibilitySnapshot } from "happy-desktop-state";
import type {
    HappyAgentDirectorySnapshot,
    HappyAgentDirectoryStore,
} from "./happyAgentDirectoryStore";
import { happyAgentListedConversations } from "./happyAgentListed";

/**
 * How many conversations are waiting for the person across every Happy Agent in this
 * window.
 *
 * This counts exactly the fact the sidebar already draws a dot for: a
 * conversation summary's `unread`, which a Happy Agent sets durably when a turn finishes
 * or an agent needs an answer. Reading the same projection rather than deriving
 * a second one is the point — the Dock and the sidebar cannot disagree about
 * what is waiting, and opening a conversation clears both at once because
 * `sessionRead` is what changes the underlying summary.
 *
 * Only what the sidebar lists counts: bots, joined tasks, and the projects'
 * sessions while the Projects section is shown. A conversation the reader has
 * put out of sight is not waiting for them here, though it stays unread on the
 * host and counts again the moment it is listed.
 */
export function happyAgentDirectoryUnreadCount(
    snapshot: HappyAgentDirectorySnapshot,
    visibility: ProjectsVisibilitySnapshot,
): number {
    let count = 0;
    for (const happyAgent of snapshot.happyAgents)
        for (const conversation of happyAgentListedConversations(happyAgent, visibility))
            if (conversation.unread) count += 1;
    return count;
}

/**
 * Keeps the Dock's count following the Happy Agent directory for as long as the window
 * lives, and returns the way to stop.
 *
 * The directory store is the one subscribed to rather than any Happy Agent's workspace,
 * and that is what makes the count survive a connection: reconnecting replaces a
 * Happy Agent's product stores, and the directory is what re-subscribes to the
 * replacement and republishes. A Happy Agent that goes down empties its projects through
 * the same path, so a teardown reports zero rather than leaving the last number
 * it happened to have.
 *
 * The first count is reported immediately, so a window that opens with nothing
 * waiting states that instead of inheriting whatever was on the icon.
 */
export function dockUnreadPublish(
    directory: HappyAgentDirectoryStore,
    projectsVisibility: ProjectsVisibilityStore,
    report: (count: number) => void,
): () => void {
    let published: number | undefined;
    const publish = () => {
        const count = happyAgentDirectoryUnreadCount(directory.get(), projectsVisibility.get());
        // Reconciles arrive constantly while an agent is working and almost none
        // of them change this number; only a change is worth an IPC message.
        if (count === published) return;
        published = count;
        report(count);
    };
    const directoryUnsubscribe = directory.subscribe(publish);
    // Hiding or showing the Projects section changes what is listed, and so
    // what is waiting, without any Happy Agent saying a word.
    const visibilityUnsubscribe = projectsVisibility.subscribe(publish);
    publish();
    return () => {
        directoryUnsubscribe();
        visibilityUnsubscribe();
    };
}
