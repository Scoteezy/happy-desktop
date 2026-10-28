import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { Sidebar, type SidebarItem, type SidebarSeparatorPinEdge } from "./Sidebar";
import { createRenderer } from "./testing";

/*
 * A separator pinned to the top holds everything above it still; one pinned
 * to the bottom holds everything below it at the foot. The rows left to scroll
 * between them keep at least half the scrollport, or a pin warns and does not
 * hold — the bottom one first. The state follows the column's height and the
 * rows live, and pinning never moves a row that is on screen.
 */

const row = (id: string): SidebarItem => ({ icon: "doc", id, kind: "view", label: id });
const ROWS: SidebarItem[] = [
    row("a"),
    row("b"),
    { id: "top", kind: "separator", label: "" },
    ...Array.from({ length: 24 }, (_, index) => row(`m${String(index)}`)),
    { id: "bottom", kind: "separator", label: "" },
    row("y"),
    row("z"),
];

type Control = {
    readonly heightSet: (height: number) => void;
    readonly pin: (id: string, pin: SidebarSeparatorPinEdge | null) => void;
    readonly rowsSet: (rows: readonly SidebarItem[]) => void;
};

const frames = async (count = 4) => {
    for (let index = 0; index < count; index += 1)
        await new Promise((done) => requestAnimationFrame(() => done(undefined)));
};

const render = async (pins: { top?: string; bottom?: string } = {}) => {
    let control: Control | undefined;
    const Fixture = () => {
        const [height, heightSet] = useState(520);
        const [rows, rowsSet] = useState<readonly SidebarItem[]>(() =>
            ROWS.map((item) =>
                item.id === pins.top
                    ? { ...item, pin: "top" as const }
                    : item.id === pins.bottom
                      ? { ...item, pin: "bottom" as const }
                      : item,
            ),
        );
        control = {
            heightSet,
            pin: (id, edge) =>
                rowsSet((current) =>
                    current.map((item) => {
                        if (item.id !== id) return item;
                        const { pin: _, ...rest } = item;
                        return edge === null ? rest : { ...rest, pin: edge };
                    }),
                ),
            rowsSet,
        };
        return (
            <div style={{ display: "flex", flexDirection: "column", height, width: 300 }}>
                <Sidebar
                    activeItemId=""
                    onItemSelect={() => {}}
                    onItemReorder={(_, move) =>
                        rowsSet((current) => {
                            const from = current.findIndex((item) => item.id === move.id);
                            const rest = current.filter((_, index) => index !== from);
                            const at =
                                move.afterId === null
                                    ? 0
                                    : rest.findIndex((item) => item.id === move.afterId) + 1;
                            return [...rest.slice(0, at), current[from]!, ...rest.slice(at)];
                        })
                    }
                    sections={[{ id: "spaces", items: [...rows] }]}
                    style={{ width: "100%" }}
                />
            </div>
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 300, height: 900 });
    await view.ready();
    await frames();
    const root = view.container;
    const nav = root.querySelector<HTMLElement>(".happy-sidebar")!;
    const viewport = root.querySelector<HTMLElement>(".happy-sidebar__body-viewport")!;
    const act = async (change: (control: Control) => void) => {
        flushSync(() => change(control!));
        await frames();
    };
    const rect = (id: string) =>
        root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!.getBoundingClientRect();
    const scrollBy = async (delta: number) => {
        viewport.scrollTop += delta;
        await new Promise((done) => viewport.addEventListener("scroll", done, { once: true }));
        await frames();
    };
    return { act, nav, rect, root, scrollBy, viewport };
};

/*
 * What a rule's width says: a plain separator's rule is the straight part of a
 * selected row's edge (its box less the corner radius at each end); a holding
 * one runs the column's full width, edge to edge. Nothing else marks a pin.
 */
const ruleOf = (root: HTMLElement, separatorId: string) =>
    root
        .querySelector(`[data-item-id="${separatorId}"] .happy-sidebar__separator-rule`)!
        .getBoundingClientRect();
