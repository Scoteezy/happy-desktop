import { useState, type PointerEvent as ReactPointerEvent } from "react";
import {
    calendarDateAdd,
    calendarDateDiff,
    calendarDateOf,
    calendarInstantOf,
    calendarMinutesOf,
    calendarTimingShiftDays,
    type HappyAgentCalendarEventId,
    type HappyAgentCalendarTiming,
} from "happy-desktop-state";
import { Icon } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import { CalendarSeriesNote } from "./CalendarSeriesNote";
import {
    calendarDateLabel,
    calendarHourLabel,
    calendarItemKey,
    calendarMinutesLabel,
    calendarSegmentsFit,
    calendarTimedSegments,
    calendarTitleOf,
    calendarWeekSegments,
    type CalendarBarSegment,
    type CalendarItem,
    type CalendarTimedSegment,
} from "./calendarLayout";

/** One hour of the time grid. */
export const CALENDAR_HOUR_HEIGHT = 48;
/** A drag lands on quarter hours. */
const SNAP_MINUTES = 15;
/** A click on empty time makes an hour-long event. */
const CLICK_MINUTES = 60;
/** How far a pointer travels before a press is a drag. */
const DRAG_SLOP = 4;
/** The all-day row shows this many lanes before it gives the last to "+N". */
const ALL_DAY_LANES = 3;
const LINE_HEIGHT = 20;
const LINE_GAP = 2;
/** The hour the grid opens scrolled to. */
const OPEN_HOUR = 7;

const MINUTE_HEIGHT = CALENDAR_HOUR_HEIGHT / 60;

export interface HappyAgentCalendarWeekViewProps {
    /** The Monday the week starts on. */
    firstDate: string;
    today: string;
    /** Now, in epoch milliseconds, for the line across today. */
    now: number;
    timeZone: string;
    items: readonly CalendarItem[];
    selectedKey?: string;
    /** A click or a drag on empty time or days: a new event over them. */
    onDraftCreate: (timing: HappyAgentCalendarTiming) => void;
    onOccurrenceOpen: (eventId: HappyAgentCalendarEventId, index: number) => void;
    /** An occurrence dragged or resized to a new timing. */
    onOccurrenceMove: (
        eventId: HappyAgentCalendarEventId,
        index: number,
        timing: HappyAgentCalendarTiming,
    ) => void;
}

/** Where a pointer is in the time grid: which day, and how far into it. */
interface GridPoint {
    readonly column: number;
    readonly minutes: number;
}

type Gesture =
    | {
          readonly kind: "select";
          readonly pointerId: number;
          readonly from: GridPoint;
          readonly to: GridPoint;
          readonly moved: boolean;
      }
    | {
          readonly kind: "selectDays";
          readonly pointerId: number;
          readonly from: number;
          readonly to: number;
      }
    | {
          readonly kind: "move" | "resize";
          readonly pointerId: number;
          readonly item: CalendarItem;
          readonly from: GridPoint;
          readonly to: GridPoint;
          readonly x: number;
          readonly y: number;
          readonly pointerX: number;
          readonly pointerY: number;
          readonly moved: boolean;
      }
    | {
          readonly kind: "moveDays";
          readonly pointerId: number;
          readonly item: CalendarItem;
          readonly from: number;
          readonly to: number;
          readonly x: number;
          readonly pointerX: number;
          readonly pointerY: number;
          readonly moved: boolean;
      };

