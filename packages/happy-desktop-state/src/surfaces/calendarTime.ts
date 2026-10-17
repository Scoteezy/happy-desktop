/**
 * Calendar dates and wall-clock times in an IANA time zone, read with the
 * platform's own time zone database through `Intl`. A date is a `YYYY-MM-DD`
 * Gregorian calendar date; a time of day is minutes after midnight.
 *
 * Nothing here expands a recurrence: the daemon does that. This only places
 * instants and dates on a reader's calendar and turns a wall-clock time back
 * into an instant, by the same rules the daemon uses.
 */

import {
    HAPPY_AGENT_CALENDAR_WEEKDAYS,
    type HappyAgentCalendarTiming,
    type HappyAgentCalendarWeekday,
} from "./surfaceTypes.js";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** The time zone this machine shows times in. */
export function calendarTimeZoneLocal(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

let timeZones: readonly string[] | undefined;

/** Every time zone the platform knows, by IANA name, for the reader to pick from. */
export function calendarTimeZones(): readonly string[] {
    if (timeZones === undefined) {
        const names = Intl.supportedValuesOf("timeZone");
        timeZones = names.includes("UTC") ? names : ["UTC", ...names];
    }
    return timeZones;
}

/** Whether the platform knows a time zone by this name. */
export function calendarTimeZoneKnown(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone });
        return true;
    } catch {
        return false;
    }
}

const partsFormats = new Map<string, Intl.DateTimeFormat>();

function partsFormat(timeZone: string): Intl.DateTimeFormat {
    let format = partsFormats.get(timeZone);
    if (format === undefined) {
        format = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        partsFormats.set(timeZone, format);
    }
    return format;
}

interface WallClock {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
}

function wallClockOf(instant: number, timeZone: string): WallClock {
    const fields: Record<string, number> = {};
    for (const part of partsFormat(timeZone).formatToParts(instant))
        if (part.type !== "literal") fields[part.type] = Number(part.value);
    return {
        year: fields["year"] ?? 1970,
        month: fields["month"] ?? 1,
        day: fields["day"] ?? 1,
        hour: fields["hour"] ?? 0,
        minute: fields["minute"] ?? 0,
        second: fields["second"] ?? 0,
    };
}

