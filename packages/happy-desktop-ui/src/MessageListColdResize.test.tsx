import { useState } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import "./styles.css";
import { MessageList, type MessageListScrollPosition } from "./Message";
import { RetainedViews } from "./RetainedViews";
import { createRenderer } from "./testing";

const settle = async () => {
    for (let i = 0; i < 4; i++)
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

it.each([
    { target: 49, nextHeight: 1223.875 },
    { target: 25, nextHeight: 1223.875 },
    { target: 49, nextHeight: 620 },
    { target: 25, nextHeight: 620 },
])(
    "publishes the committed view when hidden before resize delivery: %j",
    async ({ target, nextHeight }) => {
        const view = createRenderer();
        let update!: (height: number, active: boolean, cold?: boolean) => void;
        let latest: MessageListScrollPosition | undefined;
        let saved: MessageListScrollPosition | undefined;
        function Fixture() {
            const [state, setState] = useState({ height: 650, active: true, generation: 0 });
            update = (height, active, cold = false) =>
                flushSync(() =>
                    setState((previous) => ({
                        height,
                        active,
                        generation: previous.generation + Number(cold),
                    })),
                );
            return (
                <RetainedViews
                    activeId={state.active ? "chat" : undefined}
                    views={[
                        {
                            id: "chat",
                            content: (
                                <div style={{ display: "flex", height: state.height }}>
                                    <MessageList
                                        key={state.generation}
                                        virtualize
                                        estimateDependencies={[]}
                                        estimateRowSize={() => 100}
                                        initialScrollPosition={
                                            saved ?? {
                                                type: "row",
                                                rowKey: `.$${target}`,
                                                offset: 25,
                                                viewportInset: 32,
                                            }
                                        }
                                        onScrollPositionChange={(position) => {
                                            latest = position;
                                        }}
                                    >
                                        {Array.from({ length: 50 }, (_, index) => (
                                            <div
                                                key={index}
                                                data-row={index}
                                                style={{ height: 100 }}
                                            >
                                                <span>Row {index} glyph</span>
                                            </div>
                                        ))}
                                    </MessageList>
                                </div>
                            ),
                        },
                    ]}
                />
            );
        }
        const viewport = () =>
            view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
        const read = () => {
            const element = viewport();
            const row = element.querySelector<HTMLElement>(`[data-row="${target}"]`)!;
            expect(row).not.toBeNull();
            const range = document.createRange();
            range.selectNodeContents(row.querySelector("span")!);
            return [
                row.getBoundingClientRect().top - element.getBoundingClientRect().top,
                range.getBoundingClientRect().top - element.getBoundingClientRect().top,
            ];
        };
        try {
            view.render(Fixture, { width: 560, height: 1400 });
            await view.ready();
            await settle();
            update(800, true);
            await settle();
            const committed = read();
            const committedTop = viewport().scrollTop;
            const element = viewport();
            // Force native layout and its clamp, then hide in this same task:
            // ResizeObserver cannot deliver the changed box in between.
            element.style.flex = "none";
            element.style.height = `${nextHeight}px`;
            const pendingTop = element.scrollTop;
            if (target === 49 && nextHeight > 800)
                expect(pendingTop).toBeLessThan(committedTop - 400);
            update(nextHeight, false);
            saved = latest;
            expect(saved?.type === "row" && saved.viewportHeight).toBe(800);
            element.style.removeProperty("height");
            element.style.removeProperty("flex");
            await settle();
            update(nextHeight, true);
            await settle();
            const warm = read();
            for (let i = 0; i < warm.length; i++)
                expect(Math.abs(warm[i]! - committed[i]!)).toBeLessThanOrEqual(1);
            update(nextHeight, true, true);
            await settle();
            const cold = read();
            for (let i = 0; i < warm.length; i++)
                expect(Math.abs(cold[i]! - warm[i]!)).toBeLessThanOrEqual(1);
        } finally {
            view.destroy();
        }
    },
);

it("keeps the legacy bottom-relative restore when no viewport height was saved", async () => {
    const view = createRenderer();
    try {
        view.render(
            () => (
                <div style={{ display: "flex", height: 1223.875 }}>
                    <MessageList
                        virtualize
                        estimateDependencies={[]}
                        estimateRowSize={() => 100}
                        initialScrollPosition={{
                            type: "row",
                            rowKey: ".$10",
                            offset: 25,
                            viewportInset: 32,
                        }}
                    >
                        {Array.from({ length: 50 }, (_, index) => (
                            <div key={index} data-row={index} style={{ height: 100 }}>
                                Row {index}
                            </div>
                        ))}
                    </MessageList>
                </div>
            ),
            { width: 800, height: 1400 },
        );
        await view.ready();
        await settle();
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const row = viewport.querySelector<HTMLElement>('[data-row="10"]')!;
        expect(viewport.scrollTop).toBe(0);
        expect(
            Math.abs(row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 1012),
        ).toBeLessThanOrEqual(1);
    } finally {
        view.destroy();
    }
});

it.each([
    { count: 50, before: 650, after: 1223.875, zoom: 1 },
    { count: 50, before: 650, after: 360, zoom: 1 },
    { count: 50, before: 650, after: 360, zoom: 1, live: true },
    { count: 50, before: 650, after: 620, zoom: 1 },
    { count: 2, before: 360, after: 650, zoom: 1 },
    { count: 2, before: 650, after: 180, zoom: 1 },
    { count: 50, before: 650, after: 1223.875, zoom: 0.67 },
    { count: 2, before: 360, after: 650, zoom: 0.67 },
])("restores the same row and glyph as a retained view: %j", async (scenario) => {
    const view = createRenderer();
    let change!: (active: boolean, height: number, zoom: number, cold?: boolean) => void;
    let latest: MessageListScrollPosition | undefined;
    let saved: MessageListScrollPosition | undefined;
    const target = scenario.count === 2 ? 1 : 10;
    const measured = scenario.count === 50 && scenario.after === 360 ? 7 : target;
    function Fixture() {
        const [state, setState] = useState({
            active: true,
            height: scenario.before,
            zoom: 1,
            generation: 0,
        });
        change = (active, height, zoom, cold = false) =>
            flushSync(() =>
                setState((previous) => ({
                    active,
                    height,
                    zoom,
                    generation: previous.generation + Number(cold),
                })),
            );
        return (
            <div style={{ height: state.height, width: 537.3125, zoom: state.zoom }}>
                <RetainedViews
                    activeId={state.active ? "chat" : undefined}
                    views={[
                        {
                            id: "chat",
                            content: (
                                <div style={{ display: "flex", height: state.height }}>
                                    <MessageList
                                        key={state.generation}
                                        virtualize
                                        estimateDependencies={[]}
                                        estimateRowSize={() => 100}
                                        initialScrollPosition={
                                            saved ?? {
                                                type: "row",
                                                rowKey: `.$${target}`,
                                                offset: 25,
                                                viewportInset: 32,
                                            }
                                        }
                                        onScrollPositionChange={(position) => {
                                            latest = position;
                                        }}
                                    >
                                        {Array.from({ length: scenario.count }, (_, index) => (
                                            <div
                                                key={index}
                                                data-row={index}
                                                style={{ height: 100 }}
                                            >
                                                <span>Row {index} glyph</span>
                                            </div>
                                        ))}
                                    </MessageList>
                                </div>
                            ),
                        },
                    ]}
                />
            </div>
        );
    }
    const read = () => {
        const viewport = view.container.querySelector<HTMLElement>(
            ".happy-message-list__viewport",
        )!;
        const row = viewport.querySelector<HTMLElement>(`[data-row="${measured}"]`)!;
        expect(row).not.toBeNull();
        const range = document.createRange();
        range.selectNodeContents(row.querySelector("span")!);
        return [
            row.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
            range.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
        ];
    };
    try {
        view.render(Fixture, { width: 800, height: 1400 });
        await view.ready();
        await settle();
        const before = read();
        change(false, scenario.before, 1);
        await settle();
        saved = latest;
        expect(saved?.type).toBe("row");
        expect(saved?.type === "row" && saved.viewportHeight).toBe(scenario.before);
        const live = scenario.live === true;
        if (live) {
            change(true, scenario.before, 1);
            await settle();
        }
        change(live, scenario.after, scenario.zoom);
        await settle();
        change(true, scenario.after, scenario.zoom);
        await settle();
        const warm = read();
        if (scenario.count === 50 && scenario.zoom === 1)
            for (let i = 0; i < before.length; i++)
                expect(Math.abs(warm[i]! - before[i]!)).toBeLessThanOrEqual(1);
        change(true, scenario.after, scenario.zoom, true);
        await settle();
        const cold = read();
        for (let i = 0; i < warm.length; i++)
            expect(Math.abs(cold[i]! - warm[i]!)).toBeLessThanOrEqual(1);
    } finally {
        view.destroy();
    }
});
