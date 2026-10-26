import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
    HappyAgentApiError,
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
 * A row nested under another offers what that row holds, as it would at the
 * top level: a subtask opens, opens beside, and is archived; an attached task
 * is renamed in place, left and archived; a worktree is renamed and archived.
 * A section's heading is renamed and deleted, and deleting it leaves its rows
 * where they stand.
 */

function space(id: string, title: string, kind: "task" | "bot"): HappyAgentSpace {
    return {
        id: id as HappyAgentSpaceId,
        title,
        icon: null,
        target: { kind, id: `${kind}-${id}`, agentId: `agent-${id}`, workspaceId: "w" },
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

const summary = (id: string, title = id) => ({
    id,
    title,
    activity: "idle" as const,
    updatedAt: 1,
});

const subtask = (
    id: string,
    subtasks: HappyAgentTask["subtasks"] = [],
): HappyAgentTask["subtasks"][number] =>
    ({
        workspaceId: "w",
        path: "",
        conversation: summary(id, `Subtask ${id}`),
        subtasks,
    }) as unknown as HappyAgentTask["subtasks"][number];

function fixture(options: { readonly canArchive: boolean }) {
    const spaces = [
        space("release", "Release", "task"),
        space("steward", "Steward", "bot"),
        space("notes", "Release notes", "task"),
    ];
    const tasks = [
        {
            id: "task-release",
            workspaceId: "w",
            name: "Release",
            conversation: summary("agent-release"),
            subtasks: [subtask("sub1", [subtask("sub2")])],
            owner: null,
            path: "",
            displayPath: "",
            createdAt: 1,
            archived: false,
            canArchive: options.canArchive,
        },
        {
            id: "task-notes",
            workspaceId: "w",
            name: "Release notes",
            conversation: summary("agent-notes"),
            subtasks: [],
            owner: null,
            path: "",
            displayPath: "",
            createdAt: 1,
            archived: false,
            canArchive: true,
        },
    ] as unknown as HappyAgentTask[];
    const bots = [
        {
            id: "bot-steward",
            workspaceId: "w",
            name: "Steward",
            conversation: summary("agent-steward"),
            subtasks: [subtask("botsub")],
        },
    ] as unknown as HappyAgentBot[];
    const html = [
        "<nav>",
        "  <happy-search/>",
        "  <happy-create/>",
        '  <happy-section id="work" label="Work"/>',
        '  <happy-space id="release" expanded="true">',
        '    <happy-space id="sub1" expanded="true">',
        '      <happy-space id="sub2"/>',
        "    </happy-space>",
        '    <happy-space id="notes"/>',
        "  </happy-space>",
        '  <happy-space id="steward" expanded="true">',
        '    <happy-space id="botsub"/>',
        "  </happy-space>",
        "</nav>",
    ].join("\n");
    const actions = {
        taskLeave: vi.fn(),
        taskArchive: vi.fn(),
        botArchive: vi.fn(),
        surfaceLeave: vi.fn(),
        subtaskArchive: vi.fn(),
        worktreeArchive: vi.fn(),
        worktreeRename: vi.fn(),
        taskRename: vi.fn((_taskId: string, _name: string) => Promise.resolve(true)),
        botRename: vi.fn((_botId: string, _name: string) => Promise.resolve(true)),
    };
    const sidebarWrite = vi.fn();
    const onChatAside = vi.fn();
    const props: HappyAgentSpacesSidebarProps = {
        store: { ...happyAgentSpacesStoreNoop, sidebarWrite },
        snapshot: {
            ...happyAgentSpacesStoreNoop.get(),
            spaces: new Map(spaces.map((entry) => [entry.id, entry])),
            sidebar: {
                artifactId: "sidebar",
                version: 1,
                html,
                agentIcons: new Map(),
                seed: false,
                attachments: true,
            },
        },
        places: { bots, tasks, chatGroupOf: () => undefined },
        focus: {},
        navigation: { onChatSelect: vi.fn() },
        actions,
        now: 1,
        titleShimmerEnabled: false,
        stemCellAnimation: true,
        brand: false,
        footer: null,
        sessionRow: (agentId) => ({ id: agentId, kind: "workspace", label: `Subtask ${agentId}` }),
        worktreeRows: (agentId) =>
            agentId === "sub1" ? [{ id: "wt", kind: "workspace", label: "Checkout" }] : [],
        onChildSelect: vi.fn(),
        onChatAside,
    };
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    /** The labels of the menu the row opens on a right click. */
    const menu = (id: string): string[] => {
        fireEvent.contextMenu(row(id));
        const opened = view.getByRole("menu");
        return within(opened)
            .getAllByRole("menuitem")
            .map((item) => item.textContent?.replace(/\p{Co}/gu, "").trim() ?? "");
    };
    const choose = (label: string) =>
        fireEvent.click(within(view.getByRole("menu")).getByText(label));
    const type = (name: string) => {
        const editor = view.container.querySelector<HTMLElement>(
            '[contenteditable="plaintext-only"]',
        )!;
        editor.textContent = name;
        fireEvent.keyDown(editor, { key: "Enter" });
    };
    return { view, row, menu, choose, type, actions, sidebarWrite, onChatAside };
}

afterEach(() => vi.restoreAllMocks());

it("offers a subtask at any depth what a subtask can do, and archives it", () => {
    const { menu, choose, actions, onChatAside } = fixture({ canArchive: true });
    expect(menu("session:sub1")).toEqual([
        "Open",
        "Open in side panel",
        "Hide subtasks",
        "Archive subtask",
    ]);
    choose("Archive subtask");
    expect(actions.subtaskArchive).toHaveBeenCalledWith("sub1");

    expect(menu("session:sub2")).toEqual(["Open", "Open in side panel", "Archive subtask"]);
    choose("Open in side panel");
    expect(onChatAside).toHaveBeenCalledWith("sub2", "Subtask sub2");

    // A bot's subtask is the reader's to archive.
    expect(menu("session:botsub")).toEqual(["Open", "Open in side panel", "Archive subtask"]);
});

it("leaves archiving out of a subtask of a task the reader may not archive", () => {
    const { menu } = fixture({ canArchive: false });
    expect(menu("session:sub1")).toEqual(["Open", "Open in side panel", "Hide subtasks"]);
    expect(menu("session:sub2")).toEqual(["Open", "Open in side panel"]);
});

it("offers an attached task its whole menu, renames it in place, and leaves and archives it", () => {
    const { menu, choose, type, actions, row } = fixture({ canArchive: true });
    expect(menu("space:notes")).toEqual([
        "Open",
        "Open in side panel",
        "Rename task",
        "Leave task",
        "Archive task",
    ]);
    choose("Rename task");
    type("Release notes 2.4");
    expect(actions.taskRename).toHaveBeenCalledWith("task-notes", "Release notes 2.4");

    menu("space:notes");
    choose("Leave task");
    expect(actions.taskLeave).toHaveBeenCalledWith("task-notes");
    menu("space:notes");
    choose("Archive task");
    expect(actions.taskArchive).toHaveBeenCalledWith("task-notes");
    expect(row("space:notes").dataset.depth).toBe("1");
});

it("renames and archives a worktree drawn under a subtask", () => {
    const { menu, choose, type, actions } = fixture({ canArchive: true });
    expect(menu("worktree:wt")).toEqual(["Open", "Rename workspace", "Archive workspace"]);
    choose("Rename workspace");
    type("release-fix");
    expect(actions.worktreeRename).toHaveBeenCalledWith("wt", "release-fix");
    menu("worktree:wt");
    choose("Archive workspace");
    expect(actions.worktreeArchive).toHaveBeenCalledWith("wt");
});

it("deletes a section's heading and keeps its rows in place", () => {
    const { menu, choose, sidebarWrite } = fixture({ canArchive: true });
    expect(menu("section:work")).toEqual(["Rename section", "Delete section"]);
    choose("Delete section");
    expect(sidebarWrite).toHaveBeenCalledTimes(1);
    const html = sidebarWrite.mock.calls[0]![0] as string;
    expect(html).not.toContain("happy-section");
    expect(html).toContain('<happy-space id="release" expanded="true">');
    expect(html).toContain('<happy-space id="sub2"/>');
});

/** A connection that has just reconciled and then stays quiet until it is left. */
const sync: HappyAgentSpacesDeps["sync"] = {
    async *follow({ signal }) {
        yield { kind: "reconcile" };
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
    },
    health: () => undefined,
};

it("takes a deleted heading off at once, keeps every row still, and puts it back on refusal", async () => {
    const spaces = [space("release", "Release", "task"), space("voice", "Voice", "task")];
    const html = [
        "<nav>",
        "  <happy-search/>",
        "  <happy-create/>",
        '  <happy-space id="release"/>',
        '  <happy-section id="desktop" label="Desktop"/>',
        '  <happy-space id="voice"/>',
        "</nav>",
    ].join("\n");
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.client.listSpaces = vi.fn(async () => ({ cursor: "0", spaces, sections: [] }));
    daemon.client.reportSpaceAttention = vi.fn(async () => ({ batch: null }));
    daemon.client.getSpaceSidebar = vi.fn(async () => ({
        artifactId: "sidebar",
        version: 1,
        html,
        spaces,
    }));
    let refuse: (() => void) | undefined;
    const held = () =>
        new Promise<never>(
            (_resolve, reject) =>
                (refuse = () =>
                    reject(new HappyAgentApiError(400, "Refused.", "invalid_request", null))),
        );
    daemon.client.updateSpaceSidebar = vi.fn(held);
    daemon.client.applySpaceSidebarOperations = vi.fn(held);
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync });
    function Spaces(props: { store: HappyAgentSpacesStore }) {
        const snapshot = useSyncExternalStore(
            props.store.subscribe,
            props.store.get,
            props.store.get,
        );
        return (
            <HappyAgentSpacesSidebar
                store={props.store}
                snapshot={snapshot}
                places={{ bots: [], tasks: [], chatGroupOf: () => undefined }}
                focus={{}}
                navigation={{ onChatSelect: () => {} }}
                actions={{
                    taskLeave: () => {},
                    taskArchive: () => {},
                    botArchive: () => {},
                    surfaceLeave: () => {},
                }}
                now={1}
                titleShimmerEnabled={false}
                stemCellAnimation
                brand={false}
                footer={null}
                sessionRow={() => undefined}
                worktreeRows={() => []}
                onChildSelect={() => {}}
            />
        );
    }
    const view = render(<Spaces store={store} />);
    const row = (id: string) => view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    try {
        await waitFor(() => expect(row("section:desktop")).not.toBeNull());
        const release = row("space:release");
        const voice = row("space:voice");
        fireEvent.contextMenu(row("section:desktop")!);
        fireEvent.click(within(view.getByRole("menu")).getByText("Delete section"));
        // In the click: the heading is gone and the rows are the same nodes.
        expect(row("section:desktop")).toBeNull();
        expect(row("space:release")).toBe(release);
        expect(row("space:voice")).toBe(voice);
        await waitFor(() => expect(refuse).toBeDefined());
        refuse!();
        await waitFor(() => expect(row("section:desktop")).not.toBeNull());
        expect(row("space:release")).toBe(release);
        expect(row("space:voice")).toBe(voice);
    } finally {
        view.unmount();
        store[Symbol.dispose]();
    }
});

