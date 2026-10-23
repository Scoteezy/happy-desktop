import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    happyAgentSpacesStoreNoop,
    type HappyAgentSpace,
    type HappyAgentSpaceId,
} from "happy-desktop-state";
import {
    happyAgentSpacesChildDestination,
    HappyAgentSpacesSidebar,
    type HappyAgentSpacesPlaces,
    type HappyAgentSpacesSidebarProps,
} from "../../sources/components/HappyAgentSpacesSidebar";

function fixture() {
    const attentionUpdate = vi.fn();
    const onChildSelect = vi.fn();
    const space: HappyAgentSpace = {
        id: "parent" as HappyAgentSpaceId,
        title: "Parent",
        icon: null,
        target: { kind: "task", id: "task", agentId: "agent", workspaceId: "workspace" },
        sectionId: null,
        orderKey: "0",
        placement: "settled",
        visibility: "shown",
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        working: false,
    };
    const props: HappyAgentSpacesSidebarProps = {
        store: { ...happyAgentSpacesStoreNoop, attentionUpdate },
        snapshot: { ...happyAgentSpacesStoreNoop.get(), spaces: new Map([[space.id, space]]) },
        places: { bots: [], tasks: [], chatGroupOf: () => undefined },
        focus: {},
        navigation: { onChatSelect: vi.fn() },
        actions: {
            taskLeave: vi.fn(),
            taskArchive: vi.fn(),
            botArchive: vi.fn(),
            surfaceLeave: vi.fn(),
        },
        now: 1,
        titleShimmerEnabled: false,
        brand: false,
        footer: null,
        sessionRow: () => undefined,
        worktreeRows: (agentId) =>
            agentId === "agent" ? [{ id: "child", label: "Child", kind: "view", depth: 1 }] : [],
        onChildSelect,
    };
    return { props, attentionUpdate, onChildSelect };
}

it("ends a sidebar drag released outside, cancelled, blurred, collapsed or unmounted", () => {
    const { props, attentionUpdate } = fixture();
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    const sidebar = view.container.querySelector("nav")!;
    const begin = () => {
        fireEvent.pointerDown(sidebar, { buttons: 1 });
        fireEvent.pointerLeave(sidebar, { buttons: 1 });
        expect(attentionUpdate).toHaveBeenLastCalledWith("interacting");
    };
    begin();
    fireEvent.pointerUp(document);
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
    begin();
    fireEvent.pointerCancel(document);
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
    begin();
    fireEvent.blur(window);
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
    begin();
    view.rerender(<HappyAgentSpacesSidebar {...props} visible={false} />);
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
    view.rerender(<HappyAgentSpacesSidebar {...props} visible />);
    begin();
    view.unmount();
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
    const calls = attentionUpdate.mock.calls.length;
    fireEvent.pointerUp(document);
    fireEvent.pointerCancel(document);
    fireEvent.blur(window);
    expect(attentionUpdate).toHaveBeenCalledTimes(calls);
});

it("reports calm after child navigation", () => {
    const { props, attentionUpdate, onChildSelect } = fixture();
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    fireEvent.pointerDown(view.getByText("Child"));
    fireEvent.click(view.getByText("Child"));
    expect(onChildSelect).toHaveBeenCalledWith({ kind: "worktree", worktreeId: "child" });
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
});

it("holds attention through a row menu until its action finishes", () => {
    const { props, attentionUpdate } = fixture();
    const leave = vi.fn(() => expect(attentionUpdate).toHaveBeenLastCalledWith("interacting"));
    const view = render(
        <HappyAgentSpacesSidebar {...props} actions={{ ...props.actions, taskLeave: leave }} />,
    );
    const row = view.getByText("Parent");
    fireEvent.pointerDown(row, { button: 2, buttons: 2 });
    fireEvent.contextMenu(row);
    fireEvent.pointerUp(document, { button: 2 });
    expect(view.getByRole("menu")).toBeTruthy();
    expect(attentionUpdate).toHaveBeenLastCalledWith("interacting");
    fireEvent.pointerLeave(view.container.querySelector("nav")!, { buttons: 0 });
    fireEvent.pointerCancel(document);
    expect(attentionUpdate).toHaveBeenLastCalledWith("interacting");
    fireEvent.click(view.getByText("Leave task"));
    expect(leave).toHaveBeenCalledWith("task");
    expect(view.queryByRole("menu")).toBeNull();
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
});

it("releases menu attention on dismissal, blur, collapse and unmount", () => {
    const { props, attentionUpdate } = fixture();
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    const open = () => {
        fireEvent.contextMenu(view.getByText("Parent"));
        expect(attentionUpdate).toHaveBeenLastCalledWith("interacting");
    };
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
    open();
    fireEvent.blur(window);
    expect(view.queryByRole("menu")).toBeNull();
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
    open();
    view.rerender(<HappyAgentSpacesSidebar {...props} visible={false} />);
    expect(view.queryByRole("menu")).toBeNull();
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
    view.rerender(<HappyAgentSpacesSidebar {...props} visible />);
    open();
    view.unmount();
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
});

