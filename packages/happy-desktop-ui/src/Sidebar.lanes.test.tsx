import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarReorder, type SidebarSection } from "./Sidebar";
import { createRenderer } from "./testing";
import { useState } from "react";
import { flushSync } from "react-dom";

/*
 * With trailing folds every row and heading keeps one geometry: the name, what
 * the row is doing STATUS_GAP after it, and the fold on one column at the
 * trailing edge. Hover only fades the fold in; nothing moves.
 */
const STATUS_GAP = 6;

const sections = (): SidebarSection[] => [
    {
        action: { icon: "plus", label: "New in Desktop" },
        collapsed: false,
        id: "desktop",
        items: [
            { collapsed: false, count: 3, icon: "doc", id: "tabs", kind: "view", label: "Tabs" },
            { depth: 1, icon: "doc", id: "tabs-close", kind: "view", label: "Close button" },
            {
                count: 12,
                icon: "doc",
                id: "long",
                kind: "view",
                label: "A name long enough that it has to ellipsize before what it reports",
            },
            { icon: "doc", id: "plain", kind: "view", label: "Plain" },
        ],
        label: "Desktop",
    },
    {
        collapsed: false,
        id: "older",
        items: [
            { collapsed: true, icon: "doc", id: "old", kind: "view", label: "Old work" },
            { depth: 1, icon: "doc", id: "old-child", kind: "view", label: "Old child" },
            { icon: "doc", id: "old-plain", kind: "view", label: "Old plain" },
            { icon: "doc", id: "pinned", kind: "view", label: "Pinned", reorderable: false },
        ],
        label: "Older",
    },
];

const render = (
    onItemReorder?: (sectionId: string, move: SidebarReorder) => void,
    onItemSelect: (id: string) => void = () => {},
) => {
    const view = createRenderer();
    view.render(
        () => (
            <Sidebar
                activeItemId=""
                data-testid="lanes"
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                itemDragAcrossSections
                onItemCollapseToggle={() => {}}
                onItemReorder={onItemReorder ?? (() => {})}
                onItemSelect={onItemSelect}
                onSectionAction={() => {}}
                onSectionCollapseToggle={() => {}}
                style={{ width: 280 }}
                sections={sections()}
            />
        ),
        { width: 304, height: 420 },
    );
    return view;
};

const ui = (root: ParentNode, name: string) =>
    root.querySelector<HTMLElement>(`[data-happy-desktop-ui="${name}"]`);

const parts = (root: HTMLElement) =>
    [root, ...root.querySelectorAll<HTMLElement>("*")].map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 2) / 2);
    });

const finish = (el: Element) => {
    for (const animation of el.getAnimations({ subtree: true })) animation.finish();
};

it("keeps the fold on one column and the status right after the name, through hover", async () => {
    const view = render();
    await view.ready();
    const root = view.$('[data-testid="lanes"]').element;
    const rows = [...root.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="sidebar-item"]')];
    const heads = [
        ...root.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="sidebar-section-head"][data-lanes]',
        ),
    ];
    expect(heads.length).toBe(2);
    // Old child is folded away.
    expect(rows.map((row) => row.dataset.itemId)).toEqual([
        "tabs",
        "tabs-close",
        "long",
        "plain",
        "old",
        "old-plain",
        "pinned",
    ]);

    const folds = [
        ...rows.map((row) =>
            row.querySelector<HTMLElement>(':scope > [data-happy-desktop-ui="sidebar-item-fold"]'),
        ),
        ...heads.map((head) => ui(head, "sidebar-section-fold")),
    ];
    const columns = new Set(
        folds.map((fold) => {
            expect(fold, "every row and heading has a fold cell").not.toBeNull();
            const r = fold!.getBoundingClientRect();
            return `${Math.round(r.left)}:${Math.round(r.right)}`;
        }),
    );
    expect([...columns]).toHaveLength(1);
    for (const fold of folds) expect(getComputedStyle(fold!).opacity).toBe("0");

    // The status starts STATUS_GAP after the name, and a long name ellipsizes
    // before it rather than pushing it under the fold.
    const fold = folds[0]!.getBoundingClientRect();
    for (const id of ["tabs", "long"]) {
        const row = root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
        const label = ui(row, "sidebar-item-label")!;
        const count = ui(row, "sidebar-item-count")!;
        const gap = count.getBoundingClientRect().left - label.getBoundingClientRect().right;
        expect(Math.abs(gap - STATUS_GAP), `${id} status gap ${gap}`).toBeLessThanOrEqual(0.5);
        expect(count.getBoundingClientRect().right).toBeLessThanOrEqual(fold.left);
    }
    const long = ui(root.querySelector('[data-item-id="long"]')!, "sidebar-item-label")!;
    expect(long.scrollWidth).toBeGreaterThan(long.clientWidth);

    // Hover reveals the fold of a row that folds, shut or open, and of a
    // heading; no box in the row moves.
    for (const target of [...rows, ...heads]) {
        const before = parts(target);
        await userEvent.hover(target);
        finish(target);
        expect(parts(target), `${target.textContent} moved on hover`).toEqual(before);
        const own =
            target.dataset.happyDesktopUi === "sidebar-item"
                ? target.querySelector<HTMLElement>(
                      ':scope > [data-happy-desktop-ui="sidebar-item-fold"]',
                  )!
                : ui(target, "sidebar-section-fold")!;
        // A row with nothing to fold keeps the cell, unseen.
        if (own.hasAttribute("data-empty")) expect(getComputedStyle(own).visibility).toBe("hidden");
        else expect(getComputedStyle(own).opacity).toBe("1");
    }
    await userEvent.unhover(heads[1]!);

    // The heading's + fades in left of its fold; Older offers no +.
    const desktopHead = heads[0]!;
    await userEvent.hover(desktopHead);
    finish(desktopHead);
    const plus = ui(desktopHead, "sidebar-section-action")!;
    expect(getComputedStyle(plus).opacity).toBe("1");
    expect(plus.getBoundingClientRect().right).toBeLessThanOrEqual(
        ui(desktopHead, "sidebar-section-fold")!.getBoundingClientRect().left,
    );
    expect(ui(heads[1]!, "sidebar-section-action")).toBeNull();
}, 120_000);

