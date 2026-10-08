import type { HappyAgentActionResult } from "./happyAgentSupport.js";
import type { HappyAgentThinkingLevel } from "./happyAgentTypes.js";

/**
 * Where the reader asked for a new conversation. `workspace` is any control
 * inside an open project or worktree: the tab strip's +, the empty group's
 * new-session button, or the first message typed into an empty group.
 */
export type HappyAgentConversationSource = "workspace" | "command_palette" | "shortcut" | "voice";

/** The model a conversation started on or a message was sent with, as the host names it. */
export interface HappyAgentActivityModel {
    /**
     * The catalog provider the reader configured, by id. It is the owner's to
     * turn into something that tells two accounts apart without naming either.
     */
    readonly providerId?: string;
    /** The catalog provider's `type` (`claude`, `codex`, `bedrock`, …). */
    readonly providerType?: string;
    readonly modelId?: string;
    /** Absent when the session runs at its model's default effort. */
    readonly effort?: HappyAgentThinkingLevel;
}

/** Who a message went to, and how far below a top-level conversation it sits. */
export interface HappyAgentActivityAddress {
    readonly target: "chief_of_staff" | "bot" | "session";
    /** The addressed bot's `systemKey`; null for the reader's own bots and any other conversation. */
    readonly botSystemKey: string | null;
    /**
     * 0 for a bot's own conversation or any project session, 1 for a task a
     * bot delegated, 2 for that task's own subtask; null when the conversation
     * is not in the list.
     */
    readonly taskDepth: number | null;
}

/**
 * One reader-initiated act a workspace completed or failed, reported to its
 * owner. Only enums, counts, and host-reported model identifiers: never a
 * name, path, or any text the reader wrote.
 */
export type HappyAgentActivity =
    | {
          readonly kind: "conversationCreated";
          readonly source: HappyAgentConversationSource;
          readonly model: HappyAgentActivityModel;
      }
    | (HappyAgentActivityAddress & {
          readonly kind: "messageSent";
          /** `new_session` is the message that started its conversation. */
          readonly source: "chat" | "new_session" | "voice";
          readonly model: HappyAgentActivityModel;
      })
    | {
          readonly kind: "projectAdded";
          readonly source: "open_folder" | "clone_github";
          readonly result: HappyAgentActionResult;
      }
    | { readonly kind: "workspaceCreated"; readonly result: HappyAgentActionResult }
    | {
          readonly kind: "botCreated";
          readonly source: "sidebar" | "voice";
          readonly result: HappyAgentActionResult;
      };
