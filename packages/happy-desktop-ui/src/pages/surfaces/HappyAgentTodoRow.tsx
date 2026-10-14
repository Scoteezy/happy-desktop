import { Avatar } from "../../Avatar";
import { Button } from "../../Button";
import { Checkbox } from "../../Checkbox";
import { REORDERING_LIST_STATIC } from "../../ReorderingList";
import { Tooltip } from "../../Tooltip";
import { initialsOf, type HappyAgentSurfacePersonView } from "./surfacePresentation";

/** The todo's text is bounded by the daemon. */
const TEXT_LIMIT = 10_000;

export interface HappyAgentTodoRowProps {
    text: string;
    completed: boolean;
    /** Who wrote it, once they are known; absent when the todo credits nobody. */
    author?: HappyAgentSurfacePersonView;
    /** The text being typed while the todo is edited in place; absent otherwise. */
    editing?: string;
    onCompletedChange: (completed: boolean) => void;
    onEditStart: () => void;
    onEditTextChange: (text: string) => void;
    onEditCommit: () => void;
    onEditCancel: () => void;
    onDelete: () => void;
}

/**
 * One todo in a fixed 40px row: its checkbox, its text, the face of who wrote
 * it when that is known, and a delete control that shows while the row is
 * hovered or focused.
 *
 * In a reorderable list the row's body is what is dragged. Its controls — the
 * checkbox, the delete button, and the field while the text is edited — are
 * marked static, so a press on them is only ever a press. A click on the text
 * that never became a drag edits it in place: Enter or leaving the field
 * saves, Escape puts it back.
 */
export function HappyAgentTodoRow(props: HappyAgentTodoRowProps) {
    return (
        <div
            className="happy-agent-todo-row"
            data-completed={props.completed ? "" : undefined}
            data-editing={props.editing !== undefined ? "" : undefined}
            data-happy-desktop-ui="happy-agent-todo-row"
        >
            <span className="happy-agent-todo-row__check" {...REORDERING_LIST_STATIC}>
                <Checkbox
                    aria-label={
                        props.completed
                            ? `Mark “${props.text}” not done`
                            : `Mark “${props.text}” done`
                    }
                    checked={props.completed}
                    onChange={props.onCompletedChange}
                />
            </span>
            {props.editing !== undefined ? (
                <input
                    {...REORDERING_LIST_STATIC}
                    aria-label="Todo text"
                    autoFocus
                    className="happy-agent-todo-row__field"
                    maxLength={TEXT_LIMIT}
                    onBlur={props.onEditCommit}
                    onChange={(event) => props.onEditTextChange(event.currentTarget.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            props.onEditCommit();
                        } else if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            props.onEditCancel();
                        }
                    }}
                    type="text"
                    value={props.editing}
                />
            ) : (
                <button
                    className="happy-agent-todo-row__text"
                    onClick={props.onEditStart}
                    title={props.text}
                    type="button"
                >
                    {props.text}
                </button>
            )}
            {props.author ? (
                // Part of the body, so a press on the face drags the row like
                // a press anywhere else on it.
                <Tooltip
                    className="happy-agent-todo-row__author"
                    label={`Added by ${props.author.name}`}
                    placement="top"
                >
                    <Avatar
                        aria-label={`Added by ${props.author.name}`}
                        imageUrl={props.author.photo?.url}
                        initials={initialsOf(props.author.name)}
                        size="xs"
                    />
                </Tooltip>
            ) : null}
            <Button
                {...REORDERING_LIST_STATIC}
                aria-label={`Delete “${props.text}”`}
                className="happy-agent-todo-row__delete"
                icon="trash"
                iconOnly
                onClick={props.onDelete}
                size="small"
                variant="ghost"
            />
        </div>
    );
}
