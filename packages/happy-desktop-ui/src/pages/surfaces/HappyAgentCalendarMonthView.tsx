import { useState, type PointerEvent as ReactPointerEvent } from "react";
import {
    calendarDateAdd,
    calendarDateDiff,
    calendarMinutesOf,
    calendarTimingShiftDays,
    type HappyAgentCalendarEventId,
    type HappyAgentCalendarTiming,
} from "happy-desktop-state";
import { CalendarSeriesNote } from "./CalendarSeriesNote";
import {
    calendarDateLabel,
    calendarItemKey,
    calendarMinutesLabel,
    calendarSegmentsFit,
    calendarTitleOf,
    calendarWeekSegments,
    type CalendarBarSegment,
    type CalendarItem,
} from "./calendarLayout";

/** Each line of a day cell is this tall, which is what lets a cell say how many lines it holds. */
const LINE_HEIGHT = 20;
const LINE_GAP = 2;
/** The day number above a cell's lines. */
const CELL_HEAD = 28;
/** How far a pointer travels before a press on a day or an event is a drag. */
const DRAG_SLOP = 4;

export interface HappyAgentCalendarMonthViewProps {
    /** The Monday the grid starts on. */
    firstDate: string;
    /** 28 to 42: whole weeks. */
    days: number;
    /** The month the grid is for, `YYYY-MM`; days outside it are muted. */
    month: string;
    today: string;
    timeZone: string;
    items: readonly CalendarItem[];
    /** The occurrence the popover is open on, drawn as chosen. */
    selectedKey?: string;
    /** A click or a drag across empty days: a new all-day event over them. */
    onDraftCreate: (timing: HappyAgentCalendarTiming) => void;
    onOccurrenceOpen: (eventId: HappyAgentCalendarEventId, index: number) => void;
    /** An occurrence dragged to another day keeps its time and moves by whole days. */
    onOccurrenceMove: (
        eventId: HappyAgentCalendarEventId,
        index: number,
        timing: HappyAgentCalendarTiming,
    ) => void;
    /** A day's number, or its "+N more": shows that day's week. */
    onDayOpen: (date: string) => void;
}

/** What a press on the grid is doing, while it lasts. */
type Gesture =
    | {
          readonly kind: "select";
          readonly pointerId: number;
          readonly from: string;
          readonly to: string;
      }
    | {
          readonly kind: "move";
          readonly pointerId: number;
          readonly item: CalendarItem;
          readonly from: string;
          readonly to: string;
          readonly x: number;
          readonly y: number;
          /** Where the pointer is now, for the note that says a series moves whole. */
          readonly pointerX: number;
          readonly pointerY: number;
          readonly moved: boolean;
      };

/** The date of the day cell under a point, read from the cell's own data. */
function dateAt(x: number, y: number): string | undefined {
    for (const element of document.elementsFromPoint(x, y)) {
        const date = (element as HTMLElement).dataset?.["calendarDate"];
        if (date !== undefined) return date;
    }
    return undefined;
}

/**
 * HappyAgentCalendarMonthView — a month of days in whole weeks, Monday
 * first. All-day events and events that run across days are bars that keep
 * one lane through their week; the rest are one line each with their start
 * time. A day with more than its cell holds gives its last line to "+N more",
 * which opens that day's week.
 *
 * A click on an empty day, or a drag across several, opens a new all-day
 * event over them; an event is dragged to another day to move it there. The
 * grid holds only the gesture under way; what is shown is the owner's.
 */
