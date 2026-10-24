import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { createRenderer } from "./testing";
import { messageTextLayoutCacheCreate, plainTextHeight } from "./messageTextLayout";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it("reuses exact mounted history layouts while the final row streams", async () => {
    const view = createRenderer();
    const textCache = messageTextLayoutCacheCreate();
    const initial = Array.from({ length: 60 }, (_, index) => ({
        id: index,
        text: `History ${index}`,
    }));
    const heights = new Map(
        initial.map((row) => [
            row.id,
            { text: row.text, height: plainTextHeight(row.text, 600, textCache) },
        ]),
    );
    const layouts: number[] = [];
    let stream!: (lines: number) => void;
    function Harness() {
        const [rows, update] = useState(initial);
        stream = (lines) =>
            flushSync(() =>
                update((previous) => [
                    ...previous.slice(0, -1),
                    {
                        id: 59,
                        text: Array.from(
                            { length: lines },
                            (_, index) => `Live line ${index}`,
                        ).join("\n"),
                    },
                ]),
            );
        return (
            <div style={{ height: 360, width: 620 }}>
                <MessageList
                    virtualize
                    estimateDependencies={[]}
                    estimateRows={rows}
                    cachedRowSize={(index) => {
                        const row = rows[index]!;
                        const hit = heights.get(row.id);
                        return hit?.text === row.text ? hit.height : undefined;
                    }}
                    estimateRowSize={(index, width) => {
                        const row = rows[index]!;
                        const hit = heights.get(row.id);
                        if (hit?.text === row.text) return hit.height;
                        layouts.push(row.id);
                        const height = plainTextHeight(row.text, width, textCache);
                        heights.set(row.id, { text: row.text, height });
                        return height;
                    }}
                >
                    {rows.map((row) => (
                        <div
                            key={row.id}
                            style={{ fontSize: 14, lineHeight: "24px", whiteSpace: "pre-wrap" }}
                        >
                            {row.text}
                        </div>
                    ))}
                </MessageList>
            </div>
        );
    }
    view.render(Harness, { width: 1550, height: 1550 });
    try {
        await view.ready();
        await nextFrame();
        for (let lines = 2; lines <= 25; lines += 1) {
            layouts.length = 0;
            stream(lines);
            await nextFrame();
            await nextFrame();
            expect(layouts, `Pretext layouts for streaming commit ${lines}`).toEqual([59]);
        }
    } finally {
        view.destroy();
    }
});

