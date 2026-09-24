import { commandShortcut, controlShortcut, keyShortcut } from "happy-desktop-ui";

/**
 * The window's chords, in one place because several surfaces read them: the
 * dispatchers that run them, the command palette, which shows the same cap
 * beside the row that does the same thing, and the shortcut sheet, which lists
 * them all. A chord written down twice would eventually promise one key and
 * run another.
 */
export const APP_SHORTCUTS = {
    /** Opens the command palette. Closing it again is the palette's own key. */
    paletteOpen: commandShortcut("k"),
    panelToggle: commandShortcut("j"),
    panelToggleAlternate: commandShortcut("b", { alt: true }),
    sessionCreate: commandShortcut("t"),
    tabClose: commandShortcut("w"),
    workspaceCreate: commandShortcut("n"),
    /** Jumps to the next conversation waiting on the person. */
    attentionNext: commandShortcut("u", { shift: true }),
    /** Marks every waiting conversation on the addressed machine read. */
    attentionReadAll: keyShortcut("escape", { shift: true }),
    /** The tab to the left in the open workspace's strip, wrapping. */
    tabPrevious: commandShortcut("[", { shift: true }),
    /** The tab to the right in the open workspace's strip, wrapping. */
    tabNext: commandShortcut("]", { shift: true }),
    /** One step down the recently used conversations; releasing Control lands. */
    recentNext: controlShortcut("tab"),
    /** One step back up that same list. */
    recentPrevious: controlShortcut("tab", { shift: true }),
    workspacePin: commandShortcut("p", { shift: true }),
    workspaceSettle: commandShortcut("s", { shift: true }),
    workspaceArchive: commandShortcut("a", { shift: true }),
    /** Undoes the last pin, snooze, or settle while its toast is up. */
    triageUndo: commandShortcut("z"),
    /** Opens the sheet that lists every chord here. */
    shortcutHelp: commandShortcut("/"),
    /** The sidebar's bell: the attention list on, or back to every workspace. */
    attentionToggle: commandShortcut("u", { alt: true }),
    /** The sidebar's search, taking its bar. */
    sidebarSearch: commandShortcut("f", { shift: true }),
} as const;

/** What each chord does, for the sheet that lists them. */
export const APP_SHORTCUT_GROUPS: readonly {
    readonly label: string;
    readonly rows: readonly { readonly label: string; readonly keys: keyof typeof APP_SHORTCUTS }[];
}[] = [
    {
        label: "Navigate",
        rows: [
            { label: "Command palette", keys: "paletteOpen" },
            { label: "Show what needs you, or every workspace", keys: "attentionToggle" },
            { label: "Search sessions", keys: "sidebarSearch" },
            { label: "Next conversation needing you", keys: "attentionNext" },
            { label: "Mark everything read", keys: "attentionReadAll" },
            { label: "Walk recent conversations", keys: "recentNext" },
            { label: "Walk recent conversations backwards", keys: "recentPrevious" },
            { label: "Next tab", keys: "tabNext" },
            { label: "Previous tab", keys: "tabPrevious" },
        ],
    },
    {
        label: "Workspace",
        rows: [
            { label: "New chat", keys: "sessionCreate" },
            { label: "New workspace", keys: "workspaceCreate" },
            { label: "Close tab", keys: "tabClose" },
            { label: "Toggle side panel", keys: "panelToggle" },
            { label: "Toggle side panel (alternate)", keys: "panelToggleAlternate" },
        ],
    },
    {
        label: "Sidebar",
        rows: [
            { label: "Pin or unpin this workspace", keys: "workspacePin" },
            { label: "Settle or reopen this workspace", keys: "workspaceSettle" },
            { label: "Archive this workspace", keys: "workspaceArchive" },
            { label: "Undo the last pin, snooze, or settle", keys: "triageUndo" },
        ],
    },
    {
        label: "Help",
        rows: [{ label: "Keyboard shortcuts", keys: "shortcutHelp" }],
    },
];
