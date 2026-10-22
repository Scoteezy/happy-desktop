import { describe, expect, it } from "vitest";
import { entriesMerge } from "../conversation/conversationEntries.js";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import type { MessageFailure } from "@slopus/happy-agent-client";
import { happyAgentFailureProject, happyAgentRetryingProject } from "./happyAgentFailureProject.js";
import type { HappyAgentModel, HappyAgentModelProvider } from "./happyAgentTypes.js";

const model = (id: string, name: string): HappyAgentModel => ({
    id,
    name,
    serviceTierOptions: [],
    thinkingLevels: [],
    defaultThinkingLevel: "high",
});
const provider = (id: string, type: string, name?: string): HappyAgentModelProvider => ({
    id,
    type,
    ...(name === undefined ? {} : { name }),
    models: [],
    enabled: true,
    hidden: false,
});
const CATALOG = {
    models: [model("anthropic/opus-5-5", "Opus 5.5"), model("openai/gpt-6.1-sol", "GPT-6.1 Sol")],
    providers: [provider("claude", "claude"), provider("claude_work", "claude", "Work account")],
};
const EMPTY = { models: [], providers: [] };

const usageLimit: MessageFailure = {
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
    it("carries the typed fields and never the targets an old daemon stored with the failure", () => {
        expect(happyAgentFailureProject(usageLimit, CATALOG)).toEqual({
            kind: "usage_limit",
            provider: { id: "claude", type: "claude", vendorName: "Claude", label: "claude" },
            resetsAt: 1_792_449_600_000,
            message: "Claude usage limit reached.",
        });
    });

    it("names a switch from the live catalog, and keeps an unknown action as handled", () => {
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
                CATALOG,
            ).resolution,
        ).toEqual({
            action: "switched",
            at: 5,
            providerId: "claude_work",
            providerLabel: "Work account",
            modelId: "anthropic/opus-5-5",
            modelName: "Opus 5.5",
        });
        // An account without a configured name, or one gone from the catalog, is its id.
        for (const providerId of ["claude", "codex"])
            expect(
                happyAgentFailureProject(
                    {
                        ...usageLimit,
                        resolution: { action: "switched", at: 5, providerId, modelId: "m" },
                    },
                    CATALOG,
                ).resolution,
            ).toEqual({
                action: "switched",
                at: 5,
                providerId,
                providerLabel: providerId,
                modelId: "m",
            });
        expect(
            happyAgentFailureProject(
                { ...usageLimit, resolution: { action: "retried", at: 6 } },
                EMPTY,
            ).resolution,
        ).toEqual({ action: "retried", at: 6 });
        expect(
            happyAgentFailureProject(
                { ...usageLimit, resolution: { action: "escalated", at: 7 } },
                EMPTY,
            ).resolution,
        ).toEqual({ action: "handled", at: 7 });
    });

    it("turns a kind newer than this client into unknown, which shows only the message", () => {
        expect(
            happyAgentFailureProject(
                { kind: "quota_paused", message: "Paused by the host.", fallbackProviders: [] },
                EMPTY,
            ),
        ).toEqual({ kind: "unknown", message: "Paused by the host." });
    });

    it("projects a known kind missing a field its card reads as unknown, never guessing it", () => {
        const malformed = (fields: Record<string, unknown>) =>
            happyAgentFailureProject(
                {
                    message: "The daemon's own sentence.",
                    fallbackProviders: [],
                    ...fields,
                } as unknown as MessageFailure,
                CATALOG,
            );
        const provider = usageLimit.kind === "usage_limit" ? usageLimit.provider : undefined;
        for (const fields of [
            // usage_limit without resetsAt must not read as "no reset time".
            { kind: "usage_limit", provider },
            { kind: "usage_limit", provider, resetsAt: "2026-10-19T22:40:00Z" },
            { kind: "usage_limit", resetsAt: null },
            { kind: "signin_missing", product: "Claude Code", command: "claude auth login" },
            { kind: "signin_missing", provider, command: "claude auth login" },
            { kind: "signin_missing", provider: { id: "claude" }, product: null, command: null },
            { kind: "no_account_available", resetsAt: null },
            { kind: "no_account_available", poolName: "Claude pool" },
            { kind: "rate_limited" },
            { kind: "context_too_long" },
            { kind: "internal" },
        ])
            expect(malformed(fields), JSON.stringify(fields)).toEqual({
                kind: "unknown",
                message: "The daemon's own sentence.",
            });
        // A well-formed one with a null reset time stays known.
        expect(malformed({ kind: "usage_limit", provider, resetsAt: null })).toMatchObject({
            kind: "usage_limit",
            resetsAt: null,
        });
    });

    it("reads an unnamed switch as handled", () => {
        const projected = happyAgentFailureProject(
            { ...usageLimit, resolution: { action: "switched", at: 3 } as never },
            CATALOG,
        );
        expect(projected.resolution).toEqual({ action: "handled", at: 3 });
    });

    it("names the overflowed model, falling back to its ID", () => {
        const tooLong: MessageFailure = {
            kind: "context_too_long",
            modelId: "anthropic/opus-5-5",
            message: "This conversation is too long for this model.",
            fallbackProviders: [],
        };
        expect(happyAgentFailureProject(tooLong, CATALOG)).toMatchObject({ modelName: "Opus 5.5" });
        expect(happyAgentFailureProject(tooLong, EMPTY)).not.toHaveProperty("modelName");
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
    const row = (failure: MessageFailure): ConversationEntry => ({
        kind: "notice",
        id: "failed",
        sequence: "1",
        variant: "notice",
        level: "error",
        text: failure.message,
        failure: happyAgentFailureProject(failure, CATALOG),
    });

    it("keeps an unchanged failure row, whatever targets it was stored with, and replaces one acted on", () => {
        const first = row(usageLimit);
        const [same] = entriesMerge([first], [row(usageLimit)]);
        expect(same).toBe(first);
        const [resolved] = entriesMerge(
            [first],
            [row({ ...usageLimit, resolution: { action: "retried", at: 9 } })],
        );
        expect(resolved).not.toBe(first);
        const [emptied] = entriesMerge([first], [row({ ...usageLimit, fallbackProviders: [] })]);
        expect(emptied).toBe(first);
    });
});
