import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import type {
    ComposerSnapshot,
    ConversationFailure,
    ConversationFailureProvider,
    ConversationServiceNoticeEntry,
} from "happy-desktop-state";
import type {
    ComposerModelAccountUsage,
    ComposerModelService,
    ComposerModelUsage,
    ComposerModelUsageWatch,
} from "./ComposerModelControl";
import { ConversationEntryView, type ConversationEntryFailureProps } from "./ConversationEntryView";
import { conversationRowHeight, conversationRowHeightCacheCreate } from "./conversationRowHeight";
import {
    conversationFailureMessage,
    conversationFailureTargetKey,
    conversationRetryingLabel,
} from "./conversationFailureText";
import {
    conversationSwitchTargetPreferred,
    conversationSwitchTargets,
    type ConversationSwitchSource,
    type ConversationSwitchTarget,
} from "./conversationSwitchTargets";
import { ConversationView } from "./ConversationView";
import { createRenderer } from "./testing";
import "./styles.css";

afterEach(() => vi.restoreAllMocks());

const CLOCK = {
    now: Date.parse("2026-10-19T21:05:00Z"),
    zone: { locale: "en-US", timeZone: "America/Los_Angeles" },
} as const;
const CLAUDE: ConversationFailureProvider = {
    id: "claude",
    type: "claude",
    vendorName: "Claude",
    label: "claude",
};
const NOW = CLOCK.now;
const model = (id: string, label: string) => ({
    id,
    label,
    efforts: [{ id: "high", label: "High" }],
});
const OPUS = model("opus-5.5", "Opus 5.5");
/* The conversation's model picker: three Claude accounts, the conversation on
   team, one Codex and one Grok account. */
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "claude",
        label: "Claude",
        account: "claude_team",
        accounts: [
            { id: "claude_work", label: "claude_work", models: [OPUS] },
            { id: "claude_extra", label: "claude_extra", models: [OPUS] },
            { id: "claude_team", label: "claude_team", models: [OPUS] },
        ],
    },
    {
        id: "codex",
        label: "Codex",
        account: "codex",
        accounts: [{ id: "codex", label: "codex", models: [model("gpt-6.1-sol", "GPT-6.1 Sol")] }],
    },
    {
        id: "grok",
        label: "Grok",
        account: "grok",
        accounts: [{ id: "grok", label: "grok", models: [model("grok-4.7", "Grok 4.7")] }],
    },
];
const SELECTION = { service: "claude", account: "claude_team", model: "opus-5.5" };
const week = (usedPercent: number, limit = false): ComposerModelAccountUsage => ({
    week: { label: "Week", usedPercent, resets: "resets Thu 8:00 PM" },
    session: { label: "Session", usedPercent: 10, resets: "resets 5:50 PM" },
    updatedAt: NOW,
    ...(limit ? { limit: {} } : {}),
});
const USAGE: ComposerModelUsage = {
    accounts: new Map([
        ["claude_work", week(38)],
        ["claude_extra", week(61)],
        ["claude_team", week(100, true)],
        ["codex", week(18)],
    ]),
    now: NOW,
};
const SOURCE: ConversationSwitchSource = { services: SERVICES, selection: SELECTION };
const TARGETS = conversationSwitchTargets(SOURCE, USAGE);
const signin = (): ConversationFailure => ({
    kind: "signin_missing",
    provider: CLAUDE,
    product: "Claude Code",
    command: "claude auth login",
    message: "daemon text",
});
const notice = (failure: ConversationFailure): ConversationServiceNoticeEntry => ({
    kind: "notice",
    variant: "notice",
    id: "failed",
    sequence: "1",
    level: "error",
    text: failure.message,
    failure,
});

