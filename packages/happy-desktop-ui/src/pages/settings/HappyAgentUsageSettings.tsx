import type { HappyAgentProviderUsageEntry, UserError } from "happy-desktop-state";
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

/**
 * The Usage category: how much of each provider account's plan is left.
 *
 * Each account is read the way the model menu's account list reads it, which is
 * the native menu bar's presentation: the week and the session, each with when it
 * starts over and the share left as a number and a draining ring at the row's
 * end, then how current the numbers are. An account is a plain row
 * closed by a hairline; nothing is drawn around it.
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
                <HappyAgentSettingsSection
                    description={usageSubtitle(providers)}
                    title="Provider accounts"
                >
                    {providers.map((provider) => (
                        <section
                            className="happy-agent-usage-settings__account"
                            data-happy-desktop-ui="happy-agent-usage-settings-provider"
                            data-provider={provider.providerId}
                            key={provider.providerId}
                        >
                            <header className="happy-agent-usage-settings__account-header">
                                <span className="happy-agent-usage-settings__identity">
                                    <span
                                        className="happy-agent-usage-settings__name"
                                        data-happy-desktop-ui="happy-agent-usage-settings-provider-name"
                                    >
                                        {providerAccountName(provider.providerId, provider.name)}
                                    </span>
                                    <span className="happy-agent-usage-settings__plan">
                                        {[provider.typeName, provider.usage?.planName]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                </span>
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
                                />
                            ) : (
                                <p className="happy-agent-usage-settings__note">Not read yet</p>
                            )}
                        </section>
                    ))}
                </HappyAgentSettingsSection>
            )}
        </>
    );
}

/** How many accounts are listed, and how many of them are already spent. */
function usageSubtitle(providers: readonly HappyAgentProviderUsageEntry[]): string {
    const spent = providers.filter((provider) => provider.usage?.exhausted).length;
    const accounts = `${String(providers.length)} account${providers.length === 1 ? "" : "s"}`;
    return spent === 0 ? accounts : `${accounts} · ${String(spent)} spent`;
}
