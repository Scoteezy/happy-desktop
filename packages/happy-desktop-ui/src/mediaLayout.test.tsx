import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
    mediaLayoutProject,
    type ComposerSnapshot,
    type ConversationEntry,
    type ConversationMediaItem,
    type ConversationMediaLayout,
    type ConversationToolCall,
} from "happy-desktop-state";
import { afterEach, describe, expect, it } from "vitest";
import "./styles.css";
import { ConversationMedia } from "./ConversationMedia";
import { conversationMediaHeight } from "./conversationRowHeight";
import { conversationMediaRunRows, conversationMediaRuns } from "./conversationMediaRuns";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import {
    MEDIA_FLOW_GAP,
    mediaColumnsPlan,
    mediaFlowGeometry,
    mediaJustifiedPlan,
    type MediaFlowPlan,
} from "./mediaLayout";

const IMAGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')}`;

function image(name: string, width: number, height: number): ConversationMediaItem {
    return { kind: "image", name, mimeType: "image/png", size: 1, width, height, url: IMAGE_URL };
}

const wide = image("wide.png", 1440, 900);
const flat = image("flat.png", 1400, 200);
const narrow = image("narrow.png", 300, 900);
const square = image("square.png", 1024, 1024);
const portrait = image("portrait.png", 1024, 1536);
const pageCapture = image("page.png", 1440, 7200);
const connect = image("connect.png", 3680, 2392);
const profile = image("profile.png", 3456, 2168);

const near = (actual: number, expected: number, label: string) =>
    expect(
        Math.abs(actual - expected),
        `${label}: ${String(actual)} vs ${String(expected)}`,
    ).toBeLessThan(0.01);

/** Every tile keeps its picture's shape exactly unless its box letterboxes it. */
function expectUncropped(plan: MediaFlowPlan, measure: number) {
    for (const row of plan.rows)
        for (const tile of row.tiles) {
            const box = mediaFlowGeometry(plan, measure).tiles.find((t) => t.index === tile.index)!;
            const boxRatio = box.width / box.height;
            /* A box is the picture's shape, or a letterbox around it: wider
               only when its height hit the cap. Never narrower or shorter
               than the picture drawn inside it. */
            expect(boxRatio, `tile ${String(tile.index)}`).toBeGreaterThanOrEqual(
                tile.ratio - 1e-9,
            );
            if (boxRatio > tile.ratio + 1e-9) expect(box.height).toBe(row.maxHeight);
        }
}

describe("column grids", () => {
    it("lays two columns at the full measure, each row as tall as its tallest picture", () => {
        const plan = mediaColumnsPlan([wide, flat, narrow, wide], 2);
        const geometry = mediaFlowGeometry(plan, 720);
        const column = (720 - MEDIA_FLOW_GAP) / 2;
        const [a, b, c, d] = geometry.tiles;
        near(a!.width, column, "wide fills its column");
        near(a!.height, column / 1.6, "wide keeps 16:10");
        near(b!.x, column + MEDIA_FLOW_GAP, "second column starts after the gap");
        near(b!.height, column / 7, "the 7:1 strip is shown whole");
        /* 1:3 at the 480 cap is 160 wide: narrowed, not cropped. */
        near(c!.width, 160, "narrow narrows to the cap");
        near(c!.height, 480, "narrow is capped");
        near(c!.y, a!.height + MEDIA_FLOW_GAP, "second row starts under the taller of the first");
        near(d!.y, c!.y, "a row shares its top");
        near(geometry.height, column / 1.6 + MEDIA_FLOW_GAP + 480, "grid height");
        expectUncropped(plan, 720);
    });

    it("letterboxes a page-tall capture instead of cropping it", () => {
        const plan = mediaColumnsPlan([pageCapture], 2);
        const [tile] = mediaFlowGeometry(plan, 720).tiles;
        near(tile!.height, 480, "capped height");
        near(tile!.width, 160, "held at the minimum width");
        expectUncropped(plan, 720);
    });

    it("stacks one column at full width, never past a picture's own pixels or 640 tall", () => {
        const plan = mediaColumnsPlan([wide, square, portrait, image("icon.png", 120, 80)], 1);
        const [w, s, p, icon] = mediaFlowGeometry(plan, 720).tiles;
        near(w!.width, 720, "landscape fills the measure");
        near(s!.width, 640, "square narrows to the 640 cap");
        near(p!.height, 640, "portrait capped");
        near(p!.width, 640 / 1.5, "portrait keeps its shape");
        near(icon!.width, 120, "a small picture is not blown up");
        expectUncropped(plan, 720);
    });
});

