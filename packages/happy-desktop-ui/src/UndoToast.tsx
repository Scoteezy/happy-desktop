import type { CSSProperties } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import type { KeyboardShortcut } from "./keyboardShortcut";

export interface UndoToastProps {
    /** What was just done, in the past tense: "Settled happy". */
    readonly label: string;
    readonly onUndo: () => void;
    readonly onDismiss?: () => void;
    /** The chord that also undoes it, worn on the button. */
    readonly shortcut?: KeyboardShortcut;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

/**
 * UndoToast — the one line that follows a pin, snooze, or settle: what was
 * done, and the way to take it back. It sits at the bottom of the window over
 * whatever is there, never blocks anything, and goes away on its own when the
 * owner withdraws the offer. It holds no timer: how long the offer stands is
 * the store's rule, and this only shows it while it does.
 */
export function UndoToast(props: UndoToastProps) {
    return (
        <div
            className={["happy-undo-toast", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="undo-toast"
            data-testid={props["data-testid"]}
            role="status"
            style={props.style}
        >
            <span aria-hidden="true" className="happy-undo-toast__mark">
                <Icon name="check" size={14} />
            </span>
            <span className="happy-undo-toast__label">{props.label}</span>
            <Button
                data-action="undo"
                onClick={props.onUndo}
                {...(props.shortcut ? { shortcut: props.shortcut } : {})}
                size="small"
                variant="secondary"
            >
                Undo
            </Button>
            {props.onDismiss ? (
                <Button
                    aria-label="Dismiss"
                    data-action="dismiss"
                    icon="close"
                    iconOnly
                    onClick={props.onDismiss}
                    size="small"
                    variant="ghost"
                />
            ) : null}
        </div>
    );
}
