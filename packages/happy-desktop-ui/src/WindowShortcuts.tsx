import { useEffectEvent, useLayoutEffect } from "react";
import {
    commandShortcutMatches,
    windowShortcutBlocked,
    windowShortcutEditing,
    type CommandShortcut,
} from "./keyboardShortcut";

export interface WindowShortcutAction {
    readonly run: () => void;
    readonly shortcut: CommandShortcut;
    /**
     * Whether the chord still runs while a text field has focus. It does by
     * default: a Command chord is a window command wherever the caret is. A
     * chord the field itself answers — Command-Z, a bare Shift-Escape — says
     * `false` here and is left to the field, so a window undo never takes the
     * place of undoing what was just typed.
     */
    readonly whenEditing?: boolean;
}

/**
 * One lifecycle-owned dispatcher for context-sensitive window commands. The
 * caller supplies only commands that are currently actionable.
 */
export function WindowShortcuts(props: { readonly actions: readonly WindowShortcutAction[] }) {
    const shortcutRun = useEffectEvent((event: KeyboardEvent) => {
        const action = props.actions.find((candidate) =>
            commandShortcutMatches(event, candidate.shortcut),
        );
        if (!action || windowShortcutBlocked()) return;
        if (action.whenEditing === false && windowShortcutEditing()) return;
        event.preventDefault();
        action.run();
    });
    // eslint-disable-next-line happy-react/no-layout-effect -- a window command must work regardless of which descendant owns focus
    useLayoutEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => shortcutRun(event);
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);
    return null;
}