describe("density", () => {
    const retina = { ...image("retina.png", 1040, 720), scale: 2 };
    const retinaWide = { ...image("retina-wide.png", 2880, 1800), scale: 2 };

    it("never draws a 2× capture past its point size, in a grid or on its own", () => {
        const [cell] = mediaFlowGeometry(mediaColumnsPlan([retina], 1), 900).tiles;
        near(cell!.width, 520, "one column stops at 520 points");
        near(cell!.height, 360, "and keeps its shape");
        const [alone] = mediaFlowGeometry(mediaJustifiedPlan([retina]), 900).tiles;
        near(alone!.width, 520, "a lone picture is drawn at its point size");
        const [big] = mediaFlowGeometry(mediaColumnsPlan([retinaWide], 1), 720).tiles;
        near(big!.width, 720, "a capture wider than the measure still fills it");
    });

    it("caps a justified row at its smallest picture's point height", () => {
        const plan = mediaJustifiedPlan([retina, { ...retina, name: "retina-2.png" }]);
        const geometry = mediaFlowGeometry(plan, 1400);
        near(geometry.height, 360, "the row is no taller than 360 points");
    });
});

describe("justified rows", () => {
    it("puts the complaint's two screenshots side by side at one height, uncropped", () => {
        const plan = mediaJustifiedPlan([connect, profile]);
        expect(plan.rows).toHaveLength(1);
        const geometry = mediaFlowGeometry(plan, 720);
        const [a, b] = geometry.tiles;
        near(a!.height, b!.height, "one shared height");
        near(a!.width + MEDIA_FLOW_GAP + b!.width, 720, "the row fills the measure");
        near(a!.width / a!.height, 3680 / 2392, "first keeps its ratio");
        near(b!.width / b!.height, 3456 / 2168, "second keeps its ratio");
    });

    it("gives extreme shapes rows of their own, in order", () => {
        const plan = mediaJustifiedPlan([wide, flat, square, narrow, portrait]);
        expect(plan.rows.map((row) => row.tiles.map((tile) => tile.index))).toEqual([
            [0],
            [1],
            [2],
            [3],
            [4],
        ]);
        expect(plan.rows[1]!.type).toBe("cells");
        expect(plan.rows[3]!.type).toBe("cells");
        near(mediaFlowGeometry(plan, 720).tiles[1]!.width, 720, "the strip spans the measure");
        expectUncropped(plan, 720);
    });

    it("partitions a long set into full rows of at most four that keep every shape", () => {
        const images = [wide, square, portrait, wide, square, wide, portrait, square, wide];
        const plan = mediaJustifiedPlan(images);
        expect(plan.rows.flatMap((row) => row.tiles.map((tile) => tile.index))).toEqual(
            images.map((_, index) => index),
        );
        const geometry = mediaFlowGeometry(plan, 720);
        for (const row of plan.rows) {
            expect(row.tiles.length).toBeLessThanOrEqual(4);
            const boxes = row.tiles.map(
                (tile) => geometry.tiles.find((t) => t.index === tile.index)!,
            );
            const right = boxes.at(-1)!.x + boxes.at(-1)!.width;
            near(right, 720, "a justified row ends at the measure");
            for (const box of boxes) near(box.height, boxes[0]!.height, "one height per row");
        }
        expectUncropped(plan, 720);
    });

    it("does not blow small pictures up to fill a row", () => {
        const plan = mediaJustifiedPlan([image("a.png", 100, 100), image("b.png", 150, 100)]);
        const [a, b] = mediaFlowGeometry(plan, 720).tiles;
        near(a!.height, 100, "row held at the pictures' own height");
        near(b!.width, 150, "second at its own width");
    });

    it("keeps a lone picture at its own size", () => {
        const geometry = mediaFlowGeometry(mediaJustifiedPlan([image("small.png", 300, 200)]), 720);
        near(geometry.tiles[0]!.width, 300, "lone width");
        near(geometry.height, 200, "lone height");
    });
});

function mediaCall(
    id: string,
    toolName: string,
    items: readonly ConversationMediaItem[],
    layout?: ConversationMediaLayout,
): ConversationEntry {
    const tool: ConversationToolCall = {
        toolCallId: id,
        toolName,
        arguments: {},
        status: "success",
        failed: false,
        presentation: { type: "media", items, ...(layout ? { layout } : {}) },
    };
    return { kind: "agentActivity", id, sequence: id, activity: { kind: "tool", tool } };
}

function exploration(id: string): ConversationEntry {
    return {
        kind: "agentActivity",
        id,
        sequence: id,
        activity: {
            kind: "tool",
            tool: {
                toolCallId: id,
                toolName: "exploration",
                arguments: null,
                status: "success",
                failed: false,
                presentation: { type: "exploration", operations: [{ kind: "read", name: "a.ts" }] },
            },
        },
    };
}

