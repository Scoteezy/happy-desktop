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
    const taskRename = vi.fn();
    const botRename = vi.fn();
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