it.each(["cached", "prepared"])(
    "mounts %s offscreen rows one per idle commit without replacing or moving the viewport",
    async (mode) => {
        const originalRequest = window.requestIdleCallback;
        const originalCancel = window.cancelIdleCallback;
        const callbacks = new Map<number, IdleRequestCallback>();
        let nextId = 0;
        window.requestIdleCallback = (callback) => {
            callbacks.set(++nextId, callback);
            return nextId;
        };
        window.cancelIdleCallback = (id) => {
            callbacks.delete(id);
        };
        let shownUpdate!: (shown: boolean) => void;
        const sizes = new Map<number, number>();
        const preparedSteps = new Map<number, number>();
        let opened = false;
        let clock = 0;
        // Every preparation step exhausts the idle slice, deterministically.
        const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
        const rows = Array.from({ length: 100 }, (_, index) => (
            <div key={index} data-row={index} style={{ height: 44 }}>
                {index === 99 ? (
                    <input aria-label="kept input" defaultValue="selection survives" />
                ) : (
                    `Row ${String(index)}`
                )}
            </div>
        ));
        function Fixture() {
            const [shown, setShown] = useState(true);
            shownUpdate = setShown;
            return (
                <div style={{ display: "flex", height: "100%" }}>
                    {shown ? (
                        <MessageList
                            virtualize
                            estimateRowSize={(index) => {
                                if (mode === "prepared" && opened && !sizes.has(index))
                                    throw new Error(
                                        `Unprepared background row ${index} was published`,
                                    );
                                sizes.set(index, 44);
                                return 44;
                            }}
                            cachedRowSize={(index) => (mode === "cached" ? 44 : sizes.get(index))}
                            prepareRowSize={
                                mode === "cached"
                                    ? undefined
                                    : function* (index) {
                                          if (sizes.has(index)) return;
                                          for (let step = 1; step <= 3; step += 1) {
                                              preparedSteps.set(index, step);
                                              clock += 9;
                                              yield;
                                          }
                                          sizes.set(index, 44);
                                      }
                            }
                        >
                            {rows}
                        </MessageList>
                    ) : null}
                </div>
            );
        }
        try {
            const view = createRenderer();
            view.render(Fixture, { width: 620, height: 360 });
            await view.ready();
            await nextFrame();
            opened = true;
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const mounted = () => [...viewport.querySelectorAll<HTMLElement>("[data-row]")];
            const initial = mounted();
            const geometry = initial.map((row) => ({
                row,
                top: row.getBoundingClientRect().top,
                height: row.getBoundingClientRect().height,
            }));
            expect(initial.length).toBeGreaterThan(0);
            expect(initial.length).toBeLessThan(12);
            const scrollTop = viewport.scrollTop;
            const input = viewport.querySelector("input")!;
            input.focus({ preventScroll: true });
            input.setSelectionRange(2, 8);
            let publishedBeforeAllPrepared = false;
            for (let step = 0; callbacks.size > 0 && step < 1000; step += 1) {
                const before = mounted();
                const [id, callback] = callbacks.entries().next().value!;
                callbacks.delete(id);
                callback({ didTimeout: false, timeRemaining: () => 8 });
                await nextFrame();
                const after = mounted();
                if (sizes.size < rows.length && after.length > initial.length)
                    publishedBeforeAllPrepared = true;
                expect(after.filter((row) => !before.includes(row)).length).toBeLessThanOrEqual(1);
                for (const row of before) expect(after).toContain(row);
                for (const { row, top, height } of geometry) {
                    expect(row.getBoundingClientRect().top).toBe(top);
                    expect(row.getBoundingClientRect().height).toBe(height);
                }
                expect(viewport.scrollTop).toBe(scrollTop);
                expect(document.activeElement).toBe(input);
                expect(input.selectionStart).toBe(2);
                expect(input.selectionEnd).toBe(8);
            }
            expect(callbacks.size).toBe(0);
            if (mode === "prepared") {
                expect(publishedBeforeAllPrepared).toBe(true);
                expect(preparedSteps.size).toBeGreaterThan(0);
                expect([...preparedSteps.values()].every((step) => step === 3)).toBe(true);
            }
            expect(mounted().length).toBe(initial.length + 12);
            flushSync(() => shownUpdate(false));
            expect(callbacks.size).toBe(0);
            flushSync(() => shownUpdate(true));
            await nextFrame();
            expect(callbacks.size).toBeGreaterThan(0);
            flushSync(() => shownUpdate(false));
            expect(callbacks.size).toBe(0);
        } finally {
            if (shownUpdate) flushSync(() => shownUpdate(false));
            window.requestIdleCallback = originalRequest;
            window.cancelIdleCallback = originalCancel;
            now.mockRestore();
        }
    },
);

it("keeps a restored short transcript on its floor when the footer grows", async () => {
    const view = createRenderer();
    let footerSet!: (height: number) => void;
    function Fixture() {
        const [footer, setFooter] = useState(34);
        footerSet = (height) => flushSync(() => setFooter(height));
        return (
            <div style={{ display: "flex", height: 360 }}>
                <MessageList
                    virtualize
                    estimateDependencies={[]}
                    estimateRowSize={() => 70}
                    footer={<div style={{ height: footer }} />}
                    footerHeight={footer}
                    initialScrollPosition={{
                        type: "row",
                        rowKey: ".$1",
                        offset: 70,
                        viewportInset: 42,
                    }}
                >
                    {[0, 1].map((index) => (
                        <div key={index} data-row={index} style={{ height: 70 }}>
                            Row {index}
                        </div>
                    ))}
                </MessageList>
            </div>
        );
    }
    try {
        view.render(Fixture, { width: 620, height: 360 });
        await view.ready();
        await nextFrame();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const row = viewport.querySelector<HTMLElement>('[data-row="1"]')!;
        const top = row.getBoundingClientRect().top;
        footerSet(35);
        await nextFrame();
        await nextFrame();
        // The floor rises by the footer's extra pixel; held space never fills
        // the viewport and lifts the rows off it.
        expect(Math.abs(row.getBoundingClientRect().top - (top - 1))).toBeLessThanOrEqual(1);
        expect(
            viewport.querySelector<HTMLElement>(".happy-message-list__virtual")!.style.minHeight,
        ).toBe("");
    } finally {
        view.destroy();
    }
});
