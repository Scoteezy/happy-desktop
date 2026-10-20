import type { ReactNode } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
    type ConversationFailure,
    type ConversationFailureFallback,
    type ConversationFailureProvider,
    type ConversationRetrying,
} from "happy-desktop-state";
import {
    ComposerModelControl,
    type ComposerModelChoice,
    type ComposerModelService,
} from "../../src/ComposerModelControl";
import { ConversationView } from "../../src/ConversationView";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { conversationEntries } from "./happyAgentChatFixtures";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-023";

const noop = () => undefined;

/** The reviewed blueprints' frame, and the smallest window Happy allows. */
const windows = [
    { id: "reference", width: 856, height: 720 },
    { id: "minimum", width: 720, height: 640 },
] as const;

/* Reset times are told on a pinned viewer clock so the page is deterministic:
   the reader is in Los Angeles at 2:05 PM on 19 October 2026. */
const ZONE = { locale: "en-US", timeZone: "America/Los_Angeles" } as const;
const NOW = Date.UTC(2026, 9, 19, 21, 5);
const RESETS = Date.UTC(2026, 9, 19, 22, 40);
const CLOCK = { now: NOW, zone: ZONE };

const CLAUDE: ConversationFailureProvider = {
    id: "claude",
    type: "claude",
    vendorName: "Claude",
    label: "claude",
};

const fallback = (
    providerLabel: string,
    modelName: string,
    usedPercent: number,
    usageWindow: string,
    group: string,
): ConversationFailureFallback => ({
    providerId: providerLabel,
    providerLabel,
    modelId: modelName.toLowerCase().replaceAll(" ", "-"),
    modelName,
    usedPercent,
    usageWindow,
    group,
});
const SAME_MODEL = [
    fallback("claude_work", "Opus 5.5", 38, "weekly", "same_model"),
    fallback("claude_extra", "Opus 5.5", 61, "weekly", "same_model"),
];
const OTHER_PROVIDERS = [
    fallback("codex", "GPT-6.1 Sol", 18, "weekly", "other_provider"),
    fallback("grok", "Grok 4.7", 24, "monthly", "other_provider"),
];
const ALL = [...SAME_MODEL, ...OTHER_PROVIDERS];
const CODEX_KEY = `codex\u0000gpt-6.1-sol`;

const before = conversationEntries.slice(0, 3);
const failed = (failure: ConversationFailure): ConversationEntry => ({
    kind: "notice",
    id: "failed",
    sequence: "30",
    variant: "notice",
    level: "error",
    text: failure.message,
    failure,
});
const resetNotice: ConversationEntry = {
    kind: "notice",
    id: "reset",
    sequence: "29",
    text: "Context reset",
    variant: "configuration",
    level: "info",
};
const agentReply = conversationEntries[2] as Extract<ConversationEntry, { kind: "message" }>;
const continued: ConversationEntry = {
    ...agentReply,
    message: {
        ...agentReply.message,
        id: "continued",
        sequence: "50",
        changePts: "50",
        text: "Applied the blocking lock in `src/auth/refresh.ts`. The rotation test passes now.",
    },
};

const signinMissing = (fallbackProviders: readonly ConversationFailureFallback[]) =>
    failed({
        kind: "signin_missing",
        provider: CLAUDE,
        product: "Claude Code",
        command: "claude auth login",
        message: "Claude Code isn't signed in. Run `claude auth login`, then retry.",
        fallbackProviders,
    });
const usageLimit: ConversationFailure = {
    kind: "usage_limit",
    provider: CLAUDE,
    resetsAt: RESETS,
    message: "Claude usage limit reached.",
    fallbackProviders: ALL,
};
const noAccount = failed({
    kind: "no_account_available",
    poolName: "Claude pool",
    resetsAt: RESETS,
    message: "Every account in “Claude pool” is out of usage.",
    fallbackProviders: OTHER_PROVIDERS,
});

type Screen = {
    readonly id: string;
    readonly label: string;
    readonly entries: readonly ConversationEntry[];
    readonly running?: boolean;
    readonly retrying?: ConversationRetrying;
    readonly preview?: { readonly target?: string; readonly menu?: { readonly active?: string } };
};