const plainWidth = (root: HTMLElement, separatorId: string) => {
    const row = root.querySelector<HTMLElement>('[data-item-id="a"]')!;
    const box = row.getBoundingClientRect();
    const radius = Number.parseFloat(getComputedStyle(row).borderTopLeftRadius);
    const rule = ruleOf(root, separatorId);
    expect(radius).toBeGreaterThan(0);
    expect(Math.abs(rule.left - (box.left + radius))).toBeLessThan(0.5);
    expect(Math.abs(rule.right - (box.right - radius))).toBeLessThan(0.5);
};
const fullWidth = (root: HTMLElement, viewport: HTMLElement, separatorId: string) => {
    const rule = ruleOf(root, separatorId);
    const column = viewport.getBoundingClientRect();
    expect(Math.abs(rule.left - column.left)).toBeLessThan(0.5);
    expect(Math.abs(rule.right - (column.left + viewport.clientWidth))).toBeLessThan(0.5);
};

it("draws a plain separator as wide as a selected row's straight edge, and no pin mark", async () => {
    const view = await render();
    plainWidth(view.root, "top");
    plainWidth(view.root, "bottom");
    expect(view.root.querySelector(".happy-sidebar__separator-pin-note")).toBeNull();
});

it("holds the rows above a top pin still while the rows below scroll, under an opaque cover", async () => {
    const view = await render({ top: "top" });
    expect(view.nav.dataset.pinTop).toBe("hold");
    const before = { a: view.rect("a").top, top: view.rect("top").top, m0: view.rect("m0").top };
    await view.scrollBy(200);
    expect(view.rect("a").top).toBe(before.a);
    expect(view.rect("top").top).toBe(before.top);
    expect(view.rect("m0").top).toBeLessThan(before.m0);
    // The scrolling rows pass under a cover that ends at the rule itself, with
    // no room past it: they run right up to the hairline.
    const rule = view.root
        .querySelector('[data-item-id="top"] .happy-sidebar__separator-rule')!
        .getBoundingClientRect();
    const cover = view.root
        .querySelector('.happy-sidebar__pin-cover[data-edge="top"]')!
        .getBoundingClientRect();
    expect(cover.top).toBeLessThanOrEqual(view.viewport.getBoundingClientRect().top);
    expect(Math.abs(cover.bottom - rule.bottom)).toBeLessThan(0.5);
    // The rule runs edge to edge; the scrollbar stands only beside the rows that scroll.
    expect(Math.round(rule.width)).toBe(Math.round(view.viewport.clientWidth));
    const track = view.root.querySelector<HTMLElement>(
        '.happy-sidebar__body > .happy-scrollbar__track[data-axis="vertical"]',
    )!;
    expect(Math.abs(track.getBoundingClientRect().top - rule.bottom)).toBeLessThan(1);
    fullWidth(view.root, view.viewport, "top");
    // The rule is the only mark of a pin: no glyph, nothing over the line.
    const separator = view.root.querySelector('[data-item-id="top"]')!;
    expect(separator.querySelector("svg, [class*='icon'], [class*='glyph']")).toBeNull();
});

it("holds the rows below a bottom pin at the foot of the column", async () => {
    const view = await render({ bottom: "bottom" });
    expect(view.nav.dataset.pinBottom).toBe("hold");
    const foot = view.viewport.getBoundingClientRect().bottom;
    const z = view.rect("z").bottom;
    expect(z).toBeLessThanOrEqual(foot);
    expect(z).toBeGreaterThan(foot - 40);
    await view.scrollBy(150);
    expect(view.rect("z").bottom).toBe(z);
    await view.scrollBy(10_000);
    expect(view.rect("z").bottom).toBe(z);
    // The rows that scroll run right down to the rule.
    const rule = view.root
        .querySelector('[data-item-id="bottom"] .happy-sidebar__separator-rule')!
        .getBoundingClientRect();
    const cover = view.root
        .querySelector('.happy-sidebar__pin-cover[data-edge="bottom"]')!
        .getBoundingClientRect();
    expect(Math.abs(cover.top - rule.top)).toBeLessThan(0.5);
    fullWidth(view.root, view.viewport, "bottom");
});

