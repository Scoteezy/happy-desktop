/**
 * Messages people type, which render exactly as typed. Each one is a trap for
 * a renderer that reinterprets text: box-drawing art, Markdown syntax that
 * must stay literal, significant whitespace, and runs with no break
 * opportunity. Shared by the Blueprint page and the geometry test.
 */
export const plainTextMessageFixtures = {
    /* Recreated from a real message whose bubble overlapped the next row. */
    boxArt: [
        "Sidebar collapsed, right pane closed",
        "",
        `┌${"─".repeat(96)}┐`,
        "| ● ● ● [=] |",
        "",
        "but for this one - i want spacer between the [=] [new] [spacer (2 buttons roughly) | tab just a bit extra space - like 2 icons",
        "",
        "and keep the create new button there as well when collapsed",
    ].join("\n"),
    markdownSyntax: [
        "# not a heading",
        "**not bold** and _not italic_ and `not code`",
        "- not a list",
        "1. not numbered",
        "> not a quote",
        "| a | b |",
        "|---|---|",
        "| 1 | 2 |",
        "```",
        "not a fence",
        "```",
        "[not a link](https://example.com) and <b>not html</b>",
    ].join("\n"),
    whitespace: [
        "    four leading spaces",
        "\ttab indented\tand\ttabbed",
        "two  spaces  between  words",
        "",
        "",
        "",
        "after three blank lines",
        "trailing spaces   ",
    ].join("\n"),
    cjkEmoji: [
        "表の折り返しは列幅に合わせて行われます。長い文章のセルも一行のまま保たれます。",
        "Mixed 中文 and English with emoji 🚀🧪🎉 and a family 👨‍👩‍👧‍👦 in one line.",
    ].join("\n"),
    longUrl: [
        "see https://example.com/a/really/long/path/without/any/spaces/that/is/wider/than/the/bubble/on/every/measure?query=and-more-and-more-and-more",
        "and /var/lib/happy-agent/.config/happy-agent/credentials/bulka_happy_codex.json",
    ].join("\n"),
} as const;

export type PlainTextMessageFixture = keyof typeof plainTextMessageFixtures;
