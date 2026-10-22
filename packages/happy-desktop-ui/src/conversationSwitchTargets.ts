import {
    composerModelAccountModel,
    type ComposerModelAccountUsage,
    type ComposerModelControlProps,
    type ComposerModelUsage,
    type ComposerModelUsageWatch,
} from "./ComposerModelControl";

/**
 * Where a failure card's switch reads its choices: the same services,
 * selection, and usage watch the conversation's model picker is given, so the
 * two never disagree about which accounts there are or how much each has left.
 */
export type ConversationSwitchSource = Pick<
    ComposerModelControlProps,
    "services" | "selection" | "usageWatch"
>;

/** One account a failed turn can continue on, with the model it would continue on there. */
export interface ConversationSwitchTarget {
    /** The service the account belongs to, which the list groups by. */
    readonly service: string;
    readonly serviceLabel: string;
    readonly providerId: string;
    /** The account's name, as the picker names it. */
    readonly providerLabel: string;
    readonly modelId: string;
    readonly modelName: string;
    /** The account's live usage; absent while it has no reading. */
    readonly usage?: ComposerModelAccountUsage;
}

/**
 * Every account besides the selected one, each on the model the picker would
 * move to on it: the selected model where the account offers it, otherwise its
 * top model. The selected service comes first, then the others in catalog
 * order, accounts in the order the picker lists them.
 */
export function conversationSwitchTargets(
    source: ConversationSwitchSource,
    usage: ComposerModelUsage | undefined,
): readonly ConversationSwitchTarget[] {
    const selection = source.selection;
    const services = [
        ...source.services.filter((service) => service.id === selection?.service),
        ...source.services.filter((service) => service.id !== selection?.service),
    ];
    return services.flatMap((service) =>
        service.accounts.flatMap((account): ConversationSwitchTarget[] => {
            if (account.id === selection?.account) return [];
            const model = composerModelAccountModel(account, selection?.model);
            if (model === undefined) return [];
            const accountUsage = usage?.accounts.get(account.id);
            return [
                {
                    service: service.id,
                    serviceLabel: service.label,
                    providerId: account.id,
                    providerLabel: account.label,
                    modelId: model.id,
                    modelName: model.label,
                    ...(accountUsage === undefined ? {} : { usage: accountUsage }),
                },
            ];
        }),
    );
}

/** Whether an account cannot be used until a window starts over. */
function blocked(usage: ComposerModelAccountUsage | undefined): boolean {
    return (
        usage?.limit !== undefined ||
        [usage?.week, usage?.session].some((window) => (window?.usedPercent ?? 0) >= 100)
    );
}

/**
 * The target the main button offers before another is picked: an account that
 * is not spent, on the failed turn's own service before any other, one with a
 * reading before one without, and then the one with the most of its week left.
 * Ties keep list order. When every account is spent, the first.
 */
export function conversationSwitchTargetPreferred(
    targets: readonly ConversationSwitchTarget[],
    selectedService: string | undefined,
): ConversationSwitchTarget | undefined {
    const rank = (target: ConversationSwitchTarget): readonly number[] => {
        const window = target.usage?.week ?? target.usage?.session;
        return [
            blocked(target.usage) ? 1 : 0,
            target.service === selectedService ? 0 : 1,
            window === undefined ? 1 : 0,
            window?.usedPercent ?? 0,
        ];
    };
    let best: { target: ConversationSwitchTarget; rank: readonly number[] } | undefined;
    for (const target of targets) {
        const candidate = { target, rank: rank(target) };
        if (best === undefined) best = candidate;
        else {
            const at = candidate.rank.findIndex((value, index) => value !== best!.rank[index]);
            if (at >= 0 && candidate.rank[at]! < best.rank[at]!) best = candidate;
        }
    }
    return best?.target;
}

/** A source of usage React can read: one watch, held while anything renders from it. */
interface ConversationSwitchUsageFeed {
    subscribe(listener: () => void): () => void;
    get(): ComposerModelUsage | undefined;
}

const feeds = new WeakMap<ComposerModelUsageWatch, ConversationSwitchUsageFeed>();

/** Reads nothing, for a conversation with no failure offering a switch. */
export const CONVERSATION_SWITCH_USAGE_NONE: ConversationSwitchUsageFeed = {
    subscribe: () => () => undefined,
    get: () => undefined,
};

/**
 * The picker's usage watch as an external store. The watch is held exactly
 * while something subscribes, so its owner follows usage only while a failure
 * card that offers a switch is on screen, and one feed per watch keeps every
 * reader on the same subscription.
 */
export function conversationSwitchUsageFeed(
    watch: ComposerModelUsageWatch,
): ConversationSwitchUsageFeed {
    const known = feeds.get(watch);
    if (known !== undefined) return known;
    const listeners = new Set<() => void>();
    let usage: ComposerModelUsage | undefined;
    let release: (() => void) | undefined;
    const feed: ConversationSwitchUsageFeed = {
        subscribe(listener) {
            listeners.add(listener);
            release ??= watch.subscribe((next) => {
                usage = next;
                for (const notify of listeners) notify();
            });
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                release?.();
                release = undefined;
                usage = undefined;
            };
        },
        get: () => usage,
    };
    feeds.set(watch, feed);
    return feed;
}