const screens: readonly Screen[] = [
    {
        id: "signin-missing",
        label: "Sign-in missing · switching is primary",
        entries: [...before, signinMissing(ALL)],
    },
    {
        id: "signin-missing-no-switch",
        label: "Sign-in missing · no other account, Retry is primary",
        entries: [...before, signinMissing([])],
    },
    {
        id: "usage-limit",
        label: "Usage limit · preset to the first target",
        entries: [...before, failed(usageLimit)],
    },
    {
        id: "usage-limit-menu",
        label: "Usage limit · target list open, codex hovered",
        entries: [...before, failed(usageLimit)],
        preview: { menu: { active: CODEX_KEY } },
    },
    {
        id: "usage-limit-picked",
        label: "Usage limit · codex picked",
        entries: [...before, failed(usageLimit)],
        preview: { target: CODEX_KEY },
    },
    {
        id: "usage-limit-resolved",
        label: "Usage limit · switched, the card stays in history",
        entries: [
            ...before,
            failed({
                ...usageLimit,
                resolution: {
                    action: "switched",
                    at: NOW,
                    providerId: "claude_work",
                    providerLabel: "claude_work",
                    modelId: "opus-5.5",
                    modelName: "Opus 5.5",
                },
            }),
            continued,
        ],
    },
    {
        id: "no-account-available",
        label: "No account available · one group, no label",
        entries: [...before, noAccount],
    },
    {
        id: "no-account-available-menu",
        label: "No account available · target list open",
        entries: [...before, noAccount],
        preview: { menu: {} },
    },
    {
        id: "retrying",
        label: "Auto-retry · live attempt with Stop",
        entries: before,
        running: true,
        retrying: {
            kind: "provider_unavailable",
            attempt: 3,
            maxAttempts: 10,
            vendorName: "Claude",
        },
    },
    {
        id: "retries-exhausted",
        label: "Auto-retry · gave up",
        entries: [
            ...before,
            failed({
                kind: "provider_unavailable",
                provider: CLAUDE,
                message: "Claude is overloaded right now.",
                fallbackProviders: ALL,
            }),
        ],
    },
    {
        id: "context-resetting",
        label: "Context full · resetting, then retrying",
        entries: [...before, resetNotice],
        running: true,
        retrying: { kind: "context_too_long", attempt: 1, maxAttempts: 1, vendorName: "Claude" },
    },
    {
        id: "context-too-long",
        label: "Context too long · New chat on the message line",
        entries: [
            ...before,
            resetNotice,
            failed({
                kind: "context_too_long",
                modelId: "opus-5.5",
                modelName: "Opus 5.5",
                message: "This conversation is too long for Opus 5.5, even after a reset.",
                fallbackProviders: [],
            }),
        ],
    },
];

const OPUS: ComposerModelChoice = {
    id: "opus-5-5",
    label: "Opus 5.5",
    efforts: [{ id: "high", label: "High" }],
    effort: "high",
};
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "claude",
        label: "Claude",
        account: "claude",
        accounts: [{ id: "claude", label: "claude", default: true, models: [OPUS] }],
    },
];
const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "conversation-failure-flow",
    submission: { status: "idle" },
    text: "",
};

function conversation(screen: Screen): ReactNode {
    return (
        <ConversationView
            activityTreatment="focused"
            agentAuthor={agentAuthor}
            composer={COMPOSER}
            composerControls={
                <ComposerModelControl
                    onSelect={noop}
                    selection={{
                        service: "claude",
                        account: "claude",
                        model: "opus-5-5",
                        effort: "high",
                    }}
                    services={SERVICES}
                />
            }
            composerPlaceholder="Message Happy…"
            conversationId={screen.id}
            elapsedMs={41_000}
            entries={screen.entries}
            errorAssistance={[{ entryId: "failed", assistance: { status: "ready" } }]}
            failureActions={{ onNewChat: noop, onRetry: noop, onSwitch: noop }}
            failureClock={CLOCK}
            {...(screen.preview ? { failurePreview: screen.preview } : {})}
            motion="calm-typed"
            onAbort={noop}
            onComposerSend={noop}
            onComposerValueChange={noop}
            onErrorAssistanceRequest={noop}
            {...(screen.retrying ? { retrying: screen.retrying } : {})}
            running={screen.running ?? false}
            style={{ flex: "1 1 auto", minWidth: 0 }}
            subtitle="~/Developer/happy-agent"
            title="Token rotation race"
            viewerId={happyAgentOwnerAuthor.id}
            workingPhase="thinking"
        />
    );
}

export function ConversationFailureFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Failed turns as the client writes them from the failure's kind: the message with Retry or New chat after it, then the switch split button and Ask Chief of Staff. Reset times are told on the viewer's own clock; this page pins it to Los Angeles. Each viewport is named for `pnpm blueprint:screens`."
            title="Conversation failure flow"
        >
            {windows.flatMap((window) =>
                screens.map((screen, index) => {
                    const number = String(index + 1).padStart(2, "0");
                    return (
                        <FullScreenSpecimen
                            key={`${window.id}-${screen.id}`}
                            detail={`${String(window.width)} × ${String(window.height)} · ${window.id} window`}
                            label={screen.label}
                            number={number}
                            screen={`${number}-${screen.id}-${String(window.width)}x${String(window.height)}`}
                            window={window}
                        >
                            <ThemeScope mode="light">
                                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                                    {conversation(screen)}
                                </div>
                            </ThemeScope>
                        </FullScreenSpecimen>
                    );
                }),
            )}
        </ComponentPage>
    );
}
