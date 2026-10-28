import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { Sidebar, type SidebarItem } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * A row's children are part of its change. Folded, they already carry it, so
 * the row unfolds with them washed (or dimmed, on the side a move leaves) as
 * one block with it on the very first frame: nothing plain first, nothing
 * fading in, nothing added once the rows are measured.
 */

const ITEMS: SidebarItem[] = [
    {
        change: { kind: "arrive", label: "Moving here from Desktop" },
        collapsed: true,
        icon: "doc",
        id: "arrived",
        kind: "view",
        label: "Arrived parent",
    },
    { depth: 1, icon: "doc", id: "arrived-a", kind: "view", label: "Child" },
    { depth: 2, icon: "doc", id: "arrived-b", kind: "view", label: "Grandchild" },
    {
        change: { kind: "move", label: "Moving to Research" },
        collapsed: true,
        icon: "doc",
        id: "leaving",
        kind: "view",
        label: "Leaving parent",
    },
    { depth: 1, icon: "doc", id: "leaving-a", kind: "view", label: "Child" },
    { collapsed: true, icon: "doc", id: "plain", kind: "view", label: "Plain" },
    { depth: 1, icon: "doc", id: "plain-a", kind: "view", label: "Child" },
];

const render = async () => {
    let toggle: ((id: string) => void) | undefined;
    const Fixture = () => {
        const [items, itemsSet] = useState(ITEMS);
        toggle = (id) =>
            itemsSet((current) =>
                current.map((item) =>
                    item.id === id ? { ...item, collapsed: item.collapsed !== true } : item,
                ),
            );
        return (
            <Sidebar
                activeItemId=""
                foldControlPlacement="trailing"
                onItemChangeAccept={() => {}}
                onItemCollapseToggle={(id) => toggle?.(id)}
                onItemSelect={() => {}}
                sections={[{ id: "spaces", items }]}
                style={{ width: 280 }}
            />
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 300, height: 420 });
    await view.ready();
    const root = view.container;
    const row = (id: string) => root.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
    // Unfolded synchronously, then read before the browser paints a frame.
    const unfold = (id: string) => flushSync(() => toggle!(id));
    return { root, row, unfold };
};

const moving = (node: HTMLElement) =>
    node.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running");

it("unfolds a row with a change with its children already part of it, on the first frame", async () => {
    const view = await render();
    const parentWash = getComputedStyle(view.row("arrived")!).backgroundImage;
    expect(parentWash).not.toBe("none");
    view.unfold("arrived");
    for (const id of ["arrived-a", "arrived-b"]) {
        const child = view.row(id)!;
        expect(child.dataset.change).toBe("arrive");
        expect(child.dataset.changeBlock).toBe("member");
        expect(getComputedStyle(child).backgroundImage).toBe(parentWash);
        expect(moving(child)).toEqual([]);
    }
    // One block: the parent heads it and squares its foot onto the child.
    expect(view.row("arrived")!.dataset.changeBlock).toBe("head");
    expect(getComputedStyle(view.row("arrived")!).borderBottomLeftRadius).toBe("0px");
    // The side a move leaves unfolds already dimmed.
    view.unfold("leaving");
    const child = view.row("leaving-a")!;
    expect(child.dataset.change).toBe("move");
    const label = child.querySelector<HTMLElement>('[data-happy-desktop-ui="sidebar-item-label"]');
    const dimmed = [...child.children].find((node) => node.contains(label))!;
    expect(getComputedStyle(dimmed).opacity).toBe("0.38");
    expect(
        getComputedStyle(dimmed)
            .transitionDuration.split(", ")
            .every((d) => d === "0s"),
    ).toBe(true);
    // A row with no change keeps plain children.
    view.unfold("plain");
    expect(view.row("plain-a")!.dataset.change).toBeUndefined();
    expect(getComputedStyle(view.row("plain-a")!).backgroundImage).toBe("none");
});
