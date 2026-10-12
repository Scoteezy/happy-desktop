import { describe, expect, it } from "vitest";
import { happyAgentStreamingMarkdownTrim } from "./happyAgentStreamingMarkdown.js";

const reply = [
    "Here is the plan:",
    "",
    "| Step | Owner | Notes |",
    "|---|:-:|---|",
    "| 1 | `maya` | Parse **once**, measure twice |",
    "| 2 | jun | Escaped \\| pipes stay in the cell |",
    "| 3 |",
    "",
    "```md",
    "| not | a | table |",
    "|---|---|---|",
    "| partial",
    "```",
    "",
    "> | Quoted | Table |",
    "> |---|---|",
    "> | a | b |",
    "",
    "Done.",
].join("\n");

describe("happyAgentStreamingMarkdownTrim", () => {
    it("never shows a header before its delimiter row or a cell before its closing pipe", () => {
        let previous = "";
        for (let end = 0; end <= reply.length; end += 1) {
            const prefix = reply.slice(0, end);
            const shown = happyAgentStreamingMarkdownTrim(prefix);
            expect(prefix.startsWith(shown), `prefix ${String(end)}`).toBe(true);
            expect(shown.length, `prefix ${String(end)} shrank`).toBeGreaterThanOrEqual(
                previous.length,
            );
            previous = shown;
            const lines = shown.split("\n");
            const writing = lines.at(-1)!;
            const fullLine = reply.split("\n")[lines.length - 1]!;
            const inFence = lines.filter((line) => line.startsWith("```")).length % 2 === 1;
            /* A table line that is still being written ends on a closing pipe. */
            if (!inFence && /^(> )?\|/u.test(fullLine) && writing.replace(/^> ?/u, "").length > 0)
                expect(writing === fullLine || writing.endsWith("|"), `prefix ${String(end)}`).toBe(
                    true,
                );
            for (const header of ["| Step | Owner | Notes |", "> | Quoted | Table |"])
                if (shown.includes(header))
                    expect(shown, `prefix ${String(end)}`).toMatch(
                        header.startsWith(">") ? /> \|---\|---\|\n/u : /\|---\|:-:\|---\|\n/u,
                    );
        }
        expect(happyAgentStreamingMarkdownTrim(reply)).toBe(reply);
    });

    it("cuts the row being written back to its last complete cell", () => {
        const table = "| a | b | c |\n|---|---|---|\n";
        expect(happyAgentStreamingMarkdownTrim(`${table}| one | tw`)).toBe(`${table}| one |`);
        expect(happyAgentStreamingMarkdownTrim(`${table}| on`)).toBe(table);
        expect(happyAgentStreamingMarkdownTrim(`${table}| one \\| two`)).toBe(table);
        expect(happyAgentStreamingMarkdownTrim(`${table}| one | two | three`)).toBe(
            `${table}| one | two |`,
        );
        expect(happyAgentStreamingMarkdownTrim(`${table}| one | two | three |\n`)).toBe(
            `${table}| one | two | three |\n`,
        );
    });

    it("hides a header until its delimiter row is complete", () => {
        expect(happyAgentStreamingMarkdownTrim("Intro\n\n| a | b |")).toBe("Intro\n\n");
        expect(happyAgentStreamingMarkdownTrim("Intro\n\n| a | b |\n|---|-")).toBe("Intro\n\n");
        expect(happyAgentStreamingMarkdownTrim("Intro\n\n| a | b |\n|---|---|")).toBe("Intro\n\n");
        expect(happyAgentStreamingMarkdownTrim("Intro\n\n| a | b |\n|---|---|\n")).toBe(
            "Intro\n\n| a | b |\n|---|---|\n",
        );
    });

    it("leaves prose, mismatched delimiters and fenced code alone", () => {
        expect(happyAgentStreamingMarkdownTrim("Use a | b to pipe it")).toBe(
            "Use a | b to pipe it",
        );
        expect(happyAgentStreamingMarkdownTrim("| a | b |\n|---|\nnext")).toBe(
            "| a | b |\n|---|\nnext",
        );
        expect(happyAgentStreamingMarkdownTrim("```\n| a | b |\n|---|---|\n| par")).toBe(
            "```\n| a | b |\n|---|---|\n| par",
        );
    });

    it("counts escaped pipes by backslash parity", () => {
        const table = "| a | b |\n|---|---|\n";
        expect(happyAgentStreamingMarkdownTrim(`${table}| x \\| y | z`)).toBe(
            `${table}| x \\| y |`,
        );
        expect(happyAgentStreamingMarkdownTrim(`${table}| x \\\\| y`)).toBe(`${table}| x \\\\|`);
        expect(happyAgentStreamingMarkdownTrim("| a \\| b |\n|---|\n| c")).toBe(
            "| a \\| b |\n|---|\n",
        );
    });

    it("handles tables without outer pipes and keeps their header readable", () => {
        expect(happyAgentStreamingMarkdownTrim("a | b")).toBe("a | b");
        expect(happyAgentStreamingMarkdownTrim("a | b\n")).toBe("a | b\n");
        expect(happyAgentStreamingMarkdownTrim("a | b\n--- | -")).toBe("a | b\n");
        expect(happyAgentStreamingMarkdownTrim("a | b\n--- | ---\nc | d")).toBe(
            "a | b\n--- | ---\nc |",
        );
        expect(happyAgentStreamingMarkdownTrim("a | b\n--- | ---\nc | d\n")).toBe(
            "a | b\n--- | ---\nc | d\n",
        );
        expect(happyAgentStreamingMarkdownTrim("a | b\n--- | ---\nplai")).toBe(
            "a | b\n--- | ---\n",
        );
    });

    it("lets a block start end the table instead of holding it as a row", () => {
        const table = "| a | b |\n|---|---|\n| 1 | 2 |\n";
        for (const next of ["#", "# Head", "- ite", "1. ite", "> quo", "```t", "***", "<di"])
            expect(happyAgentStreamingMarkdownTrim(`${table}${next}`), next).toBe(
                `${table}${next}`,
            );
        expect(happyAgentStreamingMarkdownTrim(`${table}    cod`)).toBe(`${table}    cod`);
        expect(happyAgentStreamingMarkdownTrim(`${table}\nProse | with a pipe`)).toBe(
            `${table}\nProse | with a pipe`,
        );
    });

    it("closes fences only on a matching marker at least as long", () => {
        const body = "| a | b |\n|---|---|\n| par";
        expect(happyAgentStreamingMarkdownTrim(`\`\`\`\`\n\`\`\`\n${body}`)).toBe(
            `\`\`\`\`\n\`\`\`\n${body}`,
        );
        expect(happyAgentStreamingMarkdownTrim(`~~~\n\`\`\`\n${body}`)).toBe(
            `~~~\n\`\`\`\n${body}`,
        );
        expect(happyAgentStreamingMarkdownTrim(`\`\`\`\nx\n\`\`\`\`\n${body}`)).toBe(
            "```\nx\n````\n| a | b |\n|---|---|\n",
        );
    });

    it("reads indentation by container: code at top level, a table in a list item", () => {
        const code = "    | a | b |\n    |---|---|\n    | c";
        expect(happyAgentStreamingMarkdownTrim(code)).toBe(code);
        expect(happyAgentStreamingMarkdownTrim("Intro\n\n    | a | b |")).toBe(
            "Intro\n\n    | a | b |",
        );
        expect(
            happyAgentStreamingMarkdownTrim("10. item\n    | a | b |\n    |---|---|\n    | c"),
        ).toBe("10. item\n    | a | b |\n    |---|---|\n");
        expect(happyAgentStreamingMarkdownTrim("> | a | b |\n> |---|---|\n> | 1 | 2")).toBe(
            "> | a | b |\n> |---|---|\n> | 1 |",
        );
    });

    it("reads CRLF sources like LF", () => {
        expect(happyAgentStreamingMarkdownTrim("| a | b |\r\n|---|---|\r\n| 1 | 2")).toBe(
            "| a | b |\r\n|---|---|\r\n| 1 |",
        );
    });
});
