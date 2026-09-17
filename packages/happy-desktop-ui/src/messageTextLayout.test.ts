import { expect, it } from "vitest";
import {
    markdownBodyHeight,
    messageTextLayoutCacheCreate,
    monoOutputTextHeight,
} from "./messageTextLayout";

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
    expect(cache.preparedSourceSize).toBeLessThanOrEqual(128 * 1_024);
    expect(markdownBodyHeight(original, 540, cache)).toBe(height);
    expect(monoOutputTextHeight(original, 540, cache)).toBe(monoHeight);
    expect(markdownBodyHeight(original, 320, cache)).toBe(
        markdownBodyHeight(original, 320, messageTextLayoutCacheCreate()),
    );
});

it("measures oversized messages exactly without retaining their prepared segments", () => {
    const cache = messageTextLayoutCacheCreate();
    const text = "Large transcript words. ".repeat(8_000);
    const height = markdownBodyHeight(text, 540, cache);
    expect(height).toBeGreaterThan(1_000);
    expect(Object.keys(cache.richPrepared)).toHaveLength(0);
    expect(markdownBodyHeight(text, 540, cache)).toBe(height);
    expect(markdownBodyHeight(text, 420, cache)).toBe(
        markdownBodyHeight(text, 420, messageTextLayoutCacheCreate()),
    );
});