it("makes new work right under an open heading from its +, in the click, moving no row above it", async () => {
    const spaces = [space("release", "Release", "task"), space("voice", "Voice", "task")];
    const html = [
        "<nav>",
        "  <happy-search/>",
        "  <happy-create/>",
        '  <happy-space id="release"/>',
        '  <happy-section id="desktop" label="Desktop"/>',
        '  <happy-space id="voice"/>',
        '  <happy-section id="later" label="Later" collapsed="true"/>',
        "</nav>",
    ].join("\n");
    const daemon = fakeHappyAgentDaemonCreate();
    daemon.client.listSpaces = vi.fn(async () => ({ cursor: "0", spaces, sections: [] }));
    daemon.client.reportSpaceAttention = vi.fn(async () => ({ batch: null }));
    daemon.client.getSpaceSidebar = vi.fn(async () => ({
        artifactId: "sidebar",
        version: 1,
        html,
        spaces,
    }));
    const release = daemon.pause("createStemCell");
    // A daemon that takes the window's names, so the row exists in the click.
    const named = {
        ...sync,
        health: () => ({ healthy: true, capabilities: { stemCellIdentities: true } }),
    } as unknown as HappyAgentSpacesDeps["sync"];
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync: named });
    const onSectionCreate = vi.fn((sectionId: string) => {
        store.stemCellCreate(sectionId, null);
    });
    function Spaces(props: { store: HappyAgentSpacesStore }) {
        const snapshot = useSyncExternalStore(
            props.store.subscribe,
            props.store.get,
            props.store.get,
        );
        return (
            <HappyAgentSpacesSidebar
                store={props.store}
                snapshot={snapshot}
                places={{ bots: [], tasks: [], chatGroupOf: () => undefined }}
                focus={{}}
                navigation={{ onChatSelect: () => {} }}
                actions={{
                    taskLeave: () => {},
                    taskArchive: () => {},
                    botArchive: () => {},
                    surfaceLeave: () => {},
                }}
                now={1}
                titleShimmerEnabled={false}
                stemCellAnimation
                brand={false}
                footer={null}
                sessionRow={() => undefined}
                worktreeRows={() => []}
                onChildSelect={() => {}}
                onSectionCreate={onSectionCreate}
            />
        );
    }
    const view = render(<Spaces store={store} />);
    const row = (id: string) => view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    const plus = (id: string) =>
        row(id)?.querySelector<HTMLElement>('[data-happy-desktop-ui="sidebar-item-action"]');
    const order = () =>
        [...view.container.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="sidebar-item"]')]
            .map((node) => node.dataset.itemId ?? "")
            .filter((id) => id !== "search" && id !== "create");
    try {
        await waitFor(() => expect(row("section:desktop")).not.toBeNull());
        // Only the open heading offers it; a folded one would make work out of sight.
        expect(plus("section:desktop")?.getAttribute("aria-label")).toBe("New in Desktop");
        expect(plus("section:desktop")?.dataset.reveal).toBe("hover");
        expect(plus("section:later")).toBeFalsy();
        const before = { release: row("space:release"), voice: row("space:voice") };
        fireEvent.click(plus("section:desktop")!);
        expect(onSectionCreate).toHaveBeenCalledWith("desktop");
        // The heading did not fold, and the new row stands right under it in the click.
        expect(row("section:desktop")?.getAttribute("aria-expanded")).toBe("true");
        const made = order()[2]!;
        expect(made.startsWith("space:")).toBe(true);
        expect(order()).toEqual([
            "space:release",
            "section:desktop",
            made,
            "space:voice",
            "section:later",
        ]);
        expect(row("space:release")).toBe(before.release);
        expect(row("space:voice")).toBe(before.voice);
        await waitFor(() => expect(daemon.callCount("createStemCell")).toBe(1));
        const request = daemon.calls.find((call) => call.method === "createStemCell")!.args[0] as {
            readonly sectionId: string | null;
        };
        expect(request.sectionId).toBe("desktop");
        release();
    } finally {
        view.unmount();
        store[Symbol.dispose]();
    }
});
