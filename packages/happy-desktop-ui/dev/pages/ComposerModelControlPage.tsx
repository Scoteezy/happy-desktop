import { useState, type ReactNode } from "react";
import { Button } from "../../src/Button";
import { Composer } from "../../src/Composer";
import {
    ComposerModelControl,
    type ComposerModelAccountUsage,
    type ComposerModelChoice,
    type ComposerModelControlPreview,
    type ComposerModelEffort,
    type ComposerModelSelection,
    type ComposerModelService,
    type ComposerModelUsageWatch,
} from "../../src/ComposerModelControl";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-145";

const EFFORT_LABELS = {
    off: "Off",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
    max: "Maximum",
} as const;

function efforts(...ids: (keyof typeof EFFORT_LABELS)[]): readonly ComposerModelEffort[] {
    return ids.map((id) => ({ id, label: EFFORT_LABELS[id] }));
}

const CODEX_MODELS: readonly ComposerModelChoice[] = [
    {
        id: "gpt-6-astra",
        label: "GPT-6 Astra",
        efforts: efforts("low", "medium", "high", "xhigh", "max"),
        effort: "medium",
    },
    {
        id: "gpt-6-sol",
        label: "GPT-6 Sol",
        efforts: efforts("minimal", "low", "medium", "high", "xhigh"),
        effort: "high",
    },
    {
        id: "gpt-6-luna",
        label: "GPT-6 Luna",
        efforts: efforts("low", "medium", "high"),
        effort: "medium",
    },
];

const OPUS_5_5: ComposerModelChoice = {
    id: "opus-5-5",
    label: "Opus 5.5",
    efforts: efforts("low", "medium", "high", "xhigh", "max"),
    effort: "high",
};
const FABLE_5_1: ComposerModelChoice = {
    id: "fable-5-1",
    label: "Fable 5.1",
    efforts: efforts("off", "low", "medium", "high", "xhigh", "max"),
    effort: "medium",
};
const OPUS_5: ComposerModelChoice = {
    id: "opus-5",
    label: "Opus 5",
    efforts: efforts("off", "low", "medium", "high", "xhigh", "max"),
    effort: "high",
};
const CLAUDE_MODELS = [OPUS_5_5, FABLE_5_1, OPUS_5];

const GROK_MODELS: readonly ComposerModelChoice[] = [
    {
        id: "grok-4.7",
        label: "Grok 4.7",
        efforts: efforts("low", "medium", "high", "xhigh"),
        effort: "medium",
    },
    {
        id: "grok-4.6",
        label: "Grok 4.6",
        efforts: efforts("low", "medium", "high", "xhigh"),
        effort: "medium",
    },
];

/* Accounts are provider ids grouped by their configured type, as the adapter builds them. */
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "codex",
        label: "Codex",
        account: "codex",
        accounts: [{ id: "codex", label: "codex", default: true, models: CODEX_MODELS }],
    },
    {
        id: "claude",
        label: "Claude",
        account: "claude",
        accounts: [
            { id: "claude", label: "claude", default: true, models: CLAUDE_MODELS },
            { id: "claude_extra", label: "claude_extra", models: CLAUDE_MODELS },
        ],
    },
    {
        id: "grok",
        label: "Grok",
        account: "grok",
        accounts: [
            { id: "grok", label: "grok", default: true, models: GROK_MODELS },
            { id: "grok_api", label: "grok_api", models: GROK_MODELS },
        ],
    },
];

const ASTRA: ComposerModelSelection = {
    service: "codex",
    account: "codex",
    model: "gpt-6-astra",
    effort: "xhigh",
};

/*
 * Usage as the provider-usage feed reports it. A full login (codex, claude)
 * reports its plan; claude_extra runs on a `claude setup-token` token, which
 * cannot read the plan, so its 5h and weekly windows come from rate-limit
 * headers and it has no plan. grok has no reading and grok_api, an API key,
 * has no usage API at all, so both read unknown.
 */
