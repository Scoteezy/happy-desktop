import { beforeEach, describe, expect, it, onTestFinished } from "vitest";
import { appearanceStoreCreate, happyAgentSettingsStoreCreate } from "happy-desktop-state";
import type { AppHappyAgentDirectoryStore } from "../../sources/AppHappyAgentView";
import { happyAgentHistoryCreate } from "../../sources/navigation/happyAgentHistory";
import {
    happyAgentRouterArtifactClose,
    happyAgentRouterCreate,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/**
 * Back on an artifact returns the reader to wherever it was opened from: the
 * Artifacts list in the sidebar, or the chat whose right bar listed it. A
 * window opened straight onto an artifact has nothing behind it, so Back lands
 * on the list in place instead of doing nothing.
 */

// Each case is its own freshly opened window: jsdom carries one document URL
// across a file, and a leftover address would read as a deep link.
beforeEach(() => {
    window.history.replaceState(null, "", "/");
});

const directory = {
    get: () => ({ happyAgents: [] }),
    subscribe: () => () => undefined,
    happyAgentActivate: () => undefined,
} as unknown as AppHappyAgentDirectoryStore;

async function windowAt(...addresses: readonly string[]) {
    const history = happyAgentHistoryCreate();
    const router = happyAgentRouterCreate(history);
    onTestFinished(() => router.history.destroy());
    router.update({
        context: {
            appearance: appearanceStoreCreate(),
            happyAgents: directory,
            settings: happyAgentSettingsStoreCreate(),
        } as HappyAgentRouterContext,
    });
    await router.load();
    for (const address of addresses) {
        history.push(address);
        await router.load();
    }
    return { history, router };
}

describe("Back on an artifact", () => {
    it("returns to the Artifacts list it was opened from", async () => {
        const { router } = await windowAt("/artifacts/local", "/artifacts/local/art_one");
        expect(router.state.location.pathname).toBe("/artifacts/local/art_one");

        happyAgentRouterArtifactClose(router, "local");
        await router.load();

        expect(router.state.location.pathname).toBe("/artifacts/local");
    });

    it("returns to the chat whose right bar listed it", async () => {
        const { router } = await windowAt(
            "/chats/local/prj_one/ses_one",
            "/artifacts/local/art_one",
        );

        happyAgentRouterArtifactClose(router, "local");
        await router.load();

        expect(router.state.location.pathname).toBe("/chats/local/prj_one/ses_one");
    });

    it("lands on the list in place when the window was opened straight onto the artifact", async () => {
        const history = happyAgentHistoryCreate({
            initialEntries: [{ kind: "artifact", happyAgentId: "local", artifactId: "art_one" }],
        });
        const router = happyAgentRouterCreate(history);
        onTestFinished(() => router.history.destroy());
        router.update({
            context: {
                appearance: appearanceStoreCreate(),
                happyAgents: directory,
                settings: happyAgentSettingsStoreCreate(),
            } as HappyAgentRouterContext,
        });
        await router.load();
        expect(router.state.location.pathname).toBe("/artifacts/local/art_one");
        expect(router.history.canGoBack()).toBe(false);

        happyAgentRouterArtifactClose(router, "local");
        await router.load();

        expect(router.state.location.pathname).toBe("/artifacts/local");
        // Replaced, not pushed: Back from the list does not reopen the artifact.
        expect(history.length).toBe(1);
        expect(router.history.canGoBack()).toBe(false);
    });
});
