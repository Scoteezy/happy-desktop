import { commandShortcut } from "happy-desktop-ui";

/**
 * The window's Command chords, in one place because two surfaces read them: the
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
    /**
     * The neighbouring tab in whichever strip the keyboard is in, the way a
     * browser steps through its tabs. Command-number is already the sidebar's,
     * jumping between projects, so the strip takes the bracket chords instead.
     */
    tabNext: commandShortcut("]", { shift: true }),
    tabPrevious: commandShortcut("[", { shift: true }),
    /** Brings back the tab closed most recently, the way a browser's does. */
    tabReopen: commandShortcut("t", { shift: true }),
    workspaceCreate: commandShortcut("n"),
} as const;
