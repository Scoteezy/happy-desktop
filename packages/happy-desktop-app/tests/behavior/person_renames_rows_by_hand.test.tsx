import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import {
    happyAgentSpacesStoreCreate,
    happyAgentSpacesStoreNoop,
    type HappyAgentSpace,
    type HappyAgentSpaceId,
    type HappyAgentSpacesDeps,
    type HappyAgentSpacesStore,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import {
    HappyAgentSpacesSidebar,
    type HappyAgentSpacesSidebarProps,
} from "../../sources/components/HappyAgentSpacesSidebar";

/*
 * Rows are renamed by hand as the classic sidebar renamed them: "Rename task"
 * or "Rename bot" from the row's menu, or F2 on the focused row, edits the
 * name in place, since Enter on a row opens it; Enter saves and Escape leaves
 * it as it was. A section's heading is renamed the same way, as an edit of
 * the document.
 */

function space(id: string, title: string | null, kind: "task" | "bot"): HappyAgentSpace {
    return {
        id: id as HappyAgentSpaceId,
        title,
        icon: title === null ? { type: "stem_cell" } : null,
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

function fixture() {
    const spaces = [
        space("release", "Release notes", "task"),
        space("stem", null, "task"),
        space("steward", "Release Steward", "bot"),
    ];
    const taskRename = vi.fn((_taskId: string, _name: string) => Promise.resolve(true));
    const botRename = vi.fn((_botId: string, _name: string) => Promise.resolve(true));
    const sidebarWrite = vi.fn();
    const html = [
        "<nav>",
        "  <happy-search/>",
        "  <happy-create/>",
        '  <happy-section id="desktop" label="Desktop"/>',
        ...spaces.map((entry) => `  <happy-space id="${entry.id}"/>`),
        "</nav>",
    ].join("\n");
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
                separatorPins: false,
            },
        },
        places: { bots: [], tasks: [], chatGroupOf: () => undefined },
        focus: {},
        navigation: { onChatSelect: vi.fn() },
        actions: {
            taskLeave: vi.fn(),
            taskArchive: vi.fn(),
            botArchive: vi.fn(),
            surfaceLeave: vi.fn(),
            taskRename,
            botRename,
        },
        now: 1,
        titleShimmerEnabled: false,
        stemCellAnimation: true,
        brand: false,
        footer: null,
        sessionRow: () => undefined,
        worktreeRows: () => [],
        onChildSelect: vi.fn(),
    };
    const view = render(<HappyAgentSpacesSidebar {...props} />);
    const row = (id: string) =>
        view.container.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    const field = () =>
        view.container.querySelector<HTMLElement>('[contenteditable="plaintext-only"]');
    const type = (name: string, key: "Enter" | "Escape") => {
        const editor = field()!;
        editor.textContent = name;
        fireEvent.keyDown(editor, { key });
    };
    return { view, row, field, type, taskRename, botRename, sidebarWrite };
}

it("renames a task, new work and a bot from their menus, with Enter saving and Escape cancelling", () => {
    const { view, row, field, type, taskRename, botRename } = fixture();

    fireEvent.contextMenu(row("space:release"));
    fireEvent.click(view.getByText("Rename task"));
    type("Release notes for 2.4", "Enter");
    expect(taskRename).toHaveBeenCalledWith("task-release", "Release notes for 2.4");
    expect(field()).toBeNull();

    fireEvent.contextMenu(row("space:stem"));
    fireEvent.click(view.getByText("Rename task"));
    type("Onboarding copy", "Enter");
    expect(taskRename).toHaveBeenLastCalledWith("task-stem", "Onboarding copy");

    fireEvent.contextMenu(row("space:steward"));
    fireEvent.click(view.getByText("Rename bot"));
    type("Ship it", "Escape");
    expect(botRename).not.toHaveBeenCalled();
    expect(field()).toBeNull();

    // F2 on the focused row edits it in place; Enter opens the row instead.
    row("space:steward").focus();
    fireEvent.keyDown(row("space:steward"), { key: "F2" });
    type("Ship it", "Enter");
    expect(botRename).toHaveBeenCalledWith("bot-steward", "Ship it");
});