it("writes every kind's text itself, and the daemon's only for an unknown kind", () => {
    const text = (failure: ConversationFailure) =>
        conversationFailureMessage(failure, CLOCK)
            .map((segment) => (segment.kind === "code" ? `\`${segment.text}\`` : segment.text))
            .join("");
    const base = { message: "daemon text" };
    expect(text(signin())).toBe(
        "Claude Code isn't signed in. Run `claude auth login`, then retry.",
    );
    expect(
        text({
            ...base,
            kind: "signin_missing",
            provider: { id: "grok", type: "grok", vendorName: "Grok", label: "grok" },
            product: "Grok",
            command: "grok login",
        }),
    ).toBe("Grok isn't signed in. Run `grok login`, then retry.");
    expect(
        text({
            ...base,
            kind: "signin_missing",
            provider: { ...CLAUDE, type: "bedrock", vendorName: "Bedrock", label: "work_bedrock" },
            product: null,
            command: null,
        }),
    ).toBe("work_bedrock couldn't authenticate. Check its sign-in settings, then retry.");
    expect(
        text({
            ...base,
            kind: "usage_limit",
            provider: CLAUDE,
            resetsAt: Date.parse("2026-10-19T22:40:00Z"),
        }),
    ).toBe("Claude usage limit reached until 3:40 PM.");
    expect(
        text({
            ...base,
            kind: "usage_limit",
            provider: CLAUDE,
            resetsAt: Date.parse("2026-10-20T16:00:00Z"),
        }),
    ).toBe("Claude usage limit reached until tomorrow at 9:00 AM.");
    expect(text({ ...base, kind: "usage_limit", provider: CLAUDE, resetsAt: null })).toBe(
        "Claude usage limit reached.",
    );
    expect(
        text({
            ...base,
            kind: "no_account_available",
            poolName: "Claude pool",
            resetsAt: Date.parse("2026-10-19T22:40:00Z"),
        }),
    ).toBe("Every account in “Claude pool” is out of usage until 3:40 PM.");
    expect(text({ ...base, kind: "rate_limited", provider: CLAUDE })).toBe(
        "Claude is rate-limited. Try again in a minute.",
    );
    expect(text({ ...base, kind: "provider_unavailable", provider: CLAUDE })).toBe(
        "Claude is overloaded right now. Try again in a moment.",
    );
    expect(text({ ...base, kind: "network", provider: CLAUDE })).toBe(
        "Couldn't reach Claude. Check your connection, then retry.",
    );
    expect(
        text({
            ...base,
            kind: "provider_disabled",
            provider: { id: "codex", type: "codex", vendorName: "Codex", label: "Codex" },
        }),
    ).toBe("Codex is turned off. Turn it on in Settings, then retry.");
    expect(
        text({ ...base, kind: "context_too_long", modelId: "opus-5.5", modelName: "Opus 5.5" }),
    ).toBe("This conversation is too long for Opus 5.5, even after a reset.");
    expect(text({ ...base, kind: "internal", detail: "The tool runner stopped." })).toBe(
        "Something went wrong: The tool runner stopped.",
    );
    expect(text({ ...base, kind: "unknown" })).toBe("daemon text");
    expect(
        conversationRetryingLabel({
            kind: "provider_unavailable",
            attempt: 3,
            maxAttempts: 10,
            vendorName: "Claude",
        }),
    ).toBe("Claude is overloaded — retrying (3/10)…");
    expect(
        conversationRetryingLabel({
            kind: "context_too_long",
            attempt: 1,
            maxAttempts: 1,
            vendorName: "Claude",
        }),
    ).toBe("Context full — resetting, then retrying…");
});

/** The card as the transcript draws it, owning its picked target as ConversationView does. */
function Row(props: {
    readonly failure: ConversationFailure;
    readonly current?: boolean;
    readonly targets?: readonly ConversationSwitchTarget[];
    readonly onSwitch?: ConversationEntryFailureProps["onSwitch"];
    readonly onSwitchOpen?: () => void;
    readonly onRetry?: () => void;
    readonly onNewChat?: () => void;
}) {
    const [picked, setPicked] = useState<string | undefined>(undefined);
    return (
        <ConversationEntryView
            entry={notice(props.failure)}
            errorAssistance={{ status: "ready" }}
            failure={{
                current: props.current ?? true,
                clock: CLOCK,
                ...(props.targets ? { switchTargets: props.targets, usageNow: NOW } : {}),
                ...(props.onSwitchOpen ? { onSwitchOpen: props.onSwitchOpen } : {}),
                ...(picked === undefined ? {} : { target: picked }),
                onTargetChange: setPicked,
                ...(props.onRetry ? { onRetry: props.onRetry } : {}),
                ...(props.onNewChat ? { onNewChat: props.onNewChat } : {}),
                ...(props.onSwitch ? { onSwitch: props.onSwitch } : {}),
            }}
            onErrorAssistanceRequest={() => undefined}
        />
    );
}

