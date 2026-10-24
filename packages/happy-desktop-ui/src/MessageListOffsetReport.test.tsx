import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { RetainedViews } from "./RetainedViews";
import { createRenderer } from "./testing";

const observer = vi.hoisted(() => ({
    report: undefined as ((offset: number, scrolling: boolean) => void) | undefined,
    indexes: (): readonly number[] => [],
    offset: (): number | null => null,
    scrolling: (): boolean => false,
    rangeEnd: (): number | undefined => undefined,
}));
vi.mock("@tanstack/react-virtual", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@tanstack/react-virtual")>();
    const observeElementOffset: typeof actual.observeElementOffset = (instance, report) => {
        // Drive the real virtualizer's observer callback in the exact order of
        // a deferred scroll report overtaken by a model-owned restoration.
        observer.report = report;
        observer.indexes = () => instance.getVirtualItems().map((item) => item.index);
        observer.offset = () => instance.scrollOffset;
        observer.scrolling = () => instance.isScrolling;
        observer.rangeEnd = () => instance.range?.endIndex;
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

it.each(["model", "native"] as const)(
    "mounts the current range during a %s write while the virtualizer is scrolling",
    async (kind) => {
        const view = createRenderer();
        let append!: () => void;
        function Harness() {
            const [rows, setRows] = useState(() => Array.from({ length: 50 }, (_, index) => index));
            append = () => flushSync(() => setRows((previous) => [...previous, 50, 51, 52]));
            return (
                <div style={{ display: "flex", height: 360, width: 620 }}>
                    <MessageList
                        virtualize
                        estimateRows={rows}
                        estimateDependencies={[]}
                        estimateRowSize={() => 100}
                        cachedRowSize={() => 100}
                        onScrollPositionChange={() => undefined}
                        {...(kind === "native"
                            ? {
                                  initialScrollPosition: {
                                      type: "row" as const,
                                      rowKey: ".$10",
                                      offset: 25,
                                      viewportInset: 32,
                                  },
                              }
                            : {})}
                    >
                        {rows.map((row) => (
                            <div key={row} data-row={row} style={{ height: 100 }}>
                                Row {row}
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
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            // The actual observer callback places TanStack in its scrolling state.
            // Its spurious-echo guard must not swallow the following model write.
            flushSync(() => observer.report!(viewport.scrollTop - 10, true));
            expect(observer.scrolling()).toBe(true);
            const before = viewport.scrollTop;
            if (kind === "model") append();
            else {
                viewport.scrollTop += 2000;
                viewport.dispatchEvent(new Event("scrollend"));
            }
            // Inspect the committed range without triggering a lazy range lookup,
            // and the DOM before yielding another frame or native scroll event.
            const last = kind === "model" ? 52 : 30;
            expect(observer.rangeEnd()).toBe(last);
            expect(viewport.querySelector(`[data-row="${last}"]`)).not.toBeNull();
            expect(viewport.scrollTop).toBeGreaterThan(before);
            expect(observer.offset()).toBe(viewport.scrollTop);
        } finally {
            view.destroy();
        }
    },
);

it("keeps the restored range when an old idle offset arrives before the native compensation event", async () => {
    const view = createRenderer();
    let prepend!: () => void;
    let show!: (visible: boolean) => void;
    let viewport: HTMLElement | undefined;
    const blockScroll = (event: Event) => {
        if (event.target === viewport) event.stopImmediatePropagation();
    };
    function Harness() {
        const [visible, setVisible] = useState(true);
        show = (next) => flushSync(() => setVisible(next));
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
        const content = (
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
        return (
            <RetainedViews
                activeId={visible ? "chat" : undefined}
                views={[{ id: "chat", content }]}
            />
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
        const retiredReport = observer.report!;
        show(false);
        const hiddenOffset = observer.offset();
        // The library's debounce can still fire after its observer is removed.
        // It must not overwrite the cached offset a retained view reattaches at.
        flushSync(() => retiredReport(oldOffset, false));
        expect(observer.offset()).toBe(hiddenOffset);
        show(true);
        await frames();
        expect(viewport.scrollTop).toBe(hiddenOffset);
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
