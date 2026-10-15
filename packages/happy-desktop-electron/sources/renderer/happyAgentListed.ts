import type { ConversationSummary, ProjectsVisibilitySnapshot } from "happy-desktop-state";
import type {
    HappyAgentDirectoryEntry,
    HappyAgentDirectorySnapshot,
} from "./happyAgentDirectoryStore";

/**
 * The top-level conversations this window's sidebar lists for one Happy Agent:
 * its bots, the tasks the reader has joined, and — unless the reader hid the
 * Projects section — every session in its projects and their worktrees.
 *
 * It is the one answer to "is this on screen" for everything that speaks for
 * the window as a whole: the connection rail's spinner and dot, the Dock's
 * count, and the completion chime. A conversation the sidebar does not list is
 * silent in all of them, in both directions; a task the reader never joined, or a session in a
 * hidden project, can neither raise those signals nor clear them. Its own
 * unread state stays exactly as the host keeps it, so showing the section again
 * or joining the task brings it back as it was.
 */
export function happyAgentListedConversations(
    entry: HappyAgentDirectoryEntry,
    visibility: ProjectsVisibilitySnapshot,
): readonly ConversationSummary[] {
    const listed: ConversationSummary[] = [];
    for (const bot of entry.bots) listed.push(bot.conversation);
    for (const task of entry.tasks) listed.push(task.conversation);
    if (visibility.projectsHidden) return listed;
    for (const project of entry.projects) {
        listed.push(...project.conversations);
        for (const worktree of project.worktrees) listed.push(...worktree.conversations);
    }
    return listed;
}

/** Whether one Happy Agent's session is listed in this window's sidebar right now. */
export function happyAgentDirectoryListed(
    snapshot: HappyAgentDirectorySnapshot,
    visibility: ProjectsVisibilitySnapshot,
    happyAgentId: string,
    sessionId: string,
): boolean {
    const entry = snapshot.happyAgents.find((candidate) => candidate.id === happyAgentId);
    if (!entry) return false;
    return happyAgentListedConversations(entry, visibility).some(
        (conversation) => conversation.id === sessionId,
    );
}