const modeled = (
    failure: ConversationFailure,
    width: number,
    actions: { retry: boolean; newChat: boolean; switch: boolean },
    current = true,
    picked?: string,
    targets: readonly ConversationSwitchTarget[] | undefined = TARGETS,
) =>
    conversationRowHeight(
        [notice(failure)],
        0,
        {
            surface: "chat",
            width,
            errorAssistance: { status: "ready" },
            failure: {
                current,
                actions,
                clock: CLOCK,
                ...(targets ? { switchTargets: targets } : {}),
                ...(picked ? { target: picked } : {}),
            },
        },
        conversationRowHeightCacheCreate(),
    );

const buttons = (root: ParentNode) =>
    [...root.querySelectorAll<HTMLButtonElement>(".happy-button")].map((button) => ({
        text: button.getAttribute("aria-label") ?? button.textContent,
        variant: button.dataset["variant"],
        height: button.getBoundingClientRect().height,
    }));

it.each([360, 720])(
    "puts Retry on the message line, one primary switch below, and models the row exactly at %ipx",
    async (width) => {
        const view = createRenderer();
        const onSwitch = vi.fn();
        view.render(
            () => (
                <Row
                    failure={signin()}
                    onRetry={() => undefined}
                    onSwitch={onSwitch}
                    targets={TARGETS}
                />
            ),
            {
                width,
                height: 600,
            },
        );
        await view.ready();
        await document.fonts.ready;
        const card = view.$('[data-happy-desktop-ui="conversation-error-card"]')
            .element as HTMLElement;
        expect(buttons(card)).toEqual([
            { text: "Retry", variant: "secondary", height: 28 },
            {
                text: "Switch to claude_work · Opus 5.5 and continue",
                variant: "primary",
                height: 28,
            },
            { text: "Choose another account", variant: "primary", height: 28 },
            { text: "Ask Chief of Staff", variant: "secondary", height: 28 },
        ]);
        /* Retry follows the message 8px after it, centred on its first 20px line
           and hanging 4px over it, so the line keeps the icon's height. */
        const message = view.$('[data-happy-desktop-ui="conversation-error-reason"]').bounds();
        const retry = view.$(".happy-conversation-failure-card__line-action").bounds();
        expect(retry.x - (message.x + message.width)).toBeCloseTo(8, 1);
        expect(retry.y + retry.height / 2).toBeCloseTo(message.y + 10, 1);
        // The row below starts on the message's left edge.
        const actions = view.$('[data-happy-desktop-ui="conversation-failure-actions"]').bounds();
        expect(actions.x).toBe(message.x);
        // The command copies itself.
        const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
        card.querySelector<HTMLButtonElement>('[aria-label="Copy claude auth login"]')!.click();
        await expect.poll(() => write.mock.calls).toEqual([["claude auth login"]]);
        expect(card.getBoundingClientRect().height).toBe(
            modeled(signin(), width, { retry: true, newChat: false, switch: true }),
        );
        expect(window.devicePixelRatio).toBe(2);
        await view.screenshot(`ConversationFailureCard-${String(width)}.test`);
    },
);

it("makes the message line's own action primary when nothing can be switched to", async () => {
    const view = createRenderer();
    const onNewChat = vi.fn();
    const tooLong: ConversationFailure = {
        kind: "context_too_long",
        modelId: "opus-5.5",
        modelName: "Opus 5.5",
        message: "",
    };
    view.render(() => <Row failure={tooLong} onNewChat={onNewChat} onRetry={() => undefined} />, {
        width: 720,
        height: 400,
    });
    await view.ready();
    const card = view.$('[data-happy-desktop-ui="conversation-error-card"]').element as HTMLElement;
    expect(buttons(card)).toEqual([
        { text: "New chat", variant: "primary", height: 28 },
        { text: "Ask Chief of Staff", variant: "secondary", height: 28 },
    ]);
    card.querySelector<HTMLButtonElement>(".happy-conversation-failure-card__line-action")!.click();
    expect(onNewChat).toHaveBeenCalledOnce();
    expect(card.getBoundingClientRect().height).toBe(
        modeled(tooLong, 720, { retry: true, newChat: true, switch: false }, true, undefined, []),
    );
});