function snap(minutes: number): number {
    return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function clamp(value: number, low: number, high: number): number {
    return Math.min(high, Math.max(low, value));
}

/**
 * HappyAgentCalendarWeekView — one week, Monday first: a row of all-day
 * bars over a scrolling grid of hours. Events that overlap share their day's
 * width side by side, and a red line marks now across today.
 *
 * Clicking empty time makes an hour-long draft there; dragging over time
 * makes one as long as the drag, on quarter hours. An event is dragged to
 * move it, across days and hours, and its bottom edge is dragged to change
 * when it ends. In the all-day row the same is done by whole days. The view
 * holds only the gesture under way; what is shown is the owner's.
 */
export function HappyAgentCalendarWeekView(props: HappyAgentCalendarWeekViewProps) {
    const [gesture, setGesture] = useState<Gesture>();
    const [columns, setColumns] = useState<HTMLDivElement | null>(null);
    const [allDayRow, setAllDayRow] = useState<HTMLDivElement | null>(null);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const days = Array.from({ length: 7 }, (_, column) => calendarDateAdd(props.firstDate, column));

    const pointOf = (x: number, y: number): GridPoint | undefined => {
        if (columns === null) return undefined;
        const rect = columns.getBoundingClientRect();
        return {
            column: clamp(Math.floor(((x - rect.left) / rect.width) * 7), 0, 6),
            minutes: clamp((y - rect.top) / MINUTE_HEIGHT, 0, 1_440),
        };
    };
    const dayOf = (x: number): number | undefined => {
        if (allDayRow === null) return undefined;
        const rect = allDayRow.getBoundingClientRect();
        return clamp(Math.floor(((x - rect.left) / rect.width) * 7), 0, 6);
    };
    const instantOf = (column: number, minutes: number): number =>
        calendarInstantOf(days[0]!, column * 1_440 + minutes, props.timeZone);

    /** The timing a move or a resize under way would give its occurrence. */
    const gestureTiming = (
        current: Extract<Gesture, { kind: "move" | "resize" | "moveDays" }>,
    ): HappyAgentCalendarTiming => {
        const timing = current.item.occurrence.timing;
        if (current.kind === "moveDays")
            return calendarTimingShiftDays(timing, current.to - current.from);
        if (timing.kind !== "timed") return timing;
        const deltaMinutes = snap(
            (current.to.column - current.from.column) * 1_440 +
                current.to.minutes -
                current.from.minutes,
        );
        if (current.kind === "resize") {
            const end = Math.max(
                timing.start + SNAP_MINUTES * 60_000,
                timing.end + deltaMinutes * 60_000,
            );
            return { ...timing, end };
        }
        // The move is wall-clock time on the grid the reader dragged across.
        const start =
            calendarInstantOf(
                calendarDateOf(timing.start, props.timeZone),
                calendarMinutesOf(timing.start, props.timeZone) + deltaMinutes,
                props.timeZone,
            ) +
            (timing.start % 60_000);
        return { ...timing, start, end: start + (timing.end - timing.start) };
    };

    const changingKey =
        gesture !== undefined &&
        (gesture.kind === "move" || gesture.kind === "resize" || gesture.kind === "moveDays") &&
        gesture.moved
            ? calendarItemKey(gesture.item.occurrence.eventId, gesture.item.occurrence.index)
            : undefined;
    const items =
        changingKey === undefined
            ? props.items
            : props.items.map((item) =>
                  calendarItemKey(item.occurrence.eventId, item.occurrence.index) === changingKey
                      ? {
                            ...item,
                            occurrence: {
                                ...item.occurrence,
                                timing: gestureTiming(
                                    gesture as Extract<
                                        Gesture,
                                        { kind: "move" | "resize" | "moveDays" }
                                    >,
                                ),
                            },
                        }
                      : item,
              );

    const bars = calendarWeekSegments(items, props.firstDate, props.timeZone, true);
    const barsFit = calendarSegmentsFit(bars, ALL_DAY_LANES);
    const allDayLanes = Math.min(
        ALL_DAY_LANES,
        bars.reduce((most, bar) => Math.max(most, bar.lane + 1), 0),
    );
    const timed = calendarTimedSegments(items, props.firstDate, 7, props.timeZone);

    const selection =
        gesture?.kind === "select" && gesture.moved
            ? {
                  column: gesture.from.column,
                  start: snap(Math.min(gesture.from.minutes, gesture.to.minutes)),
                  end: Math.max(
                      snap(Math.max(gesture.from.minutes, gesture.to.minutes)),
                      snap(Math.min(gesture.from.minutes, gesture.to.minutes)) + SNAP_MINUTES,
                  ),
              }
            : undefined;
    const daySelection =
        gesture?.kind === "selectDays"
            ? {
                  first: Math.min(gesture.from, gesture.to),
                  last: Math.max(gesture.from, gesture.to),
              }
            : undefined;

    const gridPress = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        const point = pointOf(event.clientX, event.clientY);
        if (point === undefined) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setGesture({
            kind: "select",
            pointerId: event.pointerId,
            from: point,
            to: point,
            moved: false,
        });
    };
    const allDayPress = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        const column = dayOf(event.clientX);
        if (column === undefined) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setGesture({ kind: "selectDays", pointerId: event.pointerId, from: column, to: column });
    };
    const timedPress = (
        event: ReactPointerEvent<HTMLElement>,
        item: CalendarItem,
        kind: "move" | "resize",
    ) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const point = pointOf(event.clientX, event.clientY);
        if (point === undefined) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setGesture({
            kind,
            pointerId: event.pointerId,
            item,
            from: point,
            to: point,
            x: event.clientX,
            y: event.clientY,
            pointerX: event.clientX,
            pointerY: event.clientY,
            moved: false,
        });
    };
    const barPress = (event: ReactPointerEvent<HTMLElement>, item: CalendarItem) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const column = dayOf(event.clientX);
        if (column === undefined) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setGesture({
            kind: "moveDays",
            pointerId: event.pointerId,
            item,
            from: column,
            to: column,
            x: event.clientX,
            pointerX: event.clientX,
            pointerY: event.clientY,
            moved: false,
        });
    };
    const pointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        if (gesture === undefined || event.pointerId !== gesture.pointerId) return;
        if (gesture.kind === "selectDays" || gesture.kind === "moveDays") {
            const to = dayOf(event.clientX) ?? gesture.to;
            if (gesture.kind === "selectDays") {
                if (to !== gesture.to) setGesture({ ...gesture, to });
                return;
            }
            const moved = gesture.moved || Math.abs(event.clientX - gesture.x) > DRAG_SLOP;
            setGesture({
                ...gesture,
                to,
                moved,
                pointerX: event.clientX,
                pointerY: event.clientY,
            });
            return;
        }
        const point = pointOf(event.clientX, event.clientY);
        if (point === undefined) return;
        if (gesture.kind === "select") {
            // A drag that makes an event stays in the day it began in.
            const to = { column: gesture.from.column, minutes: point.minutes };
            const moved =
                gesture.moved ||
                Math.abs(to.minutes - gesture.from.minutes) * MINUTE_HEIGHT > DRAG_SLOP;
            setGesture({ ...gesture, to, moved });
            return;
        }
        const to = gesture.kind === "resize" ? { ...point, column: gesture.from.column } : point;
        const moved =
            gesture.moved ||
            Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > DRAG_SLOP;
        setGesture({ ...gesture, to, moved, pointerX: event.clientX, pointerY: event.clientY });
    };
    const pointerUp = (event: ReactPointerEvent<HTMLElement>) => {
        if (gesture === undefined || event.pointerId !== gesture.pointerId) return;
        setGesture(undefined);
        switch (gesture.kind) {
            case "select": {
                const column = gesture.from.column;
                let start: number;
                let end: number;
                if (selection === undefined) {
                    start = clamp(
                        Math.floor(gesture.from.minutes / 30) * 30,
                        0,
                        1_440 - CLICK_MINUTES,
                    );
                    end = start + CLICK_MINUTES;
                } else ({ start, end } = selection);
                props.onDraftCreate({
                    kind: "timed",
                    start: instantOf(column, start),
                    end: instantOf(column, end),
                    timeZone: props.timeZone,
                });
                return;
            }
            case "selectDays": {
                const first = Math.min(gesture.from, gesture.to);
                const last = Math.max(gesture.from, gesture.to);
                props.onDraftCreate({
                    kind: "allDay",
                    startDate: days[first]!,
                    endDate: calendarDateAdd(days[last]!, 1),
                });
                return;
            }
            default: {
                const occurrence = gesture.item.occurrence;
                if (!gesture.moved) {
                    props.onOccurrenceOpen(occurrence.eventId, occurrence.index);
                    return;
                }
                props.onOccurrenceMove(
                    occurrence.eventId,
                    occurrence.index,
                    gestureTiming(gesture),
                );
            }
        }
    };
    const pointerCancel = () => setGesture(undefined);

    // Opens at the morning; the reader's own scroll is kept from then on.
    const scrollToMorning = (element: HTMLDivElement | null) => {
        if (element !== null && element.dataset["opened"] === undefined) {
            element.dataset["opened"] = "";
            // A little above the hour, so its label is not cut by the row above.
            element.scrollTop = OPEN_HOUR * CALENDAR_HOUR_HEIGHT - 8;
        }
    };

    const todayColumn = calendarDateDiff(props.firstDate, props.today);
    const nowMinutes =
        todayColumn >= 0 &&
        todayColumn < 7 &&
        calendarDateOf(props.now, props.timeZone) === props.today
            ? calendarMinutesOf(props.now, props.timeZone)
            : undefined;

    return (
        <div
            className="happy-calendar-week"
            data-gesture={changingKey === undefined ? undefined : "move"}
            data-happy-desktop-ui="calendar-week"
            ref={setRoot}
        >
            <div className="happy-calendar-week__head">
                <span className="happy-calendar-week__gutter" />
                <div className="happy-calendar-week__dates">
                    {days.map((date) => (
                        <div
                            className="happy-calendar-week__date"
                            data-today={date === props.today ? "" : undefined}
                            key={date}
                        >
                            <span className="happy-calendar-week__weekday">
                                {calendarDateLabel(date, { weekday: "short" })}
                            </span>
                            <span className="happy-calendar-week__day">
                                {String(Number(date.slice(8)))}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="happy-calendar-week__all-day">
                <span className="happy-calendar-week__gutter happy-calendar-week__gutter-label">
                    All day
                </span>
                <div
                    className="happy-calendar-week__all-day-lanes"
                    onPointerCancel={pointerCancel}
                    onPointerDown={allDayPress}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    ref={setAllDayRow}
                    style={{
                        height: `${String(Math.max(1, allDayLanes) * (LINE_HEIGHT + LINE_GAP) + 6)}px`,
                    }}
                >
                    {days.map((date, column) => (
                        <span
                            className="happy-calendar-week__all-day-cell"
                            data-selected={
                                daySelection !== undefined &&
                                column >= daySelection.first &&
                                column <= daySelection.last
                                    ? ""
                                    : undefined
                            }
                            key={date}
                        />
                    ))}
                    {barsFit.shown.map((segment) => (
                        <WeekBar
                            key={calendarItemKey(
                                segment.item.occurrence.eventId,
                                segment.item.occurrence.index,
                            )}
                            moving={
                                calendarItemKey(
                                    segment.item.occurrence.eventId,
                                    segment.item.occurrence.index,
                                ) === changingKey
                            }
                            onPointerCancel={pointerCancel}
                            onPointerDown={(event) => barPress(event, segment.item)}
                            onPointerMove={pointerMove}
                            onPointerUp={pointerUp}
                            segment={segment}
                            selected={
                                calendarItemKey(
                                    segment.item.occurrence.eventId,
                                    segment.item.occurrence.index,
                                ) === props.selectedKey
                            }
                        />
                    ))}
                    {barsFit.hidden.map((count, column) =>
                        count > 0 ? (
                            <span
                                className="happy-calendar-week__all-day-more"
                                key={days[column]}
                                style={{
                                    left: `calc(${String((column / 7) * 100)}% + 4px)`,
                                    top: `${String((ALL_DAY_LANES - 1) * (LINE_HEIGHT + LINE_GAP) + 3)}px`,
                                }}
                            >
                                +{String(count)}
                            </span>
                        ) : null,
                    )}
                </div>
            </div>
            <ScrollArea
                className="happy-calendar-week__scroll"
                viewportClassName="happy-calendar-week__scroll-viewport"
                viewportRef={scrollToMorning}
            >
                <div
                    className="happy-calendar-week__grid"
                    style={{ height: `${String(24 * CALENDAR_HOUR_HEIGHT)}px` }}
                >
                    <div className="happy-calendar-week__hours" aria-hidden="true">
                        {Array.from({ length: 24 }, (_, hour) => (
                            <span
                                className="happy-calendar-week__hour"
                                key={hour}
                                style={{ top: `${String(hour * CALENDAR_HOUR_HEIGHT)}px` }}
                            >
                                {hour === 0 ? "" : calendarHourLabel(hour)}
                            </span>
                        ))}
                    </div>
                    <div
                        className="happy-calendar-week__columns"
                        onPointerCancel={pointerCancel}
                        onPointerDown={gridPress}
                        onPointerMove={pointerMove}
                        onPointerUp={pointerUp}
                        ref={setColumns}
                    >
                        {days.map((date) => (
                            <div
                                className="happy-calendar-week__column"
                                data-today={date === props.today ? "" : undefined}
                                key={date}
                            />
                        ))}
                        {selection === undefined ? null : (
                            <span
                                className="happy-calendar-week__selection"
                                style={{
                                    left: `calc(${String((selection.column / 7) * 100)}% + 2px)`,
                                    width: `calc(${String(100 / 7)}% - 4px)`,
                                    top: `${String(selection.start * MINUTE_HEIGHT)}px`,
                                    height: `${String((selection.end - selection.start) * MINUTE_HEIGHT)}px`,
                                }}
                            >
                                {calendarMinutesLabel(selection.start)} –{" "}
                                {calendarMinutesLabel(selection.end % 1_440)}
                            </span>
                        )}
                        {timed.map((segment) => {
                            const key = calendarItemKey(
                                segment.item.occurrence.eventId,
                                segment.item.occurrence.index,
                            );
                            return (
                                <WeekEvent
                                    key={`${key}:${String(segment.column)}`}
                                    moving={key === changingKey}
                                    onMovePress={(event) => timedPress(event, segment.item, "move")}
                                    onPointerCancel={pointerCancel}
                                    onPointerMove={pointerMove}
                                    onPointerUp={pointerUp}
                                    onResizePress={(event) =>
                                        timedPress(event, segment.item, "resize")
                                    }
                                    segment={segment}
                                    selected={key === props.selectedKey}
                                    timeZone={props.timeZone}
                                />
                            );
                        })}
                        {nowMinutes === undefined ? null : (
                            <span
                                aria-hidden="true"
                                className="happy-calendar-week__now"
                                data-happy-desktop-ui="calendar-now"
                                style={{
                                    left: `${String((todayColumn / 7) * 100)}%`,
                                    width: `${String(100 / 7)}%`,
                                    top: `${String(nowMinutes * MINUTE_HEIGHT)}px`,
                                }}
                            />
                        )}
                    </div>
                </div>
            </ScrollArea>
            {gesture !== undefined &&
            (gesture.kind === "move" || gesture.kind === "resize" || gesture.kind === "moveDays") &&
            gesture.moved &&
            gesture.item.event.recurrence ? (
                <CalendarSeriesNote root={root} x={gesture.pointerX} y={gesture.pointerY} />
            ) : null}
        </div>
    );
}

function WeekBar(props: {
    segment: CalendarBarSegment;
    selected: boolean;
    moving: boolean;
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
}) {
    const { segment } = props;
    const event = segment.item.event;
    const title = calendarTitleOf(event.title);
    return (
        <button
            aria-label={[title, "all day", event.recurrence ? "repeats" : undefined]
                .filter(Boolean)
                .join(", ")}
            className="happy-calendar-line"
            data-bar=""
            data-calendar-item={calendarItemKey(
                segment.item.occurrence.eventId,
                segment.item.occurrence.index,
            )}
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
                top: `${String(segment.lane * (LINE_HEIGHT + LINE_GAP) + 3)}px`,
            }}
            title={title}
            type="button"
        >
            <span className="happy-calendar-line__title">{title}</span>
        </button>
    );
}

