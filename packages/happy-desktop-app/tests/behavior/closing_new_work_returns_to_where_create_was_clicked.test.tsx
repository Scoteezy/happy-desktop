import { fireEvent, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { expect, it, onTestFinished, vi } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentSpacesStore,
    HappyAgentStemCellsSettingsStore,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import {
    appearanceStoreCreate,
    experimentsStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentSpacesStoreCreate,
    happyAgentStemCellsSettingsStoreCreate,
    HAPPY_AGENT_STEM_CELLS_SETTING,
    happyAgentHostNoop,
    happyAgentSettingsStoreCreate,
    HAPPY_AGENT_GROUP_UNLISTED_REFUSAL,
    HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
} from "happy-desktop-state";
import type {
    AppHappyAgentDirectorySnapshot,
    AppHappyAgentDirectoryStore,
} from "../../sources/AppHappyAgentView";
import {
    happyAgentMemoryHistoryCreate,
    happyAgentRouterCreate,
    type HappyAgentRouterContext,
} from "../../sources/navigation/happyAgentRouter";

/*
 * Closing new work goes back. A reader in a conversation who clicks Create
 * stands in the new work's chat; closing that work puts them back in the
 * conversation they clicked from — at once, before the daemon has taken the
 * row away — and Back no longer leads into the work they closed.
 */

const CONVERSATION_A = "/chats/local/prj_a/ses_a";

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;

function workspace(): HappyAgentWorkspaceStore {
    const snapshot = {
        // The new chat is not listed here: this window's list stands still,
        // so only the sidebar and the address can be what changed.
        list: {
            bots: [],
            tasks: [],
            projects: { type: "ready" as const, value: [] },
            worktreeCreateFailures: new Map(),
            sessionCreateFailures: new Map(),
            projectCreateFailures: new Map(),
            subtaskFailures: new Map(),
            taskFailures: new Map(),
        },
        conversation: { type: "unloaded" as const },
        address: {},
        groupAccess: happyAgentGroupAccessRefused(HAPPY_AGENT_GROUP_UNLISTED_REFUSAL),
        fileTabs: [],
        tabOrder: [],
        openInTargets: [],
        fileViewMode: "unified" as const,
        fileScope: "changed" as const,
        fileLayout: "flat" as const,
        fileTreeExpanded: new Set<string>(),
        fileTreeCollapsed: new Set<string>(),
        fileSearch: { query: "", searching: false },
        workspaceFilesLoading: false,
        fileComments: { comments: [] },
        reviews: new Map(),
    };
    const panel = {
        get: () => PANEL_CLOSED,
        subscribe: () => () => undefined,
        panelToggle: () => undefined,
        conversationApply: () => undefined,
        [Symbol.dispose]: () => undefined,
    } as unknown as HappyAgentPanelStore;
    const known: Record<PropertyKey, unknown> = {
        get: () => snapshot,
        deviceBridgeSupport: () => undefined,
        conversationsRetained: HAPPY_AGENT_RETAINED_CONVERSATIONS_NONE,
        panel,
        subscribe: () => () => undefined,
    };
    return new Proxy(known, {
        get: (target, key) => (key in target ? target[key] : () => undefined),
    }) as unknown as HappyAgentWorkspaceStore;
}

const SIDEBAR_HTML = ["<nav>", "  <happy-search/>", "  <happy-create/>", "</nav>"].join("\n");

/** A daemon that takes the window's names for new work, and answers when the test says. */
function daemonCreate() {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.client.listSpaces = async () => ({ cursor: "0", spaces: [], sections: [] });
    daemon.client.getSpaceSidebar = async () => ({
        artifactId: "sidebar",
        version: 1,
        html: SIDEBAR_HTML,
        spaces: [],
    });
    daemon.client.reportSpaceAttention = async () => ({ batch: null });
    return daemon;
}

function directory(
    spaces: HappyAgentSpacesStore,
    stemCellsSettings: HappyAgentStemCellsSettingsStore,
): AppHappyAgentDirectoryStore {
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                id: "local",
                label: "This Mac",
                projects: [],
                projectsStatus: "ready",
                session: {
                    clock: {
                        get: () => 1_764_000_000_000,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentClockStore,
                    connection: {
                        get: () => CONNECTED,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentConnectionStore,
                    host: happyAgentHostNoop as HappyAgentHost,
                    models: {
                        get: () => MODELS_LOADING,
                        subscribe: () => () => undefined,
                    } as unknown as HappyAgentModelStore,
                    workspace: workspace(),
                    spaces,
                    stemCellsSettings: () => stemCellsSettings,
                },
                status: "connected",
            },
        ],
    };
    return {
        get: () => snapshot,
        subscribe: () => () => undefined,
        happyAgentActivate: () => undefined,
    };
}