it("opens the picker's accounts from the chevron, asks for fresh usage, picks without switching, then switches", async () => {
    const view = createRenderer();
    const onSwitch = vi.fn();
    const onSwitchOpen = vi.fn();
    // At the foot of the surface, as the latest failure sits above the composer.
    view.render(
        () => (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    height: "700px",
                }}
            >
                <Row
                    failure={signin()}
                    onRetry={() => undefined}
                    onSwitch={onSwitch}
                    onSwitchOpen={onSwitchOpen}
                    targets={TARGETS}
                />
            </div>
        ),
        { width: 720, height: 700 },
    );
    await view.ready();
    const split = view.$('[data-happy-desktop-ui="conversation-switch"]').element as HTMLElement;
    const chevron = split.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    expect(onSwitchOpen).not.toHaveBeenCalled();
    chevron.click();
    await expect
        .poll(() => document.querySelector('[data-happy-desktop-ui="conversation-switch-popup"]'))
        .not.toBeNull();
    // Unfolding is when the picker reads every account again.
    expect(onSwitchOpen).toHaveBeenCalledOnce();
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    expect(chevron.dataset["open"]).toBe("");
    const popup = document.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="conversation-switch-popup"]',
    )!;
    // The model picker's own popup and rows, grouped by its services.
    expect(popup.classList.contains("happy-composer-model-control__popup")).toBe(true);
    expect(
        [...popup.querySelectorAll(".happy-composer-model-control__service-header")].map(
            (node) => node.textContent,
        ),
    ).toEqual(["Claude", "Codex", "Grok"]);
    const rows = [...popup.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    /* Read the words, not the check: an icon is a font glyph with a character of its own.
       Each row ends on the picker's own gauge of the week left; an account with
       no reading has none. */
    const words = (row: Element) =>
        [
            row.querySelector(".happy-composer-model-control__name")?.textContent,
            row.querySelector('[data-happy-desktop-ui="composer-model-control-usage-gauge"]')
                ?.textContent ?? "",
        ].join("|");
    expect(rows.map(words)).toEqual([
        "claude_work · Opus 5.5|62%",
        "claude_extra · Opus 5.5|39%",
        "codex · GPT-6.1 Sol|82%",
        "grok · Grok 4.7|",
    ]);
    expect(rows.map((row) => row.hasAttribute("data-selected"))).toEqual([
        true,
        false,
        false,
        false,
    ]);
    expect(document.activeElement).toBe(rows[0]);
    // Trailing edges aligned, 4px from the button, above it where there is room.
    const button = split.getBoundingClientRect();
    const anchor = popup.parentElement!.getBoundingClientRect();
    expect(anchor.right).toBeCloseTo(button.right, 1);
    expect(button.top - anchor.bottom).toBeCloseTo(4, 1);
    // Beneath the list, the picked account's week, session, and freshness, as the picker shows them.
    const details = () =>
        [
            ...popup.querySelectorAll(
                '[data-happy-desktop-ui="composer-model-control-usage"], [data-happy-desktop-ui="composer-model-control-usage-freshness"], [data-happy-desktop-ui="composer-model-control-usage-unknown"]',
            ),
        ].map((node) => node.textContent);
    expect(details()).toEqual([
        "Weekresets Thu 8:00 PM62% left",
        "Sessionresets 5:50 PM90% left",
        "Updated just now",
    ]);
    rows[3]!.focus();
    await expect.poll(details).toEqual(["Usage unknown"]);
    // Picking only changes the target.
    rows[2]!.click();
    await expect
        .poll(() => document.querySelector('[data-happy-desktop-ui="conversation-switch-popup"]'))
        .toBeNull();
    expect(onSwitch).not.toHaveBeenCalled();
    const main = split.querySelector<HTMLButtonElement>(".happy-conversation-switch__main")!;
    await expect.poll(() => main.textContent).toBe("Switch to codex · GPT-6.1 Sol and continue");
    expect(document.activeElement).toBe(chevron);
    const card = view.$('[data-happy-desktop-ui="conversation-error-card"]').element as HTMLElement;
    expect(card.getBoundingClientRect().height).toBe(
        modeled(
            signin(),
            720,
            { retry: true, newChat: false, switch: true },
            true,
            conversationFailureTargetKey(TARGETS[2]!),
        ),
    );
    main.click();
    expect(onSwitch).toHaveBeenCalledExactlyOnceWith(TARGETS[2]);
});

