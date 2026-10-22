import {
    isKnownMessageFailure,
    type AgentRetrying,
    type MessageFailure,
    type MessageFailureResolution,
} from "@slopus/happy-agent-client";
import type {
    ConversationFailure,
    ConversationFailureKind,
    ConversationFailureResolution,
    ConversationRetrying,
} from "../conversation/conversationEntry.js";
import type { HappyAgentModel, HappyAgentModelProvider } from "./happyAgentTypes.js";

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

function modelNameOf(models: readonly HappyAgentModel[], modelId: string): string | undefined {
    return models.find((model) => model.id === modelId)?.name;
}

function resolutionProject(
    resolution: MessageFailureResolution,
    catalog: FailureCatalog,
): ConversationFailureResolution {
    if (resolution.action === "retried") return { action: "retried", at: resolution.at };
    if (
        resolution.action === "switched" &&
        "providerId" in resolution &&
        isString(resolution.providerId) &&
        isString(resolution.modelId)
    ) {
        const modelName = modelNameOf(catalog.models, resolution.modelId);
        return {
            action: "switched",
            at: resolution.at,
            providerId: resolution.providerId,
            providerLabel:
                catalog.providers.find((provider) => provider.id === resolution.providerId)?.name ??
                resolution.providerId,
            modelId: resolution.modelId,
            ...(modelName === undefined ? {} : { modelName }),
        };
    }
    return { action: "handled", at: resolution.at };
}

/** The live catalog a failure's model and account IDs are named from. */
export interface FailureCatalog {
    readonly models: readonly HappyAgentModel[];
    readonly providers: readonly HappyAgentModelProvider[];
}

/**
 * A failed turn's typed reason, as the transcript renders it: unknown kinds
 * and actions become explicit variants, and model and account IDs gain their
 * live catalog names. Nothing here writes text.
 *
 * The failure's own `fallbackProviders` is never read: what a card can switch
 * to is the live catalog and usage the model picker reads, not a list taken
 * when the turn failed. A daemon from protocol 32 sends it empty.
 */
export function happyAgentFailureProject(
    failure: MessageFailure,
    catalog: FailureCatalog,
): ConversationFailure {
    const base = {
        message: failure.message,
        ...(failure.resolution === undefined
            ? {}
            : { resolution: resolutionProject(failure.resolution, catalog) }),
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
            const modelName = modelNameOf(catalog.models, failure.modelId);
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
