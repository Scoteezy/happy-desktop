import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { createRenderer } from "./testing";

const observer = vi.hoisted(() => ({
    report: undefined as ((offset: number, scrolling: boolean) => void) | undefined,
    indexes: (): readonly number[] => [],
    offset: (): number | null => null,
}));
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
    const observeElementOffset: typeof actual.observeElementOffset = (instance, report) => {
        // Drive the real virtualizer's observer callback in the exact order of
        // a deferred scroll report overtaken by a model-owned restoration.
        observer.report = report;
        observer.indexes = () => instance.getVirtualItems().map((item) => item.index);
        observer.offset = () => instance.scrollOffset;
        return () => {
            observer.report = undefined;
        };
    };
    return { ...actual, observeElementOffset };
});

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}

it("keeps the restored range when an old idle offset arrives before the native compensation event", async () => {
    const view = createRenderer();
    let prepend!: () => void;
    let viewport: HTMLElement | undefined;
    const blockScroll = (event: Event) => {
        if (event.target === viewport) event.stopImmediatePropagation();
    };
    function Harness() {
        const [rows, setRows] = useState(() =>
            Array.from({ length: 200 }, (_, index) => `history:${index}`),
        );
        prepend = () =>
            flushSync(() =>
                setRows((previous) => [
                    ...Array.from({ length: 29 }, (_, index) => `older:${index}`),
                    ...previous,
                ]),
            );
        return (
            <div style={{ display: "flex", height: 360, width: 620 }}>
                <MessageList
                    virtualize
                    estimateDependencies={[]}
                    estimateRows={rows}
                    estimateRowSize={() => 44}
                    cachedRowSize={() => 44}
                >
                    {rows.map((row) => (
                        <div key={row} style={{ height: 44 }}>
                            {row}
                        </div>
                    ))}
                </MessageList>
            </div>
        );
    }
    try {
        view.render(Harness, { width: 1000, height: 1000 });
        await view.ready();
        await frames();
        viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
        viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -10_000, cancelable: true }));
        viewport.scrollTop = 4000;
        viewport.dispatchEvent(new Event("scroll"));
        flushSync(() => observer.report!(viewport!.scrollTop, true));
        await frames();
        const oldOffset = viewport.scrollTop;
        const point = viewport.getBoundingClientRect().bottom - 32;
        const held = [
            ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ].find((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top <= point && rect.bottom > point;
        })!;
        expect(held).toBeDefined();
        const top = held.getBoundingClientRect().top;
        const index = Number(held.dataset.index) + 29;
        // The manual restoration report must win before the browser reports
        // that native write; the observer still has its older idle offset.
        document.addEventListener("scroll", blockScroll, true);
        prepend();
        await frames();
        expect(viewport.scrollTop).toBeGreaterThan(oldOffset);
        expect(observer.offset()).toBe(viewport.scrollTop);
        expect(observer.indexes()).toContain(index);
        expect(held.isConnected).toBe(true);
        expect(viewport.querySelector(`[data-index="${index}"]`)).toBe(held);
        flushSync(() => observer.report!(oldOffset, false));
        expect(observer.indexes(), "idle callback discarded the restored anchor index").toContain(
            index,
        );
        expect(held.isConnected, "idle callback replaced the original anchor DOM").toBe(true);
        expect(viewport.querySelector(`[data-index="${index}"]`)).toBe(held);
        expect(Math.abs(held.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
        document.removeEventListener("scroll", blockScroll, true);
        viewport.dispatchEvent(new Event("scroll"));
        flushSync(() => observer.report!(viewport!.scrollTop, true));
        await frames();
        expect(held.isConnected).toBe(true);
        expect(viewport.querySelector(`[data-index="${index}"]`)).toBe(held);
        expect(Math.abs(held.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    } finally {
        document.removeEventListener("scroll", blockScroll, true);
        view.destroy();
    }
});
