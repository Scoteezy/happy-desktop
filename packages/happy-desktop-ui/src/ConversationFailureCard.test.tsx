import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import type {
    ConversationFailure,
    ConversationFailureFallback,
    ConversationFailureProvider,
    ConversationServiceNoticeEntry,
} from "happy-desktop-state";
import { ConversationEntryView, type ConversationEntryFailureProps } from "./ConversationEntryView";
import { conversationRowHeight, conversationRowHeightCacheCreate } from "./conversationRowHeight";
import {
    conversationFailureMessage,
    conversationFailureTargetKey,
    conversationRetryingLabel,
} from "./conversationFailureText";
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
const target = (
    providerLabel: string,
    modelName: string,
    usedPercent: number | null,
    usageWindow: string | null,
    group: string,
): ConversationFailureFallback => ({
    providerId: providerLabel,
    providerLabel,
    modelId: modelName.toLowerCase(),
    modelName,
    usedPercent,
    usageWindow,
    group,
});
const TARGETS = [
    target("claude_work", "Opus 5.5", 38, "weekly", "same_model"),
    target("claude_extra", "Opus 5.5", 61, "weekly", "same_model"),
    target("codex", "GPT-6.1 Sol", 18, "weekly", "other_provider"),
    target("grok", "Grok 4.7", null, null, "other_provider"),
];
const signin = (
    fallbackProviders: readonly ConversationFailureFallback[],
): ConversationFailure => ({
    kind: "signin_missing",
    provider: CLAUDE,
    product: "Claude Code",
    command: "claude auth login",
    message: "daemon text",
    fallbackProviders,
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
    const base = { message: "daemon text", fallbackProviders: [] };
    expect(text(signin([]))).toBe(
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
    ).toBe("work_bedrock has no credentials. Check its settings, then retry.");
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
    readonly onSwitch?: ConversationEntryFailureProps["onSwitch"];
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
) =>
    conversationRowHeight(
        [notice(failure)],
        0,
        {
            surface: "chat",
            width,
            errorAssistance: { status: "ready" },
            failure: { current, actions, clock: CLOCK, ...(picked ? { target: picked } : {}) },
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
            () => <Row failure={signin(TARGETS)} onRetry={() => undefined} onSwitch={onSwitch} />,
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
            modeled(signin(TARGETS), width, { retry: true, newChat: false, switch: true }),
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
        fallbackProviders: [],
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
        modeled(tooLong, 720, { retry: true, newChat: true, switch: false }),
    );
});

it("opens the target list from the chevron, picks without switching, then switches", async () => {
    const view = createRenderer();
    const onSwitch = vi.fn();
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
                <Row failure={signin(TARGETS)} onRetry={() => undefined} onSwitch={onSwitch} />
            </div>
        ),
        { width: 720, height: 700 },
    );
    await view.ready();
    const split = view.$('[data-happy-desktop-ui="conversation-switch"]').element as HTMLElement;
    const chevron = split.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
    chevron.click();
    await expect
        .poll(() => document.querySelector('[data-happy-desktop-ui="conversation-switch-popup"]'))
        .not.toBeNull();
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    expect(chevron.dataset["open"]).toBe("");
    const popup = document.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="conversation-switch-popup"]',
    )!;
    // The model picker's own popup and rows, with group labels for two groups.
    expect(popup.classList.contains("happy-composer-model-control__popup")).toBe(true);
    expect(
        [...popup.querySelectorAll(".happy-composer-model-control__service-header")].map(
            (node) => node.textContent,
        ),
    ).toEqual(["Same model", "Other providers"]);
    const rows = [...popup.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    /* Read the words, not the check: an icon is a font glyph with a character of its own. */
    const words = (row: Element) =>
        [
            row.querySelector(".happy-composer-model-control__name")?.textContent,
            row.querySelector(".happy-composer-model-control__account-plan")?.textContent,
        ].join("");
    expect(rows.map(words)).toEqual([
        "claude_work · Opus 5.538% weekly used",
        "claude_extra · Opus 5.561% weekly used",
        "codex · GPT-6.1 Sol18% weekly used",
        "grok · Grok 4.7—",
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
            signin(TARGETS),
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
                <Row failure={signin(TARGETS)} onSwitch={() => undefined} />
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
        ...signin(TARGETS),
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
        ...signin([]),
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
                failure={signin(TARGETS)}
                onRetry={() => undefined}
                onSwitch={() => undefined}
            />
        ),
        { width: 720, height: 300 },
    );
    await view.ready();
    const card = view.$('[data-happy-desktop-ui="conversation-error-card"]').element as HTMLElement;
    expect(buttons(card).map((button) => button.text)).toEqual(["Ask Chief of Staff"]);
    expect(card.textContent).toContain("claude auth login");
    expect(card.getBoundingClientRect().height).toBe(
        modeled(signin(TARGETS), 720, { retry: false, newChat: false, switch: false }, false),
    );
});