/** Press on a row, carry it to `y` (viewport), and let go. */
const carry = (row: HTMLElement, y: number) => {
    const r = row.getBoundingClientRect();
    const at = (type: string, clientY: number) =>
        row.dispatchEvent(
            new PointerEvent(type, {
                bubbles: true,
                button: 0,
                buttons: type === "pointerup" ? 0 : 1,
                clientX: r.left + 40,
                clientY,
                isPrimary: true,
                pointerId: 1,
                pointerType: "mouse",
            }),
        );
    at("pointerdown", r.top + r.height / 2);
    at("pointermove", r.top + r.height / 2 + Math.sign(y - r.top) * 8);
    at("pointermove", y);
    at("pointerup", y);
};

it("carries the same opaque subtree, connector and cursor within and across sections", async () => {
    const view = render();
    await view.ready();
    const root = view.$('[data-testid="lanes"]').element;
    const body = ui(root, "sidebar-body-content")!;
    const row = (id: string) => root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    const initial = row("tabs").getBoundingClientRect();
    const childOffset = row("tabs-close").getBoundingClientRect().top - initial.top;
    const stem = () => root.querySelector<HTMLElement>('[data-parent-id="tabs"]')!;
    const stemOffset = stem().getBoundingClientRect().top - initial.top;
    const event = (node: Element, type: string, y: number) =>
        flushSync(() =>
            node.dispatchEvent(
                new PointerEvent(type, {
                    bubbles: true,
                    button: 0,
                    buttons: type === "pointerup" ? 0 : 1,
                    clientX: initial.left + 40,
                    clientY: y,
                    pointerId: 1,
                    pointerType: "mouse",
                    isPrimary: true,
                }),
            ),
        );
    event(row("tabs"), "pointerdown", initial.top + 16);
    for (const [section, y] of [
        ["desktop", initial.top + 24],
        ["older", row("old-plain").getBoundingClientRect().bottom - 2.3],
    ] as const) {
        event(body, "pointermove", y);
        await expect
            .poll(() => row("tabs").closest<HTMLElement>("[data-section-id]")?.dataset.sectionId)
            .toBe(section);
        await expect.poll(() => row("tabs").hasAttribute("data-grabbed")).toBe(true);
        const held = row("tabs");
        const tree = held.parentElement!;
        expect(
            tree.hasAttribute("data-connector-dragging"),
            "the production lift owns every carried row",
        ).toBe(true);
        expect(ui(tree, "sidebar-tree-drag-surface")?.hasAttribute("data-carried")).toBe(true);
        expect(ui(tree, "sidebar-tree-carried-surface")).not.toBeNull();
        expect(getComputedStyle(held).cursor).toBe("grabbing");
        expect(getComputedStyle(body).cursor).toBe("grabbing");
        expect(
            row("tabs-close").getBoundingClientRect().top - held.getBoundingClientRect().top,
        ).toBeCloseTo(childOffset, 5);
        expect(stem().getBoundingClientRect().top - held.getBoundingClientRect().top).toBeCloseTo(
            stemOffset,
            5,
        );
        expect(stem().getBoundingClientRect().height).toBeGreaterThan(0);
    }
    event(body, "pointerup", row("tabs").getBoundingClientRect().top + 16);
});

it("opens a draggable row when the pointer has not crossed the drag threshold", async () => {
    const selected: string[] = [];
    const view = render(undefined, (id) => selected.push(id));
    await view.ready();
    await userEvent.click(view.$('[data-item-id="plain"]').element);
    expect(selected).toEqual(["plain"]);
});

