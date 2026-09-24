import type { UserError } from "../types.js";
import type { ConversationAuthor } from "./conversationAuthor.js";
import type { Loadable } from "./loadable.js";

/**
 * One row of a conversation list. `subtitle` is the second line a reader needs
 * to tell two similar conversations apart — the working directory for a local
 * session, the participants or last message for a shared chat — and `activity`
 * is the live marker every agent-driven conversation wants regardless of stack.
 */
export interface ConversationSummary {
    readonly id: string;
    readonly title: string;
    readonly subtitle?: string;
    readonly activity: "running" | "awaitingInput" | "waiting" | "idle";
    /** Epoch milliseconds of the newest content, for relative timestamps. */
    readonly updatedAt: number;
    readonly unread?: boolean;
    /**
     * Why the row is unread, for a stack that tracks it: an agent needing an
     * answer outranks a turn that merely finished. Present only with `unread`.
     */
    readonly unreadReason?: "attention_needed" | "turn_finished";
    /** When the row became unread, epoch milliseconds. Present only with `unread`. */
    readonly unreadSince?: number;
    readonly mentions?: number;
    readonly avatarFileId?: string;
    readonly participants: readonly ConversationAuthor[];
}

/**
 * The immutable list surface: what is loaded and what failed. Which conversation
 * is open is deliberately absent — that is addressed by the URL and owned by the
 * router, so no list store carries a competing selection.
 */
export interface ConversationListSnapshot {
    readonly conversations: Loadable<readonly ConversationSummary[]>;
    /** Last failed create/fork/reset, surfaced without rejecting the action. */
    readonly mutationError?: UserError;
}
