import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    happyAgentSpacesStoreNoop,
    type HappyAgentSpace,
    type HappyAgentSpaceId,
} from "happy-desktop-state";
import {
    HappyAgentSpacesSidebar,
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
        onSectionCreate: vi.fn(),
        now: 1,
        titleShimmerEnabled: false,
        brand: false,
        footer: null,
        rowChildren: () => [{ id: "child", label: "Child", kind: "view", depth: 1 }],
        onChildSelect,
        rowCollapsed: new Set(),
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
    expect(onChildSelect).toHaveBeenCalledWith("child");
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
