import { expect, it } from "vitest";
import {
    markdownBodyHeight,
    markdownBodyPrepare,
    messageMarkdownRenderTree,
    messageTextLayoutCacheCreate,
    monoOutputTextHeight,
} from "./messageTextLayout";

it("warms canonical blocks incrementally without publishing partial body heights", () => {
    const text = [
        "# Heading with **emphasis**",
        "A paragraph with `inline code`, [a link](https://example.com), and a footnote[^note].",
        "> A quote\n>\n> - A nested list\n> - With another item",
        "| First | Second |\n| --- | --- |\n| **Bold** | More words |",
        "```ts\nconst value = 42;\n```",
        "[^note]: Footnote text with **strong words**.",
    ].join("\n\n");
    const cache = messageTextLayoutCacheCreate();
    for (const width of [540, 320, 540]) {
        const work = markdownBodyPrepare(text, width, cache, 42);
        expect(work.next().done).toBe(false);
        expect(cache.markdownTrees[text]).toBeDefined();
        expect(cache.markdownHeights[text]?.[`${width}:42:diagram`]).toBeUndefined();
        let steps = 1;
        while (!work.next().done) steps += 1;
        expect(steps).toBe(7); // Parse, five body blocks, one footnote.
        expect(markdownBodyHeight(text, width, cache, 42)).toBe(
            markdownBodyHeight(text, width, messageTextLayoutCacheCreate(), 42),
        );
        // Keep parsed/prepared data but clear published heights for the round trip.
        delete cache.markdownHeights[text];
    }
});

it("gives render transforms a private sized tree without retaining streaming prefixes", () => {
    const cache = messageTextLayoutCacheCreate();
    const source = "Read `src/Message.tsx:42`, then solve $x^2$ and inspect **the result**.";
    markdownBodyHeight(source, 540, cache);
    const sized = cache.markdownTrees[source];
    const rendered = messageMarkdownRenderTree(source, cache);
    expect(rendered).toEqual(sized);
    expect(rendered).not.toBe(sized);
    rendered.children.length = 0;
    expect(sized?.children.length).toBeGreaterThan(0);
    const prefix = "A streaming prefix";
    expect(messageMarkdownRenderTree(prefix, cache).children.length).toBeGreaterThan(0);
    expect(cache.markdownTrees[prefix]).toBeUndefined();
});

it("releases old prepared runs while preserving exact warm and resized heights", () => {
    const cache = messageTextLayoutCacheCreate();
    const original = "Plain **bold** and `code` text with [a link](https://example.com). ".repeat(
        80,
    );
    const height = markdownBodyHeight(original, 540, cache);
    const monoHeight = monoOutputTextHeight(original, 540, cache);
    for (let index = 0; index < 32; index += 1) {
        markdownBodyHeight(
            `Message ${index}: ${"Measured words and spaces. ".repeat(320)}`,
            540,
            cache,
        );
    }
    expect(cache.preparedBytes).toBeLessThanOrEqual(8 * 1_024 * 1_024);
    expect(markdownBodyHeight(original, 540, cache)).toBe(height);
    expect(monoOutputTextHeight(original, 540, cache)).toBe(monoHeight);
    expect(markdownBodyHeight(original, 320, cache)).toBe(
        markdownBodyHeight(original, 320, messageTextLayoutCacheCreate()),
    );
});

it("measures oversized messages exactly without retaining their prepared segments", () => {
    const cache = messageTextLayoutCacheCreate();
    // Mixed styles retain a prepared run per fragment; plain paragraphs now
    // use only two runs and this source length no longer exceeds the budget.
    const text = "Large transcript **words**. ".repeat(8_000);
    const height = markdownBodyHeight(text, 540, cache);
    expect(height).toBeGreaterThan(1_000);
    expect(Object.keys(cache.richPrepared)).toHaveLength(0);
    expect(markdownBodyHeight(text, 540, cache)).toBe(height);
    expect(markdownBodyHeight(text, 420, cache)).toBe(
        markdownBodyHeight(text, 420, messageTextLayoutCacheCreate()),
    );
});