function shell(id: string): ConversationEntry {
    return {
        kind: "agentActivity",
        id,
        sequence: id,
        activity: {
            kind: "tool",
            tool: {
                toolCallId: id,
                toolName: "bash",
                arguments: {},
                status: "success",
                failed: false,
                presentation: { type: "execCommand", command: "ls", output: "" },
            },
        },
    };
}

function agentText(id: string, text: string): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "media",
            sequence: id,
            changePts: id,
            sender: { id: "agent", displayName: "Happy", username: "happy", kind: "agent" },
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-20T10:00:00.000Z",
        },
    };
}

const TWO: ConversationMediaLayout = { type: "columns", columns: 2 };
const ONE: ConversationMediaLayout = { type: "columns", columns: 1 };

describe("runs", () => {
    it("merges consecutive same-grid calls across exploration rows, and breaks on anything else", () => {
        const entries = [
            mediaCall("read-a", "Read", [wide], TWO),
            exploration("explore"),
            mediaCall("read-b", "Read", [flat], TWO),
            mediaCall("read-c", "Read", [narrow], TWO),
            agentText("prose", "Now generating."),
            mediaCall("gen-a", "codex_imagegen", [square], ONE),
            mediaCall("gen-b", "codex_imagegen", [portrait], ONE),
            mediaCall("read-d", "Read", [wide], TWO),
            shell("shell"),
            mediaCall("read-e", "Read", [wide], TWO),
            mediaCall("auto", "present_files", [wide, square]),
        ];
        const runs = conversationMediaRuns(entries);
        expect(runs.get("read-a")).toEqual({ type: "deferred" });
        expect(runs.get("read-b")).toEqual({ type: "deferred" });
        const end = runs.get("read-c");
        expect(end?.type).toBe("end");
        if (end?.type === "end") {
            expect(end.columns).toBe(2);
            expect(end.members.map((member) => member.entryId)).toEqual([
                "read-a",
                "read-b",
                "read-c",
            ]);
        }
        expect(runs.get("explore")).toBeUndefined();
        expect(runs.get("gen-a")).toEqual({ type: "deferred" });
        expect(runs.get("gen-b")?.type).toBe("end");
        /* A different column count, a shell call, and an unarranged set each break a run. */
        expect(runs.get("read-d")).toBeUndefined();
        expect(runs.get("read-e")).toBeUndefined();
        expect(runs.get("auto")).toBeUndefined();
    });

    it("gives a row a new estimate value exactly when its part in a run changes", () => {
        const first = mediaCall("read-a", "Read", [wide], TWO);
        const between = exploration("explore");
        const second = mediaCall("read-b", "Read", [flat], TWO);
        const before = [first, between];
        const rowsBefore = conversationMediaRunRows(before, conversationMediaRuns(before));
        expect(rowsBefore[0]).toBe(first);
        const after = [first, between, second];
        const runs = conversationMediaRuns(after);
        const rowsAfter = conversationMediaRunRows(after, runs);
        /* Two rows ahead changed the first row's part: its value changes too. */
        expect(rowsAfter[0]).not.toBe(first);
        expect(rowsAfter[1]).toBe(between);
        expect(conversationMediaRunRows(after, conversationMediaRuns(after))[0]).toBe(rowsAfter[0]);
    });
});

const roots: (() => void)[] = [];
afterEach(() => {
    for (const unmount of roots.splice(0)) unmount();
});

function mount(width: number, height: number, element: React.ReactElement): HTMLElement {
    const host = document.createElement("div");
    host.style.cssText = `width:${String(width)}px;height:${String(height)}px;display:flex;`;
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(element));
    roots.push(() => {
        root.unmount();
        host.remove();
    });
    return host;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const tree: ConversationMediaLayout = {
    type: "tree",
    root: [
        {
            type: "element",
            tag: "section",
            style: { display: "flex", flexDirection: "column", rowGap: "12px" },
            children: [
                {
                    type: "element",
                    tag: "p",
                    style: { fontSize: "large", fontWeight: "700" },
                    children: [{ type: "text", text: "Before and after, side by side" }],
                },
                {
                    type: "element",
                    tag: "div",
                    style: { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "12px" },
                    children: [0, 1].map((index) => ({
                        type: "element" as const,
                        tag: "figure" as const,
                        style: { display: "flex", flexDirection: "column", rowGap: "6px" },
                        children: [
                            { type: "item" as const, index },
                            {
                                type: "element" as const,
                                tag: "figcaption" as const,
                                style: { fontSize: "small" as const, tone: "muted" as const },
                                children: [
                                    {
                                        type: "text" as const,
                                        text: "A caption long enough to wrap onto a second line in a narrow column.",
                                    },
                                ],
                            },
                        ],
                    })),
                },
                { type: "item", index: 2, style: { width: "50%" } },
            ],
        },
    ],
};

