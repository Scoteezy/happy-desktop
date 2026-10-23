import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { RouterProvider } from "@tanstack/react-router";
import { expect, it, onTestFinished } from "vitest";
import type {
    HappyAgentClockStore,
    HappyAgentConnectionStore,
    HappyAgentHost,
    HappyAgentModelStore,
    HappyAgentPanelStore,
    HappyAgentSpacesStore,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import {
    appearanceStoreCreate,
    experimentsStoreCreate,
    happyAgentGroupAccessRefused,
    happyAgentSpacesStoreCreate,
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
 * The window's sidebar has one lifetime. Whatever a click opens — a chat, the
 * artifacts, a Surface, the inbox, a new bot — only the content beside it
 * changes: the sidebar's scroll element is the same node and stays where the
 * reader scrolled it. A reader who has not turned the Spaces experiments on
 * keeps the classic sidebar, and the window asks the daemon nothing about
 * Spaces.
 */

const CONNECTED = { connection: "connected", daemon: "ready", attempt: 0 } as const;
const PANEL_CLOSED = { open: false, tabs: [] } as const;
const MODELS_LOADING = { type: "loading" } as const;

const PROJECTS: AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"] = [
    {
        id: "prj_one",
        path: "/Users/happy/happy",
        displayPath: "~/happy",
        name: "happy",
        kind: "regular",
        lifecycle: { phase: "ready" },
        worktrees: [],
        activity: "idle",
        updatedAt: 1_763_999_000_000,
        conversations: [
            {
                id: "ses_one",
                title: "Fix token rotation race",
                subtitle: "~/happy",
                updatedAt: 1_763_999_000_000,
                activity: "idle",
            },
        ],
    },
] as unknown as AppHappyAgentDirectorySnapshot["happyAgents"][number]["projects"];

function workspace(): HappyAgentWorkspaceStore {
    const snapshot = {
        list: { bots: [], tasks: [], projects: { type: "ready" as const, value: PROJECTS } },
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
    // Every act the content beside the sidebar may call does nothing here.
    return new Proxy(known, {
        get: (target, key) => (key in target ? target[key] : () => undefined),
    }) as unknown as HappyAgentWorkspaceStore;
}

/** The Spaces document's rows: a stem cell, a Surface, and work inside a section. */
function spaceOf(id: string, title: string | null, target: Record<string, string>) {
    return {
        id,
        title,
        icon: title === null ? { type: "stem_cell" as const } : null,
        target,
        sectionId: null,
        orderKey: "0",
        placement: "settled" as const,
        visibility: "shown" as const,
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        working: false,
    };
}

const task = (agentId: string) => ({
    kind: "task",
    id: `task-${agentId}`,
    agentId,
    workspaceId: "prj_one",
});

const SPACES = [
    spaceOf("stem", null, task("ses_stem")),
    spaceOf("board", "Board", { kind: "surface", id: "srf_one" }),
    ...Array.from({ length: 30 }, (_, index) =>
        spaceOf(`old${index}`, `Old ${index}`, task(`ses_old${index}`)),
    ),
    spaceOf("release", "Release", task("ses_one")),
];

const SIDEBAR_HTML = [
    "<nav>",
    "  <happy-search/>",
    "  <happy-create/>",
    '  <happy-space id="stem"/>',
    '  <happy-space id="board"/>',
    ...SPACES.slice(2, -1).map((space) => `  <happy-space id="${space.id}"/>`),
    '  <happy-section id="desktop" label="Desktop"/>',
    '  <happy-space id="release"/>',
    "</nav>",
].join("\n");

/** Every Spaces route the window could call, counted. */
const SPACES_ROUTES = [
    "listSpaces",
    "getSpaceSidebar",
    "updateSpaceSidebar",
    "updateSpace",
    "updateSpaceSection",
    "reportSpaceAttention",
    "createStemCell",
    "tidySpaces",
] as const;

function spacesCreate() {
    const daemon = fakeHappyAgentDaemonCreate();
    const client = daemon.client as unknown as Record<string, unknown>;
    const calls: string[] = [];
    const answers: Record<string, () => unknown> = {
        listSpaces: () => ({ cursor: "0", spaces: SPACES, sections: [] }),
        getSpaceSidebar: () => ({
            artifactId: "sidebar",
            version: 1,
            html: SIDEBAR_HTML,
            spaces: SPACES,
        }),
        reportSpaceAttention: () => ({ batch: null }),
    };
    for (const route of SPACES_ROUTES)
        client[route] = async () => {
            calls.push(route);
            return answers[route]?.();
        };
    const store = happyAgentSpacesStoreCreate({
        client: daemon.client,
        sync: {
            async *follow({ signal }) {
                yield { kind: "reconcile" };
                await new Promise((resolve) => signal.addEventListener("abort", resolve));
            },
            health: () => undefined,
        },
    });
    onTestFinished(() => store[Symbol.dispose]());
    return { calls, store };
}

function directory(spaces: HappyAgentSpacesStore): AppHappyAgentDirectoryStore {
    const snapshot: AppHappyAgentDirectorySnapshot = {
        happyAgents: [
            {
                bots: [],
                id: "local",
                label: "This Mac",
                projects: PROJECTS,
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

/** A window at an address, with the Spaces experiments on or off. */
async function windowOpen(address: string, spacesOn: boolean) {
    const spaces = spacesCreate();
    const router = happyAgentRouterCreate(happyAgentMemoryHistoryCreate(address));
    onTestFinished(() => router.history.destroy());
    const experiments = experimentsStoreCreate();
    experiments.featureUpdate("spacesSidebar", spacesOn);
    experiments.featureUpdate("stemCells", spacesOn);
    const context: HappyAgentRouterContext = {
        appearance: appearanceStoreCreate({ mode: "light" }),
        happyAgents: directory(spaces.store),
        settings: happyAgentSettingsStoreCreate(),
        experiments,
    };
    router.update({ context });
    await router.load();
    const view = render(<RouterProvider context={context} router={router} />);
    const scroller = () =>
        view.container.querySelector<HTMLElement>(".happy-sidebar__body-viewport");
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(
            `[data-happy-desktop-ui="sidebar-item"][data-item-id="${id}"]`,
        );
    const rows = () =>
        [...view.container.querySelectorAll('[data-happy-desktop-ui="sidebar-item"]')].map((node) =>
            node.getAttribute("data-item-id"),
        );
    /** Scrolls the sidebar down, then proves each later step kept it there. */
    const scrolled = async () => {
        const scroll = scroller()!;
        scroll.scrollTop = 120;
        return async (pathname: string) => {
            await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
            await waitFor(() => expect(scroller()).not.toBeNull());
            expect(scroller()).toBe(scroll);
            expect(scroll.scrollTop).toBe(120);
        };
    };
    return { calls: spaces.calls, router, row, rows, scrolled };
}

it("keeps the sidebar's scroll element and its scroll wherever a click or an address leads", async () => {
    const window = await windowOpen("/chats/local/prj_one/ses_one", false);
    await waitFor(() => expect(window.row("local/prj_one")).not.toBeNull());
    const kept = await window.scrolled();

    // Clicks: the artifacts, then a project's chat.
    fireEvent.click(window.row("artifacts")!);
    await kept("/artifacts/local");
    fireEvent.click(window.row("local/prj_one")!);
    await kept("/chats/local/prj_one/ses_one");

    // Every other address the sidebar opens.
    for (const address of [
        "/surfaces/local/srf_one",
        "/inbox/local",
        "/bots/new/local",
        "/tasks/new/local",
        "/artifacts/local/art_one",
        "/chats/local/prj_one",
    ]) {
        await act(() => window.router.history.push(address));
        await kept(address);
    }
});

it("keeps the Spaces sidebar's scroll through a stem cell, a Surface, and a row inside a section", async () => {
    const window = await windowOpen("/chats/local/prj_one/ses_one", true);
    await waitFor(() => expect(window.row("space:release")).not.toBeNull());
    const kept = await window.scrolled();

    fireEvent.click(window.row("space:stem")!);
    await kept("/chats/local/prj_one/ses_stem");
    fireEvent.click(window.row("space:board")!);
    await kept("/surfaces/local/srf_one");
    fireEvent.click(window.row("space:release")!);
    await kept("/chats/local/prj_one/ses_one");
    fireEvent.click(window.row("space:old7")!);
    await kept("/chats/local/prj_one/ses_old7");
    // Nothing folded, nothing went away.
    expect(window.rows()).toContain("section:desktop");
    expect(window.rows()).toContain("space:release");
});

it("leaves the classic sidebar as it was, and calls no Spaces route, with the experiments off", async () => {
    const window = await windowOpen("/chats/local/prj_one/ses_one", false);
    await waitFor(() => expect(window.row("local/prj_one")).not.toBeNull());
    fireEvent.click(window.row("local/prj_one")!);
    fireEvent.pointerMove(window.row("local/prj_one")!);
    await act(() => window.router.history.push("/surfaces/local/srf_one"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    // The classic rows, with no Create, section, separator or space among them.
    expect(window.rows()).toEqual(["artifacts", "local/prj_one"]);
    expect(window.calls).toEqual([]);
});
