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

export interface WindowKeyReleaseProps {
    /** The `KeyboardEvent.key` whose release is reported, e.g. `"Control"`. */
    readonly keyName: string;
    readonly onRelease: () => void;
}

/**
 * Reports the release of one key, for a gesture that lasts as long as a
 * modifier is held — walking the recent tabs under Control, say — and commits
 * when it lets go. Losing the window while the key is down counts as letting
 * go, so a walk never stays open across a switch to another application.
 */
export function WindowKeyRelease(props: WindowKeyReleaseProps) {
    const release = useEffectEvent(() => props.onRelease());
    const keyName = props.keyName;
    // eslint-disable-next-line happy-react/no-layout-effect -- a key release must be seen regardless of which descendant owns focus
    useLayoutEffect(() => {
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === keyName) release();
        };
        const onBlur = () => release();
        window.addEventListener("keyup", onKeyUp);
        window.addEventListener("blur", onBlur);
        return () => {
            window.removeEventListener("keyup", onKeyUp);
            window.removeEventListener("blur", onBlur);
        };
    }, [keyName]);
    return null;
}
