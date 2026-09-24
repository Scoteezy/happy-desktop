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
        sourceConversationsVisit(source, push);
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

/** Every conversation one machine holds, with the group and place each lives in. */
function sourceConversationsVisit(
    source: {
        readonly projects: readonly HappyAgentProjectGroup[];
        readonly bots: readonly HappyAgentBot[];
    },
    visit: (
        conversation: ConversationSummary,
        groupId: string,
        place: HappyAgentAttentionPlace,
    ) => void,
): void {
    for (const project of source.projects) {
        const projectPlace = {
            projectId: project.id,
            projectName: project.name,
            ...(project.avatar ? { projectAvatarUrl: project.avatar.url } : {}),
            home: project.kind === "home",
        };
        for (const conversation of project.conversations)
            visit(conversation, project.id, { kind: "project", ...projectPlace });
        for (const worktree of project.worktrees)
            for (const conversation of worktree.conversations)
                visit(conversation, worktree.id, {
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
        visit(bot.conversation, bot.workspaceId, { kind: "bot", ...botPlace });
        const tasks = (list: readonly HappyAgentBotSubtask[]): void => {
            for (const task of list) {
                visit(task.conversation, task.workspaceId, { kind: "subtask", ...botPlace });
                tasks(task.subtasks);
            }
        };
        tasks(bot.subtasks);
    }
}

/** One conversation in the recents list, by when it was last touched. */
export interface HappyAgentRecentItem {
    /** `${happyAgentId}/${sessionId}`: the same key the attention queue uses for the row. */
    readonly key: string;
    readonly happyAgentId: string;
    readonly sessionId: HappyAgentSessionId;
    readonly groupId: HappyAgentGroupId;
    readonly title: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly activity: ConversationSummary["activity"];
    readonly place: HappyAgentAttentionPlace;
}

/** One calendar day of the recents list, the session begun latest first. */
export interface HappyAgentRecentDay {
    /** Local midnight that starts the day, so the surface can name it. */
    readonly dayStart: number;
    readonly items: readonly HappyAgentRecentItem[];
}

/** Everything one machine contributes to the recents list. */
export interface HappyAgentRecentSource {
    readonly happyAgentId: string;
    readonly projects: readonly HappyAgentProjectGroup[];
    readonly bots: readonly HappyAgentBot[];
}

export interface HappyAgentRecentOptions {
    /** Conversations whose key is here are left out: what the attention queue already lists. */
    readonly exclude?: ReadonlySet<string>;
    /** How many conversations to keep, newest first. Sixty is a sidebar's worth. */
    readonly limit?: number;
}

/**
 * The recents list: every conversation across the given machines, cut into
 * local calendar days by when each was last touched. It is the sidebar's
 * answer to "what was I doing" across projects rather than inside one, so a
 * chat on another machine or under a bot stands in the same column as one in
 * the open project. Like the attention queue it is a projection of state the
 * window already holds, derived at render time.
 *
 * Which day a conversation files under follows its last activity, but its
 * place inside the day follows when the session began. Activity moves every
 * time an agent reports anything, and a column ordered by it would shuffle
 * its rows under the reader's eye whenever several agents are working at
 * once; the start of a session never moves.
 */
export function happyAgentRecentProject(
    sources: readonly HappyAgentRecentSource[],
    options: HappyAgentRecentOptions = {},
): readonly HappyAgentRecentDay[] {
    const exclude = options.exclude;
    const limit = options.limit ?? 60;
    const items: HappyAgentRecentItem[] = [];
    for (const source of sources)
        sourceConversationsVisit(source, (conversation, groupId, place) => {
            const key = `${source.happyAgentId}/${conversation.id}`;
            if (exclude?.has(key)) return;
            items.push({
                key,
                happyAgentId: source.happyAgentId,
                sessionId: conversation.id as HappyAgentSessionId,
                groupId: groupId as HappyAgentGroupId,
                title: conversation.title,
                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
                activity: conversation.activity,
                place,
            });
        });
    items.sort(
        (left, right) => right.updatedAt - left.updatedAt || (left.key < right.key ? -1 : 1),
    );
    const days: { dayStart: number; items: HappyAgentRecentItem[] }[] = [];
    for (const item of items.slice(0, limit)) {
        const dayStart = new Date(item.updatedAt).setHours(0, 0, 0, 0);
        const last = days[days.length - 1];
        if (last && last.dayStart === dayStart) last.items.push(item);
        else days.push({ dayStart, items: [item] });
    }
    for (const day of days)
        day.items.sort(
            (left, right) => right.createdAt - left.createdAt || (left.key < right.key ? -1 : 1),
        );
    return days;
}
