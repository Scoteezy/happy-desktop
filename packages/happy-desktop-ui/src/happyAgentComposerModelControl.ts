import {
    happyAgentChiefOfStaffRequestText,
    type HappyAgentChiefOfStaffRequest,
    type HappyAgentMenusSnapshot,
    type HappyAgentModelOption,
    type HappyAgentModelSelection,
    type HappyAgentProviderUsageSnapshot,
    type HappyAgentProviderUsageStore,
    type HappyAgentProviderUsageWindow,
    type HappyAgentSessionId,
    type HappyAgentThinkingLevel,
} from "happy-desktop-state";
import type {
    ComposerModelAccount,
    ComposerModelAccountNotice,
    ComposerModelAccountUsage,
    ComposerModelChoice,
    ComposerModelControlProps,
    ComposerModelService,
    ComposerModelUsageWatch,
    ComposerModelUsageWindow,
} from "./ComposerModelControl";

/** Display names for the provider types the daemon configures. */
const SERVICE_NAMES: Readonly<Record<string, string>> = {
    bedrock: "Bedrock",
    claude: "Claude",
    codex: "Codex",
    grok: "Grok",
};

/** A type without a known display name is shown as the configured key, titled. */
function serviceName(type: string): string {
    return (
        SERVICE_NAMES[type] ??
        type
            .split(/[_-]/)
            .filter(Boolean)
            .map((part) => part[0]!.toUpperCase() + part.slice(1))
            .join(" ")
    );
}

function choiceOf(option: HappyAgentModelOption): ComposerModelChoice {
    return {
        id: option.modelId,
        label: option.name,
        efforts: option.efforts.map((effort) => ({ id: effort.level, label: effort.label })),
        effort: option.rememberedEffort ?? option.defaultEffort,
        disabled: option.disabled,
    };
}

/**
 * The notice beside the pill for a selection whose account is not an ordinary
 * choice. An unavailable one carries the exact request it would hand the
 * Chief of Staff, so the reader sees it before asking.
 */
function accountNoticeOf(
    menus: HappyAgentMenusSnapshot,
    sessionId: HappyAgentSessionId | undefined,
    ask: ((request: HappyAgentChiefOfStaffRequest) => Promise<void>) | undefined,
): ComposerModelAccountNotice | undefined {
    if (menus.currentAccount === "hidden") return { kind: "hidden" };
    if (menus.currentAccount === "available" || ask === undefined) return undefined;
    const request: HappyAgentChiefOfStaffRequest = {
        kind: "accountUnavailable",
        providerId: menus.currentProviderId,
        modelId: menus.currentModelId,
        reason: menus.currentAccount,
        ...(sessionId === undefined ? {} : { sessionId }),
    };
    return {
        kind: "unavailable",
        explanation:
            menus.currentAccount === "disabled"
                ? `The ${menus.currentProviderId} account is switched off, so nothing is sent to it.`
                : `The ${menus.currentProviderId} account is no longer configured on this Happy Agent.`,
        request: happyAgentChiefOfStaffRequestText(request),
        onAsk: () => ask(request),
    };
}

/**
 * Maps a session menu snapshot into props for the shared composer model pill.
 *
 * Providers sharing a configured type are accounts of one service, listed in
 * catalog order. The service holding the current model opens on that model's
 * provider; any other service opens on its first account. A hidden account is
 * not listed, but a selection on it stays, named beside a grey notice; one
 * that is switched off or gone gets a red notice that can ask the Chief of
 * Staff for help.
 */