describe("painted geometry agrees with the row model", () => {
    const cases: readonly {
        name: string;
        items: readonly ConversationMediaItem[];
        layout?: ConversationMediaLayout;
    }[] = [
        { name: "automatic", items: [connect, profile, flat, wide, narrow, square] },
        { name: "two columns", items: [wide, flat, narrow, pageCapture, square], layout: TWO },
        { name: "one column", items: [wide, square, portrait], layout: ONE },
        { name: "tree", items: [connect, profile, flat], layout: tree },
    ];
    for (const testCase of cases)
        for (const width of [720, 433, 361])
            it(`${testCase.name} at ${String(width)}px`, async () => {
                await document.fonts.ready;
                const host = mount(
                    width,
                    4000,
                    <div style={{ width: `${String(width)}px` }}>
                        <ConversationMedia
                            items={testCase.items}
                            {...(testCase.layout ? { layout: testCase.layout } : {})}
                        />
                    </div>,
                );
                await nextFrame();
                const painted = host
                    .querySelector(".happy-conversation-media")!
                    .getBoundingClientRect().height;
                const modeled = conversationMediaHeight(testCase.items, width, testCase.layout);
                expect(
                    Math.abs(painted - modeled),
                    `${String(painted)} vs ${String(modeled)}`,
                ).toBeLessThan(0.5);
                if (testCase.layout?.type === "tree") return;
                const plan =
                    testCase.layout?.type === "columns"
                        ? mediaColumnsPlan(testCase.items, testCase.layout.columns)
                        : mediaJustifiedPlan(testCase.items);
                const origin = host.querySelector(".happy-media-flow")!.getBoundingClientRect();
                const tiles = [...host.querySelectorAll(".happy-media-image-tile")];
                for (const box of mediaFlowGeometry(plan, width).tiles) {
                    const rect = tiles[box.index]!.getBoundingClientRect();
                    expect(Math.abs(rect.left - origin.left - box.x)).toBeLessThan(0.5);
                    expect(Math.abs(rect.top - origin.top - box.y)).toBeLessThan(0.5);
                    expect(Math.abs(rect.width - box.width)).toBeLessThan(0.5);
                    expect(Math.abs(rect.height - box.height)).toBeLessThan(0.5);
                }
            });

    it("reserves exactly what a transcript with merged runs and a tree paints", async () => {
        await document.fonts.ready;
        const composer: ComposerSnapshot = {
            agentUserIds: [],
            attachments: [],
            capabilities: { commands: [], mentions: false, shellMode: false },
            focused: false,
            mentionCandidates: [],
            revision: 0,
            scopeId: "media-geometry",
            submission: { status: "idle" },
            text: "",
        };
        const entries = [
            agentText("intro", "Reading the screenshots."),
            mediaCall("read-a", "Read", [wide], TWO),
            exploration("explore"),
            mediaCall("read-b", "Read", [flat], TWO),
            mediaCall("read-c", "Read", [narrow], TWO),
            agentText("prose", "Generating."),
            mediaCall("gen-a", "codex_imagegen", [square], ONE),
            mediaCall("gen-b", "codex_imagegen", [portrait], ONE),
            mediaCall("tree", "present_files", [connect, profile, flat], tree),
            mediaCall("auto", "present_files", [connect, profile]),
        ];
        for (const width of [1100, 760]) {
            const host = mount(
                width,
                6000,
                <ConversationView
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerSend={() => {}}
                            onComposerValueChange={() => {}}
                            running={false}
                        />
                    }
                    conversationId={`media-geometry-${String(width)}`}
                    entries={entries}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                />,
            );
            for (let frame = 0; frame < 10; frame += 1) await nextFrame();
            const rows = [
                ...host.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
            ].sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
            expect(rows.length).toBeGreaterThanOrEqual(entries.length);
            for (let index = 0; index < entries.length - 1; index += 1) {
                const row = rows[index]!.getBoundingClientRect();
                const modeled = rows[index + 1]!.getBoundingClientRect().top - row.top;
                expect(
                    Math.abs(row.height - modeled),
                    `${String(width)}px row ${String(index)}: painted ${String(row.height)}, modeled ${String(modeled)}`,
                ).toBeLessThan(0.5);
            }
            /* The run's grid is painted once, under its last call. */
            expect(host.querySelectorAll(".happy-media-flow")).toHaveLength(3);
        }
    });
});

