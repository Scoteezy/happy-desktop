import { expect, it } from "vitest";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChatStoreCreate } from "./happyAgentChatStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/* Whether the reader follows the newest content belongs to the reader, not to
 * one transcript connection: it carries over to every connection the store opens. */

it("tells each transcript connection whether its reader follows the newest content", () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const reported: boolean[][] = [];
    const store = happyAgentChatStoreCreate("agent-a" as HappyAgentSessionId, {
        catalog: happyAgentModelCatalogProject(daemon.configGet()),
        transcriptConnect: () => {
            const connection: boolean[] = [];
            reported.push(connection);
            return {
                close: () => undefined,
                loadMore: () => undefined,
                followingSet: (following) => connection.push(following),
            };
        },
        connectActions: {} as never,
        connectMutationSubscribe: () => () => undefined,
    });

    // Said before anything reads, it reaches the first connection as it opens.
    store.historyFollowingSet(true);
    const unsubscribe = store.subscribe(() => undefined);
    expect(reported).toEqual([[true]]);
    store.historyFollowingSet(false);
    expect(reported).toEqual([[true, false]]);

    // A connection opened again starts from where the reader last was.
    unsubscribe();
    const again = store.subscribe(() => undefined);
    expect(reported).toEqual([[true, false], [false]]);
    again();
});
