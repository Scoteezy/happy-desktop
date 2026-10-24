import assert from "node:assert/strict";
import { test } from "node:test";
import {
    testDepthRead,
    testDepthBrowsers,
} from "../packages/happy-desktop-gym/sources/testDepth.ts";
import {
    fuzzCases,
    fuzzCaseSteps,
} from "../packages/happy-desktop-ui/src/testing/conversationFuzz.ts";
import { validateFuzzResults } from "./validate-interaction-fuzz.mjs";

test("one validated depth selects the preview or production engines", () => {
    assert.equal(testDepthRead(undefined), "cheap");
    assert.deepEqual(testDepthBrowsers(testDepthRead("cheap")), ["chromium", "firefox"]);
    assert.deepEqual(testDepthBrowsers(testDepthRead("full")), ["chromium", "firefox", "webkit"]);
    for (const value of ["", "deep", "FULL"])
        assert.throws(() => testDepthRead(value), /expected cheap or full/);
});

test("the bug-finding tapes retain their certified full-deck lengths", () => {
    const lengths = [
        [32749, 103, 101],
        [214013, 100, 106],
        [65521, 99, 107],
        [305419896, 107, 102],
    ];
    for (const [seed, chromium, firefox] of lengths) {
        const entry = { seed, short: false };
        assert.equal(fuzzCaseSteps(entry, "chromium"), chromium);
        assert.equal(fuzzCaseSteps(entry, "firefox"), firefox);
    }
    assert.equal(fuzzCases("full").filter((entry) => !entry.restore).length, 20);
    assert.equal(fuzzCases("cheap").filter((entry) => entry.short).length, 4);
});

test("matrix validation rejects missing runs, duplicates and truncated decks", () => {
    const records = fuzzCases("cheap").map((entry) => ({
        ...entry,
        browser: "chromium",
        depth: "cheap",
        steps: fuzzCaseSteps(entry, "chromium"),
    }));
    const log = (entries) =>
        entries.map((entry) => `CHAT_FUZZ_RESULT ${JSON.stringify(entry)}`).join("\n") +
        `\nTests ${entries.length} passed`;
    assert.equal(validateFuzzResults(log(records), "cheap", ["chromium"]).valid, true);
    assert.equal(
        validateFuzzResults(log(records).replace(/\nTests.+$/, ""), "cheap", ["chromium"]).valid,
        false,
    );
    assert.equal(validateFuzzResults(log(records.slice(1)), "cheap", ["chromium"]).valid, false);
    assert.equal(
        validateFuzzResults(log([...records, records[0]]), "cheap", ["chromium"]).valid,
        false,
    );
    assert.equal(
        validateFuzzResults(
            log(
                records.map((entry, index) =>
                    index ? entry : { ...entry, steps: entry.steps - 1 },
                ),
            ),
            "cheap",
            ["chromium"],
        ).valid,
        false,
    );
    assert.equal(validateFuzzResults(log(records), "cheap", ["chromium", "firefox"]).valid, false);
});
