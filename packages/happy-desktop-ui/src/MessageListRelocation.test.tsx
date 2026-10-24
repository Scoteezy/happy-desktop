import { Suspense, startTransition, useState } from "react";
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

it("keeps mounted entities when a suspended prepend is replaced by a larger page", async () => {
    const view = createRenderer();
    const original = Array.from({ length: 80 }, (_, index) => `history:${index}`);
    const pending = new Promise<void>(() => undefined);
    let rendered!: () => void;
    const attempted = new Promise<void>((resolve) => {
        rendered = resolve;
    });
    let first!: () => void;
    let second!: () => void;
    function Pause({ active }: { active: boolean }) {
        if (active) {
            rendered();
            throw pending;
        }
        return null;
    }
    function Harness() {
        const [rows, setRows] = useState(original);
        const [paused, setPaused] = useState(false);
        first = () =>
            startTransition(() => {
                setRows(["loading-page", ...original]);
                setPaused(true);
            });
        second = () =>
            flushSync(() => {
                setRows([
                    ...Array.from({ length: 29 }, (_, index) => `older:${index}`),
                    ...original,
                ]);
                setPaused(false);
            });
        return (
            <div style={{ display: "flex", height: 360, width: 620 }}>
                <Suspense fallback={<div>Loading</div>}>
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
                    <Pause active={paused} />
                </Suspense>
            </div>
        );
    }
    view.render(Harness, { width: 1000, height: 1000 });
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
        const point = viewport.getBoundingClientRect().bottom - 32;
        const held = [
            ...viewport.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ].find((row) => {
            const rect = row.getBoundingClientRect();
            return rect.top <= point && rect.bottom > point;
        })!;
        expect(held).toBeDefined();
        const top = held.getBoundingClientRect().top;
        first();
        await attempted;
        // The suspended render has selected relocated indexes but cannot commit.
        expect(held.isConnected).toBe(true);
        second();
        await frames();
        expect(held.isConnected, "replacing a pending page removed the parked entity").toBe(true);
        expect(Math.abs(held.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
    } finally {
        view.destroy();
    }
});