it("opens the list downward when there is no room above, and closes on Escape", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
                <Row failure={signin()} onSwitch={() => undefined} targets={TARGETS} />
            </div>
        ),
        { width: 720, height: 600 },
    );
    await view.ready();
    const split = view.$('[data-happy-desktop-ui="conversation-switch"]').element as HTMLElement;
    const chevron = split.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    chevron.click();
    await expect
        .poll(() => document.querySelector('[data-happy-desktop-ui="conversation-switch-anchor"]'))
        .not.toBeNull();
    const anchor = document.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="conversation-switch-anchor"]',
    )!;
    const button = split.getBoundingClientRect();
    // The card is at the top of the surface: the list cannot fit above it.
    expect(button.top - 4 - anchor.getBoundingClientRect().height).toBeLessThan(8);
    expect(anchor.dataset["placement"]).toBe("below");
    expect(anchor.getBoundingClientRect().top - button.bottom).toBeCloseTo(4, 1);
    expect(anchor.getBoundingClientRect().right).toBeCloseTo(button.right, 1);
    (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await expect
        .poll(() => document.querySelector('[data-happy-desktop-ui="conversation-switch-anchor"]'))
        .toBeNull();
    expect(document.activeElement).toBe(chevron);
});

it("keeps a resolved card in history with a muted record and no actions", async () => {
    const view = createRenderer();
    const switched: ConversationFailure = {
        ...signin(),
        resolution: {
            action: "switched",
            at: CLOCK.now,
            providerId: "claude_work",
            providerLabel: "claude_work",
            modelId: "opus 5.5",
            modelName: "Opus 5.5",
        },
    };
    view.render(
        () => <Row failure={switched} onRetry={() => undefined} onSwitch={() => undefined} />,
        {
            width: 720,
            height: 300,
        },
    );
    await view.ready();
    const card = view.$('[data-happy-desktop-ui="conversation-error-card"]').element as HTMLElement;
    expect(card.querySelectorAll(".happy-button")).toHaveLength(0);
    expect(view.$(".happy-conversation-failure-card__resolution-text").element.textContent).toBe(
        "Switched to claude_work · Opus 5.5",
    );
    expect(card.getBoundingClientRect().height).toBe(
        modeled(switched, 720, { retry: true, newChat: false, switch: true }),
    );
    const handled: ConversationFailure = {
        ...signin(),
        resolution: { action: "handled", at: CLOCK.now },
    };
    view.render(() => <Row failure={handled} onRetry={() => undefined} />, {
        width: 720,
        height: 300,
    });
    await view.ready();
    // Each render is a case of its own; the handled one is the second card.
    expect(
        [
            ...view.container.querySelectorAll(".happy-conversation-failure-card__resolution-text"),
        ].map((node) => node.textContent),
    ).toEqual(["Switched to claude_work · Opus 5.5", "Handled"]);
});

it("offers only Ask Chief of Staff on a failure the conversation has moved past", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <Row
                current={false}
                failure={signin()}
                onRetry={() => undefined}
                onSwitch={() => undefined}
                targets={TARGETS}
            />
        ),
        { width: 720, height: 300 },
    );
    await view.ready();
    const card = view.$('[data-happy-desktop-ui="conversation-error-card"]').element as HTMLElement;
    expect(buttons(card).map((button) => button.text)).toEqual(["Ask Chief of Staff"]);
    expect(card.textContent).toContain("claude auth login");
    expect(card.getBoundingClientRect().height).toBe(
        modeled(signin(), 720, { retry: false, newChat: false, switch: false }, false),
    );
});