async function windowOpen(daemon: ReturnType<typeof daemonCreate>) {
    await daemon.client.saveUserSetting(HAPPY_AGENT_STEM_CELLS_SETTING, {
        value: true,
        updatedAt: Date.now(),
        mutationId: "stem-cells-fixture",
    });
    const stemCellsSettings = happyAgentStemCellsSettingsStoreCreate({
        client: daemon.client,
        sync: {
            async *follow({ signal }) {
                yield { kind: "reconcile" };
                await new Promise((resolve) => signal.addEventListener("abort", resolve));
            },
            health: () => undefined,
        },
    });
    onTestFinished(() => stemCellsSettings[Symbol.dispose]());
    const store = happyAgentSpacesStoreCreate({
        client: daemon.client,
        sync: {
            async *follow({ signal }) {
                yield { kind: "reconcile" };
                await new Promise((resolve) => signal.addEventListener("abort", resolve));
            },
            health: () => ({
                healthy: true,
                ready: true,
                status: "ready",
                version: { daemon: "0.4.105", protocol: 1 },
                capabilities: { stemCellIdentities: true },
            }),
        },
    });
    onTestFinished(() => store[Symbol.dispose]());
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate(CONVERSATION_A));
    onTestFinished(() => router.history.destroy());
    const experiments = experimentsStoreCreate();
    const context: HappyAgentRouterContext = {
        appearance: appearanceStoreCreate({ mode: "light" }),
        happyAgents: directory(store, stemCellsSettings),
        settings: happyAgentSettingsStoreCreate(),
        experiments,
    };
    router.update({ context });
    await router.load();
    const view = render(<RouterProvider context={context} router={router} />);
    const rows = () =>
        [
            ...view.container.querySelectorAll<HTMLElement>(
                '[data-happy-desktop-ui="sidebar-item"]',
            ),
        ].map((node) => ({
            id: node.getAttribute("data-item-id"),
            current: node.getAttribute("aria-current") === "page",
        }));
    await waitFor(() => expect(rows().map((row) => row.id)).toContain("create"));
    const create = () =>
        view.container.querySelector<HTMLElement>(
            '[data-happy-desktop-ui="sidebar-item"][data-item-id="create"]',
        )!;
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="sidebar-item"][data-item-id="space:${id}"]`,
        )!;
    return { create, router, row, rows, store, view };
}

it("puts the reader back in the conversation Create was clicked from when the new work is closed", async () => {
    const daemon = daemonCreate();
    // The daemon has not removed anything yet when the reader is moved.
    let removed = (): void => undefined;
    const removeSpace = vi.fn(
        (_spaceId: string) =>
            new Promise<never>((resolve) => {
                removed = () => resolve(undefined as never);
            }),
    );
    daemon.client.removeSpace = removeSpace;
    const window = await windowOpen(daemon);
    expect(window.router.state.location.pathname).toBe(CONVERSATION_A);

    fireEvent.click(window.create());
    const made = window.store.get().spaces.values().next().value!;
    const newWork = `/chats/local/${made.target.workspaceId}/${made.target.agentId}`;
    await waitFor(() => expect(window.router.state.location.pathname).toBe(newWork));

    fireEvent.contextMenu(window.row(made.id));
    fireEvent.click(window.view.getByText("Close new work"));

    await waitFor(() => expect(window.router.state.location.pathname).toBe(CONVERSATION_A));
    expect(removeSpace).toHaveBeenCalledTimes(1);
    expect(removeSpace.mock.calls[0]![0]).toBe(made.id);
    // Popped, not pushed over: the conversation is all the window holds.
    expect(window.router.history.length).toBe(1);
    expect(window.router.history.canGoBack()).toBe(false);
    removed();
});

it("leaves a reader elsewhere where they are when they close new work from its row", async () => {
    const daemon = daemonCreate();
    daemon.client.removeSpace = vi.fn(async () => undefined as never);
    const window = await windowOpen(daemon);

    fireEvent.click(window.create());
    const made = window.store.get().spaces.values().next().value!;
    const newWork = `/chats/local/${made.target.workspaceId}/${made.target.agentId}`;
    await waitFor(() => expect(window.router.state.location.pathname).toBe(newWork));
    window.router.history.push("/chats/local/prj_b/ses_b");
    await waitFor(() =>
        expect(window.router.state.location.pathname).toBe("/chats/local/prj_b/ses_b"),
    );

    fireEvent.contextMenu(window.row(made.id));
    fireEvent.click(window.view.getByText("Close new work"));

    await waitFor(() => expect(daemon.client.removeSpace).toHaveBeenCalledTimes(1));
    expect(window.router.state.location.pathname).toBe("/chats/local/prj_b/ses_b");
    // Back skips the closed work and lands where Create was clicked.
    window.router.history.back();
    await waitFor(() => expect(window.router.state.location.pathname).toBe(CONVERSATION_A));
});
