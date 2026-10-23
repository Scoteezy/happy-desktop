import { fireEvent, render, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import {
    happyAgentSpacesStoreCreate,
    type HappyAgentSpacesDeps,
    type HappyAgentSpacesStore,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import {
    HappyAgentSpacesSidebar,
    type HappyAgentSpacesSidebarProps,
} from "../../sources/components/HappyAgentSpacesSidebar";

/*
 * New work nobody wrote in yet stays where it is until the person closes it.
 * Opening it, opening another row, and coming back remove nothing; only the
 * row's own "Close new work" does, and only that row.
 */

function space(id: string, title: string | null) {
    return {
        id,
        title,
        icon: title === null ? { type: "stem_cell" as const } : null,
        target: {
            kind: "task" as const,
            id: `task-${id}`,
            agentId: `agent-${id}`,
            workspaceId: "w",
        },
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

/** A daemon holding two stem cells and a task, which removes a row only when asked. */
function daemonCreate() {
    const daemon = fakeHappyAgentDaemonCreate();
    let spaces = [space("stemA", null), space("stemB", null), space("release", "Release")];
    const html = () =>
        [
            "<nav>",
            "  <happy-search/>",
            "  <happy-create/>",
            ...spaces.map((entry) => `  <happy-space id="${entry.id}"/>`),
            "</nav>",
        ].join("\n");
    let version = 1;
    const removeSpace = vi.fn(async (spaceId: string) => {
        spaces = spaces.filter((entry) => entry.id !== spaceId);
        version += 1;
        return undefined as never;
    });
    daemon.client.listSpaces = vi.fn(async () => ({ cursor: "0", spaces, sections: [] }));
    daemon.client.getSpaceSidebar = vi.fn(async () => ({
        artifactId: "sidebar",
        version,
        html: html(),
        spaces,
    }));
    daemon.client.updateSpaceSidebar = vi.fn(async () => {
        throw new Error("Nothing here writes the document.");
    });
    daemon.client.reportSpaceAttention = vi.fn(async () => ({ batch: null }));
    daemon.client.removeSpace = removeSpace;
    return { daemon, removeSpace };
}

/** A connection that has just reconciled and then stays quiet until it is left. */
const sync: HappyAgentSpacesDeps["sync"] = {
    async *follow({ signal }) {
        yield { kind: "reconcile" };
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
    },
    health: () => undefined,
};

function Spaces(props: { store: HappyAgentSpacesStore }) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const sidebar: HappyAgentSpacesSidebarProps = {
        store: props.store,
        snapshot,
        places: { bots: [], tasks: [], chatGroupOf: () => undefined },
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
        sessionRow: () => undefined,
        worktreeRows: () => [],
        onChildSelect: () => {},
    };
    return <HappyAgentSpacesSidebar {...sidebar} />;
}

/** One window's lifetime: a fresh store and sidebar, as after a reload. */
function windowOpen(daemon: ReturnType<typeof daemonCreate>["daemon"]) {
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync });
    const view = render(<Spaces store={store} />);
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="space:${id}"]`);
    const close = () => {
        view.unmount();
        store[Symbol.dispose]();
    };
    return { view, row, close };
}

it("keeps stem cells through clicks and a reload, and closes only the one asked to", async () => {
    const { daemon, removeSpace } = daemonCreate();
    let window = windowOpen(daemon);
    await waitFor(() => expect(window.row("stemB")).not.toBeNull());
    for (const id of ["stemA", "stemB", "release", "stemA", "release", "stemB", "stemA"])
        fireEvent.click(window.row(id)!);
    window.close();

    window = windowOpen(daemon);
    try {
        await waitFor(() => expect(window.row("release")).not.toBeNull());
        expect(window.row("stemA")).not.toBeNull();
        expect(window.row("stemB")).not.toBeNull();
        expect(removeSpace).not.toHaveBeenCalled();
        // No click lets queued changes land.
        expect(daemon.client.reportSpaceAttention).not.toHaveBeenCalledWith(
            { state: "calm" },
            expect.anything(),
        );

        fireEvent.contextMenu(window.row("stemA")!);
        fireEvent.click(window.view.getByText("Close new work"));
        await waitFor(() => expect(removeSpace).toHaveBeenCalledTimes(1));
        expect(removeSpace.mock.calls[0]![0]).toBe("stemA");
        // A named task offers no such close.
        fireEvent.contextMenu(window.row("release")!);
        expect(window.view.queryByText("Close new work")).toBeNull();
    } finally {
        window.close();
    }
});
