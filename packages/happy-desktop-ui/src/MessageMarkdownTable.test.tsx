import { useState } from "react";
import { flushSync } from "react-dom";
import {
    happyAgentStreamingMarkdownTrim,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
    type ConversationMessageEntry,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationView } from "./ConversationView";
import { Message } from "./Message";
import { markdownTableFixtures, type MarkdownTableFixture } from "./fixtures/markdownTables";
import {
    markdownBodyHeight,
    markdownTableLayoutAt,
    messageTextLayoutCacheCreate,
} from "./messageTextLayout";
import { createRenderer } from "./testing";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const fontsReady = async () => {
    await document.fonts.load('16px "happy Figtree"');
    await document.fonts.load('600 16px "happy Figtree"');
    await document.fonts.load('700 16px "happy Figtree"');
    await document.fonts.load('italic 16px "happy Figtree"');
    await document.fonts.load('14px "happy Mono"');
    await nextFrame();
};
const INTRO = "Here is what changed:\n\n";
const fixtures = Object.keys(markdownTableFixtures) as MarkdownTableFixture[];

function expectTableGeometry(body: HTMLElement, source: string, label: string) {
    const bounds = body.getBoundingClientRect();
    const style = getComputedStyle(body);
    const measure =
        bounds.width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    const content =
        bounds.height -
        Number.parseFloat(style.paddingTop) -
        Number.parseFloat(style.paddingBottom);
    const predicted = markdownBodyHeight(source, measure, messageTextLayoutCacheCreate());
    expect(
        Math.abs(predicted - content),
        `${label}: predicted ${String(predicted)}px, painted ${content.toFixed(3)}px`,
    ).toBeLessThan(0.5);
    const table = body.querySelector<HTMLTableElement>("table")!;
    const viewport = table.parentElement!;
    expect(table.dataset.layout, label).toBe("solved");
    const layout = markdownTableLayoutAt(
        source,
        source.indexOf("|"),
        Number.parseFloat(getComputedStyle(viewport).width),
    )!;
    const rows = [...table.rows];
    expect(
        rows.map((row) => row.getBoundingClientRect().height),
        `${label}: row heights`,
    ).toEqual(layout.rowLines.map((lines) => 16 + lines * 24));
    expect(
        [...rows[0]!.cells].map((cell) => cell.getBoundingClientRect().width),
        `${label}: column widths`,
    ).toEqual(layout.columnWidths);
    expect(table.getBoundingClientRect().width, `${label}: table width`).toBe(layout.width);
    return { layout, viewport };
}

for (const fixture of fixtures) {
    it(`paints the predicted ${fixture} table at every measure`, async () => {
        const source = `${INTRO}${markdownTableFixtures[fixture]}`;
        const widths = [360, 520, 680, 900];
        const view = createRenderer();
        for (const width of widths)
            view.render(() => <Message agent author="Happy" body={source} />, {
                width,
                height: 900,
            });
        await view.ready();
        await fontsReady();
        const bodies = [...view.container.querySelectorAll<HTMLElement>(".happy-message__body")];
        expect(bodies).toHaveLength(widths.length);
        for (const [index, body] of bodies.entries()) {
            const { layout, viewport } = expectTableGeometry(
                body,
                source,
                `${fixture} at ${String(widths[index])}px`,
            );
            if ((fixture === "fits" && widths[index]! >= 520) || fixture === "oneProseColumn")
                expect(layout.width).toBe(Math.floor(viewport.getBoundingClientRect().width));
            if (fixture === "tooManyColumns" && widths[index]! <= 680)
                expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth);
        }
        if (fixture === "oneProseColumn" || fixture === "severalProseColumns") {
            const rows = [...bodies[0]!.querySelectorAll("tr")];
            expect(
                Math.max(...rows.map((row) => row.getBoundingClientRect().height)),
            ).toBeGreaterThan(40);
        }
    });
}