const USAGE: ReadonlyMap<string, ComposerModelAccountUsage> = new Map([
    [
        "codex",
        {
            plan: "Pro",
            windows: [
                { id: "fiveHour", label: "5h", usedPercent: 42, resets: "resets 4:10 PM" },
                { id: "weekly", label: "Weekly", usedPercent: 18, resets: "resets Mon 9:00 AM" },
            ],
        },
    ],
    [
        "claude",
        {
            plan: "Max",
            windows: [
                { id: "fiveHour", label: "5h", usedPercent: 12, resets: "resets 5:50 PM" },
                { id: "weekly", label: "Weekly", usedPercent: 64, resets: "resets Thu 8:00 PM" },
            ],
        },
    ],
    [
        "claude_extra",
        {
            windows: [
                { id: "fiveHour", label: "5h", usedPercent: 91, resets: "resets 2:35 PM" },
                { id: "weekly", label: "Weekly", usedPercent: 37, resets: "resets Fri 6:00 AM" },
            ],
        },
    ],
]);

/**
 * A usage feed holding a reading from earlier in the session: it answers at
 * once, as the provider-usage store does with its held reading, and holds
 * nothing open.
 */
function heldUsage(usage: ReadonlyMap<string, ComposerModelAccountUsage>): ComposerModelUsageWatch {
    return (listener) => {
        listener(usage);
        return () => undefined;
    };
}

const usageWatch = heldUsage(USAGE);

const LONG_SERVICES: readonly ComposerModelService[] = [
    ...SERVICES,
    {
        id: "openrouter",
        label: "OpenRouter",
        account: "openrouter",
        accounts: [
            {
                id: "openrouter",
                label: "openrouter",
                default: true,
                models: [
                    "DeepSeek V4",
                    "Qwen 4 Max",
                    "Kimi K3",
                    "GLM 5",
                    "Mistral Large 3",
                    "Llama 5 405B",
                    "Gemini 3 Pro",
                    "Gemini 3 Flash",
                    "Command A+",
                    "Nova Premier 2",
                ].map((label) => ({
                    id: label.toLowerCase().replaceAll(" ", "-"),
                    label,
                    efforts: efforts("low", "medium", "high"),
                    effort: "medium",
                })),
            },
        ],
    },
];

/** Every real model has efforts; this invented one shows the case where a model has none. */
const NO_EFFORT_SERVICES: readonly ComposerModelService[] = [
    ...SERVICES,
    {
        id: "local",
        label: "Local",
        account: "local",
        accounts: [
            {
                id: "local",
                label: "local",
                default: true,
                models: [{ id: "echo-1", label: "Echo 1", efforts: [] }],
            },
        ],
    },
];

/** An invented split: the claude account lacks Fable 5.1 that claude_extra offers. */
const PARTIAL_SERVICES: readonly ComposerModelService[] = SERVICES.map((service) =>
    service.id === "claude"
        ? {
              ...service,
              account: "claude_extra",
              accounts: [
                  { id: "claude", label: "claude", default: true, models: [OPUS_5_5, OPUS_5] },
                  { id: "claude_extra", label: "claude_extra", models: CLAUDE_MODELS },
              ],
          }
        : service,
);

/** A live picker over fixture data; the preview only seeds its transient state. */
function Picker(props: {
    preview?: ComposerModelControlPreview;
    selection?: ComposerModelSelection;
    services?: readonly ComposerModelService[];
    usageWatch?: ComposerModelUsageWatch;
}) {
    const [selection, selectionSet] = useState(props.selection ?? ASTRA);
    return (
        <ComposerModelControl
            onSelect={selectionSet}
            preview={props.preview}
            selection={selection}
            services={props.services ?? SERVICES}
            usageWatch={props.usageWatch ?? usageWatch}
        />
    );
}

/** Pins the pill to the bottom-right corner, where the composer puts it, with room for its menu. */
function Anchor(props: { children: ReactNode; height?: number; width?: number | string }) {
    return (
        <div
            style={{
                display: "flex",
                width: props.width ?? 400,
                height: props.height ?? 480,
                alignItems: "flex-end",
                justifyContent: "flex-end",
            }}
        >
            {props.children}
        </div>
    );
}

function Open(props: {
    preview?: ComposerModelControlPreview;
    selection?: ComposerModelSelection;
    services?: readonly ComposerModelService[];
    usageWatch?: ComposerModelUsageWatch;
    height?: number;
    width?: number | string;
}) {
    return (
        <Anchor height={props.height} width={props.width}>
            <Picker
                preview={{ open: true, ...props.preview }}
                selection={props.selection}
                services={props.services}
                usageWatch={props.usageWatch}
            />
        </Anchor>
    );
}