it("keeps a new drag held when its pointer-down dismisses a menu", () => {
    const { props, attentionUpdate } = fixture();
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    fireEvent.contextMenu(view.getByText("Parent"));
    fireEvent.pointerUp(document);
    fireEvent.pointerDown(view.getByText("Child"), { buttons: 1 });
    expect(view.queryByRole("menu")).toBeNull();
    fireEvent.pointerLeave(view.container.querySelector("nav")!, { buttons: 1 });
    expect(attentionUpdate).toHaveBeenLastCalledWith("interacting");
    fireEvent.pointerUp(document);
    expect(attentionUpdate).toHaveBeenLastCalledWith("calm");
});

it("selects and opens a nested session at any depth, and the worktree it runs in", () => {
    const { props, onChildSelect } = fixture();
    const html = `<nav>
  <happy-search/>
  <happy-create/>
  <happy-space id="parent" expanded="true">
    <happy-space id="aChild" expanded="true">
      <happy-space id="aGrandchild"/>
    </happy-space>
  </happy-space>
</nav>`;
    const nested: HappyAgentSpacesSidebarProps = {
        ...props,
        snapshot: {
            ...props.snapshot,
            sidebar: { artifactId: "a", version: 1, html, agentIcons: new Map(), seed: false },
        },
        sessionRow: (agentId) => ({
            id: agentId,
            kind: "workspace",
            label: agentId === "aChild" ? "Child session" : "Grandchild session",
        }),
        worktreeRows: (agentId) =>
            agentId === "aChild" ? [{ id: "wt", kind: "workspace", label: "Child checkout" }] : [],
    };
    const view = render(<HappyAgentSpacesSidebar {...nested} />);
    fireEvent.click(view.getByText("Grandchild session"));
    expect(onChildSelect).toHaveBeenLastCalledWith({ kind: "session", agentId: "aGrandchild" });
    fireEvent.click(view.getByText("Child checkout"));
    expect(onChildSelect).toHaveBeenLastCalledWith({ kind: "worktree", worktreeId: "wt" });
    const selected = () =>
        [...view.container.querySelectorAll('[aria-current="page"]')].map(
            (row) => row.querySelector('[data-happy-desktop-ui="sidebar-item-label"]')?.textContent,
        );
    // The window now shows that session: its row, not the space's, is the selected one.
    view.rerender(<HappyAgentSpacesSidebar {...nested} focus={{ chatId: "aGrandchild" }} />);
    expect(selected()).toEqual(["Grandchild session"]);
    view.rerender(
        <HappyAgentSpacesSidebar {...nested} focus={{ chatId: "unlisted", groupId: "wt" }} />,
    );
    expect(selected()).toEqual(["Child checkout"]);
    view.rerender(<HappyAgentSpacesSidebar {...nested} focus={{ chatId: "agent" }} />);
    expect(selected()).toEqual(["Parent"]);
});

it("opens a nested row on a session, never on a bare workspace", () => {
    const summary = (id: string) => ({ id, title: id, activity: "idle" as const, updatedAt: 1 });
    const places = {
        bots: [],
        tasks: [
            {
                id: "task",
                workspaceId: "ws_parent",
                conversation: summary("agent"),
                subtasks: [
                    {
                        workspaceId: "ws_parent",
                        path: "",
                        conversation: summary("aChild"),
                        subtasks: [
                            {
                                workspaceId: "wt_grandchild",
                                path: "",
                                conversation: summary("aGrandchild"),
                                subtasks: [],
                            },
                        ],
                    },
                ],
            },
            // A subtask made as a task of its own, in a checkout its parent made.
            { id: "own", workspaceId: "wt_own", conversation: summary("aOwn"), subtasks: [] },
        ],
        chatGroupOf: () => undefined,
    } as unknown as HappyAgentSpacesPlaces;
    const destination = (child: Parameters<typeof happyAgentSpacesChildDestination>[0]) =>
        happyAgentSpacesChildDestination(
            child,
            places,
            [
                { id: "wt_own", conversations: [] },
                { id: "wt_listed", conversations: [{ id: "aListed" }] },
            ],
            () => undefined,
        );
    expect(destination({ kind: "session", agentId: "aGrandchild" })).toEqual({
        groupId: "wt_grandchild",
        chatId: "aGrandchild",
    });
    expect(destination({ kind: "session", agentId: "aOwn" })).toEqual({
        groupId: "wt_own",
        chatId: "aOwn",
    });
    // The worktree's own list files no chat; its task's conversation opens.
    expect(destination({ kind: "worktree", worktreeId: "wt_own" })).toEqual({
        groupId: "wt_own",
        chatId: "aOwn",
    });
    expect(destination({ kind: "worktree", worktreeId: "wt_listed" })).toEqual({
        groupId: "wt_listed",
        chatId: "aListed",
    });
    expect(destination({ kind: "worktree", worktreeId: "wt_nothing" })).toBeUndefined();
});
