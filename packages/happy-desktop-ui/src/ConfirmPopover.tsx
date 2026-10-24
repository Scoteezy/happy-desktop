import { useCallback, useId, type CSSProperties, type KeyboardEvent } from "react";
import { Button } from "./Button";

export type ConfirmPopoverTone = "default" | "danger";

export type ConfirmPopoverProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The question, in a few words. */
    title: string;
    /** What confirming does, when the title alone does not say it. */
    message?: string;
    /** Names the act itself, such as "Stop subagents", never a bare "OK". */
    confirmLabel: string;
    cancelLabel?: string;
    /** `danger` paints the confirming action in the destructive role. */
    tone?: ConfirmPopoverTone;
    onCancel: () => void;
    onConfirm: () => void;
};

/**
 * C-310 ConfirmPopover — a small question card asked in place, beside the
 * control that raised it, instead of over the whole window. It is the card
 * alone, on the raised surface the menus use: where it is anchored and what an
 * outside click does belong to the host, the way `MenuButton` hosts `Menu`.
 *
 * Mounting it moves focus to Cancel, so a stray Enter keeps things as they
 * are. Escape cancels, and Tab cycles between its two actions.
 */
export function ConfirmPopover(props: ConfirmPopoverProps) {
    const titleId = useId();
    const messageId = useId();
    const tone = props.tone ?? "default";
    // The card's commit is the moment its actions exist, so focus moves then
    // rather than after React's own scheduling.
    const cardRef = useCallback((node: HTMLDivElement | null): void => {
        node?.querySelector<HTMLElement>("button")?.focus();
    }, []);
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            props.onCancel();
            return;
        }
        if (event.key !== "Tab") return;
        const actions = [...event.currentTarget.querySelectorAll<HTMLElement>("button")];
        const first = actions[0];
        const last = actions.at(-1);
        if (first === undefined || last === undefined) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };
    return (
        <div
            aria-describedby={props.message === undefined ? undefined : messageId}
            aria-labelledby={titleId}
            aria-modal="false"
            className={["happy-confirm-popover", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="confirm-popover"
            data-testid={props["data-testid"]}
            data-tone={tone}
            onKeyDown={onKeyDown}
            ref={cardRef}
            role="alertdialog"
            style={props.style}
        >
            <div
                className="happy-confirm-popover__title"
                data-happy-desktop-ui="confirm-popover-title"
                id={titleId}
            >
                {props.title}
            </div>
            {props.message === undefined ? null : (
                <div
                    className="happy-confirm-popover__message"
                    data-happy-desktop-ui="confirm-popover-message"
                    id={messageId}
                >
                    {props.message}
                </div>
            )}
            <div
                className="happy-confirm-popover__actions"
                data-happy-desktop-ui="confirm-popover-actions"
            >
                <Button
                    data-action="cancel"
                    onClick={() => props.onCancel()}
                    size="small"
                    variant="ghost"
                >
                    {props.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                    data-action="confirm"
                    onClick={() => props.onConfirm()}
                    size="small"
                    variant={tone === "danger" ? "danger" : "primary"}
                >
                    {props.confirmLabel}
                </Button>
            </div>
        </div>
    );
}
