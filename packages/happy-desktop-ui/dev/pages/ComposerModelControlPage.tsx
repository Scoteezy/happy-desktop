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
        accounts: [{ id: "codex", label: "codex", models: CODEX_MODELS }],
    },
    {
        id: "claude",
        label: "Claude",
        account: "claude",
        accounts: [
            { id: "claude", label: "claude", models: CLAUDE_MODELS },
            { id: "claude_extra", label: "claude_extra", models: CLAUDE_MODELS },
        ],
    },
    {
        id: "grok",
        label: "Grok",
        account: "grok",
        accounts: [{ id: "grok", label: "grok", models: GROK_MODELS }],
    },
];

const ASTRA: ComposerModelSelection = {
    service: "codex",
    account: "codex",
    model: "gpt-6-astra",
    effort: "xhigh",
};

/* Usage as the provider-usage feed reports it; grok has no reading, so it reads unknown. */
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
            plan: "Max",
            windows: [
                { id: "fiveHour", label: "5h", usedPercent: 91, resets: "resets 2:35 PM" },
                { id: "weekly", label: "Weekly" },
            ],
        },
    ],
]);

/** A settled usage feed: it answers at once and holds nothing open. */
const usageWatch: ComposerModelUsageWatch = (listener) => {
    listener(USAGE);
    return () => undefined;
};

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
                  { id: "claude", label: "claude", models: [OPUS_5_5, OPUS_5] },
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
}) {
    const [selection, selectionSet] = useState(props.selection ?? ASTRA);
    return (
        <ComposerModelControl
            onSelect={selectionSet}
            preview={props.preview}
            selection={selection}
            services={props.services ?? SERVICES}
            usageWatch={usageWatch}
        />
    );
}

/** Pins the pill to the bottom-right corner, where the composer puts it, with room for its menu. */
function Anchor(props: { children: ReactNode; height?: number; width?: number }) {
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

const CODEX_ONLY = SERVICES.slice(0, 1);

function TransitFrame(props: {
    caption: string;
    selection?: ComposerModelSelection;
    transit?: number;
}) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Anchor height={200} width={376}>
                <Picker
                    preview={{
                        open: true,
                        activeModel: { service: "codex", model: "gpt-6-astra" },
                        transit: props.transit,
                    }}
                    selection={props.selection ?? { ...ASTRA, effort: "high" }}
                    services={CODEX_ONLY}
                />
            </Anchor>
            <span style={{ font: "500 12px var(--happy-font-ui)", color: "var(--text-secondary)" }}>
                {props.caption}
            </span>
        </div>
    );
}

function Hovered(props: { service: string; model: string }) {
    return (
        <Anchor>
            <Picker preview={{ open: true, activeModel: props }} />
        </Anchor>
    );
}

