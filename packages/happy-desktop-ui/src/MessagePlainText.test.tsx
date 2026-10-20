import { useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type { ConversationAuthor, ConversationMessageEntry } from "happy-desktop-state";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationEntryView } from "./ConversationEntryView";
import {
    contentWidth,
    conversationRowHeight,
    conversationRowHeightCacheCreate,
} from "./conversationRowHeight";
import { conversationMessageGrouped } from "./conversationMessageGrouped";
import {
    plainTextMessageFixtures,
    type PlainTextMessageFixture,
} from "./fixtures/plainTextMessages";
import { MessageList } from "./Message";
import {
    messageTextLayoutFontGenerationGet,
    messageTextLayoutFontGenerationSubscribe,
} from "./messageTextLayout";
import { createRenderer } from "./testing";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const GEOMETRY_TOLERANCE = 2.1;
const READER = "plain-reader";
const agent: ConversationAuthor = {
    id: "plain-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const reader: ConversationAuthor = {
    id: READER,
    displayName: "Kirill",
    username: "kirill",
    kind: "human",
};
const collaborator: ConversationAuthor = {
    id: "plain-collaborator",
    displayName: "Maya",
    username: "maya",
    kind: "human",
};

function message(id: string, sender: ConversationAuthor, text: string): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "plain",
            sequence: id,
            changePts: id,
            sender,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-10-20T09:41:00.000Z",
        },
    };
}

function Specimen(props: { entries: readonly ConversationMessageEntry[]; width: number }) {
    const [cache] = useState(conversationRowHeightCacheCreate);
    const fontGeneration = useSyncExternalStore(
        messageTextLayoutFontGenerationSubscribe,
        messageTextLayoutFontGenerationGet,
        messageTextLayoutFontGenerationGet,
    );
    return (
        <div
            className="happy-conversation"
            style={{ flex: "none", height: 1400, width: props.width }}
        >
            <MessageList
                estimateDependencies={[props.entries]}
                estimateRowSize={(index, width) =>
                    index === props.entries.length
                        ? 1
                        : conversationRowHeight(
                              props.entries,
                              index,
                              {
                                  activityTreatment: "detailed",
                                  expanded: false,
                                  surface: "conversation",
                                  viewerId: READER,
                                  width,
                              },
                              cache,
                          )
                }
                estimateRowWidth={contentWidth}
                estimateVersion={fontGeneration}
                virtualize
            >
                {props.entries.map((entry, index) => (
                    <ConversationEntryView
                        activityTreatment="detailed"
                        entry={entry}
                        grouped={conversationMessageGrouped(props.entries, index)}
                        key={entry.message.id}
                        viewerId={READER}
                    />
                ))}
                <div key="sentinel" style={{ height: 1 }} />
            </MessageList>
        </div>
    );
}

const fixtures = Object.keys(plainTextMessageFixtures) as PlainTextMessageFixture[];
/* 800 puts an own bubble at about 560px, the width the overlap was reported at. */
const WIDTHS = [880, 800, 760, 560, 360];

