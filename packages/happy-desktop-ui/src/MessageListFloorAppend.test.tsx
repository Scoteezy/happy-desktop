import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles.css";
import { MessageList } from "./Message";
import { createRenderer } from "./testing";

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

it.each(["queued", "insert-only", "trim"] as const)(
    "uses the pre-insertion floor when content and viewport height change together (%s)",
    async (mode) => {
        const view = createRenderer();
        let grow!: () => void;
        let commit!: () => void;
        function Fixture() {
            const [state, setState] = useState({
                height: mode === "trim" ? 832 : 732,
                inserted: false,
            });
            grow = () =>
                flushSync(() => setState({ height: mode === "trim" ? 920 : 820, inserted: false }));
            commit = () => flushSync(() => setState({ height: 665, inserted: true }));
            const rows = [
                { key: "prefix", height: 499 },
                ...(state.inserted ? [{ key: "reply", height: 76 }] : []),
                { key: "question", height: 80 },
                ...(mode === "trim" && !state.inserted ? [{ key: "removed", height: 100 }] : []),
                { key: "tail", height: 16 },
                ...(state.inserted && mode === "queued" ? [{ key: "queued", height: 76 }] : []),
            ];
            return (
                <div style={{ display: "flex", height: state.height }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[state.inserted]}
                        estimateVersion={state.inserted ? 1 : 0}
                        estimateRowSize={(index) => rows[index]!.height}
                        footer={
                            state.inserted && mode === "queued" ? (
                                <div style={{ height: 36 }} />
                            ) : undefined
                        }
                        footerHeight={state.inserted && mode === "queued" ? 36 : 0}
                        initialScrollPosition={{
                            type: "row",
                            rowKey: ".$question",
                            offset: 80,
                            viewportInset: mode === "trim" ? 124 : 24,
                        }}
                    >
                        {rows.map((row) => (
                            <div key={row.key} data-row={row.key} style={{ height: row.height }}>
                                <span>{row.key}</span>
                            </div>
                        ))}
                    </MessageList>
                </div>
            );
        }
        try {
            view.render(Fixture, { width: 620, height: 900 });
            await view.ready();
            await frame();
            await frame();
            grow();
            await frame();
            await frame();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const row = viewport.querySelector<HTMLElement>('[data-row="question"]')!;
            const inset =
                viewport.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom;
            expect(viewport.scrollTop).toBe(0);
            expect(Math.abs(inset - (mode === "trim" ? 212 : 112))).toBeLessThanOrEqual(1);
            commit();
            await frame();
            await frame();
            expect(
                Math.abs(
                    viewport.getBoundingClientRect().bottom -
                        row.getBoundingClientRect().bottom -
                        112,
                ),
            ).toBeLessThanOrEqual(1);
            expect(Math.abs(viewport.scrollTop - 114)).toBeLessThanOrEqual(1);
            expect(
                Math.abs(viewport.scrollHeight - (mode === "queued" ? 803 : 779)),
            ).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);

it.each([180, 100])(
    "keeps a formerly floored transcript visible when the viewport becomes %ipx",
    async (nextHeight) => {
        const view = createRenderer();
        let shrink!: () => void;
        function Fixture() {
            const [height, setHeight] = useState(650);
            shrink = () => flushSync(() => setHeight(nextHeight));
            return (
                <div style={{ display: "flex", height }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[]}
                        estimateRowSize={() => 70}
                        footer={<div style={{ height: 34 }} />}
                        footerHeight={34}
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
            view.render(Fixture, { width: 620, height: 700 });
            await view.ready();
            await frame();
            await frame();
            const viewport = view.container.querySelector<HTMLElement>(
                ".happy-message-list__viewport",
            )!;
            const row = viewport.querySelector<HTMLElement>('[data-row="1"]')!;
            expect(
                row.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
            ).toBeGreaterThan(500);
            shrink();
            await frame();
            await frame();
            const bounds = viewport.getBoundingClientRect();
            expect(row.isConnected).toBe(true);
            expect(
                Math.abs(
                    row.getBoundingClientRect().top - bounds.top - (nextHeight === 180 ? 82 : -12),
                ),
            ).toBeLessThanOrEqual(1);
            if (nextHeight === 100)
                expect(
                    Math.abs(bounds.bottom - row.getBoundingClientRect().bottom - 42),
                ).toBeLessThanOrEqual(1);
            expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.bottom);
        } finally {
            view.destroy();
        }
    },
);

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