export function ComposerModelControlPage() {
    const [configured, configuredSet] = useState(false);
    const [selection, selectionSet] = useState(ASTRA);
    return (
        <ComponentPage
            number={componentNumber}
            title="Composer model control"
            summary="One flat menu: each service names its account, each model carries its own effort slider. Hover or focus reveals a row's slider; horizontal scroll slides its bubble."
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
                detail="Astra is chosen at Extra High. Other models show only their names."
                stage="surface"
            >
                <Anchor>
                    <Picker preview={{ open: true }} />
                </Anchor>
            </Specimen>
            <Specimen
                number="03"
                label="Hovered GPT-6 Sol"
                detail="Hovering Sol reveals its slider at its remembered effort. A dot or a scroll picks Sol at that effort."
                stage="surface"
            >
                <Hovered service="codex" model="gpt-6-sol" />
            </Specimen>
            <Specimen
                number="04"
                label="Hovered Opus 5.5"
                detail="A Claude row behaves exactly like a Codex row: hover shows its dots and effort."
                stage="surface"
            >
                <Hovered service="claude" model="opus-5-5" />
            </Specimen>
            <Specimen
                number="05"
                label="Hovered Fable 5.1"
                detail="Fable 5.1 runs Off to Maximum, so its slider has six holes."
                stage="surface"
            >
                <Hovered service="claude" model="fable-5-1" />
            </Specimen>
            <Specimen
                number="06"
                label="Hovered Grok 4.7"
                detail="Grok 4.7 runs Low to Extra High."
                stage="surface"
            >
                <Hovered service="grok" model="grok-4.7" />
            </Specimen>
            <Specimen
                number="07"
                label="Opus 5.5 selected"
                detail="Opus 5.5 on claude_extra carries the check, dots, and label; the Claude header names that account."
                stage="surface"
            >
                <Anchor>
                    <Picker
                        preview={{ open: true }}
                        selection={{
                            service: "claude",
                            account: "claude_extra",
                            model: "opus-5-5",
                            effort: "high",
                        }}
                    />
                </Anchor>
            </Specimen>
            <Specimen
                number="08"
                label="Keyboard focus"
                detail="A focused row shows its slider; Left and Right step its effort, Up and Down move between rows."
                stage="surface"
            >
                <Anchor>
                    <Picker
                        preview={{
                            open: true,
                            activeModel: { service: "grok", model: "grok-4.6" },
                            focusVisible: true,
                        }}
                    />
                </Anchor>
            </Specimen>
            <Specimen
                number="09"
                label="Bubble in transit"
                detail="Frozen frames of a scroll from High toward Extra High. The label changes only at the snap."
                stage="surface"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 24, width: 800 }}>
                    <TransitFrame caption="0% — at rest on High" />
                    <TransitFrame caption="35% — stretching toward Extra High" transit={0.35} />
                    <TransitFrame
                        caption="70% — head in the next hole, waist pinching"
                        transit={0.7}
                    />
                    <TransitFrame caption="Snapped — Extra High" selection={ASTRA} />
                    <TransitFrame caption="−50% — scrolling back toward Medium" transit={-0.5} />
                    <TransitFrame
                        caption="End stop — pressing past Maximum"
                        selection={{ ...ASTRA, effort: "max" }}
                        transit={0.6}
                    />
                </div>
            </Specimen>
            <Specimen
                number="10"
                label="Accounts"
                detail="The Claude header opens its accounts, claude and claude_extra, each with its plan. The hovered account shows its usage."
                stage="surface"
            >
                <Anchor width={640}>
                    <Picker preview={{ open: true, accounts: "claude", accountHover: "claude" }} />
                </Anchor>
            </Specimen>
            <Specimen
                number="11"
                label="Partly unknown usage"
                detail="A window the service has not reported reads unknown, never 0%. Near the limit the bar turns red."
                stage="surface"
            >
                <Anchor width={640}>
                    <Picker
                        preview={{ open: true, accounts: "claude", accountHover: "claude_extra" }}
                    />
                </Anchor>
            </Specimen>
            <Specimen
                number="12"
                label="Unknown usage"
                detail="An account with no usage reading at all."
                stage="surface"
            >
                <Anchor width={640}>
                    <Picker preview={{ open: true, accounts: "grok", accountHover: "grok" }} />
                </Anchor>
            </Specimen>
            <Specimen
                number="13"
                label="Account without the model"
                detail="Fable 5.1 runs on claude_extra. The claude account has no Fable 5.1, so it says so and cannot be picked instead of silently swapping models."
                stage="surface"
            >
                <Anchor width={640}>
                    <Picker
                        preview={{ open: true, accounts: "claude", accountHover: "claude" }}
                        selection={{
                            service: "claude",
                            account: "claude_extra",
                            model: "fable-5-1",
                            effort: "medium",
                        }}
                        services={PARTIAL_SERVICES}
                    />
                </Anchor>
            </Specimen>
            <Specimen
                number="14"
                label="Model without efforts"
                detail="A made-up model with no effort levels: no slider, no label, and the pill names only the model."
                stage="surface"
            >
                <Anchor height={560}>
                    <Picker
                        preview={{ open: true }}
                        selection={{ service: "local", account: "local", model: "echo-1" }}
                        services={NO_EFFORT_SERVICES}
                    />
                </Anchor>
            </Specimen>
            <Specimen
                number="15"
                label="Effort off"
                detail="Fable 5.1 supports Off, so its slider starts with an Off hole."
                stage="surface"
            >
                <Anchor>
                    <Picker
                        preview={{ open: true }}
                        selection={{
                            service: "claude",
                            account: "claude",
                            model: "fable-5-1",
                            effort: "off",
                        }}
                    />
                </Anchor>
            </Specimen>
            <Specimen
                number="16"
                label="Long catalog"
                detail="The menu stops at 480 px and scrolls; the benchmarks link stays in view."
                stage="surface"
            >
                <Anchor height={560}>
                    <Picker preview={{ open: true }} services={LONG_SERVICES} />
                </Anchor>
            </Specimen>
            <Specimen
                number="17"
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
                number="18"
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