export function happyAgentComposerModelControlProps(
    menus: HappyAgentMenusSnapshot,
    handlers: {
        readonly onModelChange: (selection: HappyAgentModelSelection) => void;
        readonly onEffortChange: (effort?: HappyAgentThinkingLevel) => void;
        readonly disabled?: boolean;
        readonly usageWatch?: ComposerModelUsageWatch;
        /** The conversation the pill belongs to; absent before it is started. */
        readonly sessionId?: HappyAgentSessionId;
        /** Adds a request to the Chief of Staff's draft and opens it. Nothing is sent. */
        readonly onChiefOfStaffAsk?: (request: HappyAgentChiefOfStaffRequest) => Promise<void>;
    },
): ComposerModelControlProps {
    const services: (ComposerModelService & { accounts: ComposerModelAccount[] })[] = [];
    for (const option of menus.modelOptions) {
        let service = services.find((candidate) => candidate.id === option.providerType);
        if (service === undefined) {
            service = {
                id: option.providerType,
                label: serviceName(option.providerType),
                account: option.providerId,
                accounts: [],
            };
            services.push(service);
        }
        let account = service.accounts.find((candidate) => candidate.id === option.providerId);
        if (account === undefined) {
            account = {
                id: option.providerId,
                label: option.providerId,
                // The provider configured under its type's own id is that service's default account.
                ...(option.providerId === option.providerType ? { default: true } : {}),
                models: [],
            };
            service.accounts.push(account);
        }
        if (option.providerId === menus.currentProviderId) service.account = option.providerId;
        account.models = [...account.models, choiceOf(option)];
    }
    const listed = menus.modelOptions.some(
        (option) =>
            option.providerId === menus.currentProviderId &&
            option.modelId === menus.currentModelId,
    );
    const current = menus.currentOption;
    const accountNotice = accountNoticeOf(menus, handlers.sessionId, handlers.onChiefOfStaffAsk);
    const ask = handlers.onChiefOfStaffAsk;
    return {
        disabled: handlers.disabled,
        services,
        ...(current === undefined || listed ? {} : { selectionModel: choiceOf(current) }),
        ...(accountNotice === undefined ? {} : { accountNotice }),
        ...(ask === undefined ? {} : { onAccountsManage: () => ask({ kind: "accountsManage" }) }),
        selection: {
            service: current?.providerType ?? menus.currentProviderId,
            account: menus.currentProviderId,
            model: menus.currentModelId,
            effort: menus.currentEffort ?? current?.defaultEffort,
        },
        usageWatch: handlers.usageWatch,
        onSelect: (selection) => {
            const effort = [...menus.modelOptions, ...(current === undefined ? [] : [current])]
                .find(
                    (option) =>
                        option.providerId === selection.account &&
                        option.modelId === selection.model,
                )
                ?.efforts.find((candidate) => candidate.level === selection.effort)?.level;
            if (
                selection.account === menus.currentProviderId &&
                selection.model === menus.currentModelId
            )
                handlers.onEffortChange(effort);
            else
                handlers.onModelChange({
                    providerId: selection.account,
                    modelId: selection.model,
                    ...(effort !== undefined ? { effort } : {}),
                });
        },
    };
}

function usageWindow(
    id: string,
    label: string,
    window: HappyAgentProviderUsageWindow | undefined,
    resets: (at: Date) => string,
): ComposerModelUsageWindow {
    return {
        id,
        label,
        ...(window === undefined ? {} : { usedPercent: window.usedPercent }),
        ...(window?.resetsAt === undefined ? {} : { resets: resets(new Date(window.resetsAt)) }),
    };
}

function clockTime(at: Date): string {
    return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Plan windows per provider account; an account with no plan reading is left unknown. */
function usageProject(
    snapshot: HappyAgentProviderUsageSnapshot,
): ReadonlyMap<string, ComposerModelAccountUsage> {
    const usage = new Map<string, ComposerModelAccountUsage>();
    for (const entry of snapshot.providers) {
        const reading = entry.usage;
        if (
            reading === undefined ||
            (reading.fiveHour === undefined &&
                reading.weekly === undefined &&
                reading.planName === undefined)
        )
            continue;
        usage.set(entry.providerId, {
            ...(reading.planName === undefined ? {} : { plan: reading.planName }),
            windows: [
                usageWindow("fiveHour", "5h", reading.fiveHour, (at) => `resets ${clockTime(at)}`),
                usageWindow(
                    "weekly",
                    "Weekly",
                    reading.weekly,
                    (at) =>
                        `resets ${at.toLocaleDateString([], { weekday: "short" })} ${clockTime(at)}`,
                ),
            ],
        });
    }
    return usage;
}

/**
 * Feeds the picker's accounts from the provider-usage store. The picker holds
 * the subscription while its menu is open: the store answers at once with the
 * reading it already holds and re-reads the daemon only once that is stale.
 */
export function happyAgentComposerModelUsageWatch(
    store: HappyAgentProviderUsageStore,
): ComposerModelUsageWatch {
    return (listener) => {
        let last: HappyAgentProviderUsageSnapshot | undefined;
        const emit = () => {
            const snapshot = store.get();
            if (snapshot === last) return;
            last = snapshot;
            listener(usageProject(snapshot));
        };
        const unsubscribe = store.subscribe(emit);
        emit();
        return unsubscribe;
    };
}