it("gives way when what is left to scroll would be less than half the column, bottom first, and follows the height live", async () => {
    const view = await render({ bottom: "bottom", top: "top" });
    expect([view.nav.dataset.pinTop, view.nav.dataset.pinBottom]).toEqual(["hold", "hold"]);
    // Grow the top block past what both can keep: the bottom gives way.
    await view.act((control) =>
        control.rowsSet([
            ...["a", "b", "c", "d", "e", "f"].map(row),
            { id: "top", kind: "separator", label: "", pin: "top" },
            ...ROWS.slice(3).map((item) =>
                item.id === "bottom" ? { ...item, pin: "bottom" as const } : item,
            ),
        ]),
    );
    await expect.poll(() => view.nav.dataset.pinBottom).toBe("tall");
    expect(view.nav.dataset.pinTop).toBe("hold");
    const bottom = view.root.querySelector<HTMLElement>('[data-item-id="bottom"]')!;
    expect(bottom.hasAttribute("data-pin-tall")).toBe(true);
    // Too tall: the rule falls back to the plain width, and pointing at it says why.
    plainWidth(view.root, "bottom");
    fullWidth(view.root, view.viewport, "top");
    const note = bottom.querySelector<HTMLElement>(".happy-sidebar__separator-pin-note")!;
    expect(getComputedStyle(note).visibility).toBe("hidden");
    await userEvent.hover(bottom);
    await expect.poll(() => getComputedStyle(note).visibility).toBe("visible");
    expect(note.textContent).toContain("section below is too tall");
    await userEvent.unhover(bottom);
    // A shorter column: the top block alone is more than half of it.
    await view.act((control) => control.heightSet(300));
    await expect.poll(() => view.nav.dataset.pinTop).toBe("tall");
    // Taller again: both hold.
    await view.act((control) => control.heightSet(900));
    await expect.poll(() => view.nav.dataset.pinBottom).toBe("hold");
    expect(view.nav.dataset.pinTop).toBe("hold");
    expect(bottom.hasAttribute("data-pin-tall")).toBe(false);
});

it("moves no row on screen when a pin is set, given up, or taken off", async () => {
    const view = await render();
    const tops = () =>
        new Map(
            [...view.root.querySelectorAll<HTMLElement>("[data-item-id]")].map((node) => [
                node.dataset.itemId!,
                node.getBoundingClientRect().top,
            ]),
        );
    const visible = (map: Map<string, number>) => {
        const box = view.viewport.getBoundingClientRect();
        return [...map].filter(([, top]) => top >= box.top && top < box.bottom);
    };
    let before = tops();
    await view.act((control) => control.pin("top", "top"));
    expect(visible(tops())).toEqual(visible(before));
    await view.scrollBy(120);
    before = tops();
    // Taken off while scrolled: the rows that scroll stay where they are.
    await view.act((control) => control.pin("top", null));
    const after = tops();
    for (const [id, top] of visible(before))
        if (!["a", "b", "top"].includes(id)) expect(after.get(id)).toBe(top);
});

it("holds the rows above still, frame by frame, while the pinned separator is carried and settles", async () => {
    const view = await render({ top: "top" });
    await view.scrollBy(60);
    const held = ["a", "b"].map((id) => [id, view.rect(id).top] as const);
    const moved: string[] = [];
    let recording = true;
    let phase = "drag";
    void (async () => {
        while (recording) {
            for (const [id, top] of held)
                if (view.rect(id).top !== top)
                    moved.push(
                        `${id} at ${String(view.rect(id).top)}, not ${String(top)}, in the ${phase}`,
                    );
            await frames(1);
        }
    })();
    const separator = view.root.querySelector<HTMLElement>('[data-item-id="top"]')!;
    const body = view.root.querySelector<HTMLElement>(".happy-sidebar__body-content")!;
    const pointer = (target: Element, type: string, y: number) =>
        target.dispatchEvent(
            new PointerEvent(type, {
                bubbles: true,
                button: 0,
                buttons: type === "pointerup" ? 0 : 1,
                clientX: 120,
                clientY: y,
                isPrimary: true,
                pointerId: 1,
                pointerType: "mouse",
            }),
        );
    const start = separator.getBoundingClientRect();
    let y = start.top + start.height / 2;
    pointer(separator, "pointerdown", y);
    for (let step = 0; step < 6; step += 1) {
        y += 8;
        pointer(body, "pointermove", y);
        await frames(1);
    }
    pointer(body, "pointerup", y);
    phase = "drop";
    await frames(30);
    recording = false;
    expect(moved).toEqual([]);
    expect(view.nav.hasAttribute("data-pin-carry")).toBe(false);
    expect(view.nav.dataset.pinTop).toBe("hold");
    // Sticking again: the rows above stay through a scroll.
    await view.scrollBy(40);
    for (const [id, top] of held) expect(view.rect(id).top).toBe(top);
});
