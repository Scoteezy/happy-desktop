import type {
    DaemonUsageResponse,
    HappyAgentClient,
    HappyAgentEvent,
    HappyAgentUpdate,
    ProviderAccountUsage,
    ProviderAccountUsageWindow,
    ProviderUsageEntry,
} from "@slopus/happy-agent-client";

/*
 * What protocol 29 adds to provider usage, declared here until
 * @slopus/happy-agent-client publishes it. Each declaration mirrors the
 * daemon's contract field for field, so moving onto the client's own types is
 * a rename followed by deleting this file.
 *
 * A protocol-29 daemon sends `refreshedAt`, `refreshError`, `retryAt`, and
 * `refreshing` on every usage entry, as explicit `null` or `false` when there
 * is nothing to say. A daemon that omits them is older: it has neither the
 * change event nor the refresh route.
 */

export interface ProviderUsageWindowWire extends ProviderAccountUsageWindow {
    /** When the vendor last reported this window. */
    capturedAt?: number;
}

export interface ProviderAccountUsageWire extends Omit<ProviderAccountUsage, "windows"> {
    windows: {
        fiveHour: ProviderUsageWindowWire | null;
        weekly: ProviderUsageWindowWire | null;
        monthly: ProviderUsageWindowWire | null;
        fableWeekly?: ProviderUsageWindowWire | null;
    };
}

/** The refresh state a protocol-29 entry and its change event both carry. */
export interface ProviderUsageFreshnessWire {
    /** The last successful reading; `checkedAt` stays the last attempt. */
    refreshedAt?: number | null;
    /** The last failure, kept even while an older reading is still served. */
    refreshError?: string | null;
    retryAt?: number | null;
    refreshing?: boolean;
}

export interface ProviderUsageEntryWire
    extends Omit<ProviderUsageEntry, "usage">, ProviderUsageFreshnessWire {
    usage: ProviderAccountUsageWire | null;
}

export interface DaemonUsageResponseWire extends Omit<DaemonUsageResponse, "providers"> {
    providers?: ProviderUsageEntryWire[];
}

/**
 * `provider.usage.updated`: one account's complete entry after any change to
 * it, without the configured `type`, `enabled`, and `models`, which change only
 * with `config.updated`. Each one replaces the last for its account.
 */
export interface ProviderUsageUpdatedPayload {
    providerId: string;
    usage: ProviderAccountUsageWire | null;
    checkedAt: number | null;
    error: string | null;
    refreshedAt: number | null;
    refreshError: string | null;
    retryAt: number | null;
    refreshing: boolean;
}

/** `POST /v0/usage/refresh`; omitted ids mean every account. */
export interface ProviderUsageRefreshRequest {
    providerIds?: string[];
    /** Accounts read more recently than this are skipped. Defaults to five minutes. */
    olderThanMs?: number;
}

/** The accounts whose refresh started; their results arrive only as change events. */
export interface ProviderUsageRefreshResponse {
    started: string[];
}

/** The client method protocol 29 adds, until the published client declares it. */
export interface ProviderUsageRefreshClient {
    refreshProviderUsage?(
        request?: ProviderUsageRefreshRequest,
        options?: { signal?: AbortSignal },
    ): Promise<ProviderUsageRefreshResponse>;
}

/** The event type, typed so it can be asked of the connection's event filter. */
export const PROVIDER_USAGE_UPDATED = "provider.usage.updated" as HappyAgentEvent["type"];

/** The account entry an update carries when it is a usage change. */
export function providerUsageUpdatedOf(
    update: HappyAgentUpdate,
): ProviderUsageUpdatedPayload | undefined {
    if (update.kind !== "event") return undefined;
    const event: { readonly type: string; readonly payload: unknown } = update.event;
    return event.type === PROVIDER_USAGE_UPDATED
        ? (event.payload as ProviderUsageUpdatedPayload)
        : undefined;
}

/** `POST /v0/usage/refresh`, or `undefined` while the client cannot send it. */
export function providerUsageRefresh(
    client: HappyAgentClient,
    request: ProviderUsageRefreshRequest,
): Promise<ProviderUsageRefreshResponse> | undefined {
    const refreshing: ProviderUsageRefreshClient = client as ProviderUsageRefreshClient;
    return refreshing.refreshProviderUsage?.(request);
}
