/**
 * Synthetic chat tables covering every branch of `markdownTableLayout`, shaped
 * after the tables agents actually write: a short label or ID column beside
 * one or more prose columns, inline code paths, and the occasional table too
 * wide for any measure. Shared by the Blueprint page and the geometry test.
 */
export const markdownTableFixtures = {
    fits: [
        "| Kind | Opens as | Scrolls |",
        "| --- | --- | --- |",
        "| Markdown | Rendered prose | Yes |",
        "| Image | Contained stage | No |",
    ].join("\n"),
    oneProseColumn: [
        "| Step | Status | Notes |",
        "|---|---|---|",
        "| 1 | Done | Parsed the transcript once and reused the same tree for the height model and the renderer, so nothing is measured twice. |",
        "| 2 | Running | Measuring every cell with the bundled fonts before the row mounts, which keeps the scrollbar honest while the reader scrolls back. |",
        "| 3 | Blocked | Waiting on review. |",
    ].join("\n"),
    severalProseColumns: [
        "| Option | What it does | Trade-off | Verdict |",
        "|---|---|---|---|",
        "| Keep one line per row | Every cell stays on a single line and the table scrolls sideways whenever it is wider than the message. | Long notes are unreadable without scrolling, and the scrollbar hides on idle. | Rejected |",
        "| Wrap prose columns | Short columns keep their one line while the prose columns share the remaining width by how much they want. | Rows grow taller, so the height model has to measure every cell exactly. | **Chosen** |",
        "| Let the browser decide | Automatic table layout distributes width with engine-specific rules that differ between Chromium, Gecko and WebKit. | The virtual list could not predict a row's height before it mounts. | Rejected |",
    ].join("\n"),
    shortColumns: [
        "| # | ID | State | Owner | Summary |",
        "|--:|---|:-:|---|---|",
        "| 1 | `a1b2c3` | open | Maya | The settings sheet loses focus when a background sync rewrites the same value it already shows. |",
        "| 2 | `d4e5f6` | merged | Jun | Streamed tables flashed their header as plain text until the delimiter row arrived. |",
        "| 10 | `0f9e8d` | closed | Amara | Duplicate. |",
    ].join("\n"),
    inlineFormatting: [
        "| File | Change | Why |",
        "|---|---|---|",
        "| `packages/happy-desktop-ui/src/messageTextLayout.ts` | Adds **one solve** shared by the estimator and the renderer | See [the design note](https://example.com/design/tables) and ~~the old guess~~ |",
        "| `src/styles/message.css` | `table-layout: fixed` with `white-space: normal` cells | *Integer* `<col>` widths keep both sides on the same pixel grid |",
        "| `README.md` | Nothing | — |",
    ].join("\n"),
    cjkEmoji: [
        "| 項目 | 説明 | 状態 |",
        "|---|---|---|",
        "| 表の折り返し | 長い文章のセルは列幅に合わせて折り返され、短い列は一行のまま保たれます。 | ✅ 完了 |",
        "| 絵文字 🎉 | Mixed 中文 and English text with emoji 🚀🧪 keeps breaking where the browser breaks it. | 🚧 進行中 |",
    ].join("\n"),
    tooManyColumns: [
        "| Package | Entry | Build | Test | Lint | Typecheck | Owner | Notes |",
        "|---|---|---|---|---|---|---|---|",
        "| `happy-desktop-ui` | `src/index.ts` | `vite build` | `run-ui-alignment-tests.mjs` | `eslint . && oxlint .` | `tsc --project tsconfig.json` | design-system | Real browsers, slow |",
        "| `happy-desktop-state` | `src/index.ts` | `tsc --project tsconfig.json` | `vitest run` | `oxlint .` | `tsc --project tsconfig.json` | client-state | Node only |",
    ].join("\n"),
    emptyCells: [
        "| Name | Value | Comment |",
        "|---|---|---|",
        "| first |  | The middle cell is empty |",
        "|  |  |  |",
        "| short row |",
        "| extra | cells | are | dropped |",
    ].join("\n"),
    unbreakable: [
        "| Link | Result |",
        "|---|---|",
        "| https://example.com/a/really/long/path/without/any/spaces/that/is/wider/than/its/column/on/every/measure | Broken anywhere, like body paragraphs |",
        "| Supercalifragilisticexpialidociouslyunbreakablewordthatkeepsgoing | Same rule for a long word |",
    ].join("\n"),
} as const;

export type MarkdownTableFixture = keyof typeof markdownTableFixtures;
