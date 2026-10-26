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
    happyAgentSpaceProposalWaits,
    HappyAgentSpacesSidebar,
    type HappyAgentSpacesPlaces,
    type HappyAgentSpacesSidebarProps,
} from "../../sources/components/HappyAgentSpacesSidebar";

function fixture() {
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
        store: happyAgentSpacesStoreNoop,
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
    return { props, onChildSelect };
}

it("opens a row on click without writing the document", () => {
    const { props, onChildSelect } = fixture();
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
    expect(sidebarWrite).not.toHaveBeenCalled();
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
            sidebar: {
                artifactId: "a",
                version: 1,
                html,
                agentIcons: new Map(),
                seed: false,
            },
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

it("ends a row's work with its conversation's, whatever the space last said", () => {
    const { props } = fixture();
    const parent = props.snapshot.spaces.get("parent" as HappyAgentSpaceId)!;
    const watcher: HappyAgentSpace = {
        ...parent,
        id: "watcher" as HappyAgentSpaceId,
        title: "Watcher",
        target: { kind: "agent", id: "watcher", agentId: "watcher", workspaceId: null },
        orderKey: "1",
    };
    const places = (activity: "running" | "idle") =>
        ({
            bots: [],
            tasks: [
                {
                    id: "task",
                    workspaceId: "workspace",
                    conversation: { id: "agent", title: "Parent", activity, updatedAt: 1 },
                    subtasks: [],
                },
            ],
            chatGroupOf: () => undefined,
        }) as unknown as HappyAgentSpacesPlaces;
    // The daemon read both rows while their runs were live, and does not send
    // the space again when a run ends.
    const snapshot = {
        ...props.snapshot,
        spaces: new Map([
            [parent.id, { ...parent, working: true }],
            [watcher.id, { ...watcher, working: true }],
        ]),
    };
    const status = (view: ReturnType<typeof render>, id: string) =>
        view.container
            .querySelector(`[data-happy-desktop-ui="sidebar-item"][data-item-id="space:${id}"]`)
            ?.getAttribute("data-status");
    const view = render(
        <HappyAgentSpacesSidebar {...props} snapshot={snapshot} places={places("running")} />,
    );
    expect(status(view, "parent")).toBe("working");
    // Stopped: the task's conversation settles, and its row with it.
    view.rerender(
        <HappyAgentSpacesSidebar {...props} snapshot={snapshot} places={places("idle")} />,
    );
    expect(status(view, "parent")).toBeNull();
    // A row whose conversation the window does not hold has only the space's word.
    expect(status(view, "watcher")).toBe("working");
});

it("marks Prioritizing's row while its proposal waits, by its chat's unread state or this device's", () => {
    const { props } = fixture();
    const focus: HappyAgentSpace = {
        id: "focus" as HappyAgentSpaceId,
        title: "Prioritizing",
        icon: { type: "library", slug: "prioritize" },
        target: { kind: "agent", id: "prioritizing", agentId: "prioritizing", workspaceId: "w" },
        sectionId: null,
        orderKey: "2",
        placement: "settled",
        visibility: "shown",
        version: 1,
        createdAt: 1,
        updatedAt: 1,
        working: false,
    };
    const waiting = {
        ...props.snapshot,
        proposal: { artifactId: "proposal", version: 2 },
        proposalSeen: false,
    };
    // A hidden subtask the window does not hold: this device's record decides.
    expect(happyAgentSpaceProposalWaits(focus, waiting, props.places)).toBe(true);
    expect(
        happyAgentSpaceProposalWaits(focus, { ...waiting, proposalSeen: true }, props.places),
    ).toBe(false);
    expect(happyAgentSpaceProposalWaits(focus, { ...waiting, proposal: null }, props.places)).toBe(
        false,
    );
    // Held as one of Happy's subtasks: its unread state decides.
    const held = (unread: boolean): HappyAgentSpacesPlaces => ({
        ...props.places,
        bots: [
            {
                subtasks: [
                    {
                        workspaceId: "w",
                        path: "/w",
                        conversation: { id: "prioritizing", title: "Prioritizing", unread },
                        subtasks: [],
                    },
                ],
            } as unknown as HappyAgentSpacesPlaces["bots"][number],
        ],
    });
    expect(happyAgentSpaceProposalWaits(focus, waiting, held(true))).toBe(true);
    expect(happyAgentSpaceProposalWaits(focus, waiting, held(false))).toBe(false);
    // Only Prioritizing's own row says so.
    const parent = props.snapshot.spaces.get("parent" as HappyAgentSpaceId)!;
    expect(happyAgentSpaceProposalWaits(parent, waiting, props.places)).toBe(false);
});
