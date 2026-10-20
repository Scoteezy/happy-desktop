import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { createRenderer } from "./testing";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it("mounts ready offscreen rows one per idle commit without replacing or moving the viewport", async () => {
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
                    <MessageList virtualize estimateRowSize={() => 44} cachedRowSize={() => 44}>
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
        for (let step = 0; callbacks.size > 0 && step < 100; step += 1) {
            const before = mounted();
            const [id, callback] = callbacks.entries().next().value!;
            callbacks.delete(id);
            callback({ didTimeout: false, timeRemaining: () => 8 });
            await nextFrame();
            const after = mounted();
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
    }
});
