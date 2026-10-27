import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import {
    happyAgentSpacesStoreCreate,
    happyAgentSpacesStoreNoop,
    type HappyAgentBot,
    type HappyAgentSpace,
    type HappyAgentSpaceId,
    type HappyAgentSpacesDeps,
    type HappyAgentSpacesStore,
    type HappyAgentTask,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import {
    HappyAgentSpacesSidebar,
    type HappyAgentSpacesSidebarProps,
} from "../../sources/components/HappyAgentSpacesSidebar";

/*
 * Focus has a row of its own, right after Happy. Folding Happy hides what
 * nests under Happy and nothing else, so Focus stays on screen; and showing
 * Happy's subtasks never nests a second copy of Focus under it.
 */

function space(
    id: string,
    title: string,
    target: HappyAgentSpace["target"],
    version = 1,
): HappyAgentSpace {
    return {
        id: id as HappyAgentSpaceId,
        title,
        icon: null,
        target,
        sectionId: null,
        orderKey: "0",
        placement: "settled",
        visibility: "shown",
        version,
        createdAt: 1,
        updatedAt: 1,
        working: false,
    } as HappyAgentSpace;
}

const happy = space("happy", "Happy", {
    kind: "bot",
    id: "bot-happy",
    agentId: "agent-happy",
    workspaceId: "w",
});
const focus = space("focus", "Focus", {
    kind: "agent",
    id: "agent-focus",
    agentId: "agent-focus",
    workspaceId: "w",
});

const subtask = (id: string): HappyAgentTask["subtasks"][number] =>
    ({
        workspaceId: "w",
        path: "",
        conversation: { id, title: id, activity: "idle", updatedAt: 1 },
        subtasks: [],
    }) as unknown as HappyAgentTask["subtasks"][number];

const bots = [
    {
        id: "bot-happy",
        workspaceId: "w",
        name: "Happy",
        systemKey: "chief_of_staff",
        conversation: { id: "agent-happy", title: "Happy", activity: "idle", updatedAt: 1 },
        subtasks: [subtask("agent-focus"), subtask("agent-errand")],
    },
] as unknown as HappyAgentBot[];

const props = (
    store: HappyAgentSpacesStore,
    snapshot: HappyAgentSpacesSidebarProps["snapshot"],
): HappyAgentSpacesSidebarProps => ({
    store,
    snapshot,
    places: { bots, tasks: [], chatGroupOf: () => undefined },
    focus: {},
    navigation: { onChatSelect: () => {} },
    actions: {
        taskLeave: () => {},
        taskArchive: () => {},
        botArchive: () => {},
        surfaceLeave: () => {},
    },
    now: 1,
    titleShimmerEnabled: false,
    stemCellAnimation: true,
    brand: false,
    footer: null,
    sessionRow: (agentId) => ({ id: agentId, kind: "workspace", label: agentId }),
    worktreeRows: () => [],
    onChildSelect: () => {},
});

/** A connection that has just reconciled and then stays quiet until it is left. */
const sync: HappyAgentSpacesDeps["sync"] = {
    async *follow({ signal }) {
        yield { kind: "reconcile" };
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
    },
    health: () => undefined,
};

it("keeps Focus's own row on screen when Happy is folded", async () => {
    // The window's list does not name Focus; the sidebar document's answer does.
    const html = [
        "<nav>",
        "  <happy-search/>",
        "  <happy-create/>",
        '  <happy-space id="happy">',
        '    <happy-space id="agent-focus"/>',
        "  </happy-space>",
        '  <happy-space id="focus"/>',
        "</nav>",
    ].join("\n");
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.client.listSpaces = vi.fn(async () => ({ cursor: "0", spaces: [happy], sections: [] }));
    daemon.client.reportSpaceAttention = vi.fn(async () => ({ batch: null }));
    daemon.client.getSpaceSidebar = vi.fn(async () => ({
        artifactId: "sidebar",
        version: 1,
        html,
        spaces: [happy, focus],
    }));
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync });
    function Spaces(own: { store: HappyAgentSpacesStore }) {
        const snapshot = useSyncExternalStore(own.store.subscribe, own.store.get, own.store.get);
        return <HappyAgentSpacesSidebar {...props(own.store, snapshot)} />;
    }
    const view = render(<Spaces store={store} />);
    const row = (id: string) => view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    try {
        await waitFor(() => expect(row("space:focus")).not.toBeNull());
        expect(row("space:happy")?.getAttribute("aria-expanded")).toBe("false");
        expect(row("session:agent-focus")).toBeNull();
        // A top-level row carries no depth.
        expect(row("space:focus")?.dataset.depth).toBeUndefined();
        expect(row("space:focus")?.textContent).toContain("Focus");
    } finally {
        view.unmount();
        store[Symbol.dispose]();
    }
});

it("shows Happy's subtasks without nesting a second Focus under it", () => {
    const html = [
        "<nav>",
        "  <happy-search/>",
        "  <happy-create/>",
        '  <happy-space id="happy"/>',
        '  <happy-space id="focus"/>',
        "</nav>",
    ].join("\n");
    const sidebarSessionsRevealWrite = vi.fn();
    const view = render(
        <HappyAgentSpacesSidebar
            {...props(
                { ...happyAgentSpacesStoreNoop, sidebarSessionsRevealWrite },
                {
                    ...happyAgentSpacesStoreNoop.get(),
                    spaces: new Map([happy, focus].map((entry) => [entry.id, entry])),
                    sidebar: {
                        artifactId: "sidebar",
                        version: 1,
                        html,
                        agentIcons: new Map(),
                        seed: false,
                    },
                },
            )}
        />,
    );
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    fireEvent.contextMenu(row("space:happy"));
    fireEvent.click(within(view.getByRole("menu")).getByText("Show subtasks"));
    expect(sidebarSessionsRevealWrite).toHaveBeenCalledTimes(1);
    const written = sidebarSessionsRevealWrite.mock.calls[0]![0] as string;
    expect(written).toContain('<happy-space id="agent-errand"/>');
    expect(written).not.toContain('id="agent-focus"');
    expect(written).toContain('<happy-space id="focus"/>');
});
