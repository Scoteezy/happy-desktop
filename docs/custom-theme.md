# Custom theme

Happy Desktop has five appearance choices: System, Light, Dark, Midnight, and
Custom. Custom is the one a person shapes by hand, usually by asking an agent
("make it warmer", "darker sidebar", "teal accents"). The agent edits one file
and the window repaints within a moment. No reload or restart is needed.

## The file

`~/.happy/desktop/theme.json`:

```json
{
    "version": 1,
    "base": "midnight",
    "colors": {
        "groupped-background": "#1d1a17",
        "surface": "#25211d",
        "text": "#ebdbb2",
        "text-secondary": "#a89984",
        "text-link": "#d79921"
    }
}
```

- `version` must be `1`.
- `base` is `"light"`, `"dark"`, or `"midnight"`. Every role not listed in
  `colors` comes from this palette, as does the light or dark color scheme of
  the window, browser tabs, and previews.
- `colors` maps role names to hex colours: `#rgb`, `#rgba`, `#rrggbb`, or
  `#rrggbbaa`. It may be empty or omitted.
- Unknown fields, unknown roles, and non-hex values are refused.

The theme is only shown while Custom is selected (Settings → General → Theme,
the theme menu in the status bar, or the command palette). An agent changing the
theme should tell the person to pick Custom if they have not already.

## Checking a write

If the file is refused, the window keeps the previous theme, and the reason is
written to `~/.happy/desktop/theme.error.txt`. That file is deleted as soon as a
valid theme is accepted. After writing, wait about a second, then check whether
`theme.error.txt` exists.

## Roles worth knowing

The full list is `THEME_COLOR_ROLES` in
`packages/happy-desktop-state/src/appearance/customTheme.ts`. Each role is a CSS
variable in `packages/happy-desktop-ui/src/theme.css` (for example `surface` is
`--surface`). The ones that shape the overall look:

| Role                                               | What it paints                                       |
| -------------------------------------------------- | ---------------------------------------------------- |
| `groupped-background`                              | The window floor: sidebar, rail, settings background |
| `surface`                                          | The main content panel, tabs, and cards              |
| `surface-high`                                     | Recessed areas such as code blocks                   |
| `surface-selected`, `surface-pressed`              | Selected and pressed rows                            |
| `header-background`                                | Panel headers; on Windows, also the title bar        |
| `divider`                                          | Hairlines between areas                              |
| `input-background`, `sidebar-search-background`    | The composer, inputs, and the sidebar search         |
| `user-message-background`                          | The person's own chat bubbles                        |
| `text`, `agent-message-text`, `user-message-text`  | Main text                                            |
| `text-secondary`, `groupped-section-title`         | Quieter text and section headings                    |
| `text-link`                                        | The accent: links, active states                     |
| `button-primary-background`, `button-primary-tint` | The main action button and its label                 |
| `composer-send-background`, `composer-send-icon`   | The round send button in the composer and its arrow  |
| `terminal-background`, `diff-context-bg`           | Terminal and diff backgrounds                        |

Surfaces should keep a visible step between them. On a dark base, raised areas
(`surface`, `input-background`) should be a little lighter than
`groupped-background`. Keep `button-primary-background` readable against the
surfaces around it.
