import { describe, expect, it } from "vitest";
import { entriesMerge } from "../conversation/conversationEntries.js";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import {
    happyAgentFailureProject,
    happyAgentRetryingProject,
    type HappyAgentMessageFailure,
} from "./happyAgentFailureProject.js";
import type { HappyAgentModel } from "./happyAgentTypes.js";

const model = (id: string, name: string): HappyAgentModel => ({
    id,
    name,
    serviceTierOptions: [],
    thinkingLevels: [],
    defaultThinkingLevel: "high",
});
const MODELS = [
    model("anthropic/opus-5-5", "Opus 5.5"),
    model("openai/gpt-6.1-sol", "GPT-6.1 Sol"),
];

const usageLimit: HappyAgentMessageFailure = {
    kind: "usage_limit",
    provider: { id: "claude", type: "claude", vendorName: "Claude", label: "claude" },
    resetsAt: 1_792_449_600_000,
    message: "Claude usage limit reached.",
    fallbackProviders: [
        {
            providerId: "claude_work",
            providerLabel: "claude_work",
            modelId: "anthropic/opus-5-5",
            usedPercent: 38,
            usageWindow: "weekly",
            group: "same_model",
        },
        {
            providerId: "codex",
            providerLabel: "codex",
            modelId: "openai/gpt-6.1-sol",
            usedPercent: null,
            usageWindow: null,
            group: "a_future_group",
        },
    ],
};

describe("happyAgentFailureProject", () => {
    it("carries the typed fields and names each target's model from the catalog", () => {
        expect(happyAgentFailureProject(usageLimit, MODELS)).toEqual({
            kind: "usage_limit",
            provider: { id: "claude", type: "claude", vendorName: "Claude", label: "claude" },
            resetsAt: 1_792_449_600_000,
            message: "Claude usage limit reached.",
            fallbackProviders: [
                {
                    providerId: "claude_work",
                    providerLabel: "claude_work",
                    modelId: "anthropic/opus-5-5",
                    modelName: "Opus 5.5",
                    usedPercent: 38,
                    usageWindow: "weekly",
                    group: "same_model",
                },
                {
                    providerId: "codex",
                    providerLabel: "codex",
                    modelId: "openai/gpt-6.1-sol",
                    modelName: "GPT-6.1 Sol",
                    usedPercent: null,
                    usageWindow: null,
                    group: "a_future_group",
                },
            ],
        });
    });

    it("names a switch by its target's label, and keeps an unknown action as handled", () => {
        expect(
            happyAgentFailureProject(
                {
                    ...usageLimit,
                    resolution: {
                        action: "switched",
                        at: 5,
                        providerId: "claude_work",
                        modelId: "anthropic/opus-5-5",
                    },
                },
                MODELS,
            ).resolution,
        ).toEqual({
            action: "switched",
            at: 5,
            providerId: "claude_work",
            providerLabel: "claude_work",
            modelId: "anthropic/opus-5-5",
            modelName: "Opus 5.5",
        });
        expect(
            happyAgentFailureProject(
                { ...usageLimit, resolution: { action: "retried", at: 6 } },
                [],
            ).resolution,
        ).toEqual({ action: "retried", at: 6 });
        expect(
            happyAgentFailureProject(
                { ...usageLimit, resolution: { action: "escalated", at: 7 } },
                [],
            ).resolution,
        ).toEqual({ action: "handled", at: 7 });
    });

    it("turns a kind newer than this client into unknown, which shows only the message", () => {
        expect(
            happyAgentFailureProject(
                { kind: "quota_paused", message: "Paused by the host.", fallbackProviders: [] },
                [],
            ),
        ).toEqual({ kind: "unknown", message: "Paused by the host.", fallbackProviders: [] });
    });

    it("names the overflowed model, falling back to its ID", () => {
        const tooLong: HappyAgentMessageFailure = {
            kind: "context_too_long",
            modelId: "anthropic/opus-5-5",
            message: "",
            fallbackProviders: [],
        };
        expect(happyAgentFailureProject(tooLong, MODELS)).toMatchObject({ modelName: "Opus 5.5" });
        expect(happyAgentFailureProject(tooLong, [])).not.toHaveProperty("modelName");
    });
});

describe("happyAgentRetryingProject", () => {
    it("is absent when no recovery runs, and closes unknown kinds", () => {
        expect(happyAgentRetryingProject(null)).toBeUndefined();
        expect(happyAgentRetryingProject(undefined)).toBeUndefined();
        expect(
            happyAgentRetryingProject({
                attempt: 3,
                maxAttempts: 10,
                kind: "provider_unavailable",
                vendorName: "Claude",
            }),
        ).toEqual({
            attempt: 3,
            maxAttempts: 10,
            kind: "provider_unavailable",
            vendorName: "Claude",
        });
        expect(
            happyAgentRetryingProject({
                attempt: 1,
                maxAttempts: 2,
                kind: "brand_new",
                vendorName: "Grok",
            })?.kind,
        ).toBe("unknown");
    });
});

describe("failure rows in entriesMerge", () => {
    const row = (failure: HappyAgentMessageFailure): ConversationEntry => ({
        kind: "notice",
        id: "failed",
        sequence: "1",
        variant: "notice",
        level: "error",
        text: failure.message,
        failure: happyAgentFailureProject(failure, MODELS),
    });

    it("keeps an unchanged failure row and replaces one that was acted on", () => {
        const first = row(usageLimit);
        const [same] = entriesMerge([first], [row(usageLimit)]);
        expect(same).toBe(first);
        const [resolved] = entriesMerge(
            [first],
            [row({ ...usageLimit, resolution: { action: "retried", at: 9 } })],
        );
        expect(resolved).not.toBe(first);
        const [usage] = entriesMerge(
            [first],
            [
                row({
                    ...usageLimit,
                    fallbackProviders: [{ ...usageLimit.fallbackProviders[0]!, usedPercent: 41 }],
                }),
            ],
        );
        expect(usage).not.toBe(first);
    });
});
