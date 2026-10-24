import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import {
    testDepthBrowsers,
    testDepthRead,
} from "../packages/happy-desktop-gym/sources/testDepth.ts";
import {
    fuzzCases,
    fuzzCaseSteps,
} from "../packages/happy-desktop-ui/src/testing/conversationFuzz.ts";

const key = ({ browser, seed, restore }) => `${browser}:${seed}:${restore ?? ""}`;

/** Refuse truncated decks, missing engines, duplicate runs, and partial stress schedules. */
export function validateFuzzResults(text, depth, browsers, cases = fuzzCases(depth)) {
    const clean = stripVTControlCharacters(text);
    const actual = [...clean.matchAll(/CHAT_FUZZ_RESULT (\{[^\n]+\})/g)].map((match) =>
        JSON.parse(match[1]),
    );
    const expected = browsers.flatMap((browser) =>
        cases
            .filter((entry) => !entry.restore || browser === "chromium")
            .map((entry) => ({
                ...entry,
                browser,
                steps: fuzzCaseSteps(entry, browser),
                depth,
            })),
    );
    const missing = expected.filter(
        (entry) => !actual.some((result) => key(result) === key(entry)),
    );
    const unexpected = actual.filter((result, index) => {
        const entry = expected.find((entry) => key(entry) === key(result));
        return (
            !entry ||
            actual.findIndex((other) => key(other) === key(result)) !== index ||
            result.steps !== entry.steps ||
            result.short !== entry.short ||
            result.depth !== depth
        );
    });
    const failed = /(?:FAIL\s|Tests\s+\d+ failed|Unhandled Errors)/.test(clean);
    const completed = /^\s*Tests\s+\d+ passed\b/m.test(clean);
    return {
        valid: completed && !failed && missing.length === 0 && unexpected.length === 0,
        completed,
        seedRuns: actual.length,
        actions: actual.reduce((sum, entry) => sum + entry.steps, 0),
        missing,
        unexpected,
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const depth = testDepthRead(
        args.find((arg) => arg.startsWith("--depth="))?.slice(8) ?? process.env.HAPPY_TEST_DEPTH,
    );
    const selected = args.filter((arg) => arg.startsWith("--browser=")).map((arg) => arg.slice(10));
    const browsers = selected.length ? selected : testDepthBrowsers(depth);
    const logs = args.filter((arg) => !arg.startsWith("--"));
    if (!logs.length)
        throw new Error(
            "Pass one or more Vitest log files, optionally --depth=full and --browser=chromium.",
        );
    const report = validateFuzzResults(
        logs.map((file) => readFileSync(file, "utf8")).join("\n"),
        depth,
        browsers,
    );
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.valid ? 0 : 1;
}
