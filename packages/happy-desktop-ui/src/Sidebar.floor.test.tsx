import "./styles.css";
import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { Sidebar, type SidebarItem, type SidebarItemChange } from "./Sidebar";
import { SidebarChanges } from "./SidebarChanges";
import { createRenderer } from "./testing";

/*
 * The top of the sidebar never moves. Folding or unfolding a section, the
 * bottom-most one included and while scrolled to the very bottom, a proposal's
 * marks and rows coming and going, and the bar that floats over the foot of the
 * rows appearing or disappearing all leave every row above the change exactly
 * where it was. A permanent floor under the last row lets the rows scroll clear
 * of the bar, so the bottom-most section unfolds where it can be seen.
 */

const heading = (id: string, label: string, collapsed = false): SidebarItem => ({
    collapsed,
    id,
    kind: "section",
    label,
});
const row = (id: string, label: string): SidebarItem => ({
    icon: "doc",
    id,
    kind: "view",
    label,
});

const LONG: SidebarItem[] = [
    ...["releases", "desktop", "research", "writing", "infra"].flatMap((id) => [
        heading(id, id),
        ...[1, 2, 3].map((index) => row(`${id}-${String(index)}`, `${id} task ${String(index)}`)),
    ]),
    heading("later", "later", true),
    ...[1, 2, 3, 4].map((index) => row(`later-${String(index)}`, `later task ${String(index)}`)),
];

type Control = {
    readonly barShow: (shown: boolean) => void;
    readonly changeSet: (id: string, change: SidebarItemChange | undefined) => void;
    readonly fold: (id: string) => void;
    readonly rowAdd: (after: string, item: SidebarItem) => void;
    readonly rowRemove: (id: string) => void;
};

const render = async () => {
    let control: Control | undefined;
    const Fixture = () => {
        const [rows, setRows] = useState(LONG);
        const [bar, setBar] = useState(true);
        control = {
            barShow: setBar,
            changeSet: (id, change) =>
                setRows((current) =>
                    current.map((entry) => (entry.id === id ? { ...entry, change } : entry)),
                ),
            fold: (id) =>
                setRows((current) =>
                    current.map((entry) =>
                        entry.id === id ? { ...entry, collapsed: !entry.collapsed } : entry,
                    ),
                ),
            rowAdd: (after, item) =>
                setRows((current) =>
                    current.flatMap((entry) => (entry.id === after ? [entry, item] : [entry])),
                ),
            rowRemove: (id) => setRows((current) => current.filter((entry) => entry.id !== id)),
        };
        return (
            <div style={{ display: "flex", flexDirection: "column", height: 520, width: 300 }}>
                <Sidebar
                    activeItemId=""
                    bodyFloat={
                        bar ? (
                            <SidebarChanges
                                onAccept={() => {}}
                                onChat={() => {}}
                                onReject={() => {}}
                                proposer="Prioritizing"
                            />
                        ) : undefined
                    }
                    foldControlPlacement="trailing"
                    onItemChangeAccept={() => {}}
                    onItemCollapseToggle={(id) => control?.fold(id)}
                    onItemSelect={() => {}}
                    sections={[{ id: "spaces", items: rows }]}
                    style={{ width: "100%" }}
                />
            </div>
        );
    };
    const view = createRenderer().render(() => <Fixture />, { width: 300, height: 520 });
    await view.ready();
    const root = view.container;
    const viewport = root.querySelector<HTMLElement>(".happy-sidebar__body-viewport")!;
    const act = async (change: (control: Control) => void) => {
        flushSync(() => change(control!));
        await frames();
    };
    /** Every rendered row's top, by ID. */
    const tops = () =>
        new Map(
            [...root.querySelectorAll<HTMLElement>("[data-item-id]")].map((node) => [
                node.dataset.itemId!,
                node.getBoundingClientRect().top,
            ]),
        );
    const rect = (id: string) =>
        root.querySelector<HTMLElement>(`[data-item-id="${id}"]`)!.getBoundingClientRect();
    const bar = () => root.querySelector<HTMLElement>(".happy-sidebar-changes");
    const scrollToBottom = async () => {
        viewport.scrollTop = viewport.scrollHeight;
        await new Promise((done) => viewport.addEventListener("scroll", done, { once: true }));
        await frames();
    };
    return { act, bar, rect, scrollToBottom, tops, viewport };
};