function WeekEvent(props: {
    segment: CalendarTimedSegment;
    timeZone: string;
    selected: boolean;
    moving: boolean;
    onMovePress: (event: ReactPointerEvent<HTMLElement>) => void;
    onResizePress: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: () => void;
}) {
    const { segment } = props;
    const { event, occurrence } = segment.item;
    const timing = occurrence.timing;
    const title = calendarTitleOf(event.title);
    const height = Math.max(20, (segment.endMinutes - segment.startMinutes) * MINUTE_HEIGHT);
    const time =
        timing.kind === "timed"
            ? `${calendarMinutesLabel(calendarMinutesOf(timing.start, props.timeZone))} – ${calendarMinutesLabel(calendarMinutesOf(timing.end, props.timeZone))}`
            : "";
    const width = 100 / 7 / segment.lanes;
    return (
        <div
            aria-label={[title, time, event.recurrence ? "repeats" : undefined]
                .filter(Boolean)
                .join(", ")}
            className="happy-calendar-event"
            data-calendar-item={calendarItemKey(occurrence.eventId, occurrence.index)}
            data-compact={height < 40 ? "" : undefined}
            data-happy-desktop-ui="calendar-event"
            data-moving={props.moving ? "" : undefined}
            data-selected={props.selected ? "" : undefined}
            data-untitled={event.title.trim().length === 0 ? "" : undefined}
            onPointerCancel={props.onPointerCancel}
            onPointerDown={props.onMovePress}
            onPointerMove={props.onPointerMove}
            onPointerUp={props.onPointerUp}
            role="button"
            style={{
                left: `calc(${String((segment.column / 7) * 100 + segment.lane * width)}% + 2px)`,
                width: `calc(${String(width)}% - 4px)`,
                top: `${String(segment.startMinutes * MINUTE_HEIGHT)}px`,
                height: `${String(height - 2)}px`,
            }}
            tabIndex={0}
            title={`${title}\n${time}`}
        >
            <span className="happy-calendar-event__title">
                {event.recurrence ? <Icon name="repeat" size={12} /> : null}
                <span className="happy-calendar-event__label">{title}</span>
            </span>
            <span className="happy-calendar-event__time">{time}</span>
            {event.location ? (
                <span className="happy-calendar-event__location">{event.location}</span>
            ) : null}
            {segment.continuesAfter ? null : (
                <span
                    aria-hidden="true"
                    className="happy-calendar-event__resize"
                    onPointerCancel={props.onPointerCancel}
                    onPointerDown={props.onResizePress}
                    onPointerMove={props.onPointerMove}
                    onPointerUp={props.onPointerUp}
                />
            )}
        </div>
    );
}
