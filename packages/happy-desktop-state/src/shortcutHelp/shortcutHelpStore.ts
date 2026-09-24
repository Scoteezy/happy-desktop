/**
 * Whether the window's keyboard-shortcut sheet is showing. It is window view
 * state like the palette: a card over whatever screen is up, opened by one
 * chord and closed by Escape or the same chord again, and never something to
 * come back to.
 */
export interface ShortcutHelpSnapshot {
    readonly open: boolean;
}

export interface ShortcutHelpStore {
    get(): ShortcutHelpSnapshot;
    subscribe(listener: () => void): () => void;
    helpOpen(): void;
    helpClose(): void;
    helpToggle(): void;
}

const CLOSED: ShortcutHelpSnapshot = { open: false };
const OPENED: ShortcutHelpSnapshot = { open: true };

/** Creates the window-lifetime shortcut sheet store. The constructor opens nothing. */
export function shortcutHelpStoreCreate(): ShortcutHelpStore {
    let snapshot = CLOSED;
    const listeners = new Set<() => void>();
    const publish = (next: ShortcutHelpSnapshot): void => {
        if (snapshot === next) return;
        snapshot = next;
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        helpOpen: () => publish(OPENED),
        helpClose: () => publish(CLOSED),
        helpToggle: () => publish(snapshot.open ? CLOSED : OPENED),
    };
}

/** The sheet a window that offers none stands in: it stays closed. */
export const shortcutHelpStoreNoop: ShortcutHelpStore = {
    get: () => CLOSED,
    subscribe: () => () => undefined,
    helpOpen: () => undefined,
    helpClose: () => undefined,
    helpToggle: () => undefined,
};
