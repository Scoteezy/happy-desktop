export interface KeyboardShortcut {
    readonly aria: string;
    readonly caps: string;
}

/**
 * One exact chord: which modifiers must be held and which key is struck. A
 * chord made by `commandShortcut` holds Command; one made by `controlShortcut`
 * holds Control; one made by `keyShortcut` holds neither. The matcher reads all
 * three the same way, so a window binds any of them through one dispatcher.
 */
export interface CommandShortcut extends KeyboardShortcut {
    readonly alt: boolean;
    readonly code: string;
    readonly ctrl: boolean;
    readonly key: string;
    readonly meta: boolean;
    readonly shift: boolean;
}

interface ChordModifiers {
    readonly alt?: boolean;
    readonly shift?: boolean;
}

/**
 * The keys whose name on a cap is a symbol rather than the character they
 * produce, and whose physical code is fixed. A shifted punctuation key changes
 * its `key` ("[" becomes "{"), so these chords are matched by code.
 */
const SPECIAL_KEYS: Readonly<Record<string, { readonly cap: string; readonly code: string }>> = {
    "[": { cap: "[", code: "BracketLeft" },
    "]": { cap: "]", code: "BracketRight" },
    "/": { cap: "/", code: "Slash" },
    ",": { cap: ",", code: "Comma" },
    ".": { cap: ".", code: "Period" },
    escape: { cap: "⎋", code: "Escape" },
    tab: { cap: "⇥", code: "Tab" },
    enter: { cap: "↩", code: "Enter" },
    backspace: { cap: "⌫", code: "Backspace" },
};

function chord(
    key: string,
    modifiers: ChordModifiers & { readonly ctrl: boolean; readonly meta: boolean },
): CommandShortcut {
    const normalized = key.toLowerCase();
    const special = SPECIAL_KEYS[normalized];
    const label = special ? special.cap : normalized.toUpperCase();
    const alt = modifiers.alt === true;
    const shift = modifiers.shift === true;
    const ariaKey = special ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : label;
    return {
        alt,
        aria: `${modifiers.ctrl ? "Control+" : ""}${modifiers.meta ? "Meta+" : ""}${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${ariaKey}`,
        caps: `${modifiers.ctrl ? "⌃" : ""}${alt ? "⌥" : ""}${shift ? "⇧" : ""}${modifiers.meta ? "⌘" : ""}${label}`,
        code: special ? special.code : /^[0-9]$/.test(normalized) ? `Digit${label}` : `Key${label}`,
        ctrl: modifiers.ctrl,
        key: normalized,
        meta: modifiers.meta,
        shift,
    };
}

/** Creates one exact macOS Command chord and every representation its UI needs. */
export function commandShortcut(key: string, modifiers: ChordModifiers = {}): CommandShortcut {
    return chord(key, { ...modifiers, ctrl: false, meta: true });
}

/**
 * Creates one exact Control chord — the cross-platform "cycle" gesture, as in
 * Control-Tab — which macOS leaves to the application rather than the menu bar.
 */
export function controlShortcut(key: string, modifiers: ChordModifiers = {}): CommandShortcut {
    return chord(key, { ...modifiers, ctrl: true, meta: false });
}

/**
 * Creates one chord with no Command or Control in it, for the few keys a window
 * binds bare: Shift-Escape, say. Such a chord is matched only where a text field
 * is not the one being typed into, which the dispatcher decides.
 */
export function keyShortcut(key: string, modifiers: ChordModifiers = {}): CommandShortcut {
    return chord(key, { ...modifiers, ctrl: false, meta: false });
}

/** Matches one exact chord while leaving unrelated and composing input untouched. */
export function commandShortcutMatches(event: KeyboardEvent, shortcut: CommandShortcut): boolean {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat)
        return false;
    if (
        event.metaKey !== shortcut.meta ||
        event.ctrlKey !== shortcut.ctrl ||
        event.altKey !== shortcut.alt ||
        event.shiftKey !== shortcut.shift
    )
        return false;
    // A key whose character shifts under Shift, or whose name is not a
    // character at all, is known by its physical code.
    if (SPECIAL_KEYS[shortcut.key] !== undefined) return event.code === shortcut.code;
    if (event.key.toLowerCase() === shortcut.key) return true;
    const digit = /^[0-9]$/.test(shortcut.key);
    if (digit) return event.code === shortcut.code || event.code === `Numpad${shortcut.key}`;
    // Option transforms a letter's `key` on macOS (Option-B is "∫"), so that
    // chord needs its physical code. Plain Command chords remain character
    // based, matching the active keyboard layout and native menu accelerators.
    return shortcut.alt && event.code === shortcut.code;
}

/** Global workspace commands never act through a modal or an open custom menu. */
export function windowShortcutBlocked(): boolean {
    return [
        ...document.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="modal-overlay"], [role="dialog"], [role="menu"]',
        ),
    ].some((element) => element.getClientRects().length > 0);
}

/**
 * Whether the element that has focus takes typed text, so a bare key or an
 * editing chord — Command-Z — is left to it rather than run as a window command.
 */
export function windowShortcutEditing(): boolean {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return false;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
        return !element.readOnly && !element.disabled;
    return element.isContentEditable;
}
