import { calendarDateDiff, calendarDateOf, calendarTimeZoneLocal } from "happy-desktop-state";

/**
 * Whose clock a moment is told on. Both default to the viewer's own: the
 * locale and time zone this Desktop runs in, never the agent host's. Tests
 * and blueprints pin them so a rendering does not depend on the machine.
 */
export interface LocalTimeZone {
    readonly locale?: string;
    readonly timeZone?: string;
}

const formats = new Map<string, Intl.DateTimeFormat>();

function format(zone: LocalTimeZone, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = JSON.stringify([zone.locale ?? null, zone.timeZone ?? null, options]);
    let value = formats.get(key);
    if (value === undefined) {
        value = new Intl.DateTimeFormat(zone.locale, {
            ...options,
            ...(zone.timeZone === undefined ? {} : { timeZone: zone.timeZone }),
        });
        formats.set(key, value);
    }
    return value;
}

/** The wall-clock time alone, such as "3:40 PM" or "15:40". */
export function localClockTime(at: number, zone: LocalTimeZone = {}): string {
    return format(zone, { hour: "numeric", minute: "2-digit" }).format(at);
}

/** The short weekday, such as "Thu". */
export function localWeekdayShort(at: number, zone: LocalTimeZone = {}): string {
    return format(zone, { weekday: "short" }).format(at);
}

/** Calendar days from `now` to `at` on the viewer's calendar: 0 today, 1 tomorrow, -1 yesterday. */
export function localDaysFrom(now: number, at: number, zone: LocalTimeZone = {}): number {
    const timeZone = zone.timeZone ?? calendarTimeZoneLocal();
    return calendarDateDiff(calendarDateOf(now, timeZone), calendarDateOf(at, timeZone));
}

/** A moment today reads as its time alone; any other day leads with the short weekday. */
export function localDayTime(at: number, now: number, zone: LocalTimeZone = {}): string {
    return localDaysFrom(now, at, zone) === 0
        ? localClockTime(at, zone)
        : `${localWeekdayShort(at, zone)} ${localClockTime(at, zone)}`;
}

/**
 * When something happens, as it reads after "until": the exact local time,
 * with a day whenever it is not today. Tomorrow says so, the rest of the coming
 * week names its weekday, and anything else, including a day already past,
 * gives the date, with the year when it is not this one. Without `now`, which
 * day is today is unknown, so the date is always given.
 */
export function localMoment(at: number, now: number | undefined, zone: LocalTimeZone = {}): string {
    const time = localClockTime(at, zone);
    const days = now === undefined ? undefined : localDaysFrom(now, at, zone);
    if (days === 0) return time;
    if (days === 1) return `tomorrow at ${time}`;
    if (days !== undefined && days > 1 && days < 7)
        return `${format(zone, { weekday: "long" }).format(at)} at ${time}`;
    const sameYear =
        now !== undefined &&
        format(zone, { year: "numeric" }).format(at) ===
            format(zone, { year: "numeric" }).format(now);
    const date = format(
        zone,
        sameYear
            ? { month: "short", day: "numeric" }
            : { month: "short", day: "numeric", year: "numeric" },
    ).format(at);
    return `${date} at ${time}`;
}
