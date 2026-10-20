import { expect, it } from "vitest";
import {
    markdownBodyHeight,
    messageMarkdownRenderTree,
    messageTextLayoutCacheCreate,
    monoOutputTextHeight,
} from "./messageTextLayout";

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
