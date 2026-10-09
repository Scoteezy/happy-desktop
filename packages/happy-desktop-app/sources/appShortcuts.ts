import { commandShortcut, keyShortcut } from "happy-desktop-ui";

/**
 * The window's chords, in one place because two surfaces read them: the
 * dispatchers that run them, and the command palette, which shows the same cap
 * beside the row that does the same thing. A chord written down twice would
 * eventually promise one key and run another.
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
    workspacePin: commandShortcut("p", { shift: true }),
    workspaceSettle: commandShortcut("s", { shift: true }),
    workspaceArchive: commandShortcut("a", { shift: true }),
    /** Undoes the last pin, snooze, or settle while its toast is up. */
    triageUndo: commandShortcut("z"),
    /** The sidebar's bell: the attention list on, or back to every workspace. */
    attentionToggle: commandShortcut("u", { alt: true }),
    /** The sidebar's search, taking its bar. */
    sidebarSearch: commandShortcut("f", { shift: true }),
} as const;
