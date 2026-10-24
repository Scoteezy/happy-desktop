import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it.each([false, true])(
    "keeps a restored short reader row fixed when a row arrives below it (trim: %s)",
    async (trim) => {
        const view = createRenderer();
        let append!: () => void;
        function Fixture() {
            const [rows, setRows] = useState([70, 70]);
            append = () =>
                flushSync(() =>
                    setRows((previous) => [previous[0]!, previous[1]! - (trim ? 2 : 0), 42]),
                );
            return (
                <div style={{ display: "flex", height: 360 }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[rows.length]}
                        estimateRowSize={(index) => rows[index] ?? 0}
                        footer={<div style={{ height: 34 }} />}
                        footerHeight={34}
                        initialScrollPosition={{
                            type: "row",
                            rowKey: ".$1",
                            offset: 70,
                            viewportInset: 42,
                        }}
                    >
                        {rows.map((height, index) => (
                            <div key={index} data-row={index} style={{ height }}>
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
            await frame();
            await frame();
            const row = view.container.querySelector<HTMLElement>('[data-row="1"]')!;
            const before = row.getBoundingClientRect().top;
            append();
            await frame();
            await frame();
            expect(row.isConnected).toBe(true);
            expect(Math.abs(row.getBoundingClientRect().top - before)).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);