const frames = async () => {
    for (let index = 0; index < 3; index += 1)
        await new Promise((done) => requestAnimationFrame(() => done(undefined)));
};

/** No row that stood above `limit` before has moved. */
const expectStill = (
    before: ReadonlyMap<string, number>,
    after: ReadonlyMap<string, number>,
    limit: number,
) => {
    const moved = [...before]
        .filter(([id, top]) => top < limit && after.has(id))
        .map(([id, top]) => [id, after.get(id)! - top] as const)
        .filter(([, delta]) => Math.abs(delta) > 0.01);
    expect(moved).toEqual([]);
};

it("unfolds the bottom-most section at the bottom where it can be seen, and folds it back, without moving a row", async () => {
    const view = await render();
    await view.scrollToBottom();
    const scrollTop = view.viewport.scrollTop;
    expect(scrollTop).toBeGreaterThan(0);

    let before = view.tops();
    await view.act((control) => control.fold("later"));
    expectStill(before, view.tops(), Number.POSITIVE_INFINITY);
    expect(view.viewport.scrollTop).toBe(scrollTop);
    // What unfolded stands on screen, clear of the bar floating over the foot.
    const first = view.rect("later-1");
    expect(first.bottom).toBeLessThanOrEqual(view.bar()!.getBoundingClientRect().top);
    expect(first.top).toBeGreaterThan(view.viewport.getBoundingClientRect().top);

    before = view.tops();
    await view.act((control) => control.fold("later"));
    expectStill(before, view.tops(), Number.POSITIVE_INFINITY);
    expect(view.viewport.scrollTop).toBe(scrollTop);
});

it("folds and unfolds a section above the bottom, scrolled to the bottom, without moving a row above it", async () => {
    const view = await render();
    await view.scrollToBottom();
    for (const id of ["infra", "infra", "writing", "writing"]) {
        const before = view.tops();
        await view.act((control) => control.fold(id));
        expectStill(before, view.tops(), before.get(id)! + 1);
    }
});

it("keeps every row still while the bar comes and goes, at the top and at the bottom", async () => {
    const view = await render();
    for (const scrolled of [false, true]) {
        if (scrolled) await view.scrollToBottom();
        const before = view.tops();
        const scrollTop = view.viewport.scrollTop;
        await view.act((control) => control.barShow(false));
        expect(view.bar()).toBeNull();
        expectStill(before, view.tops(), Number.POSITIVE_INFINITY);
        await view.act((control) => control.barShow(true));
        expectStill(before, view.tops(), Number.POSITIVE_INFINITY);
        expect(view.viewport.scrollTop).toBe(scrollTop);
    }
});

it("keeps the rows above still while marks and proposed rows come and go", async () => {
    const view = await render();
    await view.scrollToBottom();
    let before = view.tops();
    await view.act((control) =>
        control.changeSet("infra-2", { kind: "archive", label: "Archive" }),
    );
    await view.act((control) => control.changeSet("writing", { kind: "move", label: "Move" }));
    expectStill(before, view.tops(), Number.POSITIVE_INFINITY);

    before = view.tops();
    await view.act((control) =>
        control.rowAdd("infra-1", {
            ...row("arrived", "arrived task"),
            change: { kind: "arrive", label: "Move here" },
        }),
    );
    expectStill(before, view.tops(), before.get("infra-2")!);

    // Accepted: the source leaves and the destination settles.
    before = view.tops();
    await view.act((control) => {
        control.rowRemove("research-2");
        control.changeSet("arrived", undefined);
    });
    expectStill(before, view.tops(), before.get("research-2")!);
});

it("lets the last row scroll clear of the bar", async () => {
    const view = await render();
    await view.scrollToBottom();
    const bar = view.bar()!.getBoundingClientRect();
    expect(view.rect("later").bottom).toBeLessThanOrEqual(bar.top);
});
