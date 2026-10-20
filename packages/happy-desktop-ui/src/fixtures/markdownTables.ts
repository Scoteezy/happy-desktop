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
    /* A real agent reply: code with spaces in a narrow first column, unbroken
       identifiers in the middle, and the longest prose in the last column. */
    agentComparison: [
        "| Config today | What runs | Who launches it | Whose agent loop |",
        "|---|---|---|---|",
        "| `type = \"claude\"` (existing) | Claude Agent SDK, using Happy's bundled Claude Code binary | The SDK | **Happy's**: Claude's own tools and settings are switched off, and Happy's prompt and tools are used |",
        '| `acp` + `agent = "claude"` (new) | **The same SDK, version and binary** (`resolveClaudeCodeExecutablePath()`) | The SDK. We only put the process in its own group so stop can kill its commands. `launch: {command: "claude"}` is leftover and only passes env vars | **Claude Code\'s**: its own prompt, tools, settings and sub-agents, with Happy\'s tools added over MCP |',
        '| `type = "codex"` (existing) | Responses API calls with Codex credentials, no Codex binary | — | Happy\'s |',
        '| `acp` + `agent = "codex"` (new) | `codex app-server`, driven by our own hand-typed JSON-RPC client | **By hand**: `npx -y @openai/codex@0.160.1 app-server` | Codex\'s |',
        '| `acp` + `agent = "antigravity"` | Community ACP adapter, which drives `agy` | By hand: `npx -y antigravity-acp@1.2.0` (needs Bun) | Antigravity\'s |',
    ].join("\n"),
    longCodeSpan: [
        "| Symbol | Where it lives | Notes |",
        "|---|---|---|",
        "| `resolveClaudeCodeExecutablePathFromBundledRuntimeDirectory()` | `packages/happy-agent/sources/runtime/claude/executable.ts` | Called once per session start. |",
        "| `id` | `index.ts` | Short. |",
    ].join("\n"),
    keyValue: [
        "| Key | Value |",
        "|---|---|",
        "| Model | Opus 5.5 with a one-million-token context window, routed through the shared provider account |",
        "| Workspace | `/var/lib/happy-agent/happy/workspaces/happy-desktop/markdown-table-layout` |",
        "| Status | Running |",
        "| Started | 2026-10-20 09:41 |",
    ].join("\n"),
    compactMatrix: [
        "| Engine | macOS | Linux | Windows | Tests | Retina |",
        "|---|:-:|:-:|:-:|--:|:-:|",
        "| Chromium | ✓ | ✓ | ✓ | 1 204 | ✓ |",
        "| Firefox | ✓ | ✓ | — | 1 198 | ✓ |",
        "| WebKit | ✓ | — | — | 1 187 | — |",
    ].join("\n"),
    alignedFormatting: [
        "| Left | Center | Right |",
        "|:---|:---:|---:|",
        "| **Bold** label | [Release notes](https://example.com/releases/0.0.84) | `1.25 s` |",
        "| *Italic* and `code` | ~~Removed~~ kept | **42** |",
        "| A longer left cell that has to wrap onto a second line somewhere | Centered | 3 |",
    ].join("\n"),
    headerOnly: ["| Column | Another column | Third |", "|---|---|---|"].join("\n"),
    oneRow: ["| Result |", "|---|", "| Everything passed. |"].join("\n"),
    longWords: [
        "| Kind | Text |",
        "|---|---|",
        "| Path | /var/lib/happy-agent/.config/happy-agent/credentials/bulka_happy_codex.json |",
        "| Code path | `/var/lib/happy-agent/.config/happy-agent/credentials/bulka_happy_codex.json` |",
        "| German | Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz |",
        "| Russian | Превысокомногорассмотрительствующий человек |",
    ].join("\n"),
    tenColumns: [
        "| Run | Branch | Commit | Author | Started | Duration | Build | Unit | Browser | Result |",
        "|---|---|---|---|---|---|---|---|---|---|",
        "| 812 | `main` | `356c1d48` | Kirill | 09:41 | 6 min 12 s | passed | passed | passed with two retried flaky screenshots | Shipped to preview |",
        "| 813 | `worktree/markdown-table-layout` | `c6abc66c` | Happy | 10:02 | 4 min 55 s | passed | failed | skipped | Waiting for a fix to the table width solver |",
    ].join("\n"),
} as const;

export type MarkdownTableFixture = keyof typeof markdownTableFixtures;
