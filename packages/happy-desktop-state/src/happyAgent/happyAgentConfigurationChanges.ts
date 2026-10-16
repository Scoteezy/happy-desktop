import type { ConfigurationBlock } from "@slopus/happy-agent-client";
import type { HappyAgentModel } from "./happyAgentTypes.js";
import { happyAgentPermissionLabel } from "./happyAgentSupport.js";

const EFFORT_LABELS: Readonly<Record<string, string>> = {
    none: "None",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra high",
    max: "Maximum",
    ultra: "Ultra",
};

/** Only durable execution identity decides a switch; the current catalog names models only. */
export function happyAgentConfigurationChanges(
    configuration: ConfigurationBlock,
    models: readonly HappyAgentModel[],
): readonly {
    readonly field: "model" | "account" | "provider" | "effort" | "permissions" | "speed";
    readonly text: string;
}[] {
    const { before, after } = configuration;
    if (before === null) return [];
    const changes: {
        field: "model" | "account" | "provider" | "effort" | "permissions" | "speed";
        text: string;
    }[] = [];
    const modelName = (id: string): string => models.find((model) => model.id === id)?.name ?? id;
    const speedName = (modelId: string, tier: string | null): string =>
        models
            .find((model) => model.id === modelId)
            ?.serviceTierOptions.find((option) => option.id === tier)?.label ??
        (tier === null ? "Default" : tier === "fast" ? "Fast" : tier);
    if (before.modelId !== after.modelId)
        changes.push({
            field: "model",
            text: `Model ${modelName(before.modelId)} → ${modelName(after.modelId)}`,
        });
    const sameFamily =
        before.providerType !== undefined && before.providerType === after.providerType;
    if (sameFamily && before.account && after.account && before.account.id !== after.account.id) {
        changes.push({
            field: "account",
            text:
                before.account.label && after.account.label
                    ? `Account ${before.account.label} → ${after.account.label}`
                    : "Account changed",
        });
    } else if (before.providerId !== after.providerId) {
        // Route IDs are authoritative even if family/account identity was withheld.
        changes.push({
            field: "provider",
            text: `Provider selection changed: ${before.providerId} → ${after.providerId}`,
        });
    }
    if (before.effort !== after.effort)
        changes.push({
            field: "effort",
            text: `Effort ${EFFORT_LABELS[before.effort] ?? before.effort} → ${EFFORT_LABELS[after.effort] ?? after.effort}`,
        });
    if (before.permissionMode !== after.permissionMode)
        changes.push({
            field: "permissions",
            text: `Permissions ${happyAgentPermissionLabel(before.permissionMode)} → ${happyAgentPermissionLabel(after.permissionMode)}`,
        });
    if (before.serviceTier !== after.serviceTier)
        changes.push({
            field: "speed",
            text: `Speed ${speedName(before.modelId, before.serviceTier)} → ${speedName(after.modelId, after.serviceTier)}`,
        });
    return changes;
}
