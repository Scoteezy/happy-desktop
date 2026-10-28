import "./styles.css";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * The fold is foundational: a row that folds always shows it as its last
 * column, on one edge for every row. A change mark stands left of it, and
 * neither the mark nor the note its hover brings moves it. A heading's title
 * runs its full width until a hover control shows, which is laid over its end.
 */

const ITEMS: SidebarItem[] = [
    { collapsed: false, icon: "doc", id: "plain", kind: "view", label: "Plain parent" },
    { depth: 1, icon: "doc", id: "plain-child", kind: "view", label: "Child" },
    {
        change: { kind: "archive", label: "Archiving" },
        collapsed: false,
        icon: "doc",
        id: "marked",
        kind: "view",
        label: "Marked parent",
    },
    { depth: 1, icon: "doc", id: "marked-child", kind: "view", label: "Child" },
    {
        change: { from: "plain", kind: "arrive", label: "Moving here from Desktop" },
        collapsed: true,
        icon: "doc",
        id: "arrived",
        kind: "view",
        label: "Arrived parent",
    },
    { depth: 1, icon: "doc", id: "arrived-child", kind: "view", label: "Child" },
    {
        action: { icon: "plus", label: "New in a section with a long name", reveal: "hover" },
        collapsed: false,
        id: "heading",
        kind: "section",
        label: "A section whose name is long enough to run under its controls",
    },
    { icon: "doc", id: "under", kind: "view", label: "Under" },
];

const render = async () => {
    const view = createRenderer().render(
        () => (
            <Sidebar
                activeItemId=""
                foldControlPlacement="trailing"
                foldControlReveal="hover"
                onItemAction={() => {}}
                onItemChangeAccept={() => {}}
                onItemChangeReject={() => {}}
                onItemCollapseToggle={() => {}}
                onItemSelect={() => {}}
                sections={[{ id: "spaces", items: ITEMS }]}
                style={{ width: 280 }}
            />
        ),
        { width: 300, height: 420 },
    );
    await view.ready();
    return view.container;
};

const row = (root: HTMLElement, id: string) =>
    root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!;
const fold = (root: HTMLElement, id: string) =>
    row(root, id).querySelector<HTMLElement>(
        ':scope > [data-happy-desktop-ui="sidebar-item-fold"]',
    )!;
const box = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top };
};

it("keeps every fold on one column, shown, with or without a mark, and while a mark's note shows", async () => {
    const root = await render();
    const ids = ["plain", "marked", "arrived"];
    const rest = ids.map((id) => box(fold(root, id)));
    expect(new Set(rest.map((edge) => Math.round(edge.left))).size).toBe(1);
    for (const id of ids) expect(getComputedStyle(fold(root, id)).opacity).toBe("1");
    // Marks stand left of the fold.
    for (const id of ["marked", "arrived"]) {
        const mark = row(root, id).querySelector(".happy-sidebar__item-change-mark")!;
        expect(box(mark).right).toBeLessThanOrEqual(box(fold(root, id)).left);
    }

    for (const id of ["marked", "arrived"]) {
        const mark = row(root, id).querySelector<HTMLElement>(".happy-sidebar__item-change-mark")!;
        await userEvent.hover(mark);
        const note = row(root, id).querySelector<HTMLElement>(
            '[data-happy-desktop-ui="sidebar-item-change-note"]',
        )!;
        await expect.poll(() => getComputedStyle(note).opacity).toBe("1");
        expect(ids.map((each) => box(fold(root, each)))).toEqual(rest);
        // The note stands above its row, ending left of the mark, with a ✕.
        expect(box(note).top).toBeLessThan(box(row(root, id)).top);
        expect(note.getBoundingClientRect().right).toBeLessThanOrEqual(box(mark).left);
        expect(
            note.querySelector('[data-happy-desktop-ui="sidebar-item-change-reject"]'),
        ).not.toBeNull();
    }
});

it("runs a heading's title under its + only while the + shows, without moving the fold", async () => {
    const root = await render();
    const heading = row(root, "heading");
    const label = heading.querySelector<HTMLElement>(".happy-sidebar__section-item-label")!;
    const headingFold = heading.querySelector<HTMLElement>(".happy-sidebar__section-item-fold")!;
    const before = { fold: box(headingFold), label: box(label), width: label.clientWidth };
    expect(getComputedStyle(label).maskImage).toBe("none");
    await userEvent.hover(heading);
    const action = heading.querySelector<HTMLElement>(".happy-sidebar__section-item-action")!;
    await expect.poll(() => getComputedStyle(action.firstElementChild!).opacity).toBe("1");
    expect({ fold: box(headingFold), label: box(label), width: label.clientWidth }).toEqual(before);
    expect(getComputedStyle(label).maskImage).not.toBe("none");
});
