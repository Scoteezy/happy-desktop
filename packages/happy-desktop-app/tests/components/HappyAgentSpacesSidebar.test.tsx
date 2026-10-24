import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    happyAgentSpacesStoreNoop,
    type HappyAgentSpace,
    type HappyAgentSpaceId,
} from "happy-desktop-state";
import {
    happyAgentSpaceMark,
    happyAgentSpacesChildDestination,
    HappyAgentSpacesSidebar,
    type HappyAgentSpacesPlaces,
    type HappyAgentSpacesSidebarProps,
} from "../../sources/components/HappyAgentSpacesSidebar";

function fixture() {
    const attentionInteractingUpdate = vi.fn();
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
        store: { ...happyAgentSpacesStoreNoop, attentionInteractingUpdate },
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
        stemCellAnimation: true,
        brand: false,
        footer: null,
        sessionRow: () => undefined,
        worktreeRows: (agentId) =>
            agentId === "agent" ? [{ id: "child", label: "Child", kind: "view", depth: 1 }] : [],
        onChildSelect,
    };
    return { props, attentionInteractingUpdate, onChildSelect };
}

it("ends a sidebar drag released outside, cancelled, blurred, collapsed or unmounted", () => {
    const { props, attentionInteractingUpdate } = fixture();
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    const sidebar = view.container.querySelector("nav")!;
    const begin = () => {
        fireEvent.pointerDown(sidebar, { buttons: 1 });
        fireEvent.pointerLeave(sidebar, { buttons: 1 });
        expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(true);
    };
    begin();
    fireEvent.pointerUp(document);
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
    begin();
    fireEvent.pointerCancel(document);
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
    begin();
    fireEvent.blur(window);
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
    begin();
    view.rerender(<HappyAgentSpacesSidebar {...props} visible={false} />);
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
    view.rerender(<HappyAgentSpacesSidebar {...props} visible />);
    begin();
    view.unmount();
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
    const calls = attentionInteractingUpdate.mock.calls.length;
    fireEvent.pointerUp(document);
    fireEvent.pointerCancel(document);
    fireEvent.blur(window);
    expect(attentionInteractingUpdate).toHaveBeenCalledTimes(calls);
});

it("opens a row on click without letting queued changes land or writing the document", () => {
    const { props, attentionInteractingUpdate, onChildSelect } = fixture();
    const sidebarWrite = vi.fn();
    const onChatSelect = vi.fn();
    const view = render(
        <HappyAgentSpacesSidebar
            {...props}
            store={{ ...props.store, sidebarWrite }}
            navigation={{ onChatSelect }}
        />,
    );
    for (const label of ["Parent", "Child", "Parent", "Child"])
        fireEvent.click(view.getByText(label));
    expect(onChatSelect).toHaveBeenCalled();
    expect(onChildSelect).toHaveBeenCalledWith({ kind: "worktree", worktreeId: "child" });
    // Queued changes land only once the pointer leaves the sidebar, never because a row opened.
    expect(attentionInteractingUpdate).not.toHaveBeenCalled();
    expect(sidebarWrite).not.toHaveBeenCalled();
});

it("holds attention through a row menu until its action finishes", () => {
    const { props, attentionInteractingUpdate } = fixture();
    const leave = vi.fn(() => expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(true));
    const view = render(
        <HappyAgentSpacesSidebar {...props} actions={{ ...props.actions, taskLeave: leave }} />,
    );
    const row = view.getByText("Parent");
    fireEvent.pointerDown(row, { button: 2, buttons: 2 });
    fireEvent.contextMenu(row);
    fireEvent.pointerUp(document, { button: 2 });
    expect(view.getByRole("menu")).toBeTruthy();
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(true);
    fireEvent.pointerLeave(view.container.querySelector("nav")!, { buttons: 0 });
    fireEvent.pointerCancel(document);
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(true);
    fireEvent.click(view.getByText("Leave task"));
    expect(leave).toHaveBeenCalledWith("task");
    expect(view.queryByRole("menu")).toBeNull();
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
});

it("releases menu attention on dismissal, blur, collapse and unmount", () => {
    const { props, attentionInteractingUpdate } = fixture();
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    const open = () => {
        fireEvent.contextMenu(view.getByText("Parent"));
        expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(true);
    };
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
    open();
    fireEvent.blur(window);
    expect(view.queryByRole("menu")).toBeNull();
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
    open();
    view.rerender(<HappyAgentSpacesSidebar {...props} visible={false} />);
    expect(view.queryByRole("menu")).toBeNull();
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
    view.rerender(<HappyAgentSpacesSidebar {...props} visible />);
    open();
    view.unmount();
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
});

it("keeps a new drag held when its pointer-down dismisses a menu", () => {
    const { props, attentionInteractingUpdate } = fixture();
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    fireEvent.contextMenu(view.getByText("Parent"));
    fireEvent.pointerUp(document);
    fireEvent.pointerDown(view.getByText("Child"), { buttons: 1 });
    expect(view.queryByRole("menu")).toBeNull();
    fireEvent.pointerLeave(view.container.querySelector("nav")!, { buttons: 1 });
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(true);
    fireEvent.pointerUp(document);
    expect(attentionInteractingUpdate).toHaveBeenLastCalledWith(false);
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

it("wears the row's own icon, and a round face only when the row has none", () => {
    const space = (
        id: string,
        title: string | null,
        icon: HappyAgentSpace["icon"],
        target: HappyAgentSpace["target"],
    ): HappyAgentSpace => ({
        id: id as HappyAgentSpaceId,
        title,
        icon,
        target,
        sectionId: null,
        orderKey: "0",
        placement: "settled",
        visibility: "shown",
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        working: false,
    });
    const avatar = "http://happy-agent/v0/bots/bot-uploaded/avatar";
    const ownerFace = "http://happy-agent/v0/users/u/avatar";
    const places = {
        bots: [{ id: "bot-uploaded", avatar: { url: avatar, thumbhash: "" } }],
        tasks: [{ id: "task-owned", owner: { avatar: { url: ownerFace } } }],
        chatGroupOf: () => undefined,
    } as unknown as HappyAgentSpacesPlaces;
    const bot = { kind: "bot", id: "bot-uploaded", agentId: "a", workspaceId: "w" } as const;
    const task = (id: string) => ({ kind: "task", id, agentId: "a", workspaceId: "w" }) as const;
    const mark = (row: HappyAgentSpace) => happyAgentSpaceMark(row, places, false);
    // An icon beats the avatar: a clay icon stands as drawn, a chosen picture is a face.
    expect(mark(space("c", "Insight Miner", { type: "library", slug: "code" }, bot))).toEqual({
        imageMark: expect.objectContaining({ src: expect.any(String) }),
    });
    expect(
        mark(space("i", "Insight Miner", { type: "image", url: "http://happy-agent/x.png" }, bot)),
    ).toEqual({
        imageUrl: "http://happy-agent/x.png",
    });
    expect(mark(space("s", "Named", { type: "stem_cell" }, bot))).toEqual({
        stemCell: { id: "s" },
    });
    // A row with no icon falls back to its bot's avatar, or its task owner's face, drawn round.
    expect(mark(space("b", "Insight Miner", null, bot))).toEqual({ imageUrl: avatar });
    expect(mark(space("o", "Preview Releases", null, task("task-owned")))).toEqual({
        imageUrl: ownerFace,
    });
    // With neither, new work is the stem cell and named work wears its glyph.
    expect(mark(space("n", null, null, task("t")))).toEqual({ stemCell: { id: "n" } });
    expect(mark(space("p", "Buried Alive flyer", null, task("t")))).toEqual({ icon: "tasks" });
});
