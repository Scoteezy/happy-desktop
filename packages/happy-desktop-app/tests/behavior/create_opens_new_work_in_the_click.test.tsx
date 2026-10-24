import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
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
    HappyAgentApiError,
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
 * Create makes new work in the click. On a daemon that takes the window's
 * names for it, the row is in the sidebar, selected, and its chat is the
 * address before the daemon has answered at all — and before the window has
 * drawn another frame. Only a refusal undoes it, and the window says so.
 */

afterEach(() => vi.useRealTimers());

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
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate("/chats/local"));
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
    return { create, router, rows, store, view };
}

/**
 * Lets everything already queued settle — promises, and work React and the
 * router queue behind them — without letting a frame or a timer pass.
 */
async function sameFrame() {
    for (let turn = 0; turn < 10; turn += 1) await act(() => Promise.resolve());
}

it("puts new work in the sidebar, selects it and opens its chat in the click, with the daemon not yet answering", async () => {
    const daemon = daemonCreate();
    const window = await windowOpen(daemon);
    const release = daemon.pause("createStemCell");
    // From here no timer and no animation frame runs: what lands, lands in
    // the frame the click happened in.
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "requestAnimationFrame"] });
    fireEvent.click(window.create());
    await sameFrame();

    const made = window.store.get().spaces.values().next().value!;
    expect(daemon.callCount("createStemCell")).toBe(1);
    expect(window.rows()).toContainEqual({ id: `space:${made.id}`, current: true });
    expect(window.router.history.location.pathname).toBe(
        `/chats/local/${made.target.workspaceId}/${made.target.agentId}`,
    );
    expect(window.router.state.location.pathname).toBe(
        `/chats/local/${made.target.workspaceId}/${made.target.agentId}`,
    );

    vi.useRealTimers();
    release();
    // The daemon's answer changes nothing the reader sees.
    await waitFor(() => expect(window.store.get().spaces.get(made.id)?.version).toBe(1));
    expect(window.rows()).toContainEqual({ id: `space:${made.id}`, current: true });
    expect(window.view.container.textContent).not.toContain("New work could not be made");
});

it("takes refused new work back out, leaves its chat, and says why", async () => {
    const daemon = daemonCreate();
    daemon.failOnce(
        "createStemCell",
        new HappyAgentApiError(409, "That name is taken.", "conflict", null),
    );
    const window = await windowOpen(daemon);
    fireEvent.click(window.create());
    const [made] = [...window.store.get().spaces.values()];
    expect(window.rows().map((row) => row.id)).toContain(`space:${made!.id}`);
    await waitFor(() =>
        expect(window.view.container.textContent).toContain(
            "New work could not be made. That name is taken.",
        ),
    );
    expect(window.rows().map((row) => row.id)).not.toContain(`space:${made!.id}`);
    await waitFor(() => expect(window.router.state.location.pathname).toBe("/chats/local"));
});