/** How far the zone's wall clock is ahead of UTC at an instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
    const wall = wallClockOf(instant, timeZone);
    const asUtc = Date.UTC(
        wall.year,
        wall.month - 1,
        wall.day,
        wall.hour,
        wall.minute,
        wall.second,
    );
    return asUtc - (instant - (((instant % 1_000) + 1_000) % 1_000));
}

function pad(value: number, width: number): string {
    return String(value).padStart(width, "0");
}

function dateFromUtc(utc: number): string {
    const date = new Date(utc);
    return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

/** Midnight UTC of a date: the arithmetic every date helper here is done in. */
function utcOf(date: string): number {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Whether text is a real `YYYY-MM-DD` date. */
export function calendarDateValid(date: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/u.test(date) && dateFromUtc(utcOf(date)) === date;
}

export function calendarDateAdd(date: string, days: number): string {
    return dateFromUtc(utcOf(date) + days * DAY_MS);
}

/** How many days `to` is after `from`; negative when it is before. */
export function calendarDateDiff(from: string, to: string): number {
    return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

/** The weekday of a date, Monday 0 through Sunday 6. */
export function calendarDateWeekdayIndex(date: string): number {
    return (new Date(utcOf(date)).getUTCDay() + 6) % 7;
}

export function calendarDateWeekday(date: string): HappyAgentCalendarWeekday {
    return HAPPY_AGENT_CALENDAR_WEEKDAYS[calendarDateWeekdayIndex(date)]!;
}

/** The Monday on or before a date. */
export function calendarWeekStart(date: string): string {
    return calendarDateAdd(date, -calendarDateWeekdayIndex(date));
}

/** The first of the date's month. */
export function calendarMonthStart(date: string): string {
    return `${date.slice(0, 7)}-01`;
}

/** The first of the month `months` after the date's month. */
export function calendarMonthAdd(date: string, months: number): string {
    const value = new Date(utcOf(calendarMonthStart(date)));
    value.setUTCMonth(value.getUTCMonth() + months);
    return dateFromUtc(value.getTime());
}

/** The date an instant falls on in a time zone. */
export function calendarDateOf(instant: number, timeZone: string): string {
    const wall = wallClockOf(instant, timeZone);
    return `${pad(wall.year, 4)}-${pad(wall.month, 2)}-${pad(wall.day, 2)}`;
}

/** The wall-clock time of an instant in a time zone, in minutes after midnight. */
export function calendarMinutesOf(instant: number, timeZone: string): number {
    const wall = wallClockOf(instant, timeZone);
    return wall.hour * 60 + wall.minute;
}

/**
 * The instant a wall-clock time on a date names in a time zone. A time that
 * does not exist, because the clocks jumped forward, moves forward by the jump;
 * one that happens twice, because they went back, is the earlier. That is
 * RFC 5545's rule and Temporal's `compatible`, which the daemon uses too.
 */
export function calendarInstantOf(date: string, minutes: number, timeZone: string): number {
    const wall = utcOf(date) + minutes * MINUTE_MS;
    const before = offsetAt(wall - DAY_MS, timeZone);
    const after = offsetAt(wall + DAY_MS, timeZone);
    if (before === after) return wall - before;
    const early = wall - before;
    const late = wall - after;
    const earlyHolds = offsetAt(early, timeZone) === before;
    const lateHolds = offsetAt(late, timeZone) === after;
    if (earlyHolds && lateHolds) return Math.min(early, late);
    if (earlyHolds) return early;
    if (lateHolds) return late;
    // Inside a forward jump: read with the offset from before it.
    return early;
}

/** Midnight at the start of a date in a time zone. */
export function calendarMidnightOf(date: string, timeZone: string): number {
    return calendarInstantOf(date, 0, timeZone);
}

/**
 * The instants a timing covers when shown in a time zone: a timed one is its
 * own, and an all-day one runs from the zone's midnight at its first date to
 * the zone's midnight at its end date, as the daemon's range read counts it.
 */
export function calendarTimingSpan(
    timing: HappyAgentCalendarTiming,
    timeZone: string,
): { readonly start: number; readonly end: number } {
    if (timing.kind === "timed") return { start: timing.start, end: timing.end };
    return {
        start: calendarMidnightOf(timing.startDate, timeZone),
        end: calendarMidnightOf(timing.endDate, timeZone),
    };
}

/**
 * The date a timing starts on, on its own terms: an all-day timing's first
 * date, and a timed one's start in its own time zone.
 */
export function calendarTimingStartDate(timing: HappyAgentCalendarTiming): string {
    return timing.kind === "allDay"
        ? timing.startDate
        : calendarDateOf(timing.start, timing.timeZone);
}

/**
 * A timing moved by whole days on its own calendar: an all-day one's dates,
 * and a timed one to the same wall-clock time so many days later in its own
 * time zone, keeping its length.
 */
export function calendarTimingShiftDays(
    timing: HappyAgentCalendarTiming,
    days: number,
): HappyAgentCalendarTiming {
    if (days === 0) return timing;
    if (timing.kind === "allDay")
        return {
            kind: "allDay",
            startDate: calendarDateAdd(timing.startDate, days),
            endDate: calendarDateAdd(timing.endDate, days),
        };
    const date = calendarDateAdd(calendarDateOf(timing.start, timing.timeZone), days);
    const extra = timing.start - Math.floor(timing.start / MINUTE_MS) * MINUTE_MS;
    const start =
        calendarInstantOf(date, calendarMinutesOf(timing.start, timing.timeZone), timing.timeZone) +
        extra;
    return { ...timing, start, end: start + (timing.end - timing.start) };
}

/** The longest an event may last: 366 days. */
export const HAPPY_AGENT_CALENDAR_DURATION_LIMIT_MS = 366 * DAY_MS;
export const HAPPY_AGENT_CALENDAR_DURATION_LIMIT_DAYS = 366;