describe("layout trees in the CSS subset", () => {
    const retina = { ...image("retina.png", 1040, 720), scale: 2 };
    const icon = { ...image("icon.png", 128, 128), scale: 2 };
    const chart = image("chart.png", 480, 270);
    const items = [retina, icon, chart, chart, square, wide, portrait, square];
    const lenient = mediaLayoutProject(
        {
            type: "tree",
            root: [
                { type: "item", index: 0 },
                { type: "item", index: 1, style: { width: "auto" } },
                { type: "item", index: 2, style: { width: "50%" } },
                { type: "item", index: 3, style: { width: "100%" } },
                {
                    type: "element",
                    tag: "div",
                    style: {
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "8px",
                    },
                    children: [4, 5, 6].map((index) => ({
                        type: "item",
                        index,
                        style: { width: "100%", aspectRatio: "4 / 3", objectFit: "cover" },
                    })),
                },
                { type: "item", index: 7, style: { height: "120px" } },
                {
                    type: "element",
                    tag: "p",
                    style: { fontSize: "small", lineHeight: "1.5", marginTop: "1em" },
                    children: [{ type: "text", text: "A caption under everything." }],
                },
            ],
        },
        items.length,
    )!;

    it("draws pictures at their natural point size unless the layout sizes them", async () => {
        await document.fonts.ready;
        const host = mount(
            720,
            4000,
            <div style={{ width: "720px" }}>
                <ConversationMedia items={items} layout={lenient} />
            </div>,
        );
        await nextFrame();
        /* The engine lays out in fractions of a pixel (Chromium in 64ths). */
        const px = (actual: number, expected: number, label: string) =>
            expect(Math.abs(actual - expected), `${label}: ${String(actual)}`).toBeLessThan(0.1);
        const tiles = [...host.querySelectorAll(".happy-media-image-tile")].map((tile) =>
            tile.getBoundingClientRect(),
        );
        px(tiles[0]!.width, 520, "a 2× capture with no width is 520 points wide");
        px(tiles[0]!.height, 360, "and 360 tall");
        px(tiles[1]!.width, 64, "a 2× icon at width: auto stays 64 points");
        px(tiles[2]!.width, 360, "width: 50% is half the container");
        px(tiles[3]!.width, 720, "width: 100% fills it, past the picture's own 480 pixels");
        px(tiles[4]!.width, (720 - 2 * 8) / 3, "auto-fill fits three 200px-or-wider columns");
        px(tiles[4]!.height, tiles[4]!.width * 0.75, "at the ratio the layout set");
        px(tiles[7]!.width, 120, "a fixed height alone sizes the width by the picture's shape");
        px(tiles[7]!.height, 120, "and keeps the height");
    });

    for (const width of [720, 433, 361])
        it(`reserves exactly what the tree paints at ${String(width)}px`, async () => {
            await document.fonts.ready;
            const host = mount(
                width,
                4000,
                <div style={{ width: `${String(width)}px` }}>
                    <ConversationMedia items={items} layout={lenient} />
                </div>,
            );
            await nextFrame();
            const painted = host
                .querySelector(".happy-conversation-media")!
                .getBoundingClientRect().height;
            const modeled = conversationMediaHeight(items, width, lenient);
            expect(
                Math.abs(painted - modeled),
                `${String(painted)} vs ${String(modeled)}`,
            ).toBeLessThan(0.5);
        });

    it("drops each part the grammar refuses and keeps the rest", () => {
        const layout = mediaLayoutProject(
            {
                type: "tree",
                root: [
                    {
                        type: "element",
                        tag: "marquee",
                        style: {
                            display: "flex",
                            flexDirection: "sideways",
                            gap: "calc(10px + 2px)",
                            rowGap: "10px",
                            color: "red",
                            background: "url(https://example.com/x.png)",
                            tone: "danger",
                        },
                        children: [
                            {
                                type: "item",
                                index: 0,
                                style: { width: "red", objectFit: "zoom", maxWidth: "70%" },
                            },
                            { type: "item", index: 9 },
                            { type: "item", index: 0, style: { width: "100%" } },
                        ],
                    },
                ],
            },
            2,
        );
        expect(layout).toEqual({
            type: "tree",
            root: [
                {
                    type: "element",
                    tag: "div",
                    style: { display: "flex", rowGap: "10px" },
                    children: [{ type: "item", index: 0, style: { maxWidth: "70%" } }],
                },
                { type: "item", index: 1 },
            ],
        });
    });
});
