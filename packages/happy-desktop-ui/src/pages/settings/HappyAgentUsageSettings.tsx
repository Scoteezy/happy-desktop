import type {
    HappyAgentProviderModelTokenUsage,
    HappyAgentProviderTokenCounts,
    HappyAgentProviderUsageEntry,
    UserError,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { ComposerModelAccountUsageDetails } from "../../ComposerModelControl";
import { EmptyState } from "../../EmptyState";
import { happyAgentComposerModelUsageProject } from "../../happyAgentComposerModelControl";
import { providerAccountName } from "./providerAccountName";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentUsageSettingsProps {
    /** Every configured provider account, in the order they should be read. */
    providers: readonly HappyAgentUsageProviderRow[];
    /** True before the first reading arrives, so "no accounts" is not claimed early. */
    loading?: boolean;
    /** The reading itself failed; whatever was already read stays legible beneath it. */
    error?: UserError;
    /** Now, in milliseconds: resets and ages are told from it. Absent, no age is told. */
    currentTime?: number;
}

/** Usage joined to the authoritative provider catalog by its stable routing ID. */
export interface HappyAgentUsageProviderRow extends HappyAgentProviderUsageEntry {
    readonly name?: string;
    readonly typeName?: string;
}

/** The rolling windows a model's tokens are reported for, in the order they are read. */
const TOKEN_WINDOWS = [
    { key: "day", label: "day" },
    { key: "week", label: "week" },
    { key: "month", label: "month" },
] as const;

const TOKENS = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/**
 * The Usage category: how much of each provider account's plan is left, one
 * section per service and one row per account in it.
 *
 * An account reads the way the model menu's account list reads it: its name and
 * plan, the week and the session with when each starts over and the share left
 * as a number and a draining ring, then how current the numbers are. Under that,
 * one quiet line per model the account actually spent tokens on; a model with
 * nothing in any window is left out.
 *
 * It renders exactly what it is handed. It reads nothing and refreshes nothing:
 * the owner keeps the readings current for as long as this category is open.
 */
export function HappyAgentUsageSettings(props: HappyAgentUsageSettingsProps) {
    const providers = props.providers;
    // Without a clock, resets name their day and no age is told.
    const now = props.currentTime;
    const usage = happyAgentComposerModelUsageProject({ providers, loading: false }, now ?? 0);
    return (
        <>
            {props.error ? (
                <Banner tone="danger" title="Usage may be out of date">
                    {props.error.message}
                </Banner>
            ) : null}
            {providers.length === 0 ? (
                <EmptyState
                    animation={props.loading ? "snail" : undefined}
                    description={
                        props.loading
                            ? "Reading what this machine's provider accounts have spent."
                            : "Sign in to a coding assistant on this machine and its plan appears here."
                    }
                    icon={props.loading ? "clock" : "zap"}
                    title={props.loading ? "Loading usage…" : "No provider accounts"}
                />
            ) : (
                serviceGroups(providers).map((group) => (
                    <HappyAgentSettingsSection key={group.service} title={group.service}>
                        {group.accounts.map((provider) => {
                            const models = (provider.usage?.models ?? []).filter(modelUsed);
                            return (
                                <section
                                    className="happy-agent-usage-settings__account"
                                    data-happy-desktop-ui="happy-agent-usage-settings-provider"
                                    data-provider={provider.providerId}
                                    key={provider.providerId}
                                >
                                    <header className="happy-agent-usage-settings__account-header">
                                        <span
                                            className="happy-agent-usage-settings__name"
                                            data-happy-desktop-ui="happy-agent-usage-settings-provider-name"
                                        >
                                            {providerAccountName(
                                                provider.providerId,
                                                provider.name,
                                            )}
                                        </span>
                                        {provider.usage?.planName ? (
                                            <span className="happy-agent-usage-settings__plan">
                                                {provider.usage.planName}
                                            </span>
                                        ) : null}
                                    </header>
                                    {provider.error !== undefined ? (
                                        <p
                                            className="happy-agent-usage-settings__note"
                                            data-happy-desktop-ui="happy-agent-usage-settings-provider-error"
                                            data-note="error"
                                        >
                                            {provider.error}
                                        </p>
                                    ) : usage.has(provider.providerId) ? (
                                        <ComposerModelAccountUsageDetails
                                            className="happy-agent-usage-settings__details"
                                            now={now}
                                            usage={usage.get(provider.providerId)}
                                            windowsUniform
                                        />
                                    ) : (
                                        <p className="happy-agent-usage-settings__note">
                                            Not read yet
                                        </p>
                                    )}
                                    {models.length > 0 ? (
                                        <ul
                                            aria-label="Tokens by model"
                                            className="happy-agent-usage-settings__models"
                                        >
                                            {models.map((model) => (
                                                <li
                                                    className="happy-agent-usage-settings__model"
                                                    data-happy-desktop-ui="happy-agent-usage-settings-model"
                                                    key={model.modelId}
                                                >
                                                    <span className="happy-agent-usage-settings__model-id">
                                                        {model.modelId}
                                                    </span>
                                                    <span className="happy-agent-usage-settings__model-tokens">
                                                        {modelTokens(model)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </section>
                            );
                        })}
                    </HappyAgentSettingsSection>
                ))
            )}
        </>
    );
}

/** Accounts under their service, services in the order their first account is listed. */
function serviceGroups(providers: readonly HappyAgentUsageProviderRow[]) {
    const groups: { service: string; accounts: HappyAgentUsageProviderRow[] }[] = [];
    for (const provider of providers) {
        const service = provider.typeName ?? "Other";
        const group = groups.find((candidate) => candidate.service === service);
        if (group) group.accounts.push(provider);
        else groups.push({ service, accounts: [provider] });
    }
    return groups;
}

function tokensTotal(counts: HappyAgentProviderTokenCounts | undefined): number {
    if (counts === undefined) return 0;
    return (
        counts.inputTokens + counts.outputTokens + counts.cacheReadTokens + counts.cacheWriteTokens
    );
}

/** A model the account spent anything on, in any window. */
function modelUsed(model: HappyAgentProviderModelTokenUsage): boolean {
    return (
        tokensTotal(model.hour) +
            tokensTotal(model.day) +
            tokensTotal(model.week) +
            tokensTotal(model.month) >
        0
    );
}

/** "5.7M day · 37.4M week · 134.7M month", leaving out windows with nothing in them. */
function modelTokens(model: HappyAgentProviderModelTokenUsage): string {
    return TOKEN_WINDOWS.flatMap(({ key, label }) => {
        const total = tokensTotal(model[key]);
        return total > 0 ? [`${TOKENS.format(total)} ${label}`] : [];
    }).join(" · ");
}
