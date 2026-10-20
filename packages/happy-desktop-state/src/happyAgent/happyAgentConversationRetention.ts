import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/**
 * How many of the conversations the reader has just left a workspace keeps,
 * so a window can keep their views mounted and going back to one shows it at
 * once instead of building its transcript again. The most recently left are
 * kept while they fit both limits; the rest are let go, oldest first.
 */
export interface HappyAgentConversationRetention {
    /** Conversations kept beside the one on screen. Zero keeps none. */
    readonly count: number;
    /**
     * What the kept conversations' views may hold together, in the unit the
     * host reports them in through `conversationViewSizeUpdate` — rendered
     * elements, for a window.
     */
    readonly size: number;
}

/**
 * The conversations a workspace keeps behind the open one. Only which ones:
 * a kept view shows its conversation as it was left, and is shown again from
 * the conversation as it is when it is opened.
 */
export interface HappyAgentRetainedConversationsSnapshot {
    /** The most recently left first. Never the conversation that is open. */
    readonly conversationIds: readonly HappyAgentSessionId[];
}

/** Changes only when a conversation is kept or let go, never as one streams. */
export interface HappyAgentRetainedConversationsStore {
    get(): HappyAgentRetainedConversationsSnapshot;
    subscribe(listener: () => void): () => void;
}

/**
 * The most conversations kept beside the open one, whatever the machine: eight
 * views in all.
 */
export const HAPPY_AGENT_CONVERSATIONS_RETAINED_MAX = 7;

/** Rendered elements kept views may hold together, per gigabyte the device reports. */
const RETAINED_ELEMENTS_PER_GIGABYTE = 6_000;

/** What a device that does not say how much memory it has is assumed to have. */
const DEVICE_MEMORY_UNKNOWN_GIGABYTES = 4;

/**
 * Keeps none: what a workspace does when its host gives no retention, which is
 * what tests and Blueprint want.
 */
export const HAPPY_AGENT_CONVERSATION_RETENTION_NONE: HappyAgentConversationRetention = {
    count: 0,
    size: 0,
};

const RETAINED_NONE: HappyAgentRetainedConversationsSnapshot = { conversationIds: [] };

/** The kept conversations of a workspace that keeps none, for Blueprint and tests. */
export const HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE: HappyAgentRetainedConversationsStore = {
    get: () => RETAINED_NONE,
    subscribe: () => () => undefined,
};

/**
 * The retention a device can afford, from the memory it reports in gigabytes
 * (`navigator.deviceMemory`, which Chromium rounds down to a power of two and
 * caps at 8). One view per gigabyte is kept mounted, the one on screen
 * included, between two and eight; and the hidden ones may hold 6,000 rendered
 * elements per gigabyte together, so a few heavy transcripts are let go before
 * many light ones would be.
 */
export function happyAgentConversationRetentionFor(
    deviceMemoryGigabytes: number | undefined,
): HappyAgentConversationRetention {
    const gigabytes =
        deviceMemoryGigabytes === undefined ||
        !Number.isFinite(deviceMemoryGigabytes) ||
        deviceMemoryGigabytes <= 0
            ? DEVICE_MEMORY_UNKNOWN_GIGABYTES
            : deviceMemoryGigabytes;
    const views = Math.min(
        HAPPY_AGENT_CONVERSATIONS_RETAINED_MAX + 1,
        Math.max(2, Math.floor(gigabytes)),
    );
    return {
        count: views - 1,
        size: Math.round(Math.min(8, Math.max(1, gigabytes)) * RETAINED_ELEMENTS_PER_GIGABYTE),
    };
}

/** Clamps a host-supplied retention to what a workspace may hold. */
export function happyAgentConversationRetentionNormalize(
    retention: HappyAgentConversationRetention | undefined,
): HappyAgentConversationRetention {
    if (retention === undefined) return HAPPY_AGENT_CONVERSATION_RETENTION_NONE;
    const count = Number.isFinite(retention.count) ? Math.floor(retention.count) : 0;
    const size = Number.isFinite(retention.size) ? retention.size : 0;
    return {
        count: Math.min(HAPPY_AGENT_CONVERSATIONS_RETAINED_MAX, Math.max(0, count)),
        size: Math.max(0, size),
    };
}
