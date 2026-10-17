/**
 * Where a calendar's occurrences go on screen: which days of a week row a
 * bar spans and in which lane, and where a timed occurrence sits in a day's
 * column beside the ones it overlaps. Everything is placed on the reader's
 * calendar, in the time zone the page is shown in. Nothing here expands a
 * recurrence; the occurrences arrive expanded.
 */

import {
    calendarDateAdd,
    calendarDateDiff,
    calendarDateOf,
    calendarMidnightOf,
    calendarMinutesOf,
    type HappyAgentCalendarEvent,
    type HappyAgentCalendarEventId,
    type HappyAgentCalendarOccurrence,
    type HappyAgentCalendarTiming,
} from "happy-desktop-state";

const DAY_MS = 86_400_000;

/** One occurrence with the event it belongs to. */
export interface CalendarItem {
    readonly occurrence: HappyAgentCalendarOccurrence;
    readonly event: HappyAgentCalendarEvent;
}

/** Stable for an occurrence across reads: its event and its index in the series. */
export function calendarItemKey(eventId: HappyAgentCalendarEventId, index: number): string {
    return `${eventId}:${String(index)}`;
}

/** The days a timing covers on the reader's calendar: the first, and the one after the last. */
export function calendarTimingDays(
    timing: HappyAgentCalendarTiming,
    timeZone: string,
): { readonly startDate: string; readonly endDate: string } {
    if (timing.kind === "allDay") return { startDate: timing.startDate, endDate: timing.endDate };
    const startDate = calendarDateOf(timing.start, timeZone);
    // An event that ends at midnight does not reach into the day it ends on.
    const endDate = calendarDateAdd(
        calendarDateOf(Math.max(timing.start, timing.end - 1), timeZone),
        1,
    );
    return { startDate, endDate };
}

/**
 * Whether a timing is drawn as a bar across days rather than in a day's time
 * grid: every all-day one, and a timed one that lasts a day or more.
 */
export function calendarTimingSpansDays(timing: HappyAgentCalendarTiming): boolean {
    return timing.kind === "allDay" || timing.end - timing.start >= DAY_MS;
}

/** One occurrence's piece of a week row: the columns it spans, and its lane. */
export interface CalendarBarSegment {
    readonly item: CalendarItem;
    /** The first column it covers, 0 to 6. */
    readonly startColumn: number;
    /** The column after the last it covers, 1 to 7. */
    readonly endColumn: number;
    /** It began before this row, or goes on after it. */
    readonly continuesBefore: boolean;
    readonly continuesAfter: boolean;
    /** Drawn as a bar across days; otherwise as one timed line in its day. */
    readonly bar: boolean;
    readonly lane: number;
}

/**
 * The pieces of a week row, each in the lowest lane free across its columns.
 * Bars go first, longest first, so a long event keeps one lane across the row
 * and the single days' lines fill in beneath.
 */
export function calendarWeekSegments(
    items: readonly CalendarItem[],
    weekStart: string,
    timeZone: string,
    /** Only bars, as a week view's all-day row shows. */
    barsOnly: boolean,
): CalendarBarSegment[] {
    const pieces: (Omit<CalendarBarSegment, "lane"> & { readonly startsAt: number })[] = [];
    for (const item of items) {
        const timing = item.occurrence.timing;
        const bar = calendarTimingSpansDays(timing);
        if (barsOnly && !bar) continue;
        const days = calendarTimingDays(timing, timeZone);
        const start = calendarDateDiff(weekStart, days.startDate);
        const end = calendarDateDiff(weekStart, days.endDate);
        if (end <= 0 || start >= 7) continue;
        pieces.push({
            item,
            startColumn: Math.max(0, start),
            endColumn: Math.min(7, end),
            continuesBefore: start < 0,
            continuesAfter: end > 7,
            bar: bar || end - start > 1,
            startsAt:
                timing.kind === "timed"
                    ? timing.start
                    : calendarMidnightOf(timing.startDate, timeZone),
        });
    }
    pieces.sort(
        (left, right) =>
            Number(right.bar) - Number(left.bar) ||
            left.startColumn - right.startColumn ||
            right.endColumn - right.startColumn - (left.endColumn - left.startColumn) ||
            left.startsAt - right.startsAt,
    );
    const lanes: boolean[][] = [];
    return pieces.map(({ startsAt: _startsAt, ...piece }) => {
        let lane = 0;
        for (;;) {
            const used = (lanes[lane] ??= []);
            let free = true;
            for (let column = piece.startColumn; column < piece.endColumn; column += 1)
                if (used[column]) free = false;
            if (free) {
                for (let column = piece.startColumn; column < piece.endColumn; column += 1)
                    used[column] = true;
                return { ...piece, lane };
            }
            lane += 1;
        }
    });
}

/**
 * Which pieces of a row fit in `lanes` lanes, and how many are hidden on
 * each day. A day that overflows gives its last lane to "+N more", so a piece
 * in that lane is hidden on every day it covers when any of them overflows.
 */
