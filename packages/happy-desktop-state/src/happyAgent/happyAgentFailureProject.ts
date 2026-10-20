import {
    isKnownMessageFailure,
    type AgentRetrying,
    type MessageFailure,
    type MessageFailureFallback,
    type MessageFailureResolution,
} from "@slopus/happy-agent-client";
import type {
    ConversationFailure,
    ConversationFailureFallback,
    ConversationFailureKind,
    ConversationFailureResolution,
    ConversationRetrying,
} from "../conversation/conversationEntry.js";
import type { HappyAgentModel } from "./happyAgentTypes.js";

const KNOWN_KINDS: ReadonlySet<string> = new Set<Exclude<ConversationFailureKind, "unknown">>([
    "signin_missing",
    "usage_limit",
    "no_account_available",
    "rate_limited",
    "provider_unavailable",
    "network",
    "context_too_long",
    "provider_disabled",
    "internal",
]);

const isString = (value: unknown): value is string => typeof value === "string";

/** A switch target is offered only when everything it switches to is named. */
function fallbackValid(fallback: MessageFailureFallback): boolean {
    const fields: Readonly<Record<string, unknown>> = fallback;
    const used = fields["usedPercent"];
    return (
        isString(fields["providerId"]) &&
        isString(fields["providerLabel"]) &&
        isString(fields["modelId"]) &&
        isString(fields["group"]) &&
        (used === null || (typeof used === "number" && Number.isFinite(used))) &&
        (fields["usageWindow"] === null || isString(fields["usageWindow"]))
    );
}

function modelNameOf(models: readonly HappyAgentModel[], modelId: string): string | undefined {
    return models.find((model) => model.id === modelId)?.name;
}

function resolutionProject(
    resolution: MessageFailureResolution,
    fallbacks: readonly ConversationFailureFallback[],
    models: readonly HappyAgentModel[],
): ConversationFailureResolution {
    if (resolution.action === "retried") return { action: "retried", at: resolution.at };
    if (
        resolution.action === "switched" &&
        "providerId" in resolution &&
        isString(resolution.providerId) &&
        isString(resolution.modelId)
    ) {
        const modelName = modelNameOf(models, resolution.modelId);
        return {
            action: "switched",
            at: resolution.at,
            providerId: resolution.providerId,
            // The switch was made to one of the failure's own targets, which name it.
            providerLabel:
                fallbacks.find((fallback) => fallback.providerId === resolution.providerId)
                    ?.providerLabel ?? resolution.providerId,
            modelId: resolution.modelId,
            ...(modelName === undefined ? {} : { modelName }),
        };
    }
    return { action: "handled", at: resolution.at };
}

/**
 * A failed turn's typed reason, as the transcript renders it: unknown kinds
 * and actions become explicit variants, and model IDs gain their catalog
 * names. Nothing here writes text.
 */
export function happyAgentFailureProject(
    failure: MessageFailure,
    models: readonly HappyAgentModel[],
): ConversationFailure {
    const fallbackProviders = (
        Array.isArray(failure.fallbackProviders) ? failure.fallbackProviders : []
    )
        .filter(fallbackValid)
        .map((fallback): ConversationFailureFallback => {
            const modelName = modelNameOf(models, fallback.modelId);
            return {
                providerId: fallback.providerId,
                providerLabel: fallback.providerLabel,
                modelId: fallback.modelId,
                ...(modelName === undefined ? {} : { modelName }),
                usedPercent: fallback.usedPercent,
                usageWindow: fallback.usageWindow,
                group: fallback.group,
            };
        });
    const base = {
        message: failure.message,
        fallbackProviders,
        ...(failure.resolution === undefined
            ? {}
            : { resolution: resolutionProject(failure.resolution, fallbackProviders, models) }),
    };
    /* The client checks every field the kind requires, so a malformed known
       kind, such as a `usage_limit` without `resetsAt`, is `unknown` and shows
       `message` rather than reading as a failure with no reset time. */
    if (!isKnownMessageFailure(failure)) return { ...base, kind: "unknown" };
    switch (failure.kind) {
        case "signin_missing":
            return {
                ...base,
                kind: failure.kind,
                provider: failure.provider,
                product: failure.product,
                command: failure.command,
            };
        case "usage_limit":
            return {
                ...base,
                kind: failure.kind,
                provider: failure.provider,
                resetsAt: failure.resetsAt,
            };
        case "no_account_available":
            return {
                ...base,
                kind: failure.kind,
                poolName: failure.poolName,
                resetsAt: failure.resetsAt,
            };
        case "rate_limited":
        case "provider_unavailable":
        case "network":
        case "provider_disabled":
            return { ...base, kind: failure.kind, provider: failure.provider };
        case "context_too_long": {
            const modelName = modelNameOf(models, failure.modelId);
            return {
                ...base,
                kind: failure.kind,
                modelId: failure.modelId,
                ...(modelName === undefined ? {} : { modelName }),
            };
        }
        case "internal":
            return { ...base, kind: failure.kind, detail: failure.detail };
    }
}

/** The live recovery on a turn; absent when none is running. */
export function happyAgentRetryingProject(
    retrying: AgentRetrying | null | undefined,
): ConversationRetrying | undefined {
    if (retrying === null || retrying === undefined) return undefined;
    return {
        attempt: retrying.attempt,
        maxAttempts: retrying.maxAttempts,
        kind: KNOWN_KINDS.has(retrying.kind)
            ? (retrying.kind as Exclude<ConversationFailureKind, "unknown">)
            : "unknown",
        vendorName: retrying.vendorName,
    };
}
