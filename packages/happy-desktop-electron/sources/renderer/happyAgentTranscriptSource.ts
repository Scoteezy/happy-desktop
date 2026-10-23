import type { HappyAgentChatTranscriptConnect, HappyAgentConnection } from "happy-desktop-state";

/**
 * Adapts one Happy Agent session subscription to the retained chat store.
 *
 * Reconnection, gap recovery, and transcript hydration belong to the shared
 * connection itself, and so does the answer history it has followed.
 */
export function happyAgentTranscriptConnectCreate(
    connection: HappyAgentConnection,
): HappyAgentChatTranscriptConnect {
    return (options) => {
        const session = connection.connectSession({
            sessionId: options.sessionId,
            onChange: (elements, state) =>
                options.onChange(elements, state, state.answeredUserInputs),
            onError: options.onError,
        });
        return {
            close: () => session.close(),
            loadMore: (token) => session.loadMore(token),
            followingSet: (following) => session.followingSet?.(following),
        };
    };
}
