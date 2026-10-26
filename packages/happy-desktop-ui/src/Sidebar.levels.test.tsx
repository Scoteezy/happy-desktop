import "./styles.css";
import { expect, it } from "vitest";
import { useState } from "react";
import { Sidebar, type SidebarItem, type SidebarReorder } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * No drag changes a row's level. A bot carried over a task with an attachment
 * and a session under it, with the hand well to the right, lands among the
 * top-level rows and never under the task; the attachment carried out to the
 * left stays among the task's own rows.
 */

const ROWS: SidebarItem[] = [
    { icon: "doc", id: "happy", kind: "view", label: "Happy" },
    { collapsed: false, icon: "tasks", id: "task", kind: "view", label: "Android release" },
    { depth: 1, icon: "list", id: "todos", kind: "view", label: "Release checklist" },
    { depth: 1, icon: "chat", id: "review", kind: "view", label: "Review the build" },
    { icon: "agents", id: "bot", kind: "view", label: "Support bot" },
    { icon: "tasks", id: "pricing", kind: "view", label: "Pricing page" },
];

const depthOf = (item: SidebarItem | undefined) => item?.depth ?? 0;

/* The row a nested row stands under, or null at the top level. */
const parentOf = (items: readonly SidebarItem[], id: string): string | null => {
    const at = items.findIndex((item) => item.id === id);
    for (let row = at - 1; row >= 0; row -= 1)
        if (depthOf(items[row]) < depthOf(items[at])) return items[row]!.id;
    return null;
};

/* A move among the row's siblings, the way the document applies one. */
const moveApply = (items: readonly SidebarItem[], move: SidebarReorder): SidebarItem[] => {
    const subtreeEnd = (list: readonly SidebarItem[], index: number) => {
        let end = index + 1;
        while (end < list.length && depthOf(list[end]) > depthOf(list[index])) end += 1;
        return end;
    };
    const from = items.findIndex((item) => item.id === move.id);
    const moved = items.slice(from, subtreeEnd(items, from));
    const rest = [...items.slice(0, from), ...items.slice(from + moved.length)];
    const at =
        move.afterId !== null
            ? subtreeEnd(
                  rest,
                  rest.findIndex((item) => item.id === move.afterId),
              )
            : move.parentId !== undefined
              ? rest.findIndex((item) => item.id === move.parentId) + 1
              : 0;
    return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
};

const render = () => {
    const moves: SidebarReorder[] = [];
    let shown = ROWS;
    const Fixture = () => {
        const [items, setItems] = useState(ROWS);
        return (
            <Sidebar
                activeItemId=""
                foldControlPlacement="trailing"
                onItemCollapseToggle={() => {}}
                onItemReorder={(_, move) => {
                    moves.push(move);
                    shown = moveApply(shown, move);
                    setItems(shown);
                }}
                onItemSelect={() => {}}
                sections={[{ id: "spaces", items, label: "" }]}
                style={{ width: 280 }}
            />
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 304, height: 480 });
    return { view, moves, shown: () => shown };
};

const frame = () => new Promise<number>(requestAnimationFrame);

it("lands a bot carried over a task among the top-level rows, never under the task", async () => {
    const { view, moves, shown } = render();
    await view.ready();
    const body = view.$('[data-happy-desktop-ui="sidebar-body-content"]').element;
    const row = (id: string) => body.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    const pointer = (target: Element, type: string, x: number, y: number) =>
        target.dispatchEvent(
            new PointerEvent(type, {
                bubbles: true,
                button: 0,
                buttons: type === "pointerup" ? 0 : 1,
                clientX: x,
                clientY: y,
                isPrimary: true,
                pointerId: 1,
                pointerType: "mouse",
            }),
        );
    /** Carries `id` to `y`, `dx` sideways, and returns the level it was held at. */
    const carry = async (id: string, y: number, dx: number): Promise<string> => {
        const start = row(id).getBoundingClientRect();
        const x = start.left + 60;
        const from = start.top + start.height / 2;
        pointer(row(id), "pointerdown", x, from);
        pointer(body, "pointermove", x, from + Math.sign(y - from) * 8);
        for (let step = 1; step <= 12; step += 1) {
            pointer(body, "pointermove", x + (dx * step) / 12, from + ((y - from) * step) / 12);
            await frame();
        }
        await frame();
        const held = row(id).dataset.depth ?? "0";
        pointer(body, "pointerup", x + dx, y);
        await new Promise((resolve) => setTimeout(resolve, 500));
        return held;
    };
    const box = (id: string) => row(id).getBoundingClientRect();

    // Over the task's lower half, between it and its attachment, over the
    // attachment, and below its last row: always with the hand far right.
    const targets = [
        () => box("task").top + box("task").height * 0.62,
        () => box("todos").top + 2,
        () => box("todos").top + box("todos").height / 2,
        () => box("review").top + box("review").height * 0.62,
    ];
    for (const target of targets) {
        const count = moves.length;
        expect(await carry("bot", target(), 48)).toBe("0");
        for (const move of moves.slice(count)) expect(move.parentId).toBeUndefined();
        expect(parentOf(shown(), "bot")).toBeNull();
        expect(row("bot").dataset.depth ?? "0").toBe("0");
        expect(parentOf(shown(), "todos")).toBe("task");
        expect(parentOf(shown(), "review")).toBe("task");
    }
    // The bot did travel: it now stands right after the task's rows, at the top level.
    expect(moves.length).toBeGreaterThan(0);

    // The attachment carried out to the left and down past the bot stays under the task.
    const count = moves.length;
    expect(await carry("todos", box("pricing").bottom - 2, -48)).toBe("1");
    for (const move of moves.slice(count)) expect(move.parentId).toBe("task");
    expect(parentOf(shown(), "todos")).toBe("task");
    expect(row("todos").dataset.depth).toBe("1");
}, 60_000);