it("renames a section's heading as an edit of the document", () => {
    const { view, row, type, sidebarWrite } = fixture();
    fireEvent.contextMenu(row("section:desktop"));
    fireEvent.click(view.getByText("Rename section"));
    type("Desktop app", "Enter");
    expect(sidebarWrite).toHaveBeenCalledTimes(1);
    const html = sidebarWrite.mock.calls[0]![0] as string;
    expect(html).toContain('<happy-section id="desktop" label="Desktop app"');
    expect(html).toContain('<happy-space id="release"');
});

/** A connection whose journal events the test delivers one at a time. */
function journal(daemon: ReturnType<typeof fakeHappyAgentDaemonCreate>) {
    const queue: ReturnType<typeof daemon.eventEmit>[] = [];
    let wake: (() => void) | undefined;
    const sync: HappyAgentSpacesDeps["sync"] = {
        async *follow({ signal }) {
            yield { kind: "reconcile" };
            while (!signal.aborted) {
                const event = queue.shift();
                if (event)
                    yield {
                        kind: "update",
                        update: { kind: "event", cursor: event.cursor, event },
                    };
                else await new Promise<void>((resolve) => (wake = resolve));
            }
        },
        health: () => undefined,
    };
    return {
        sync,
        /** Delivers one `space.updated` as the journal would. */
        async echo(space: Parameters<typeof daemon.eventEmit<"space.updated">>[1]["space"]) {
            queue.push(daemon.eventEmit("space.updated", { space }));
            wake?.();
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 10));
            });
        },
    };
}

it("shows the new name from the Enter that saves it, through a late reply and an out-of-order echo", async () => {
    const daemon = fakeHappyAgentDaemonCreate();
    const row = (version: number, title: string, working = false) => ({
        ...space("release", title, "task"),
        version,
        updatedAt: version,
        working,
    });
    daemon.client.listSpaces = vi.fn(async () => ({
        cursor: "0",
        sections: [],
        spaces: [row(1, "Release notes")],
    }));
    daemon.client.getSpaceSidebar = vi.fn(async () => ({
        artifactId: "sidebar",
        version: 1,
        html: '<nav>\n  <happy-space id="release"/>\n</nav>',
        spaces: [],
    }));
    daemon.client.reportSpaceAttention = vi.fn(async () => ({ batch: null }));
    const { sync, echo } = journal(daemon);
    const store = happyAgentSpacesStoreCreate({ client: daemon.client, sync });
    // The daemon's answer to the rename is held until the test lets it go.
    let reply!: (taken: boolean) => void;
    const taskRename = vi.fn(
        (_taskId: string, _name: string) => new Promise<boolean>((resolve) => (reply = resolve)),
    );
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
                    taskRename,
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
    const item = () => view.container.querySelector<HTMLElement>('[data-item-id="space:release"]');
    // What the row reads, without its icon's glyph.
    const label = () =>
        item()
            ?.textContent?.replace(/\p{Co}/gu, "")
            .trim() ?? "";
    try {
        await waitFor(() => expect(label()).toBe("Release notes"));
        // Every label the row's node ever carried, as each commit left it.
        const labels: string[] = [];
        const record = () => {
            const text = label();
            if (text !== labels.at(-1)) labels.push(text);
        };
        record();
        const observer = new MutationObserver(record);
        observer.observe(view.container, { subtree: true, childList: true, characterData: true });

        fireEvent.contextMenu(item()!);
        fireEvent.click(view.getByText("Rename task"));
        const editor = view.container.querySelector<HTMLElement>(
            '[contenteditable="plaintext-only"]',
        )!;
        editor.textContent = "Release notes for 2.4";
        fireEvent.keyDown(editor, { key: "Enter" });
        record();
        // In the keystroke: the row already reads the new name.
        expect(label()).toBe("Release notes for 2.4");
        expect(taskRename).toHaveBeenCalledWith("task-release", "Release notes for 2.4");

        // Before the reply, the daemon's journal delivers a change it made
        // before the rename landed, and then an older one out of order.
        await echo(row(2, "Release notes", true));
        await echo(row(1, "Release notes"));
        expect(label()).toBe("Release notes for 2.4");
        await act(async () => reply(true));
        await echo(row(3, "Release notes for 2.4", true));
        observer.disconnect();
        record();
        expect(label()).toBe("Release notes for 2.4");
        // Old, then new: nothing in between and nothing old again.
        expect(labels).toEqual(["Release notes", "Release notes for 2.4"]);
    } finally {
        view.unmount();
        store[Symbol.dispose]();
    }
});
