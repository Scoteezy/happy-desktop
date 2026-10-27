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
 * Focus is one of Happy's subtasks: it is on screen nested under Happy when
 * Happy is unfolded, and gone when Happy folds. Showing Happy's subtasks
 * nests it like any other. A row the sidebar document names resolves even
 * when the window's list of rows does not hold it yet.
 */

function space(id: string, title: string, target: HappyAgentSpace["target"]): HappyAgentSpace {
    return {
        id: id as HappyAgentSpaceId,
        title,
        icon: null,
        target,
        sectionId: null,
        orderKey: "0",
        placement: "settled",
        visibility: "shown",
        version: 1,
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
const release = space("release", "Release", {
    kind: "task",
    id: "task-release",
    agentId: "agent-release",
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

/** The snapshot of a window holding Happy, any other rows, and the given sidebar document. */
const snapshotOf = (
    html: string,
    others: readonly HappyAgentSpace[] = [],
): HappyAgentSpacesSidebarProps["snapshot"] => ({
    ...happyAgentSpacesStoreNoop.get(),
    spaces: new Map([happy, ...others].map((entry) => [entry.id, entry])),
    sidebar: { artifactId: "sidebar", version: 1, html, agentIcons: new Map(), seed: false },
});

const nav = (happyRow: string[]) =>
    ["<nav>", "  <happy-search/>", "  <happy-create/>", ...happyRow, "</nav>"].join("\n");

it("shows Focus nested under Happy when Happy is unfolded, and not when it folds", () => {
    const nested = (expanded: boolean) =>
        nav([
            `  <happy-space id="happy"${expanded ? ' expanded="true"' : ""}>`,
            '    <happy-space id="agent-focus"/>',
            "  </happy-space>",
        ]);
    const view = render(
        <HappyAgentSpacesSidebar {...props(happyAgentSpacesStoreNoop, snapshotOf(nested(true)))} />,
    );
    const row = (id: string) => view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    expect(row("space:happy")?.getAttribute("aria-expanded")).toBe("true");
    expect(row("session:agent-focus")?.dataset.depth).toBe("1");

    view.rerender(
        <HappyAgentSpacesSidebar
            {...props(happyAgentSpacesStoreNoop, snapshotOf(nested(false)))}
        />,
    );
    expect(row("space:happy")?.getAttribute("aria-expanded")).toBe("false");
    expect(row("session:agent-focus")).toBeNull();
    // Nowhere else in the sidebar either.
    expect(view.container.textContent).not.toContain("agent-focus");
});

it("nests Focus with Happy's other subtasks when they are shown", () => {
    const sidebarSessionsRevealWrite = vi.fn();
    const view = render(
        <HappyAgentSpacesSidebar
            {...props(
                { ...happyAgentSpacesStoreNoop, sidebarSessionsRevealWrite },
                // The window may still hold Focus's own row; it nests all the same.
                snapshotOf(nav(['  <happy-space id="happy"/>']), [focus]),
            )}
        />,
    );
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    fireEvent.contextMenu(row("space:happy"));
    fireEvent.click(within(view.getByRole("menu")).getByText("Show subtasks"));
    expect(sidebarSessionsRevealWrite).toHaveBeenCalledTimes(1);
    const written = sidebarSessionsRevealWrite.mock.calls[0]![0] as string;
    expect(written).toContain('<happy-space id="agent-focus"/>');
    expect(written).toContain('<happy-space id="agent-errand"/>');
});

/** A connection that has just reconciled and then stays quiet until it is left. */
const sync: HappyAgentSpacesDeps["sync"] = {
    async *follow({ signal }) {
        yield { kind: "reconcile" };
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
    },
    health: () => undefined,
};

it("draws a row the sidebar document names though the window's list lacks it", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.client.listSpaces = vi.fn(async () => ({ cursor: "0", spaces: [happy], sections: [] }));
    daemon.client.reportSpaceAttention = vi.fn(async () => ({ batch: null }));
    daemon.client.getSpaceSidebar = vi.fn(async () => ({
        artifactId: "sidebar",
        version: 1,
        html: nav(['  <happy-space id="happy"/>', '  <happy-space id="release"/>']),
        spaces: [happy, release],
    }));
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync });
    function Spaces(own: { store: HappyAgentSpacesStore }) {
        const snapshot = useSyncExternalStore(own.store.subscribe, own.store.get, own.store.get);
        return <HappyAgentSpacesSidebar {...props(own.store, snapshot)} />;
    }
    const view = render(<Spaces store={store} />);
    const row = (id: string) => view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    try {
        await waitFor(() => expect(row("space:release")).not.toBeNull());
        expect(row("space:release")?.textContent).toContain("Release");
    } finally {
        view.unmount();
        store[Symbol.dispose]();
    }
});
