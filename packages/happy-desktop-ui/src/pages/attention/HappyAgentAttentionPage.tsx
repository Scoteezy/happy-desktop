import type { CSSProperties } from "react";
import type {
    HappyAgentAttentionItem,
    HappyAgentAttentionPlace,
    HappyAgentInboxSubmission,
} from "happy-desktop-state";
import { Avatar } from "../../Avatar";
import { AvatarBrutalist } from "../../AvatarBrutalist";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { Composer } from "../../Composer";
import { EmptyState } from "../../EmptyState";
import { SURFACE_HEADER_HEIGHT } from "../../InfoPanel";
import {
    HappyAgentUserInputPrompt,
    type HappyAgentUserInputAnswerMap,
} from "../../HappyAgentUserInputPrompt";
import type { KeyboardShortcut } from "../../keyboardShortcut";
import { ScrollArea } from "../../Scrollbar";
import { Toolbar } from "../../Toolbar";

export type HappyAgentAttentionAnswerMap = HappyAgentUserInputAnswerMap;

export interface HappyAgentAttentionPageProps {
    /** Every conversation waiting on the person, in the order to work through them. */
    items: readonly HappyAgentAttentionItem[];
    /** True before any machine has answered, so an empty queue is not claimed early. */
    loading?: boolean;
    /** Why answers cannot currently be submitted. Drafts and selections remain local. */
    unavailable?: string;
    /** What has been written into a row's reply box so far. */
    questionMessage?: (item: HappyAgentAttentionItem) => string | undefined;
    /** Options ticked into a row's question but not yet submitted. */
    questionSelection?: (
        item: HappyAgentAttentionItem,
    ) => Readonly<Record<string, readonly string[]>> | undefined;
    /** The in-flight or failed answer for a row's question. */
    questionSubmission?: (item: HappyAgentAttentionItem) => HappyAgentInboxSubmission | undefined;
    onAnswer?: (item: HappyAgentAttentionItem, answers: HappyAgentAttentionAnswerMap) => void;
    onSelectionChange?: (
        item: HappyAgentAttentionItem,
        answers: HappyAgentAttentionAnswerMap,
    ) => void;
    onMessageChange?: (item: HappyAgentAttentionItem, text: string) => void;
    onMessageSubmit?: (item: HappyAgentAttentionItem) => void;
    /** Opens the conversation behind a row. */
    onOpen: (item: HappyAgentAttentionItem) => void;
    /** Marks a finished turn seen without opening it. */
    onRead?: (item: HappyAgentAttentionItem) => void;
    /** Marks everything in the queue seen. */
    onReadAll?: () => void;
    /** How long a row has been waiting, in the surface's own words. */
    itemTime?: (item: HappyAgentAttentionItem) => string | undefined;
    /** The chord that jumps to the next row, shown on the header. */
    nextShortcut?: KeyboardShortcut;
    /** The chord that marks everything read, shown on the header. */
    readAllShortcut?: KeyboardShortcut;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentAttentionPage — the queue of conversations waiting on the person,
 * across every machine the window is connected to. Conversations an agent is
 * blocked on come first, oldest first; turns that merely finished follow.
 *
 * A row is a place and a title: whose conversation it is, where it lives, and
 * why it is here. A row an agent is blocked on with a question the machine has
 * words for unfolds into that question and is answered in place. Every other
 * row is opened, because whatever the agent needs is only in the conversation.
 * A finished turn can also just be marked seen, which is the queue's way of
 * saying "noted" without a visit.
 *
 * It renders exactly what it is handed and reports every act upward; it holds
 * no queue of its own.
 */
export function HappyAgentAttentionPage(props: HappyAgentAttentionPageProps) {
    const blocked = props.items.filter((item) => item.reason === "attention_needed");
    const finished = props.items.filter((item) => item.reason === "turn_finished");
    const total = props.items.length;
    return (
        <div
            className={["happy-agent-attention", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-attention"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div
                className="happy-agent-attention__header"
                data-happy-desktop-ui="happy-agent-attention-header"
            >
                <Toolbar
                    height={SURFACE_HEADER_HEIGHT}
                    subtitle={attentionSubtitle(blocked.length, finished.length, props.loading)}
                    title="Attention"
                    trailing={
                        total > 0 ? (
                            <div className="happy-agent-attention__header-actions">
                                <Button
                                    data-action="attention-next"
                                    icon="arrow-right"
                                    onClick={() => {
                                        const first = props.items[0];
                                        if (first) props.onOpen(first);
                                    }}
                                    {...(props.nextShortcut
                                        ? { shortcut: props.nextShortcut }
                                        : {})}
                                    size="small"
                                    variant="ghost"
                                >
                                    Open next
                                </Button>
                                {props.onReadAll ? (
                                    <Button
                                        data-action="attention-read-all"
                                        icon="check"
                                        onClick={props.onReadAll}
                                        {...(props.readAllShortcut
                                            ? { shortcut: props.readAllShortcut }
                                            : {})}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Mark all read
                                    </Button>
                                ) : null}
                            </div>
                        ) : undefined
                    }
                />
            </div>
            <ScrollArea
                className="happy-agent-attention__scroll"
                data-happy-desktop-ui="happy-agent-attention-scroll"
                viewportClassName="happy-agent-attention__scroll-viewport"
            >
                <div className="happy-agent-attention__content">
                    {props.unavailable ? (
                        <Banner tone="neutral" title="Happy Agent reconnecting">
                            {props.unavailable}
                        </Banner>
                    ) : null}

                    {total === 0 ? (
                        <EmptyState
                            animation={props.loading ? "snail" : "sparkles"}
                            description={
                                props.loading
                                    ? "Reading what your agents are waiting on."
                                    : "When an agent stops for you, or finishes a turn, it waits here."
                            }
                            icon={props.loading ? "clock" : "check-circle"}
                            title={props.loading ? "Loading…" : "Nothing needs you"}
                        />
                    ) : null}

                    {blocked.length > 0 ? (
                        <SectionLabel
                            count={blocked.length}
                            label="Needs an answer"
                            testid="happy-agent-attention-section-blocked"
                        />
                    ) : null}
                    {blocked.map((item) => (
                        <AttentionRow item={item} key={item.key} page={props} />
                    ))}

                    {finished.length > 0 ? (
                        <SectionLabel
                            count={finished.length}
                            label="Finished"
                            testid="happy-agent-attention-section-finished"
                        />
                    ) : null}
                    {finished.map((item) => (
                        <AttentionRow item={item} key={item.key} page={props} />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

function SectionLabel(props: { count: number; label: string; testid: string }) {
    return (
        <h2 className="happy-agent-attention__section" data-happy-desktop-ui={props.testid}>
            <span className="happy-agent-attention__section-label">{props.label}</span>
            <span className="happy-agent-attention__section-count">{props.count}</span>
        </h2>
    );
}

function attentionSubtitle(blocked: number, finished: number, loading?: boolean): string {
    if (loading && blocked + finished === 0) return "Loading…";
    if (blocked + finished === 0) return "Nothing waiting";
    const parts = [];
    if (blocked > 0) parts.push(`${blocked} need${blocked === 1 ? "s" : ""} an answer`);
    if (finished > 0) parts.push(`${finished} finished`);
    return parts.join(" · ");
}

/** Where a row's conversation lives, as one line. */
export function happyAgentAttentionPlaceLabel(place: HappyAgentAttentionPlace): string {
    switch (place.kind) {
        case "project":
            return place.home ? "Home" : place.projectName;
        case "workspace":
            return `${place.home ? "Home" : place.projectName} · ${place.worktreeName}`;
        case "bot":
            return `Bot · ${place.botName}`;
        case "subtask":
            return `Task for ${place.botName}`;
    }
}

/**
 * The mark of the place a row belongs to: the project's own picture, the house
 * for the home project, or the bot's face. It is the place rather than the
 * session because the queue is scanned by "which of my things is this about",
 * and a project's picture answers that where a hashed session tile does not.
 */
function PlaceAvatar(props: { place: HappyAgentAttentionPlace }) {
    const place = props.place;
    if (place.kind === "project" || place.kind === "workspace") {
        return (
            <Avatar
                aria-label={place.projectName}
                className="happy-agent-attention__item-avatar"
                {...(place.home ? { icon: "home" as const } : {})}
                {...(place.projectAvatarUrl ? { imageUrl: place.projectAvatarUrl } : {})}
                initials={place.projectName.slice(0, 1).toUpperCase()}
                size="sm"
            />
        );
    }
    if (place.botAvatarUrl)
        return (
            <Avatar
                aria-label={place.botName}
                className="happy-agent-attention__item-avatar"
                imageUrl={place.botAvatarUrl}
                initials={place.botName.slice(0, 1).toUpperCase()}
                size="sm"
                type="agent"
            />
        );
    return (
        <AvatarBrutalist
            aria-label={place.botName}
            className="happy-agent-attention__item-avatar"
            id={place.botId}
            size={24}
        />
    );
}

function AttentionRow(props: {
    item: HappyAgentAttentionItem;
    page: HappyAgentAttentionPageProps;
}) {
    const { item, page } = props;
    const question = item.question;
    const submission = page.questionSubmission?.(item);
    const time = page.itemTime?.(item);
    const onMessageChange = page.onMessageChange;
    const onMessageSubmit = page.onMessageSubmit;
    const blocked = item.reason === "attention_needed";
    return (
        <article
            className="happy-agent-attention__item"
            data-happy-desktop-ui="happy-agent-attention-item"
            data-item-key={item.key}
            data-reason={item.reason}
        >
            <div
                className="happy-agent-attention__item-header"
                data-happy-desktop-ui="happy-agent-attention-item-header"
            >
                <span className="happy-agent-attention__item-identity">
                    <PlaceAvatar place={item.place} />
                    <span className="happy-agent-attention__item-text">
                        <span className="happy-agent-attention__item-title">{item.title}</span>
                        <span className="happy-agent-attention__item-place">
                            <span
                                className="happy-agent-attention__item-reason"
                                data-reason={item.reason}
                            >
                                {blocked ? "Needs you" : "Finished"}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="happy-agent-attention__item-place-text">
                                {happyAgentAttentionPlaceLabel(item.place)}
                            </span>
                        </span>
                    </span>
                </span>
                <span className="happy-agent-attention__item-meta">
                    {submission?.type === "pending" ? (
                        <span
                            className="happy-agent-attention__item-status"
                            data-happy-desktop-ui="happy-agent-attention-item-status"
                            role="status"
                        >
                            Sending…
                        </span>
                    ) : null}
                    {time ? <span className="happy-agent-attention__item-time">{time}</span> : null}
                    {!blocked && page.onRead ? (
                        <Button
                            data-action="attention-read"
                            icon="check"
                            onClick={() => page.onRead?.(item)}
                            size="small"
                            variant="ghost"
                        >
                            Mark read
                        </Button>
                    ) : null}
                    <Button
                        data-action="attention-open"
                        icon="arrow-right"
                        onClick={() => page.onOpen(item)}
                        size="small"
                        variant={blocked && !question ? "primary" : "ghost"}
                    >
                        Open
                    </Button>
                </span>
            </div>
            {question ? (
                <HappyAgentUserInputPrompt
                    {...(submission?.type === "failed" ? { error: submission.error } : {})}
                    {...(page.onAnswer
                        ? {
                              onAnswer: (
                                  _requestId: string,
                                  answers: HappyAgentAttentionAnswerMap,
                              ) => page.onAnswer?.(item, answers),
                          }
                        : {})}
                    {...(page.onSelectionChange
                        ? {
                              onSelectionChange: (
                                  _requestId: string,
                                  answers: HappyAgentAttentionAnswerMap,
                              ) => page.onSelectionChange?.(item, answers),
                          }
                        : {})}
                    pending={submission?.type === "pending"}
                    submitDisabled={page.unavailable !== undefined}
                    {...(page.unavailable === undefined
                        ? {}
                        : { submitDisabledReason: page.unavailable })}
                    {...((selection) => (selection ? { selection } : {}))(
                        page.questionSelection?.(item),
                    )}
                    request={{ requestId: question.requestId, questions: question.questions }}
                    variant="flat"
                />
            ) : null}
            {question && onMessageChange && onMessageSubmit ? (
                <Composer
                    className="happy-agent-attention__reply"
                    data-testid="happy-agent-attention-reply"
                    onSend={() => onMessageSubmit(item)}
                    onValueChange={(value) => onMessageChange(item, value)}
                    pending={submission?.type === "pending"}
                    placeholder="Or say what to do instead…"
                    submitDisabled={page.unavailable !== undefined}
                    value={page.questionMessage?.(item) ?? ""}
                />
            ) : null}
        </article>
    );
}