const OPUS_MEDIUM: ComposerModelSelection = {
    service: "claude",
    account: "claude",
    model: "opus-5-5",
    effort: "medium",
};

const OPUS_EXTRA: ComposerModelSelection = { ...OPUS_MEDIUM, account: "claude_extra" };

export function ComposerModelControlPage() {
    const [configured, configuredSet] = useState(false);
    const [selection, selectionSet] = useState(ASTRA);
    return (
        <ComponentPage
            number={componentNumber}
            title="Composer model control"
            summary="One flat menu on one left edge: each service names its account, and each model names its effort when it is chosen, hovered, or focused, with a check right after the chosen label. The effort opens a small list; the account opens a panel beside the menu."
        >
            <Specimen
                number="01"
                label="Closed"
                detail="The pill names the model and its effort."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 800 }}>
                    <Composer
                        mentions={[]}
                        modelControl={<Picker />}
                        onAttachmentsSelect={() => undefined}
                        onSend={() => undefined}
                        onValueChange={() => undefined}
                        placeholder="Message Happy…"
                        value=""
                    />
                </div>
            </Specimen>
            <Specimen
                number="02"
                label="Open"
                detail="Astra is chosen at Extra High: its check follows its name, and the chosen row always names its effort. Each service's own account reads Default account."
                stage="surface"
            >
                <Open />
            </Specimen>
            <Specimen
                number="03"
                label="Hovered row"
                detail="Sol, hovered below the selected Astra, names its remembered effort. The two highlights keep a gap."
                stage="surface"
            >
                <Open preview={{ activeModel: { service: "codex", model: "gpt-6-sol" } }} />
            </Specimen>
            <Specimen
                number="04"
                label="Effort button hovered"
                detail="Pointing at Sol's effort highlights just that button, the way a project's settings gear does in the sidebar."
                stage="surface"
            >
                <Open
                    preview={{
                        activeModel: { service: "codex", model: "gpt-6-sol" },
                        effortHover: true,
                    }}
                />
            </Specimen>
            <Specimen
                number="05"
                label="Effort list open"
                detail="Clicking Extra High lists Astra's efforts, the check after the current one. Picking one applies it and closes the menu."
                stage="surface"
            >
                <Open preview={{ efforts: { service: "codex", model: "gpt-6-astra" } }} />
            </Specimen>
            <Specimen
                number="06"
                label="Account panel opening right"
                detail="Clicking Claude's account opens its accounts in a panel beside the menu, level with the header. There is room to the right, so it opens there."
                stage="surface"
            >
                <Open preview={{ accounts: "claude", accountHover: "claude" }} />
            </Specimen>
            <Specimen
                number="07"
                label="Account panel opening left"
                detail="Near the window's right edge there is no room beside the menu, so the same panel opens to its left."
                stage="surface"
            >
                <Open preview={{ accounts: "claude", accountHover: "claude" }} width="100%" />
            </Specimen>
            <Specimen
                number="08"
                label="Default account and a named one"
                detail="Codex runs on its own account, which reads Default account. Claude runs on claude_extra, which reads by its id. Headers never show a plan; plans live in the account panel."
                stage="surface"
            >
                <Open selection={OPUS_EXTRA} />
            </Specimen>
            <Specimen
                number="09"
                label="Cached usage shown instantly"
                detail="The panel shows the reading held from earlier in the session at once and refreshes it in the background once it is a minute old. Every account has a plan cell: the full claude login reports Max."
                stage="surface"
            >
                <Open preview={{ accounts: "claude", accountHover: "claude" }} />
            </Specimen>
            <Specimen
                number="10"
                label="Usage without a plan"
                detail="claude_extra runs on a setup token: its 5h and weekly usage are real, read from rate-limit headers, but it cannot see its plan, so its plan cell reads a muted dash."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude_extra" }}
                    selection={OPUS_EXTRA}
                />
            </Specimen>
            <Specimen
                number="11"
                label="API-key account without usage"
                detail="grok_api is an API key, and the Grok API has no usage endpoint: its plan cell reads a dash and its usage reads unknown, never 0%. The grok CLI account reports no plan either."
                stage="surface"
            >
                <Open preview={{ accounts: "grok", accountHover: "grok_api" }} />
            </Specimen>
            <Specimen
                number="12"
                label="Account without the model"
                detail="Fable 5.1 runs on claude_extra. The default account has no Fable 5.1, so it says so and cannot be picked instead of silently swapping models."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude" }}
                    selection={{
                        service: "claude",
                        account: "claude_extra",
                        model: "fable-5-1",
                        effort: "medium",
                    }}
                    services={PARTIAL_SERVICES}
                />
            </Specimen>
            <Specimen
                number="13"
                label="Long catalog"
                detail="The menu stops at 480 px and scrolls. The scrollbar stands beside the rows, the panel inset away from the selected row, and the benchmarks link stays in view."
                stage="surface"
            >
                <Open height={560} services={LONG_SERVICES} />
            </Specimen>
            <Specimen
                number="14"
                label="Keyboard focus"
                detail="A focused row names its effort and rings inside its own highlight. Left and Right step the effort; Up and Down move."
                stage="surface"
            >
                <Open
                    preview={{
                        activeModel: { service: "grok", model: "grok-4.6" },
                        focusVisible: true,
                    }}
                />
            </Specimen>
            <Specimen
                number="15"
                label="Header focus above a hovered row"
                detail="The reported dark-theme case in the composer: keyboard focus on Codex's account above a hovered, selected GPT-6 Astra. Nothing touches."
                stage="surface"
            >
                <div
                    className="happy-theme-dark"
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        width: 800,
                        height: 520,
                        padding: 16,
                        background: "var(--surface-high)",
                    }}
                >
                    <Composer
                        mentions={[]}
                        modelControl={
                            <Picker
                                preview={{
                                    open: true,
                                    activeModel: { service: "codex", model: "gpt-6-astra" },
                                    accountFocus: "codex",
                                }}
                            />
                        }
                        onAttachmentsSelect={() => undefined}
                        onSend={() => undefined}
                        onValueChange={() => undefined}
                        placeholder="Message Happy…"
                        value=""
                    />
                </div>
            </Specimen>
            <Specimen
                number="16"
                label="Model without efforts"
                detail="A made-up model with no effort levels names no effort, and the pill names only the model."
                stage="surface"
            >
                <Open
                    height={560}
                    selection={{ service: "local", account: "local", model: "echo-1" }}
                    services={NO_EFFORT_SERVICES}
                />
            </Specimen>
            <Specimen
                number="17"
                label="Swipe effort"
                detail="Horizontal scroll over a row steps its effort one level per flick and selects it; the menu stays open."
                stage="surface"
            >
                <Open
                    preview={{ activeModel: { service: "claude", model: "opus-5-5" } }}
                    selection={OPUS_MEDIUM}
                />
            </Specimen>
            <Specimen
                number="18"
                label="Swipe account"
                detail="Horizontal scroll over a header steps its account and moves the selected model onto it."
                stage="surface"
            >
                <Open selection={OPUS_MEDIUM} />
            </Specimen>
            <Specimen
                number="19"
                label="Models not configured"
                detail="An empty node may still report a default model and effort. Neither is presented as a usable configuration."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 800 }}>
                    <Composer
                        disabled
                        mentions={[]}
                        modelControl={
                            <ComposerModelControl
                                selection={{
                                    service: "bedrock",
                                    account: "bedrock",
                                    model: "openai/gpt-5.6-sol",
                                }}
                                services={[]}
                            />
                        }
                        onAttachmentsSelect={() => undefined}
                        onSend={() => undefined}
                        onValueChange={() => undefined}
                        placeholder="Configure models to start messaging…"
                        value=""
                    />
                </div>
            </Specimen>
            <Specimen
                number="20"
                label="Catalog changes"
                detail="Adding models enables the picker. Removing all models closes it immediately."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 560, gap: 16 }}>
                    <Button onClick={() => configuredSet(!configured)}>
                        {configured ? "Remove configured models" : "Configure models"}
                    </Button>
                    <Anchor width={560}>
                        <ComposerModelControl
                            onSelect={selectionSet}
                            selection={selection}
                            services={configured ? SERVICES : []}
                        />
                    </Anchor>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
