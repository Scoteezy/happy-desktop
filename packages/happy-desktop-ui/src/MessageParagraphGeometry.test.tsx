import { expect, it } from "vitest";
import "./styles.css";
import { Message } from "./Message";
import { markdownBodyHeight, messageTextLayoutCacheCreate } from "./messageTextLayout";
import { createRenderer } from "./testing";

it("matches text-node paragraph wrapping at every pixel and on width round trips", async () => {
    const sources = [
        "I found the mismatch in the message height model. The browser wraps the long identifier, but the model reserves one line.",
        "I’ll make the renderer and model agree, then verify it at the normal and narrow desktop widths. ".repeat(
            8,
        ),
        "Words, punctuation (including parentheses), dashes—and a few 123456789 numbers. ".repeat(
            6,
        ),
        "Collapsed   spaces\nand newlines stay on the same paragraph. ".repeat(8),
        "日本語の文章と English words, 中文内容 그리고 한국어 🙂. ".repeat(8),
        "A nonbreaking\u00a0space and supercalifragilisticexpialidocious".repeat(8),
        "longidentifier".repeat(30),
        "Continuous prose around **several bold words and punctuation**, then more prose and *several italic words*. ".repeat(
            5,
        ),
        "A text run followed by (`inline code`) and [a long link label with multiple words](https://example.com/path), then plain text. ".repeat(
            4,
        ),
        "A prefix around **nested *mixed emphasis* words**; joining**bold**suffix and more prose. ".repeat(
            5,
        ),
        "A plain run with **strong words** followed by trailing spaces   \nand another line with `code`. ".repeat(
            5,
        ),
    ];
    const view = createRenderer();
    for (const source of sources)
        view.render(() => <Message agent author="Happy" body={source} />, {
            width: 1000,
            height: 1200,
        });
    await view.ready();
    await document.fonts.load('16px "happy Figtree"');
    await document.fonts.ready;
    const paragraphs = [...view.container.querySelectorAll<HTMLElement>(".happy-message__body p")];
    expect(paragraphs).toHaveLength(sources.length);
    for (const [index, paragraph] of paragraphs.entries()) {
        const cache = messageTextLayoutCacheCreate();
        for (let width = 300; width <= 900; width += 1) {
            paragraph.style.width = `${String(width)}px`;
            const painted = paragraph.getBoundingClientRect().height;
            expect(
                markdownBodyHeight(sources[index]!, width, cache),
                `source ${String(index)} at ${String(width)}px`,
            ).toBe(painted);
        }
        for (const width of [300, 900, 300]) {
            paragraph.style.width = `${String(width)}px`;
            expect(markdownBodyHeight(sources[index]!, width, cache)).toBe(
                paragraph.getBoundingClientRect().height,
            );
        }
    }
});