it("lists the picker's accounts besides the selected one, and prefers the unspent one with the most week left", () => {
    expect(TARGETS.map((target) => [target.service, target.providerId, target.modelId])).toEqual([
        ["claude", "claude_work", "opus-5.5"],
        ["claude", "claude_extra", "opus-5.5"],
        ["codex", "codex", "gpt-6.1-sol"],
        ["grok", "grok", "grok-4.7"],
    ]);
    // An account without the selected model continues on its top model; one with none enabled is no target.
    const services: readonly ComposerModelService[] = [
        {
            ...SERVICES[0]!,
            accounts: [
                ...SERVICES[0]!.accounts,
                {
                    id: "claude_sonnet",
                    label: "claude_sonnet",
                    models: [model("sonnet-5", "Sonnet 5")],
                },
                {
                    id: "claude_off",
                    label: "claude_off",
                    models: [{ ...OPUS, disabled: true }],
                },
            ],
        },
    ];
    expect(
        conversationSwitchTargets({ services, selection: SELECTION }, undefined).map(
            (target) => `${target.providerId}:${target.modelName}`,
        ),
    ).toEqual(["claude_work:Opus 5.5", "claude_extra:Opus 5.5", "claude_sonnet:Sonnet 5"]);
    // The selected service comes first, whatever the catalog order.
    expect(
        conversationSwitchTargets(
            { services, selection: { service: "codex", account: "codex", model: "gpt-6.1-sol" } },
            undefined,
        )[0]?.service,
    ).toBe("claude");
    const preferred = (usage: ComposerModelUsage) =>
        conversationSwitchTargetPreferred(conversationSwitchTargets(SOURCE, usage), "claude")
            ?.providerId;
    expect(preferred(USAGE)).toBe("claude_work");
    const accounts = (entries: readonly [string, ComposerModelAccountUsage][]) => ({
        accounts: new Map([...USAGE.accounts, ...entries]),
        now: NOW,
    });
    // A spent account, or one whose session is full, gives way to the next on its service.
    expect(preferred(accounts([["claude_work", week(20, true)]]))).toBe("claude_extra");
    expect(
        preferred(
            accounts([
                ["claude_work", { ...week(20), session: { label: "Session", usedPercent: 100 } }],
            ]),
        ),
    ).toBe("claude_extra");
    // Every account on the service spent: another service, read before unread.
    expect(
        preferred(
            accounts([
                ["claude_work", week(100, true)],
                ["claude_extra", week(100, true)],
            ]),
        ),
    ).toBe("codex");
    // Nothing read at all: list order.
    expect(preferred({ accounts: new Map(), now: NOW })).toBe("claude_work");
    expect(conversationSwitchTargetPreferred([], "claude")).toBeUndefined();
});

/**
 * The picker's usage watch, as the provider-usage store backs it: it answers
 * with its held reading at once, follows changes while held, and records the
 * refreshes it is asked for.
 */
function liveUsage(initial: ComposerModelUsage) {
    let usage = initial;
    const listeners = new Set<(usage: ComposerModelUsage) => void>();
    const refresh = vi.fn<(accounts: readonly string[]) => void>();
    const watch: ComposerModelUsageWatch = {
        subscribe(listener) {
            listeners.add(listener);
            listener(usage);
            return () => listeners.delete(listener);
        },
        refresh,
    };
    return {
        watch,
        refresh,
        held: () => listeners.size,
        set(next: ComposerModelUsage) {
            usage = next;
            for (const listener of listeners) listener(next);
        },
    };
}

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "failure-switch",
    submission: { status: "idle" },
    text: "",
};