it("drags a top-level row within and across sections, children never re-parent", async () => {
    const moves: [string, SidebarReorder][] = [];
    const selected: string[] = [];
    const view = render(
        (sectionId, move) => moves.push([sectionId, move]),
        (id) => selected.push(id),
    );
    await view.ready();
    const root = view.$('[data-testid="lanes"]').element;
    const row = (id: string) => root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;

    // Within: Plain above Tabs, which carries its child with it.
    carry(row("plain"), row("tabs").getBoundingClientRect().top + 2);
    expect(moves.at(-1)).toEqual(["desktop", { afterId: null, id: "plain" }]);

    // Across: Tabs to the end of Older, as one block with its child.
    carry(row("tabs"), row("old-plain").getBoundingClientRect().bottom - 2);
    expect(moves.at(-1)).toEqual(["older", { afterId: "old-plain", id: "tabs" }]);

    // The release was away from the carried row, so no click claimed the drag;
    // the next click still opens a row, even one that is not carried itself.
    await new Promise((resolve) => setTimeout(resolve));
    await userEvent.click(row("pinned"));
    expect(selected).toEqual(["pinned"]);

    // A child only moves among its siblings: carried out of its parent it
    // never lands in another parent or another section.
    const count = moves.length;
    carry(row("tabs-close"), row("old-plain").getBoundingClientRect().bottom - 2);
    expect(
        moves
            .slice(count)
            .every(([section, move]) => section === "desktop" && move.parentId === "tabs"),
    ).toBe(true);
}, 120_000);

it("previews the committed cross-section order and keeps every resting row still on confirmation", async () => {
    let current = sections();
    let confirm = () => {};
    const dragStates: boolean[] = [];
    const Fixture = () => {
        const [value, setValue] = useState(current);
        confirm = () => setValue([...current]);
        return (
            <Sidebar
                activeItemId=""
                foldControlPlacement="trailing"
                itemDragAcrossSections
                onItemSelect={() => {}}
                onDragChange={(active) => dragStates.push(active)}
                sections={value}
                onItemReorder={(target, move) => {
                    const source = current.find((section) =>
                        section.items.some((item) => item.id === move.id),
                    )!;
                    const at = source.items.findIndex((item) => item.id === move.id);
                    let end = at + 1;
                    while (end < source.items.length && (source.items[end]!.depth ?? 0) > 0) end++;
                    const block = source.items.slice(at, end);
                    const ids = new Set(block.map((item) => item.id));
                    current = current.map((section) => {
                        const items = section.items.filter((item) => !ids.has(item.id));
                        if (section.id === target) {
                            let insert =
                                move.afterId === null
                                    ? 0
                                    : items.findIndex((item) => item.id === move.afterId) + 1;
                            while (
                                insert > 0 &&
                                insert < items.length &&
                                (items[insert]!.depth ?? 0) > 0
                            )
                                insert++;
                            items.splice(insert, 0, ...block);
                        }
                        return { ...section, items };
                    });
                    setValue(current);
                }}
            />
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 280, height: 600 });
    await view.ready();
    const root = view.$('[data-happy-desktop-ui="sidebar-body-content"]').element;
    const row = (id: string) => root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
    const held = row("tabs");
    const from = held.getBoundingClientRect();
    const to = row("old-plain").getBoundingClientRect();
    const event = (node: Element, type: string, y: number) =>
        node.dispatchEvent(
            new PointerEvent(type, {
                bubbles: true,
                button: 0,
                buttons: type === "pointerup" ? 0 : 1,
                clientX: from.x + 40,
                clientY: y,
                pointerId: 1,
                pointerType: "mouse",
                isPrimary: true,
            }),
        );
    event(held, "pointerdown", from.y + from.height / 2);
    event(root, "pointermove", from.y + from.height / 2 + 8);
    event(root, "pointermove", to.bottom - 2);
    await new Promise(requestAnimationFrame);
    finish(root);
    expect(row("tabs").closest<HTMLElement>("[data-section-id]")!.dataset.sectionId).toBe("older");
    const resting = () =>
        [...root.querySelectorAll<HTMLElement>("[data-item-id]")]
            .filter((node) => !["tabs", "tabs-close"].includes(node.dataset.itemId!))
            .map((node) => [node.dataset.itemId, node.getBoundingClientRect().top]);
    const preview = resting();
    event(root, "pointerup", to.bottom - 2);
    await new Promise(requestAnimationFrame);
    finish(root);
    expect(resting()).toEqual(preview);
    const nodes = [...root.querySelectorAll("[data-item-id]")];
    flushSync(confirm);
    expect([...root.querySelectorAll("[data-item-id]")]).toEqual(nodes);
    expect(resting()).toEqual(preview);
    expect(dragStates).toEqual([true, false]);
});