it("keeps a bubble's table on the bubble's measure", async () => {
    const source = markdownTableFixtures.severalProseColumns;
    const view = createRenderer();
    view.render(() => <Message author="Maya" body={source} own time="9:41" />, {
        width: 760,
        height: 900,
    });
    view.render(() => <Message author="Jun" body={markdownTableFixtures.fits} time="9:42" />, {
        width: 760,
        height: 400,
    });
    await view.ready();
    await fontsReady();
    for (const body of view.container.querySelectorAll<HTMLElement>(".happy-message__body"))
        expectTableGeometry(
            body,
            body.closest("[data-own]") ? source : markdownTableFixtures.fits,
            "bubble",
        );
});

const agent: ConversationAuthor = {
    id: "table-stream-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "table-stream",
    submission: { status: "idle" },
    text: "",
};
const tool: ConversationEntry = {
    kind: "agentActivity",
    id: "table-stream-tool",
    sequence: "2",
    activity: { kind: "labeled", label: "Edit", subject: "Write", status: "success", mono: true },
};
function streamed(text: string, streaming: boolean): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id: "table-stream",
            chatId: "table-stream",
            sequence: "1",
            changePts: "1",
            sender: agent,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-09-06T12:34:00.000Z",
            generationStatus: streaming ? "streaming" : "complete",
        },
    };
}

it("streams a wrapping table cell by cell with exact rows and no partial cells", async () => {
    const full = `${INTRO}${markdownTableFixtures.shortColumns}\n\nDone.`;
    const view = createRenderer();
    let update!: (text: string, streaming: boolean) => void;
    function Harness() {
        const [state, setState] = useState({ text: INTRO.trim(), streaming: true });
        update = (text, streaming) => setState({ text, streaming });
        return (
            <ConversationView
                agentAuthor={agent}
                composer={composer}
                conversationId="table-stream"
                entries={[streamed(state.text, state.streaming), tool]}
                motion="calm"
                onComposerSend={() => {}}
                onComposerValueChange={() => {}}
                running
            />
        );
    }
    view.render(Harness, { width: 560, height: 800 });
    await view.ready();
    await fontsReady();
    const finalCells = markdownTableFixtures.shortColumns
        .split("\n")
        .filter((_, index) => index !== 1)
        .map((line) =>
            line
                .slice(1, -1)
                .split("|")
                .map((cell) => cell.trim().replaceAll("`", "")),
        );
    let previous = "";
    for (let end = 1; end <= full.length; end += 1) {
        const text = happyAgentStreamingMarkdownTrim(full.slice(0, end));
        if (text === previous) continue;
        previous = text;
        flushSync(() => update(text, true));
        await nextFrame();
        const row = view.container.querySelector<HTMLElement>(".happy-message-list__virtual-row")!;
        const next = row.nextElementSibling!.getBoundingClientRect().top;
        const body = row.querySelector<HTMLElement>(".happy-message__body")!;
        const label = `prefix ${String(end)}`;
        expect(
            Math.abs(next - row.getBoundingClientRect().bottom),
            `${label}: reserved row`,
        ).toBeLessThan(0.5);
        expect(body.textContent, label).not.toContain("|");
        const table = body.querySelector("table");
        if (!table) continue;
        expectTableGeometry(body, text, label);
        for (const [rowIndex, tableRow] of [...table.rows].entries())
            for (const [cellIndex, cell] of [...tableRow.cells].entries()) {
                const painted = cell.textContent ?? "";
                if (painted.length > 0)
                    expect(painted, `${label}: cell ${String(rowIndex)}:${String(cellIndex)}`).toBe(
                        finalCells[rowIndex]![cellIndex],
                    );
            }
    }
    flushSync(() => update(full, false));
    await nextFrame();
    expectTableGeometry(
        view.container.querySelector<HTMLElement>(".happy-message__body")!,
        full,
        "settled",
    );
});
