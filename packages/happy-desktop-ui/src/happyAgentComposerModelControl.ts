import {
    happyAgentChiefOfStaffRequestText,
    happyAgentServiceName,
    type HappyAgentChiefOfStaffRequest,
    type HappyAgentMenusSnapshot,
    type HappyAgentModelOption,
    type HappyAgentModelSelection,
    type HappyAgentProviderUsageReading,
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
    ComposerModelUsage,
    ComposerModelUsageWatch,
    ComposerModelUsageWindow,
} from "./ComposerModelControl";
import { localClockTime, localDayTime, localWeekdayShort } from "./localTime";

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
    const accountName = menus.currentOption?.providerName ?? menus.currentProviderId;
    return {
        kind: "unavailable",
        explanation:
            menus.currentAccount === "disabled"
                ? `The ${accountName} account is switched off, so nothing is sent to it.`
                : `The ${accountName} account is no longer configured on this Happy Agent.`,
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
                label: happyAgentServiceName(option.providerType),
                account: option.providerId,
                accounts: [],
            };
            services.push(service);
        }
        let account = service.accounts.find((candidate) => candidate.id === option.providerId);
        if (account === undefined) {
            account = {
                id: option.providerId,
                label: option.providerName ?? option.providerId,
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
    resets: (at: number) => string,
): ComposerModelUsageWindow {
    return {
        id,
        label,
        ...(window === undefined ? {} : { usedPercent: window.usedPercent }),
        ...(window?.resetsAt === undefined ? {} : { resets: resets(window.resetsAt) }),
        ...(window?.capturedAt === undefined ? {} : { capturedAt: window.capturedAt }),
    };
}

/**
 * When a spent account can be used again: the latest reset among the windows
 * that are full, since the account stays blocked until every one of them has
 * started over. An account the vendor blocked with no full window waits on
 * its fullest one.
 */
function limitResetsAt(reading: HappyAgentProviderUsageReading): number | undefined {
    const windows = [reading.fiveHour, reading.weekly, reading.monthly].filter(
        (window): window is HappyAgentProviderUsageWindow => window !== undefined,
    );
    const full = windows.filter((window) => window.usedPercent >= 100);
    const blocking =
        full.length > 0
            ? full
            : [...windows].sort((left, right) => right.usedPercent - left.usedPercent).slice(0, 1);
    const resets = blocking.flatMap((window) =>
        window.resetsAt === undefined ? [] : [window.resetsAt],
    );
    return resets.length === 0 ? undefined : Math.max(...resets);
}

/**
 * Plan windows and their freshness per provider account. An account with no
 * plan reading is left unknown, unless it is being read or its read failed,
 * which the picker says beneath the unknown bar.
 */
export function happyAgentComposerModelUsageProject(
    snapshot: HappyAgentProviderUsageSnapshot,
    now: number,
): ReadonlyMap<string, ComposerModelAccountUsage> {
    const usage = new Map<string, ComposerModelAccountUsage>();
    for (const entry of snapshot.providers) {
        const reading = entry.usage;
        const hasPlan =
            reading !== undefined &&
            (reading.fiveHour !== undefined ||
                reading.weekly !== undefined ||
                reading.planName !== undefined);
        // A daemon before protocol 29 says when its reading was taken, not
        // when the account was last read; that is the closest it can tell.
        const updatedAt = entry.refreshedAt ?? (hasPlan ? reading.capturedAt : undefined);
        // Before protocol 29 the daemon's own failed read is the only failure there is.
        const refreshError = entry.refreshError ?? entry.error;
        if (!hasPlan && !entry.refreshing && refreshError === undefined) continue;
        const limitResets =
            hasPlan && reading.exhausted === true ? limitResetsAt(reading) : undefined;
        usage.set(entry.providerId, {
            ...(reading?.planName === undefined ? {} : { plan: reading.planName }),
            windows: hasPlan
                ? [
                      usageWindow(
                          "fiveHour",
                          "5h",
                          reading.fiveHour,
                          (at) => `resets ${localClockTime(at)}`,
                      ),
                      usageWindow(
                          "weekly",
                          "Weekly",
                          reading.weekly,
                          (at) => `resets ${localWeekdayShort(at)} ${localClockTime(at)}`,
                      ),
                  ]
                : [],
            ...(updatedAt === undefined ? {} : { updatedAt }),
            ...(entry.refreshing ? { refreshing: true } : {}),
            ...(refreshError === undefined ? {} : { refreshError }),
            ...(hasPlan && reading.exhausted === true
                ? {
                      limit:
                          limitResets === undefined
                              ? {}
                              : { resets: localDayTime(limitResets, now) },
                  }
                : {}),
        });
    }
    return usage;
}

/** Ages are told again this often while the menu is open, so "3 min ago" keeps counting. */
const USAGE_AGE_TICK_MS = 15_000;

/**
 * Feeds the picker's accounts from the provider-usage store. The picker holds
 * the subscription while its menu is open: the store answers at once with the
 * reading it already holds, follows the daemon's changes, and passes the
 * picker's refresh requests on to the daemon.
 */
export function happyAgentComposerModelUsageWatch(
    store: HappyAgentProviderUsageStore,
): ComposerModelUsageWatch {
    return {
        subscribe(listener) {
            let last: HappyAgentProviderUsageSnapshot | undefined;
            let usage: ComposerModelUsage | undefined;
            const emit = () => {
                const snapshot = store.get();
                if (snapshot === last) return;
                last = snapshot;
                const now = Date.now();
                usage = { accounts: happyAgentComposerModelUsageProject(snapshot, now), now };
                listener(usage);
            };
            const tick = () => {
                if (usage === undefined) return;
                usage = { accounts: usage.accounts, now: Date.now() };
                listener(usage);
            };
            const unsubscribe = store.subscribe(emit);
            emit();
            const timer = setInterval(tick, USAGE_AGE_TICK_MS);
            return () => {
                clearInterval(timer);
                unsubscribe();
            };
        },
        refresh: (accounts) => store.usageRefresh(accounts),
    };
}