export function calendarSegmentsFit(
    segments: readonly CalendarBarSegment[],
    lanes: number,
): { readonly shown: readonly CalendarBarSegment[]; readonly hidden: readonly number[] } {
    const overflow = Array.from({ length: 7 }, () => false);
    for (const segment of segments)
        if (segment.lane >= lanes)
            for (let column = segment.startColumn; column < segment.endColumn; column += 1)
                overflow[column] = true;
    const hidden = Array.from({ length: 7 }, () => 0);
    const shown: CalendarBarSegment[] = [];
    for (const segment of segments) {
        let fits = segment.lane < lanes - 1;
        if (segment.lane === lanes - 1) {
            fits = true;
            for (let column = segment.startColumn; column < segment.endColumn; column += 1)
                if (overflow[column]) fits = false;
        }
        if (fits) shown.push(segment);
        else
            for (let column = segment.startColumn; column < segment.endColumn; column += 1)
                hidden[column] = (hidden[column] ?? 0) + 1;
    }
    return { shown, hidden };
}

/** One timed occurrence's piece of one day's column, placed beside those it overlaps. */
export interface CalendarTimedSegment {
    readonly item: CalendarItem;
    /** Which day of the week it is in, 0 to 6. */
    readonly column: number;
    /** Minutes after the day's midnight on its wall clock. */
    readonly startMinutes: number;
    readonly endMinutes: number;
    /** It began on an earlier day, or goes on into a later one. */
    readonly continuesBefore: boolean;
    readonly continuesAfter: boolean;
    /** Its share of the day's width: which of `columns` side-by-side lanes it takes. */
    readonly lane: number;
    readonly lanes: number;
}

/**
 * The timed occurrences of a week, cut at each midnight they cross and laid
 * out side by side where they overlap. Each group of occurrences that overlap
 * one another shares the day's width equally.
 */
export function calendarTimedSegments(
    items: readonly CalendarItem[],
    weekStart: string,
    days: number,
    timeZone: string,
): CalendarTimedSegment[] {
    const byColumn: Omit<CalendarTimedSegment, "lane" | "lanes">[][] = Array.from(
        { length: days },
        () => [],
    );
    for (const item of items) {
        const timing = item.occurrence.timing;
        if (timing.kind !== "timed" || calendarTimingSpansDays(timing)) continue;
        for (let column = 0; column < days; column += 1) {
            const date = calendarDateAdd(weekStart, column);
            const dayStart = calendarMidnightOf(date, timeZone);
            const dayEnd = calendarMidnightOf(calendarDateAdd(date, 1), timeZone);
            if (timing.end <= dayStart || timing.start >= dayEnd) continue;
            const start = Math.max(timing.start, dayStart);
            const end = Math.min(timing.end, dayEnd);
            byColumn[column]!.push({
                item,
                column,
                startMinutes: start === dayStart ? 0 : calendarMinutesOf(start, timeZone),
                endMinutes: end === dayEnd ? 1_440 : calendarMinutesOf(end, timeZone),
                continuesBefore: timing.start < dayStart,
                continuesAfter: timing.end > dayEnd,
            });
        }
    }
    const placed: CalendarTimedSegment[] = [];
    for (const pieces of byColumn) {
        pieces.sort(
            (left, right) =>
                left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes,
        );
        let group: { piece: (typeof pieces)[number]; lane: number }[] = [];
        let laneEnds: number[] = [];
        let groupEnd = -1;
        const flush = (): void => {
            for (const { piece, lane } of group)
                placed.push({ ...piece, lane, lanes: laneEnds.length });
            group = [];
            laneEnds = [];
        };
        for (const piece of pieces) {
            // A piece shorter than the smallest drawn height still takes that height.
            const end = Math.max(piece.endMinutes, piece.startMinutes + 20);
            if (piece.startMinutes >= groupEnd) flush();
            let lane = laneEnds.findIndex((laneEnd) => laneEnd <= piece.startMinutes);
            if (lane === -1) {
                lane = laneEnds.length;
                laneEnds.push(end);
            } else laneEnds[lane] = end;
            group.push({ piece, lane });
            groupEnd = Math.max(groupEnd, end);
        }
        flush();
    }
    return placed;
}

/** A time of day as the reader's clock writes it: "9:00", "13:30", or "9 AM" by locale. */
export function calendarMinutesLabel(minutes: number, locale?: string): string {
    const date = new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
    return new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
    }).format(date);
}

/** An hour mark in the time grid's gutter: "09:00" or "9 AM" by locale. */
export function calendarHourLabel(hour: number, locale?: string): string {
    const date = new Date(Date.UTC(2000, 0, 1, hour));
    return new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).format(date);
}

/** A date as the reader's locale writes it, by the parts given. */
export function calendarDateLabel(
    date: string,
    options: Intl.DateTimeFormatOptions,
    locale?: string,
): string {
    const [year, month, day] = date.split("-").map(Number);
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(
        new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)),
    );
}

/** How an event's title is shown: as written, or the placeholder for a blank one. */
export function calendarTitleOf(title: string): string {
    return title.trim().length === 0 ? "(No title)" : title;
}
