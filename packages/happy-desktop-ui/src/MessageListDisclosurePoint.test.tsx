import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { useMessageListDisclosureAnchor } from "./messageListDisclosureAnchor";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function frames() {
    await frame();
    await frame();
}

it.each([
    { count: 45, height: 360, dock: 0, afterDock: 0, above: false },
    { count: 7, height: 820, dock: 0, afterDock: 0, above: false },
    { count: 7, height: 820, dock: 155, afterDock: 0, above: false },
    { count: 7, height: 820, dock: 0, afterDock: 0, above: true },
    { count: 7, height: 820, dock: 0, afterDock: 155, above: true },
])(
    "keeps a disclosure at native zero when content arrives below it: %j",
    async ({ count, height, dock, afterDock, above }) => {
        const view = createRenderer();
        let insert!: () => void;
        function Disclosure({ expand }: { expand: () => void }) {
            const anchor = useMessageListDisclosureAnchor();
            const control = useRef<HTMLButtonElement>(null);
            return (
                <button
                    ref={control}
                    onClick={() => {
                        anchor?.(control.current!);
                        expand();
                    }}
                >
                    Details
                </button>
            );
        }
        function Harness() {
            const [open, setOpen] = useState(false);
            const [added, setAdded] = useState(false);
            insert = () => flushSync(() => setAdded(true));
            const rows = Array.from({ length: count }, (_, index) => ({
                id: `row:${index}`,
                height: index === 2 && open ? 80 : 40,
            }));
            if (added) rows.splice(above ? 2 : 3, 0, { id: "inserted", height: 64 });
            return (
                <div style={{ display: "flex", flexDirection: "column", height, width: 620 }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[open]}
                        estimateRows={rows}
                        estimateRowSize={(index) => rows[index]!.height}
                        cachedRowSize={(index) => rows[index]!.height}
                    >
                        {rows.map((row) => (
                            <div key={row.id} style={{ height: row.height }}>
                                {row.id === "row:2" ? (
                                    <Disclosure expand={() => setOpen(true)} />
                                ) : (
                                    row.id
                                )}
                            </div>
                        ))}
                    </MessageList>
                    <div style={{ flex: "none", height: added ? afterDock : dock }} />
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
            viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -10_000, cancelable: true }));
            viewport.scrollTop = 0;
            viewport.dispatchEvent(new Event("scroll"));
            await frames();
            const control = viewport.querySelector<HTMLButtonElement>("button")!;
            expect(control).toBeDefined();
            const top = control.getBoundingClientRect().top;
            flushSync(() => control.click());
            await frames();
            expect(Math.abs(control.getBoundingClientRect().top - top)).toBeLessThanOrEqual(1);
            insert();
            await frames();
            expect(control.isConnected).toBe(true);
            expect(
                Math.abs(control.getBoundingClientRect().top - top + Math.max(0, afterDock - dock)),
            ).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);
