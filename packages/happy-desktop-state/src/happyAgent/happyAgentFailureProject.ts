import type {
    ConversationFailure,
    ConversationFailureFallback,
    ConversationFailureKind,
    ConversationFailureResolution,
    ConversationRetrying,
} from "../conversation/conversationEntry.js";
import type { HappyAgentModel } from "./happyAgentTypes.js";

/*
 * Happy Agent's protocol 30 `MessageFailure` and `Agent.retrying`, mirrored
 * field for field until @slopus/happy-agent-client publishes them. When it
 * does, these declarations are replaced by imports of the package's own
 * `MessageFailure` and `Agent["retrying"]`, and nothing else here changes.
 */
export interface HappyAgentMessageFailureProvider {
    readonly id: string;
    readonly type: string;
    readonly vendorName: string;
    readonly label: string;
}
export interface HappyAgentMessageFailureFallback {
    readonly providerId: string;
    readonly providerLabel: string;
    readonly modelId: string;
    readonly usedPercent: number | null;
    readonly usageWindow: string | null;
    readonly group: string;
}
export type HappyAgentMessageFailureResolution =
    | { readonly action: "retried"; readonly at: number }
    | {
          readonly action: "switched";
          readonly at: number;
          readonly providerId: string;
          readonly modelId: string;
      }
    | { readonly action: string; readonly at: number };
interface HappyAgentMessageFailureBase {
    readonly message: string;
    readonly fallbackProviders: readonly HappyAgentMessageFailureFallback[];
    readonly resolution?: HappyAgentMessageFailureResolution;
}
export type HappyAgentKnownMessageFailure = HappyAgentMessageFailureBase &
    (
        | {
              readonly kind: "signin_missing";
              readonly provider: HappyAgentMessageFailureProvider;
              readonly product: string | null;
              readonly command: string | null;
          }
        | {
              readonly kind: "usage_limit";
              readonly provider: HappyAgentMessageFailureProvider;
              readonly resetsAt: number | null;
          }
        | {
              readonly kind: "no_account_available";
              readonly poolName: string;
              readonly resetsAt: number | null;
          }
        | {
              readonly kind:
                  | "rate_limited"
                  | "provider_unavailable"
                  | "network"
                  | "provider_disabled";
              readonly provider: HappyAgentMessageFailureProvider;
          }
        | { readonly kind: "context_too_long"; readonly modelId: string }
        | { readonly kind: "internal"; readonly detail: string }
    );
export type HappyAgentMessageFailure =
    | HappyAgentKnownMessageFailure
    | (HappyAgentMessageFailureBase & { readonly kind: string });
export interface HappyAgentRetrying {
    readonly attempt: number;
    readonly maxAttempts: number;
    readonly kind: string;
    readonly vendorName: string;
}

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

/*
 * The daemon is another process, so a known kind is trusted only when every
 * field its card reads is really there. A kind name alone is not enough: a
 * `usage_limit` without `resetsAt` would otherwise read as one with no reset
 * time. Anything malformed is projected as `unknown` and shows `message`.
 */
type Fields = Readonly<Record<string, unknown>>;
const isString = (value: unknown): value is string => typeof value === "string";
const isStringOrNull = (value: unknown) => value === null || isString(value);
const isTimeOrNull = (value: unknown) =>
    value === null || (typeof value === "number" && Number.isFinite(value));
const hasProvider = (fields: Fields) => {
    const provider = fields["provider"];
    if (typeof provider !== "object" || provider === null) return false;
    const named = provider as Fields;
    return (
        isString(named["id"]) &&
        isString(named["type"]) &&
        isString(named["vendorName"]) &&
        isString(named["label"])
    );
};

/** Whether a failure's kind is known and every field that kind's card reads is present. */
function knownMessageFailure(
    failure: HappyAgentMessageFailure,
): failure is HappyAgentKnownMessageFailure {
    if (!KNOWN_KINDS.has(failure.kind)) return false;
    const fields = failure as unknown as Fields;
    switch (failure.kind) {
        case "signin_missing":
            return (
                hasProvider(fields) &&
                isStringOrNull(fields["product"]) &&
                isStringOrNull(fields["command"])
            );
        case "usage_limit":
            return hasProvider(fields) && isTimeOrNull(fields["resetsAt"]);
        case "no_account_available":
            return isString(fields["poolName"]) && isTimeOrNull(fields["resetsAt"]);
        case "context_too_long":
            return isString(fields["modelId"]);
        case "internal":
            return isString(fields["detail"]);
        default:
            return hasProvider(fields);
    }
}

/** A switch target is offered only when everything it switches to is named. */
function fallbackValid(fallback: HappyAgentMessageFailureFallback): boolean {
    const fields = fallback as unknown as Fields;
    const used = fields["usedPercent"];
    return (
        isString(fields["providerId"]) &&
        isString(fields["providerLabel"]) &&
        isString(fields["modelId"]) &&
        isString(fields["group"]) &&
        (used === null || (typeof used === "number" && Number.isFinite(used))) &&
        isStringOrNull(fields["usageWindow"])
    );
}

function modelNameOf(models: readonly HappyAgentModel[], modelId: string): string | undefined {
    return models.find((model) => model.id === modelId)?.name;
}

function resolutionProject(
    resolution: HappyAgentMessageFailureResolution,
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
    failure: HappyAgentMessageFailure,
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
    if (!knownMessageFailure(failure)) return { ...base, kind: "unknown" };
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
    retrying: HappyAgentRetrying | null | undefined,
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