for (const fixture of fixtures)
    it(`paints ${fixture} user messages as typed at the modeled height`, async () => {
        const text = plainTextMessageFixtures[fixture] + (fixture === "whitespace" ? "\n\n" : "");
        const entries = [
            message("1", reader, text),
            message("2", agent, "Thinking about it."),
            message("3", collaborator, text),
            /* Grouped: the hover time rides the final word. */
            message("4", collaborator, text),
            message("5", agent, "Done."),
        ];
        const view = createRenderer();
        for (const width of WIDTHS)
            view.render(() => <Specimen entries={entries} width={width} />, {
                width,
                height: 1400,
            });
        await view.ready();
        await document.fonts.ready;
        await nextFrame();
        await nextFrame();
        const lists = [...view.container.querySelectorAll(".happy-conversation")];
        expect(lists).toHaveLength(WIDTHS.length);
        for (const [listIndex, list] of lists.entries()) {
            const label = `${fixture} at ${String(WIDTHS[listIndex])}px`;
            for (let index = 0; index < entries.length; index += 1) {
                const row = list.querySelector<HTMLElement>(
                    `.happy-message-list__virtual-row[data-index="${String(index)}"]`,
                )!;
                const next = list.querySelector<HTMLElement>(
                    `.happy-message-list__virtual-row[data-index="${String(index + 1)}"]`,
                )!;
                const painted = row.getBoundingClientRect().height;
                const modeled = next.getBoundingClientRect().top - row.getBoundingClientRect().top;
                expect(
                    Math.abs(painted - modeled),
                    `${label} row ${String(index)}: painted ${String(painted)}px, modeled ${String(modeled)}px`,
                ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
            }
            /* People's messages read exactly as typed: no Markdown elements. */
            for (const index of [0, 2, 3]) {
                const body = list.querySelector<HTMLElement>(
                    `.happy-message-list__virtual-row[data-index="${String(index)}"] .happy-message__body`,
                )!;
                expect(
                    body.querySelector(
                        "h1, h2, strong, em, code, ul, ol, blockquote, table, pre, a",
                    ),
                    `${label} row ${String(index)} markup`,
                ).toBeNull();
                const paragraph = body.querySelector(".happy-message__plain-text")!;
                expect(
                    paragraph.firstChild?.textContent,
                    `${label} row ${String(index)} text`,
                ).toBe(text);
                const style = getComputedStyle(paragraph);
                expect(style.whiteSpace).toBe("pre-wrap");
                expect(style.overflowWrap).toBe("anywhere");
                expect(style.fontSize).toBe("16px");
                expect(style.lineHeight).toBe("24px");
            }
        }
    });

/* Every width in a band around the default measure, a pixel apart: a model that
   disagrees with the browser's line breaking at one width only shows up here. */
const SWEEP = { from: 700, to: 760 } as const;
it("keeps every user-message fixture at its modeled height across a 1px width sweep", async () => {
    const entries = fixtures.flatMap((fixture, fixtureIndex) => {
        const text = plainTextMessageFixtures[fixture] + (fixture === "whitespace" ? "\n\n" : "");
        const id = String(fixtureIndex * 3);
        return [
            message(`${id}-own`, reader, text),
            message(`${id}-incoming`, collaborator, text),
            /* Grouped: the hover time rides the final word. */
            message(`${id}-grouped`, collaborator, text),
        ];
    });
    let widthUpdate!: (width: number) => void;
    function Sweep() {
        const [width, setWidth] = useState<number>(SWEEP.from);
        widthUpdate = setWidth;
        return <Specimen entries={entries} width={width} />;
    }
    const view = createRenderer();
    view.render(Sweep, { width: SWEEP.to, height: 1400 });
    await view.ready();
    await document.fonts.ready;
    await nextFrame();
    const list = view.container.querySelector(".happy-conversation")!;
    const scrollport = list.querySelector<HTMLElement>("[data-scrollbar-viewport]")!;
    const failures: string[] = [];
    for (let width = SWEEP.from; width <= SWEEP.to; width += 1) {
        flushSync(() => widthUpdate(width));
        await nextFrame();
        /* The list virtualizes; walk it a viewport at a time. */
        for (let top = 0; top < scrollport.scrollHeight; top += scrollport.clientHeight / 2) {
            scrollport.scrollTop = top;
            scrollport.dispatchEvent(new Event("scroll"));
            await nextFrame();
            const viewport = scrollport.getBoundingClientRect();
            for (const row of list.querySelectorAll<HTMLElement>(
                ".happy-message-list__virtual-row",
            )) {
                /* Rows the reader can see; an offscreen overscan row may wait for idle layout. */
                const bounds = row.getBoundingClientRect();
                if (bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue;
                const index = Number(row.dataset.index);
                if (index >= entries.length) continue;
                const next = list.querySelector<HTMLElement>(
                    `.happy-message-list__virtual-row[data-index="${String(index + 1)}"]`,
                );
                if (!next) continue;
                const painted = row.getBoundingClientRect().height;
                const modeled = next.getBoundingClientRect().top - row.getBoundingClientRect().top;
                if (Math.abs(painted - modeled) > GEOMETRY_TOLERANCE)
                    failures.push(
                        `${entries[index]!.message.id} at ${String(width)}px: painted ${String(painted)}px, modeled ${String(modeled)}px`,
                    );
            }
        }
    }
    expect([...new Set(failures)]).toEqual([]);
}, 120_000);
