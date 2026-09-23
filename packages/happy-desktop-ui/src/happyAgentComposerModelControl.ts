import type {
    HappyAgentMenusSnapshot,
    HappyAgentModelSelection,
    HappyAgentProviderUsageSnapshot,
    HappyAgentProviderUsageStore,
    HappyAgentProviderUsageWindow,
    HappyAgentThinkingLevel,
} from "happy-desktop-state";
import type {
    ComposerModelAccount,
    ComposerModelAccountUsage,
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

/**
 * Maps a session menu snapshot into props for the shared composer model pill.
 *
 * Providers sharing a configured type are accounts of one service, listed in
 * catalog order. The service holding the current model opens on that model's
 * provider; any other service opens on its first account.
 */
export function happyAgentComposerModelControlProps(
    menus: HappyAgentMenusSnapshot,
    handlers: {
        readonly onModelChange: (selection: HappyAgentModelSelection) => void;
        readonly onEffortChange: (effort?: HappyAgentThinkingLevel) => void;
        readonly disabled?: boolean;
        readonly usageWatch?: ComposerModelUsageWatch;
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
            account = { id: option.providerId, label: option.providerId, models: [] };
            service.accounts.push(account);
        }
        if (option.providerId === menus.currentProviderId) service.account = option.providerId;
        account.models = [
            ...account.models,
            {
                id: option.modelId,
                label: option.name,
                efforts: option.efforts.map((effort) => ({
                    id: effort.level,
                    label: effort.label,
                })),
                effort: option.rememberedEffort ?? option.defaultEffort,
                disabled: option.disabled,
            },
        ];
    }
    const current = menus.modelOptions.find(
        (option) =>
            option.providerId === menus.currentProviderId &&
            option.modelId === menus.currentModelId,
    );
    return {
        disabled: handlers.disabled,
        services,
        selection: {
            service: current?.providerType ?? menus.currentProviderId,
            account: menus.currentProviderId,
            model: menus.currentModelId,
            effort: menus.currentEffort ?? current?.defaultEffort,
        },
        usageWatch: handlers.usageWatch,
        onSelect: (selection) => {
            const effort = menus.modelOptions
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
 * Feeds the picker's account submenu from the provider-usage store. Subscribing
 * is what starts the daemon reads, and the picker holds the subscription only
 * while its account submenu is open.
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
