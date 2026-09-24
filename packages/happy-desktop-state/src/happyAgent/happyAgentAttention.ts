import type { ConversationSummary } from "../conversation/conversationSummary.js";
import type { HappyAgentProjectGroup } from "./happyAgentProjectGroupProject.js";
import type {
    HappyAgentBot,
    HappyAgentBotSubtask,
    HappyAgentGroupId,
    HappyAgentInboxItem,
    HappyAgentSessionId,
} from "./happyAgentTypes.js";

/**
 * Why one conversation is in the attention queue. An agent that stopped to ask
 * something — a question, a permission — outranks a turn that merely finished:
 * the first is holding an agent up, the second is only waiting to be read.
 */
export type HappyAgentAttentionReason = "attention_needed" | "turn_finished";

/**
 * Where an attention row's conversation lives, so the queue can say it without
 * the reader having to open the row to find out. Every conversation belongs to
 * exactly one of these places.
 */
export type HappyAgentAttentionPlace =
    | {
          readonly kind: "project";
          readonly projectId: string;
          readonly projectName: string;
          readonly projectAvatarUrl?: string;
          readonly home: boolean;
      }
    | {
          readonly kind: "workspace";
          readonly projectId: string;
          readonly projectName: string;
          readonly projectAvatarUrl?: string;
          readonly home: boolean;
          readonly worktreeName: string;
      }
    | {
          readonly kind: "bot";
          readonly botId: string;
          readonly botName: string;
          readonly botAvatarUrl?: string;
      }
    | {
          readonly kind: "subtask";
          readonly botId: string;
          readonly botName: string;
          readonly botAvatarUrl?: string;
      };

/** One conversation waiting on the person, with everything the queue shows about it. */
export interface HappyAgentAttentionItem {
    /** Stable across reconciles: the machine and the session. */
    readonly key: string;
    readonly happyAgentId: string;
    readonly sessionId: HappyAgentSessionId;
    /** The group the session is addressed through: its project, worktree, or bot workspace. */
    readonly groupId: HappyAgentGroupId;
    readonly title: string;
    readonly reason: HappyAgentAttentionReason;
    /**
     * When the conversation started waiting. Absent when the host did not say,
     * in which case the row sorts after every row that carries one.
     */
    readonly since?: number;
    readonly place: HappyAgentAttentionPlace;
    /**
     * The agent's own question, when the wait is one the machine's inbox has
     * words for. A row carrying it is answered in place; one without it is
     * opened, because whatever the agent needs — a permission, a look at what
     * it did — is only in the conversation.
     */
    readonly question?: HappyAgentInboxItem;
}

/** Everything one machine contributes to the queue. */
export interface HappyAgentAttentionSource {
    readonly happyAgentId: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    readonly bots: readonly HappyAgentBot[];
    /** The machine's pending questions, matched to their sessions by id. */
    readonly questions: readonly HappyAgentInboxItem[];
}

/**
 * The attention queue: every unread conversation across the given machines, in
 * the order a person works through it. Conversations an agent is blocked on come
 * first, then turns that finished; inside each run the one that has waited
 * longest comes first, because it is the one holding things up.
 *
 * It is a projection, not a store. The signals it reads — a session's
 * `unreadReason`, a bot conversation's `unread`, the inbox's pending questions —
 * are already durable state the window subscribes to; deriving the queue from
 * them at render time is what keeps the sidebar badge, the Dock count and this
 * list from ever disagreeing about what is waiting.
 */
export function happyAgentAttentionProject(
    sources: readonly HappyAgentAttentionSource[],
): readonly HappyAgentAttentionItem[] {
    const items: HappyAgentAttentionItem[] = [];
    for (const source of sources) {
        const questionBySession = new Map<string, HappyAgentInboxItem>();
        for (const question of source.questions)
            if (question.status === "pending" && !questionBySession.has(question.sessionId))
                questionBySession.set(question.sessionId, question);
        const push = (
            conversation: ConversationSummary,
            groupId: string,
            place: HappyAgentAttentionPlace,
        ): void => {
            if (conversation.unread !== true) return;
            const question = questionBySession.get(conversation.id);
            // A pending question is the strongest statement of why the row is
            // waiting: even a host that only said "finished" has an agent
            // blocked behind it.
            const reason: HappyAgentAttentionReason =
                question !== undefined
                    ? "attention_needed"
                    : (conversation.unreadReason ?? "turn_finished");
            const since = conversation.unreadSince ?? question?.createdAt;
            items.push({
                key: `${source.happyAgentId}/${conversation.id}`,
                happyAgentId: source.happyAgentId,
                sessionId: conversation.id as HappyAgentSessionId,
                groupId: groupId as HappyAgentGroupId,
                title: conversation.title,
                reason,
                ...(since === undefined ? {} : { since }),
                place,
                ...(question === undefined ? {} : { question }),
            });
        };
        for (const project of source.projects) {
            const projectPlace = {
                projectId: project.id,
                projectName: project.name,
                ...(project.avatar ? { projectAvatarUrl: project.avatar.url } : {}),
                home: project.kind === "home",
            };
            for (const conversation of project.conversations)
                push(conversation, project.id, { kind: "project", ...projectPlace });
            for (const worktree of project.worktrees)
                for (const conversation of worktree.conversations)
                    push(conversation, worktree.id, {
                        kind: "workspace",
                        ...projectPlace,
                        worktreeName: worktree.name,
                    });
        }
        for (const bot of source.bots) {
            const botPlace = {
                botId: bot.id,
                botName: bot.name,
                ...(bot.avatar ? { botAvatarUrl: bot.avatar.url } : {}),
            };
            push(bot.conversation, bot.workspaceId, { kind: "bot", ...botPlace });
            const visit = (tasks: readonly HappyAgentBotSubtask[]): void => {
                for (const task of tasks) {
                    push(task.conversation, task.workspaceId, { kind: "subtask", ...botPlace });
                    visit(task.subtasks);
                }
            };
            visit(bot.subtasks);
        }
    }
    return items.sort(attentionCompare);
}

function attentionCompare(left: HappyAgentAttentionItem, right: HappyAgentAttentionItem): number {
    if (left.reason !== right.reason) return left.reason === "attention_needed" ? -1 : 1;
    if (left.since !== right.since) {
        if (left.since === undefined) return 1;
        if (right.since === undefined) return -1;
        return left.since - right.since;
    }
    return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

/**
 * The row the next keyboard jump lands on: the first row that is not the
 * conversation on screen, so pressing the chord from inside one waiting chat
 * goes on to the next rather than reopening the same one.
 */
export function happyAgentAttentionNext(
    items: readonly HappyAgentAttentionItem[],
    current: { readonly happyAgentId: string; readonly sessionId?: string } | undefined,
): HappyAgentAttentionItem | undefined {
    if (items.length === 0) return undefined;
    const index = items.findIndex(
        (item) =>
            current !== undefined &&
            item.happyAgentId === current.happyAgentId &&
            item.sessionId === current.sessionId,
    );
    if (index === -1) return items[0];
    return items[(index + 1) % items.length];
}
