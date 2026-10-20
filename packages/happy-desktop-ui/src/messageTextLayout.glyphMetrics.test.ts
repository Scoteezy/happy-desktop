import { expect, it, vi } from "vitest";

const pretext = vi.hoisted(() => ({ clears: 0 }));
vi.mock("@chenglou/pretext", async (importOriginal) => {
    const original = await importOriginal<typeof import("@chenglou/pretext")>();
    return {
        ...original,
        clearCache: () => {
            pretext.clears += 1;
            original.clearCache();
        },
    };
});

import { markdownBodyHeight, messageTextLayoutCacheCreate } from "./messageTextLayout";

it("drops Pretext's global segment widths as new text keeps arriving, without changing a height", () => {
    const cache = messageTextLayoutCacheCreate();
    const first = "Run 1 replies with **bold** words and `code`. ".repeat(40);
    const height = markdownBodyHeight(first, 540, cache);
    // Every reply carries words no earlier reply had, as numbered streamed replies do.
    for (let reply = 0; reply < 400 && pretext.clears === 0; reply += 1) {
        const words = Array.from({ length: 2_400 }, (_, word) => `w${reply}x${word}`);
        markdownBodyHeight(`Reply ${reply}: ${words.join(" ")}`, 540, cache);
    }
    expect(pretext.clears).toBeGreaterThan(0);
    expect(markdownBodyHeight(first, 540, cache)).toBe(height);
    expect(markdownBodyHeight(first, 320, cache)).toBe(
        markdownBodyHeight(first, 320, messageTextLayoutCacheCreate()),
    );
});