it("switches from the conversation's live picker source, follows its usage, and refreshes it when unfolded", async () => {
    const live = liveUsage(USAGE);
    const onSwitch = vi.fn();
    const source: ConversationSwitchSource = { ...SOURCE, usageWatch: live.watch };
    const view = createRenderer();
    let failureSet: (failure: ConversationFailure) => void = () => undefined;
    function Conversation() {
        const [failure, setFailure] = useState(signin);
        failureSet = setFailure;
        return conversation(failure);
    }
    const conversation = (failure: ConversationFailure) => (
        <div style={{ display: "flex", height: "600px" }}>
            <ConversationView
                composer={COMPOSER}
                conversationId="failure-switch"
                entries={[notice(failure)]}
                failureActions={{ onRetry: () => undefined, onSwitch }}
                failureClock={CLOCK}
                failureSwitch={source}
                onComposerSend={() => undefined}
                onComposerValueChange={() => undefined}
            />
        </div>
    );
    view.render(() => <Conversation />, { width: 720, height: 600 });
    await view.ready();
    const main = () =>
        document.querySelector<HTMLButtonElement>(".happy-conversation-switch__main")?.textContent;
    await expect.poll(main).toBe("Switch to claude_work · Opus 5.5 and continue");
    expect(live.held()).toBe(1);
    expect(live.refresh).not.toHaveBeenCalled();

    // The account the button names is spent while the card is on screen.
    live.set({
        accounts: new Map([...USAGE.accounts, ["claude_work", week(100, true)]]),
        now: NOW,
    });
    await expect.poll(main).toBe("Switch to claude_extra · Opus 5.5 and continue");

    document.querySelector<HTMLButtonElement>(".happy-conversation-switch__menu")!.click();
    await expect
        .poll(() => document.querySelector('[data-happy-desktop-ui="conversation-switch-popup"]'))
        .not.toBeNull();
    // The refresh the picker asks for when it opens: every account it lists.
    expect(live.refresh).toHaveBeenCalledExactlyOnceWith([
        "claude_work",
        "claude_extra",
        "claude_team",
        "codex",
        "grok",
    ]);
    const gauge = (providerId: string) =>
        [
            ...document.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="conversation-switch-row"]',
            ),
        ]
            .find((row) => row.textContent?.startsWith(providerId))
            ?.querySelector('[data-happy-desktop-ui="composer-model-control-usage-gauge"]')
            ?.textContent;
    expect(gauge("codex")).toBe("82%");
    // A refreshed reading lands in the open list.
    live.set({ accounts: new Map([...USAGE.accounts, ["codex", week(70)]]), now: NOW });
    await expect.poll(() => gauge("codex")).toBe("30%");
    document
        .querySelector<HTMLButtonElement>('[data-happy-desktop-ui="conversation-switch-row"]')!
        .click();
    document.querySelector<HTMLButtonElement>(".happy-conversation-switch__main")!.click();
    expect(onSwitch).toHaveBeenCalledOnce();
    expect(onSwitch.mock.calls[0]![0]).toBe("failed");
    expect(onSwitch.mock.calls[0]![1]).toMatchObject({
        providerId: "claude_work",
        modelId: "opus-5.5",
    });

    // A resolved failure offers nothing, and nothing is followed for it.
    failureSet({ ...signin(), resolution: { action: "retried", at: NOW } });
    await expect.poll(live.held).toBe(0);
    expect(document.querySelector(".happy-conversation-switch")).toBeNull();
});

it("offers Retry alone when the live picker has no other account", async () => {
    const live = liveUsage(USAGE);
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", height: "500px" }}>
                <ConversationView
                    composer={COMPOSER}
                    conversationId="failure-alone"
                    entries={[notice(signin())]}
                    failureActions={{ onRetry: () => undefined, onSwitch: () => undefined }}
                    failureClock={CLOCK}
                    failureSwitch={{
                        services: [{ ...SERVICES[0]!, accounts: [SERVICES[0]!.accounts[2]!] }],
                        selection: SELECTION,
                        usageWatch: live.watch,
                    }}
                    onComposerSend={() => undefined}
                    onComposerValueChange={() => undefined}
                />
            </div>
        ),
        { width: 720, height: 500 },
    );
    await view.ready();
    await expect
        .poll(() =>
            [...document.querySelectorAll(".happy-conversation-failure-card .happy-button")].map(
                (button) => `${button.textContent}:${(button as HTMLElement).dataset["variant"]}`,
            ),
        )
        .toEqual(["Retry:primary"]);
});