export function HappyAgentCalendarMonthView(props: HappyAgentCalendarMonthViewProps) {
    const [gesture, setGesture] = useState<Gesture>();
    const [rowHeight, setRowHeight] = useState(0);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const weeks = Math.ceil(props.days / 7);
    // Measured once the grid has a size: how many lines a cell holds.
    const measure = (element: HTMLDivElement | null) => {
        if (element === null) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry) setRowHeight(entry.contentRect.height / weeks);
        });
        observer.observe(element);
        return () => observer.disconnect();
    };
    const lanes = Math.max(1, Math.floor((rowHeight - CELL_HEAD - 4) / (LINE_HEIGHT + LINE_GAP)));
    const shift =
        gesture?.kind === "move" && gesture.moved ? calendarDateDiff(gesture.from, gesture.to) : 0;
    const movingKey =
        gesture?.kind === "move" && gesture.moved
            ? calendarItemKey(gesture.item.occurrence.eventId, gesture.item.occurrence.index)
            : undefined;
    // The occurrence being dragged is drawn where it would land.
    const items = props.items.map((item) =>
        calendarItemKey(item.occurrence.eventId, item.occurrence.index) === movingKey
            ? {
                  ...item,
                  occurrence: {
                      ...item.occurrence,
                      timing: calendarTimingShiftDays(item.occurrence.timing, shift),
                  },
              }
            : item,
    );
    const selection =
        gesture?.kind === "select"
            ? gesture.from <= gesture.to
                ? { first: gesture.from, last: gesture.to }
                : { first: gesture.to, last: gesture.from }
            : undefined;

    const dayPress = (event: ReactPointerEvent<HTMLDivElement>, date: string) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setGesture({ kind: "select", pointerId: event.pointerId, from: date, to: date });
    };
    const itemPress = (event: ReactPointerEvent<HTMLElement>, item: CalendarItem) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        const from = dateAt(event.clientX, event.clientY);
        if (from === undefined) return;
        setGesture({
            kind: "move",
            pointerId: event.pointerId,
            item,
            from,
            to: from,
            x: event.clientX,
            y: event.clientY,
            pointerX: event.clientX,
            pointerY: event.clientY,
            moved: false,
        });
    };
    const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        if (gesture === undefined || event.pointerId !== gesture.pointerId) return;
        const to = dateAt(event.clientX, event.clientY) ?? gesture.to;
        if (gesture.kind === "select") {
            if (to !== gesture.to) setGesture({ ...gesture, to });
            return;
        }
        const moved =
            gesture.moved ||
            Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > DRAG_SLOP;
        setGesture({
            ...gesture,
            to,
            moved,
            pointerX: event.clientX,
            pointerY: event.clientY,
        });
    };
    const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
        if (gesture === undefined || event.pointerId !== gesture.pointerId) return;
        setGesture(undefined);
        if (gesture.kind === "select") {
            const first = gesture.from <= gesture.to ? gesture.from : gesture.to;
            const last = gesture.from <= gesture.to ? gesture.to : gesture.from;
            props.onDraftCreate({
                kind: "allDay",
                startDate: first,
                endDate: calendarDateAdd(last, 1),
            });
            return;
        }
        const occurrence = gesture.item.occurrence;
        if (!gesture.moved) {
            props.onOccurrenceOpen(occurrence.eventId, occurrence.index);
            return;
        }
        const days = calendarDateDiff(gesture.from, gesture.to);
        if (days !== 0)
            props.onOccurrenceMove(
                occurrence.eventId,
                occurrence.index,
                calendarTimingShiftDays(occurrence.timing, days),
            );
    };
    const pointerCancel = () => setGesture(undefined);

    const rows = Array.from({ length: weeks }, (_, week) => {
        const weekStart = calendarDateAdd(props.firstDate, week * 7);
        const segments = calendarWeekSegments(items, weekStart, props.timeZone, false);
        const { shown, hidden } = calendarSegmentsFit(segments, lanes);
        return { weekStart, shown, hidden };
    });

    return (
        <div
            className="happy-calendar-month"
            data-happy-desktop-ui="calendar-month"
            data-gesture={gesture?.kind === "move" && gesture.moved ? "move" : undefined}
            ref={setRoot}
        >
            <div className="happy-calendar-month__weekdays" aria-hidden="true">
                {Array.from({ length: 7 }, (_, column) => (
                    <span className="happy-calendar-month__weekday" key={column}>
                        {calendarDateLabel(calendarDateAdd(props.firstDate, column), {
                            weekday: "short",
                        })}
                    </span>
                ))}
            </div>
            <div className="happy-calendar-month__weeks" ref={measure} role="grid">
                {rows.map(({ weekStart, shown, hidden }) => (
                    <div className="happy-calendar-month__week" key={weekStart} role="row">
                        <div className="happy-calendar-month__days">
                            {Array.from({ length: 7 }, (_, column) => {
                                const date = calendarDateAdd(weekStart, column);
                                const more = hidden[column] ?? 0;
                                return (
                                    <div
                                        aria-label={calendarDateLabel(date, {
                                            weekday: "long",
                                            day: "numeric",
                                            month: "long",
                                        })}
                                        className="happy-calendar-month__day"
                                        data-calendar-date={date}
                                        data-outside={
                                            date.slice(0, 7) === props.month ? undefined : ""
                                        }
                                        data-selected={
                                            selection !== undefined &&
                                            date >= selection.first &&
                                            date <= selection.last
                                                ? ""
                                                : undefined
                                        }
                                        data-today={date === props.today ? "" : undefined}
                                        key={date}
                                        onPointerCancel={pointerCancel}
                                        onPointerDown={(event) => dayPress(event, date)}
                                        onPointerMove={pointerMove}
                                        onPointerUp={pointerUp}
                                        role="gridcell"
                                    >
                                        <button
                                            className="happy-calendar-month__date"
                                            onClick={() => props.onDayOpen(date)}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            type="button"
                                        >
                                            {date.endsWith("-01")
                                                ? calendarDateLabel(date, {
                                                      month: "short",
                                                      day: "numeric",
                                                  })
                                                : String(Number(date.slice(8)))}
                                        </button>
                                        {more > 0 ? (
                                            <button
                                                className="happy-calendar-month__more"
                                                onClick={() => props.onDayOpen(date)}
                                                onPointerDown={(event) => event.stopPropagation()}
                                                style={{
                                                    top: `${String(CELL_HEAD + (lanes - 1) * (LINE_HEIGHT + LINE_GAP))}px`,
                                                }}
                                                type="button"
                                            >
                                                +{String(more)} more
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                        {shown.map((segment) => (
                            <MonthLine
                                key={`${calendarItemKey(segment.item.occurrence.eventId, segment.item.occurrence.index)}:${weekStart}`}
                                moving={
                                    calendarItemKey(
                                        segment.item.occurrence.eventId,
                                        segment.item.occurrence.index,
                                    ) === movingKey
                                }
                                onPointerCancel={pointerCancel}
                                onPointerDown={(event) => itemPress(event, segment.item)}
                                onPointerMove={pointerMove}
                                onPointerUp={pointerUp}
                                segment={segment}
                                selected={
                                    calendarItemKey(
                                        segment.item.occurrence.eventId,
                                        segment.item.occurrence.index,
                                    ) === props.selectedKey
                                }
                                timeZone={props.timeZone}
                            />
                        ))}
                    </div>
                ))}
            </div>
            {gesture?.kind === "move" && gesture.moved && gesture.item.event.recurrence ? (
                <CalendarSeriesNote root={root} x={gesture.pointerX} y={gesture.pointerY} />
            ) : null}
        </div>
    );
}

/** One occurrence in a week row: a bar across days, or one timed line in a day. */
function MonthLine(props: {
    segment: CalendarBarSegment;
    timeZone: string;
    selected: boolean;
    moving: boolean;
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
}) {
    const { segment } = props;
    const { event, occurrence } = segment.item;
    const timing = occurrence.timing;
    const title = calendarTitleOf(event.title);
    const time =
        timing.kind === "timed" && !segment.continuesBefore
            ? calendarMinutesLabel(calendarMinutesOf(timing.start, props.timeZone))
            : undefined;
    return (
        <button
            aria-label={[title, time, event.recurrence ? "repeats" : undefined]
                .filter(Boolean)
                .join(", ")}
            className="happy-calendar-line"
            data-bar={segment.bar ? "" : undefined}
            data-calendar-item={calendarItemKey(occurrence.eventId, occurrence.index)}
            data-continues-after={segment.continuesAfter ? "" : undefined}
            data-continues-before={segment.continuesBefore ? "" : undefined}
            data-happy-desktop-ui="calendar-line"
            data-moving={props.moving ? "" : undefined}
            data-selected={props.selected ? "" : undefined}
            data-untitled={event.title.trim().length === 0 ? "" : undefined}
            onPointerCancel={props.onPointerCancel}
            onPointerDown={props.onPointerDown}
            onPointerMove={props.onPointerMove}
            onPointerUp={props.onPointerUp}
            style={{
                left: `calc(${String((segment.startColumn / 7) * 100)}% + 4px)`,
                width: `calc(${String(((segment.endColumn - segment.startColumn) / 7) * 100)}% - 8px)`,
                top: `${String(CELL_HEAD + segment.lane * (LINE_HEIGHT + LINE_GAP))}px`,
            }}
            title={title}
            type="button"
        >
            {segment.bar ? null : <span aria-hidden="true" className="happy-calendar-line__dot" />}
            {time === undefined ? null : <span className="happy-calendar-line__time">{time}</span>}
            <span className="happy-calendar-line__title">{title}</span>
        </button>
    );
}
