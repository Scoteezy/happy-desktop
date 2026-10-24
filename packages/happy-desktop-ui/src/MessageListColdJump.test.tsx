import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}

it("keeps the painted reading point when history follows a clamped cold jump", async () => {
    const request = window.requestIdleCallback;
    const cancel = window.cancelIdleCallback;
    // Keep unseen rows cold until the gesture requires them.
    window.requestIdleCallback = () => 1;
    window.cancelIdleCallback = () => undefined;
    const view = createRenderer();
    const cached = new Map<string, number>();
    let jump!: () => void;
    let prepend!: () => void;
    let viewport: HTMLElement | undefined;
    const blockScroll = (event: Event) => {
        if (event.target === viewport) event.stopImmediatePropagation();
    };
    function Harness() {
        const [generation, update] = useState(0);
        const [rows, setRows] = useState(() =>
            Array.from({ length: 80 }, (_, index) => ({
                id: `history:${index}`,
                height: index < 40 ? 20 : 100,
            })),
        );
        jump = () => flushSync(() => update((previous) => previous + 1));
        prepend = () =>
            flushSync(() =>
                setRows((previous) => [
                    ...Array.from({ length: 23 }, (_, index) => ({
                        id: `older:${index}`,
                        height: 50,
                    })),
                    ...previous,
                ]),
            );
        return (
            <div style={{ display: "flex", height: 360, width: 620 }}>
                <MessageList
                    virtualize
                    estimateDependencies={[generation]}
                    estimateRows={rows}
                    estimateRowSize={(index) => {
                        const row = rows[index]!;
                        cached.set(row.id, row.height);
                        return row.height;
                    }}
                    cachedRowSize={(index) => cached.get(rows[index]!.id)}
                >
                    {rows.map((row) => (
                        <div key={row.id} style={{ height: row.height }}>
                            {row.id}
                        </div>
                    ))}
                </MessageList>
            </div>
        );
    }
    view.render(Harness, { width: 1000, height: 1000 });
    try {
        await view.ready();
        await frames();
        viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
        // The new native offset and cold model publish before a scroll report.
        document.addEventListener("scroll", blockScroll, true);
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -10_000, cancelable: true }));
        viewport.scrollTop = 0;
        jump();
        await frames();
        const bounds = viewport.getBoundingClientRect();
        const point = bounds.bottom - 32;
        const held = [
            ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ].find((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top <= point && rect.bottom > point;
        })!;
        expect(held, "cold jump left no painted row at the reading point").toBeDefined();
        const top = held.getBoundingClientRect().top;
        prepend();
        await frames();
        expect(held.isConnected, "prepending removed the cold jump's painted anchor").toBe(true);
        expect(Math.abs(held.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    } finally {
        document.removeEventListener("scroll", blockScroll, true);
        view.destroy();
        window.requestIdleCallback = request;
        window.cancelIdleCallback = cancel;
    }
});

it.each([
    { height: 815, remaining: 573, seed: 7 },
    { height: 410, remaining: 87, seed: 104729 },
])("keeps visible rows after the dock covers the old point: %j", async ({ height, remaining }) => {
    const view = createRenderer();
    let growDock!: () => void;
    let insert!: (index: number) => void;
    function Harness() {
        const [dock, setDock] = useState(0);
        const [rows, setRows] = useState(() =>
            Array.from({ length: 80 }, (_, index) => ({ id: `row:${index}`, height: 40 })),
        );
        growDock = () => flushSync(() => setDock(height - remaining));
        insert = (index) =>
            flushSync(() =>
                setRows((previous) => [
                    ...previous.slice(0, index),
                    { id: "inserted", height: 64 },
                    ...previous.slice(index),
                ]),
            );
        return (
            <div style={{ display: "flex", flexDirection: "column", height, width: 620 }}>
                <MessageList
                    virtualize
                    estimateDependencies={[]}
                    estimateRows={rows}
                    estimateRowSize={(index) => rows[index]!.height}
                    cachedRowSize={(index) => rows[index]!.height}
                >
                    {rows.map((row) => (
                        <div key={row.id} style={{ height: row.height }}>
                            {row.id}
                        </div>
                    ))}
                </MessageList>
                <div style={{ flex: "none", height: dock }} />
            </div>
        );
    }
    view.render(Harness, { width: 1000, height: 1200 });
    try {
        await view.ready();
        await frames();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -10_000, cancelable: true }));
        viewport.scrollTop = 1000;
        viewport.dispatchEvent(new Event("scroll"));
        await frames();
        const atPoint = () => {
            const point = viewport.getBoundingClientRect().bottom - 32;
            return [
                ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ].find((row) => {
                const rect = row.getBoundingClientRect();
                return rect.top <= point && rect.bottom > point;
            })!;
        };
        const covered = atPoint();
        expect(covered).toBeDefined();
        growDock();
        await frames();
        expect(covered.getBoundingClientRect().top).toBeGreaterThan(
            viewport.getBoundingClientRect().bottom,
        );
        const held = atPoint();
        expect(held).toBeDefined();
        const top = held.getBoundingClientRect().top;
        const between = Math.floor(
            (Number(held.dataset.index) + Number(covered.dataset.index)) / 2,
        );
        insert(between);
        await frames();
        expect(held.isConnected).toBe(true);
        expect(Math.abs(held.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    } finally {
        view.destroy();
    }
});
