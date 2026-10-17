import { Icon } from "../../Icon";

/**
 * CalendarSeriesNote — the note beside the pointer while an occurrence of a
 * series is dragged, saying the whole series moves with it. It stands just
 * below and right of the pointer, in the coordinates of the view it is in.
 */
export function CalendarSeriesNote(props: {
    /** The view the note is placed in; nothing is drawn until it is known. */
    root: HTMLElement | null;
    /** The pointer, in window coordinates. */
    x: number;
    y: number;
}) {
    if (props.root === null) return null;
    const rect = props.root.getBoundingClientRect();
    return (
        <span
            className="happy-calendar-series-note"
            data-happy-desktop-ui="calendar-series-note"
            role="status"
            style={{
                left: `${String(Math.round(props.x - rect.left + 12))}px`,
                top: `${String(Math.round(props.y - rect.top + 16))}px`,
            }}
        >
            <Icon name="repeat" size={12} />
            Changes all events in this series
        </span>
    );
}
