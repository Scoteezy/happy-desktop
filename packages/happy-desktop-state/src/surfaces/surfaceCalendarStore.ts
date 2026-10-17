import {
    HappyAgentApiError,
    type CalendarEvent,
    type HappyAgentClient,
    type UpdateCalendarEventRequest,
} from "@slopus/happy-agent-client";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { happyAgentSyncRead } from "../happyAgentConnection/happyAgentSyncRead.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import {
    HAPPY_AGENT_CALENDAR_DURATION_LIMIT_DAYS,
    HAPPY_AGENT_CALENDAR_DURATION_LIMIT_MS,
    calendarDateAdd,
    calendarDateDiff,
    calendarDateOf,
    calendarDateValid,
    calendarInstantOf,
    calendarMidnightOf,
    calendarMinutesOf,
    calendarMonthAdd,
    calendarMonthStart,
    calendarTimeZoneLocal,
    calendarTimingSpan,
    calendarTimingStartDate,
    calendarWeekStart,
} from "./calendarTime.js";
import {
    HAPPY_AGENT_CALENDAR_EVENT_TYPES,
    happyAgentCalendarEventProject,
    happyAgentCalendarEventSurfaceOf,
    happyAgentCalendarOccurrenceProject,
    happyAgentCalendarRecurrenceWire,
    happyAgentCalendarTimingWire,
    happyAgentVersionNewer,
} from "./surfaceProject.js";
import {
    HAPPY_AGENT_CALENDAR_WEEKDAYS,
    type HappyAgentCalendarEvent,
    type HappyAgentCalendarEventId,
    type HappyAgentCalendarOccurrence,
    type HappyAgentCalendarRecurrence,
    type HappyAgentCalendarTiming,
    type HappyAgentSurfaceId,
} from "./surfaceTypes.js";

/** The daemon's bounds on an event's text. */
export const HAPPY_AGENT_CALENDAR_TITLE_LIMIT = 1_024;
export const HAPPY_AGENT_CALENDAR_LOCATION_LIMIT = 1_024;
export const HAPPY_AGENT_CALENDAR_NOTES_LIMIT = 10_000;
export const HAPPY_AGENT_CALENDAR_INTERVAL_LIMIT = 1_000;
export const HAPPY_AGENT_CALENDAR_COUNT_LIMIT = 10_000;

// eslint-disable-next-line no-control-regex
const LINE_FORBIDDEN = /[\u0000-\u001f\u007f]/gu;
// eslint-disable-next-line no-control-regex
const NOTES_FORBIDDEN = /[\u0000-\u0008\u000b-\u001f\u007f]/gu;

/** How long a burst of calendar events is gathered before the range is read again. */
const REREAD_DELAY_MS = 120;

export type HappyAgentCalendarView = "month" | "week";

/** The days a view shows and the instants they cover in the reader's time zone. */
export interface HappyAgentCalendarRange {
    /** The first day shown: a Monday. */
    readonly firstDate: string;
    /** How many days are shown: 7 for a week, 28 to 42 for a month. */
    readonly days: number;
    /** Midnight at the start of the first day. */
    readonly from: number;
    /** Midnight at the end of the last day. */
    readonly to: number;
}

/**
 * An event as the popover edits it: its timing as wall-clock fields in its
 * own time zone, and its text as typed. An all-day draft's end date is the
 * last day it covers, as the reader thinks of it, not the exclusive one the
 * daemon stores.
 */
export interface HappyAgentCalendarDraft {
    readonly title: string;
    readonly allDay: boolean;
    readonly startDate: string;
    /** Minutes after midnight; kept while all-day so switching back restores it. */
    readonly startMinutes: number;
    readonly endDate: string;
    readonly endMinutes: number;
    readonly timeZone: string;
    readonly location: string;
    readonly notes: string;
    readonly recurrence: HappyAgentCalendarRecurrence | null;
}

/** What the popover edits: a new event, or one occurrence of an event, which stands for its series. */
export type HappyAgentCalendarEditorTarget =
    | { readonly kind: "new"; readonly eventId: HappyAgentCalendarEventId }
    | {
          readonly kind: "occurrence";
          readonly eventId: HappyAgentCalendarEventId;
          readonly index: number;
          /** The occurrence's timing when it was opened, which an edit is measured from. */
          readonly timing: HappyAgentCalendarTiming;
      };

export interface HappyAgentCalendarEditor {
    readonly target: HappyAgentCalendarEditorTarget;
    readonly draft: HappyAgentCalendarDraft;
    /** The timing the draft makes, or `undefined` while it makes none the daemon would take. */
    readonly timing: HappyAgentCalendarTiming | undefined;
    /** Why the draft cannot be saved as it stands. */
    readonly problem?: string;
    /** Whether saving changes a whole series rather than one event. */
    readonly series: boolean;
}

export interface HappyAgentCalendarSnapshot {
    readonly surfaceId: HappyAgentSurfaceId;
    /**
     * `loading` until a range has been read once, and `missing` when the
     * daemon has no such calendar. Moving to another month or week stays
     * `ready` and keeps showing what is held there while it is read.
     */
    readonly status: "loading" | "ready" | "missing";
    readonly view: HappyAgentCalendarView;
    /** A day in the period shown; the period is the month or week around it. */
    readonly anchor: string;
    /** The reader's time zone, which every view is shown in. */
    readonly timeZone: string;
    readonly range: HappyAgentCalendarRange;
    /** The events the occurrences belong to, with this window's own changes applied. */
    readonly events: ReadonlyMap<HappyAgentCalendarEventId, HappyAgentCalendarEvent>;
    /** Every occurrence held that overlaps the range, as the daemon expanded them, in its order. */
    readonly occurrences: readonly HappyAgentCalendarOccurrence[];
    /** More occurrences overlap the range than the daemon returns in one read. */
    readonly truncated: boolean;
    readonly editor?: HappyAgentCalendarEditor;
    /** The last change that was not saved, and why, until it is dismissed or another is made. */
    readonly failure?: UserError;
    /** The last read failed; what was held stays visible and the read is retried. */
    readonly error?: UserError;
}

export interface HappyAgentCalendarStore {
    get(): HappyAgentCalendarSnapshot;
    subscribe(listener: () => void): () => void;
    viewUpdate(view: HappyAgentCalendarView): void;
    /** Shows the next or the previous month or week. */
    periodStep(step: 1 | -1): void;
    /** Shows the period that holds today. */
    todayShow(): void;
    /** Shows the week that holds a date. */
    weekShow(date: string): void;
    /** Opens the popover on a new event, as a click or a drag on empty space made it. */
    draftOpen(timing: HappyAgentCalendarTiming): void;
    /** Opens the popover on one occurrence; saving changes its whole series. */
    occurrenceEditOpen(eventId: HappyAgentCalendarEventId, index: number): void;
    editorTitleUpdate(title: string): void;
    editorAllDayUpdate(allDay: boolean): void;
    /** Moves the start, and the end with it, so the event keeps its length. */
    editorStartDateUpdate(date: string): void;
    editorStartMinutesUpdate(minutes: number): void;
    editorEndDateUpdate(date: string): void;
    editorEndMinutesUpdate(minutes: number): void;
    /** Keeps the wall-clock times and reads them in the new time zone. */
    editorTimeZoneUpdate(timeZone: string): void;
    editorLocationUpdate(location: string): void;
    editorNotesUpdate(notes: string): void;
    editorRecurrenceUpdate(recurrence: HappyAgentCalendarRecurrence | null): void;
    /** Moves the new event the popover is open on, as dragging its draft does. */
    editorTimingUpdate(timing: HappyAgentCalendarTiming): void;
    /** Saves the popover's event when it can be saved and closes it; a change of nothing sends nothing. */
    editorSave(): void;
    /** Deletes the popover's event, or drops the new one, and closes it. */
    editorDelete(): void;
    editorClose(): void;
    /**
     * Gives one occurrence a new timing, as dragging or resizing it does. Its
     * series moves by the same amount: the event's own timing shifts by the
     * days and the wall-clock time the occurrence moved, a weekly series on
     * named weekdays turns those days with it, and an end date moves along.
     */
    occurrenceTimingUpdate(
        eventId: HappyAgentCalendarEventId,
        index: number,
        timing: HappyAgentCalendarTiming,
    ): void;
    failureDismiss(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentCalendarDeps {
    readonly client: Pick<
        HappyAgentClient,
        "listCalendarEvents" | "createCalendarEvent" | "updateCalendarEvent" | "deleteCalendarEvent"
    >;
    readonly sync: HappyAgentSync;
    readonly surfaceId: HappyAgentSurfaceId;
    readonly now?: () => number;
    /** The reader's time zone; this machine's by default. */
    readonly timeZone?: string;
    /** Given for a calendar this window is still making: settles once the daemon has it. */
    readonly surfaceCreated?: Promise<void>;
}

/** The fields of an event the reader can change. */
interface EventFields {
    readonly title: string;
    readonly notes: string | null;
    readonly location: string | null;
    readonly timing: HappyAgentCalendarTiming;
    readonly recurrence: HappyAgentCalendarRecurrence | null;
}

/**
 * How a change moves a timing: so many days on its own calendar, then to a
 * wall-clock time and length of its own. The same retiming moves an event's
 * own timing and each of its occurrences held, so a series is shown moved at
 * once and the daemon is sent the event's.
 */
type Retime = {
    readonly days: number;
    readonly to:
        | { readonly kind: "allDay"; readonly spanDays: number }
        | {
              readonly kind: "timed";
              readonly minutes: number;
              readonly timeZone: string;
              readonly durationMs: number;
          };
};

type CalendarOp =
    | {
          readonly kind: "create";
          readonly eventId: HappyAgentCalendarEventId;
          readonly fields: EventFields;
          readonly at: number;
      }
    | {
          readonly kind: "update";
          readonly eventId: HappyAgentCalendarEventId;
          readonly changes: Partial<EventFields>;
          /** Present when the timing change is a move, so held occurrences move with it. */
          readonly retime?: Retime;
      }
    | { readonly kind: "delete"; readonly eventId: HappyAgentCalendarEventId };

interface QueuedOp {
    readonly op: CalendarOp;
    /** One idempotency key for every attempt of this change. */
    readonly mutationId: string;
    /**
     * The event version this change was made over, which it is sent under as
     * `If-Match`. `undefined` while it follows a change of this window's that
     * the daemon has not answered; it takes that change's version when it lands.
     */
    expectVersion: string | undefined;
}

/** What the last range read held, and the range it was read for. */
interface Held {
    readonly from: number;
    readonly to: number;
    readonly occurrences: readonly HappyAgentCalendarOccurrence[];
    readonly truncated: boolean;
}

const NO_EVENTS: ReadonlyMap<HappyAgentCalendarEventId, HappyAgentCalendarEvent> = new Map();

/** The days a view shows around a date, and the instants they cover in a time zone. */
export function happyAgentCalendarRangeOf(
    view: HappyAgentCalendarView,
    anchor: string,
    timeZone: string,
): HappyAgentCalendarRange {
    let firstDate: string;
    let days: number;
    if (view === "week") {
        firstDate = calendarWeekStart(anchor);
        days = 7;
    } else {
        const monthStart = calendarMonthStart(anchor);
        const monthLast = calendarDateAdd(calendarMonthAdd(anchor, 1), -1);
        firstDate = calendarWeekStart(monthStart);
        days = calendarDateDiff(firstDate, calendarWeekStart(monthLast)) + 7;
    }
    return {
        firstDate,
        days,
        from: calendarMidnightOf(firstDate, timeZone),
        to: calendarMidnightOf(calendarDateAdd(firstDate, days), timeZone),
    };
}

function timingSame(left: HappyAgentCalendarTiming, right: HappyAgentCalendarTiming): boolean {
    if (left.kind === "timed" && right.kind === "timed")
        return (
            left.start === right.start && left.end === right.end && left.timeZone === right.timeZone
        );
    if (left.kind === "allDay" && right.kind === "allDay")
        return left.startDate === right.startDate && left.endDate === right.endDate;
    return false;
}

function recurrenceSame(
    left: HappyAgentCalendarRecurrence | null,
    right: HappyAgentCalendarRecurrence | null,
): boolean {
    if (left === null || right === null) return left === right;
    const end = (value: HappyAgentCalendarRecurrence): string =>
        value.end.kind === "never"
            ? "never"
            : value.end.kind === "until"
              ? `until:${value.end.date}`
              : `count:${String(value.end.count)}`;
    return (
        left.frequency === right.frequency &&
        left.interval === right.interval &&
        (left.weekdays ?? []).join() === (right.weekdays ?? []).join() &&
        (left.weekdays === null) === (right.weekdays === null) &&
        end(left) === end(right)
    );
}

/** The retiming that takes one timing to another. */
function retimeOf(from: HappyAgentCalendarTiming, to: HappyAgentCalendarTiming): Retime {
    const days = calendarDateDiff(calendarTimingStartDate(from), calendarTimingStartDate(to));
    return {
        days,
        to:
            to.kind === "allDay"
                ? { kind: "allDay", spanDays: calendarDateDiff(to.startDate, to.endDate) }
                : {
                      kind: "timed",
                      minutes: calendarMinutesOf(to.start, to.timeZone),
                      timeZone: to.timeZone,
                      durationMs: to.end - to.start,
                  },
    };
}

function retimeApply(timing: HappyAgentCalendarTiming, retime: Retime): HappyAgentCalendarTiming {
    const date = calendarDateAdd(calendarTimingStartDate(timing), retime.days);
    const to = retime.to;
    if (to.kind === "allDay")
        return { kind: "allDay", startDate: date, endDate: calendarDateAdd(date, to.spanDays) };
    // The start's own seconds and milliseconds survive a move on the minute grid.
    const extra =
        timing.kind === "timed" ? timing.start - Math.floor(timing.start / 60_000) * 60_000 : 0;
    const start = calendarInstantOf(date, to.minutes, to.timeZone) + extra;
    return { kind: "timed", start, end: start + to.durationMs, timeZone: to.timeZone };
}

/**
 * A series' rule after its event moved by so many days: named weekdays turn
 * with it and an end date moves along, so the series keeps its shape. Monthly
 * and yearly rules follow the start by themselves.
 */
function recurrenceShift(
    recurrence: HappyAgentCalendarRecurrence | null,
    days: number,
): HappyAgentCalendarRecurrence | null {
    if (recurrence === null || days === 0) return recurrence;
    const turn = ((days % 7) + 7) % 7;
    const weekdays =
        recurrence.weekdays === null || turn === 0
            ? recurrence.weekdays
            : HAPPY_AGENT_CALENDAR_WEEKDAYS.filter((day, index) =>
                  recurrence.weekdays!.includes(
                      HAPPY_AGENT_CALENDAR_WEEKDAYS[(index + 7 - turn) % 7]!,
                  ),
              );
    const end =
        recurrence.end.kind === "until"
            ? { kind: "until" as const, date: calendarDateAdd(recurrence.end.date, days) }
            : recurrence.end;
    if (weekdays === recurrence.weekdays && end === recurrence.end) return recurrence;
    return { ...recurrence, weekdays, end };
}

function draftOf(
    timing: HappyAgentCalendarTiming,
    fields: Pick<EventFields, "title" | "notes" | "location" | "recurrence">,
    timeZone: string,
): HappyAgentCalendarDraft {
    const text = {
        title: fields.title,
        location: fields.location ?? "",
        notes: fields.notes ?? "",
        recurrence: fields.recurrence,
    };
    if (timing.kind === "allDay")
        return {
            ...text,
            allDay: true,
            startDate: timing.startDate,
            startMinutes: 9 * 60,
            endDate: calendarDateAdd(timing.endDate, -1),
            endMinutes: 10 * 60,
            timeZone,
        };
    return {
        ...text,
        allDay: false,
        startDate: calendarDateOf(timing.start, timing.timeZone),
        startMinutes: calendarMinutesOf(timing.start, timing.timeZone),
        endDate: calendarDateOf(timing.end, timing.timeZone),
        endMinutes: calendarMinutesOf(timing.end, timing.timeZone),
        timeZone: timing.timeZone,
    };
}

/** The timing a draft makes, or why it makes none the daemon would take. */
function draftTiming(
    draft: HappyAgentCalendarDraft,
): { readonly timing: HappyAgentCalendarTiming } | { readonly problem: string } {
    if (!calendarDateValid(draft.startDate) || !calendarDateValid(draft.endDate))
        return { problem: "Choose a start and an end date." };
    let timing: HappyAgentCalendarTiming;
    if (draft.allDay) {
        const endDate = calendarDateAdd(draft.endDate, 1);
        const days = calendarDateDiff(draft.startDate, endDate);
        if (days <= 0) return { problem: "It ends before it starts." };
        if (days > HAPPY_AGENT_CALENDAR_DURATION_LIMIT_DAYS)
            return { problem: "An event can last at most 366 days." };
        timing = { kind: "allDay", startDate: draft.startDate, endDate };
    } else {
        const start = calendarInstantOf(draft.startDate, draft.startMinutes, draft.timeZone);
        const end = calendarInstantOf(draft.endDate, draft.endMinutes, draft.timeZone);
        if (end <= start) return { problem: "It ends before it starts." };
        if (end - start > HAPPY_AGENT_CALENDAR_DURATION_LIMIT_MS)
            return { problem: "An event can last at most 366 days." };
        timing = { kind: "timed", start, end, timeZone: draft.timeZone };
    }
    const end = draft.recurrence?.end;
    if (end?.kind === "until" && end.date < draft.startDate)
        return { problem: "The series ends before it starts." };
    if (draft.recurrence?.weekdays?.length === 0)
        return { problem: "Choose at least one day of the week." };
    return { timing };
}

/** A title as the daemon takes it: no control characters, within its bound. Blank is fine. */
function titleClean(title: string): string {
    return title.replace(LINE_FORBIDDEN, " ").slice(0, HAPPY_AGENT_CALENDAR_TITLE_LIMIT);
}

/** A location, or `null` when nothing but space is left of it. */
function locationClean(location: string): string | null {
    const clean = location
        .replace(LINE_FORBIDDEN, " ")
        .slice(0, HAPPY_AGENT_CALENDAR_LOCATION_LIMIT);
    return clean.trim().length === 0 ? null : clean;
}

/** Notes, or `null` when there are none. Tabs and line breaks stay. */
function notesClean(notes: string): string | null {
    const clean = notes
        .replace(/\r\n?/gu, "\n")
        .replace(NOTES_FORBIDDEN, " ")
        .slice(0, HAPPY_AGENT_CALENDAR_NOTES_LIMIT);
    return clean.trim().length === 0 ? null : clean;
}

function conflictEvent(error: HappyAgentApiError): CalendarEvent | undefined {
    const event = error.body?.["event"];
    return typeof event === "object" && event !== null ? (event as CalendarEvent) : undefined;
}

/** How an event is named in a sentence, with the placeholder a blank title is shown as. */
function eventNamed(title: string): string {
    return title.trim().length === 0 ? "an event with no title" : `“${title.trim()}”`;
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = (): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
        };
        const timer = setTimeout(done, milliseconds);
        signal.addEventListener("abort", done, { once: true });
    });
}

/**
 * One calendar Surface, kept live while something shows it.
 *
 * The constructor opens nothing. The first subscriber follows the calendar's
 * events and reads the range on screen; the last one stops following. The
 * daemon expands every series, so the range is read again whenever the
 * reader moves to another month or week, whenever a `calendar_event.*` for
 * this calendar arrives, after each change of this window's lands, and
 * whenever the connection is re-established. Events are only the hint to
 * read; nothing is taken from their payloads.
 *
 * Every change applies at once over what was read, until the daemon answers.
 * Changes are sent one at a time, in order, each naming the event version it
 * was made over as `If-Match` and repeated under its one mutation ID until it
 * is heard. A change the event moved on under is never sent again over
 * someone else's: the event is shown as they left it, the range is read
 * again, and the page says the change was not saved. Moving an occurrence
 * shifts the whole series, as there are no occurrences of their own to move.
 */
export function happyAgentCalendarStoreCreate(
    deps: HappyAgentCalendarDeps,
): HappyAgentCalendarStore {
    const now = deps.now ?? Date.now;
    const idCreate = cuid2Create(now);
    const surfaceId = deps.surfaceId;
    const timeZone = deps.timeZone ?? calendarTimeZoneLocal();
    const listeners = new Set<() => void>();
    const today = calendarDateOf(now(), timeZone);
    /** The daemon's events as last read or answered. */
    let authoritative = new Map<HappyAgentCalendarEventId, HappyAgentCalendarEvent>();
    let held: Held | undefined;
    let snapshot: HappyAgentCalendarSnapshot = {
        surfaceId,
        status: "loading",
        view: "month",
        anchor: today,
        timeZone,
        range: happyAgentCalendarRangeOf("month", today, timeZone),
        events: NO_EVENTS,
        occurrences: [],
        truncated: false,
    };
    let queue: QueuedOp[] = [];
    /**
     * Changes the daemon has taken, with the version each made, whose
     * occurrences the range has not been read at since: they stay applied to
     * what is shown until a read holds that version, so a moved event never
     * jumps back while the range is read again.
     */
    let landed: { readonly op: CalendarOp; readonly version: string }[] = [];
    let queueRunning = false;
    let following: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reread: ReturnType<typeof setTimeout> | undefined;
    let reading: AbortController | undefined;
    let failed = false;
    let disposed = false;
    const life = new AbortController();

    const notify = (): void => {
        for (const listener of listeners) listener();
    };

    /** Whether a pending change still stands over what the daemon holds. */
    const opStands = (entry: QueuedOp): boolean => {
        const current = authoritative.get(entry.op.eventId);
        if (entry.op.kind === "create") return current === undefined;
        // A change made over a version the daemon has since left — this
        // window's own, answered already, or someone else's — is not shown.
        return entry.expectVersion === undefined || current?.version === entry.expectVersion;
    };

    const eventsProjected = (): Map<HappyAgentCalendarEventId, HappyAgentCalendarEvent> => {
        const events = new Map(authoritative);
        for (const entry of queue) {
            if (!opStands(entry)) continue;
            const op = entry.op;
            if (op.kind === "create") {
                events.set(op.eventId, {
                    id: op.eventId,
                    surfaceId,
                    // Who made it is the daemon's to say once it answers.
                    authorUserId: null,
                    ...op.fields,
                    status: "active",
                    deletedAt: null,
                    createdAt: op.at,
                    updatedAt: op.at,
                    version: "",
                });
                continue;
            }
            const event = events.get(op.eventId);
            if (event === undefined) continue;
            if (op.kind === "delete") events.delete(op.eventId);
            else events.set(op.eventId, { ...event, ...op.changes });
        }
        for (const [id, event] of events) if (event.status === "deleted") events.delete(id);
        return events;
    };

    const overlaps = (timing: HappyAgentCalendarTiming): boolean => {
        const span = calendarTimingSpan(timing, timeZone);
        return span.start < snapshot.range.to && span.end > snapshot.range.from;
    };

    const occurrencesProjected = (): HappyAgentCalendarOccurrence[] => {
        let occurrences: HappyAgentCalendarOccurrence[] = [...(held?.occurrences ?? [])];
        const ops = [
            ...landed.map((entry) => entry.op),
            ...queue.filter(opStands).map((entry) => entry.op),
        ];
        for (const op of ops) {
            if (op.kind === "create") {
                if (!occurrences.some((occurrence) => occurrence.eventId === op.eventId))
                    occurrences.push({ eventId: op.eventId, index: 0, timing: op.fields.timing });
                continue;
            }
            if (op.kind === "delete") {
                occurrences = occurrences.filter((occurrence) => occurrence.eventId !== op.eventId);
                continue;
            }
            const { timing, recurrence } = op.changes;
            const retime = op.retime;
            if (retime !== undefined)
                occurrences = occurrences.map((occurrence) =>
                    occurrence.eventId === op.eventId
                        ? { ...occurrence, timing: retimeApply(occurrence.timing, retime) }
                        : occurrence,
                );
            else if (timing !== undefined || recurrence === null) {
                // Where the rest of a changed series falls is the daemon's to
                // say; until it is read again, only the event's own is shown.
                occurrences = occurrences.filter((occurrence) => occurrence.eventId !== op.eventId);
                const event = authoritative.get(op.eventId);
                const own = timing ?? event?.timing;
                if (own !== undefined)
                    occurrences.push({ eventId: op.eventId, index: 0, timing: own });
            }
        }
        return occurrences
            .filter((occurrence) => overlaps(occurrence.timing))
            .sort((left, right) => {
                const leftSpan = calendarTimingSpan(left.timing, timeZone);
                const rightSpan = calendarTimingSpan(right.timing, timeZone);
                return (
                    leftSpan.start - rightSpan.start ||
                    (left.timing.kind === right.timing.kind
                        ? 0
                        : left.timing.kind === "allDay"
                          ? -1
                          : 1) ||
                    (left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0) ||
                    left.index - right.index
                );
            });
    };

    const editorOf = (
        target: HappyAgentCalendarEditorTarget,
        draft: HappyAgentCalendarDraft,
        series: boolean,
    ): HappyAgentCalendarEditor => {
        const made = draftTiming(draft);
        return "timing" in made
            ? { target, draft, timing: made.timing, series }
            : { target, draft, timing: undefined, problem: made.problem, series };
    };

    /** Rebuilds what is shown from what is held and what is pending, then tells everyone. */
    const republish = (next: Partial<HappyAgentCalendarSnapshot> = {}): void => {
        snapshot = { ...snapshot, ...next };
        const events = eventsProjected();
        const occurrences = occurrencesProjected();
        // Unchanged entries keep their identity, so a row redraws only for its own change.
        const sameEvents =
            events.size === snapshot.events.size &&
            [...events].every(([id, event]) => snapshot.events.get(id) === event);
        const sameOccurrences =
            occurrences.length === snapshot.occurrences.length &&
            occurrences.every((occurrence, index) => {
                const before = snapshot.occurrences[index];
                return (
                    before !== undefined &&
                    before.eventId === occurrence.eventId &&
                    before.index === occurrence.index &&
                    timingSame(before.timing, occurrence.timing)
                );
            });
        snapshot = {
            ...snapshot,
            events: sameEvents ? snapshot.events : events,
            occurrences: sameOccurrences
                ? snapshot.occurrences
                : occurrences.map((occurrence) => {
                      const before = snapshot.occurrences.find(
                          (entry) =>
                              entry.eventId === occurrence.eventId &&
                              entry.index === occurrence.index &&
                              timingSame(entry.timing, occurrence.timing),
                      );
                      return before ?? occurrence;
                  }),
            truncated: held?.truncated ?? false,
        };
        notify();
    };

    /** Takes a later version of an event; answers whether anything changed. */
    const eventAdopt = (event: HappyAgentCalendarEvent): boolean => {
        if (event.surfaceId !== surfaceId) return false;
        const current = authoritative.get(event.id);
        if (current !== undefined && !happyAgentVersionNewer(event.version, current.version))
            return false;
        authoritative = new Map(authoritative).set(event.id, event);
        return true;
    };

    const read = (): void => {
        if (reread) clearTimeout(reread);
        reread = undefined;
        if (following === undefined) return;
        reading?.abort();
        const own = new AbortController();
        reading = own;
        const signal = AbortSignal.any([own.signal, life.signal]);
        const { from, to } = snapshot.range;
        void happyAgentSyncRead(
            signal,
            async () => {
                try {
                    await deps.surfaceCreated;
                } catch {
                    return undefined;
                }
                try {
                    return await deps.client.listCalendarEvents(
                        surfaceId,
                        { from, to, timeZone },
                        { signal },
                    );
                } catch (error) {
                    if (error instanceof HappyAgentApiError && error.status === 404)
                        return undefined;
                    throw error;
                }
            },
            (error) => {
                if (signal.aborted) return;
                failed = true;
                publishError(happyAgentUserError(error));
            },
        )
            .then((response) => {
                if (signal.aborted) return;
                if (reading === own) reading = undefined;
                failed = false;
                const { error: _error, ...rest } = snapshot;
                snapshot = rest;
                if (response === undefined) {
                    authoritative = new Map();
                    held = undefined;
                    republish({ status: "missing" });
                    return;
                }
                const events = new Map<HappyAgentCalendarEventId, HappyAgentCalendarEvent>();
                for (const wire of response.events) {
                    const event = happyAgentCalendarEventProject(wire);
                    const current = authoritative.get(event.id);
                    // An answer to this window's change can be newer than a read sent before it.
                    events.set(
                        event.id,
                        current !== undefined &&
                            happyAgentVersionNewer(current.version, event.version)
                            ? current
                            : event,
                    );
                }
                // Events still being changed, or open in the popover, stay known
                // when the range moves away from them.
                const kept = new Set<HappyAgentCalendarEventId>(
                    queue.map((entry) => entry.op.eventId),
                );
                const target = snapshot.editor?.target;
                if (target?.kind === "occurrence") kept.add(target.eventId);
                for (const id of kept) {
                    const current = authoritative.get(id);
                    if (current !== undefined && !events.has(id)) events.set(id, current);
                }
                authoritative = events;
                held = {
                    from,
                    to,
                    occurrences: response.occurrences.map(happyAgentCalendarOccurrenceProject),
                    truncated: response.truncated,
                };
                // A change this read holds the version of, or whose event it
                // no longer shows here, is in what it read.
                landed = landed.filter((entry) => {
                    const read = response.events.find((wire) => wire.id === entry.op.eventId);
                    return (
                        read !== undefined && happyAgentVersionNewer(entry.version, read.version)
                    );
                });
                republish({ status: "ready" });
            })
            .catch(() => undefined);
    };

    const publishError = (error: UserError): void => {
        snapshot = { ...snapshot, error };
        notify();
    };

    /** Reads the range again shortly, so a burst of events reads it once. */
    const rereadSoon = (): void => {
        if (following === undefined || reread !== undefined) return;
        reread = setTimeout(() => {
            reread = undefined;
            read();
        }, REREAD_DELAY_MS);
    };

    const start = (): void => {
        if (disposed || following || listeners.size === 0) return;
        const active = new AbortController();
        following = active;
        void (async () => {
            for await (const input of deps.sync.follow({
                signal: active.signal,
                events: HAPPY_AGENT_CALENDAR_EVENT_TYPES,
            })) {
                if (input.kind === "error") {
                    failed = true;
                    continue;
                }
                if (
                    input.kind === "bootstrap" ||
                    input.kind === "reconcile" ||
                    (input.kind === "update" && input.update.kind === "connected" && failed)
                ) {
                    read();
                    continue;
                }
                if (input.kind !== "update" || input.update.kind !== "event") continue;
                if (happyAgentCalendarEventSurfaceOf(input.update.event) === surfaceId)
                    rereadSoon();
            }
        })()
            .catch(() => {
                failed = true;
            })
            .finally(() => {
                if (following === active) following = undefined;
                if (!active.signal.aborted && !disposed && listeners.size > 0)
                    retry = setTimeout(start, 1_000);
            });
    };

    const stop = (): void => {
        following?.abort();
        following = undefined;
        reading?.abort();
        reading = undefined;
        if (retry) clearTimeout(retry);
        retry = undefined;
        if (reread) clearTimeout(reread);
        reread = undefined;
    };

    const opSend = async (entry: QueuedOp): Promise<CalendarEvent> => {
        const op = entry.op;
        const signal = life.signal;
        if (op.kind === "create") {
            const fields = op.fields;
            return (
                await deps.client.createCalendarEvent(
                    surfaceId,
                    {
                        id: op.eventId,
                        mutationId: entry.mutationId,
                        title: fields.title,
                        notes: fields.notes,
                        location: fields.location,
                        timing: happyAgentCalendarTimingWire(fields.timing),
                        recurrence:
                            fields.recurrence === null
                                ? null
                                : happyAgentCalendarRecurrenceWire(fields.recurrence),
                    },
                    { signal },
                )
            ).event;
        }
        const ifMatch = entry.expectVersion ?? authoritative.get(op.eventId)?.version ?? "";
        if (op.kind === "delete")
            return (
                await deps.client.deleteCalendarEvent(surfaceId, op.eventId, {
                    ifMatch,
                    mutationId: entry.mutationId,
                    signal,
                })
            ).event;
        const { title, notes, location, timing, recurrence } = op.changes;
        // An update is queued only when it changes at least one field, which
        // is what each branch of the request type demands.
        const request = {
            mutationId: entry.mutationId,
            ...(title === undefined ? {} : { title }),
            ...(notes === undefined ? {} : { notes }),
            ...(location === undefined ? {} : { location }),
            ...(timing === undefined ? {} : { timing: happyAgentCalendarTimingWire(timing) }),
            ...(recurrence === undefined
                ? {}
                : {
                      recurrence:
                          recurrence === null ? null : happyAgentCalendarRecurrenceWire(recurrence),
                  }),
        } as UpdateCalendarEventRequest;
        return (
            await deps.client.updateCalendarEvent(surfaceId, op.eventId, request, {
                ifMatch,
                signal,
            })
        ).event;
    };

    /** Drops every pending change to an event, as one of them can no longer be made. */
    const opsDrop = (eventId: HappyAgentCalendarEventId): void => {
        queue = queue.filter((queued) => queued.op.eventId !== eventId);
    };

    const queueRun = async (): Promise<void> => {
        if (queueRunning) return;
        queueRunning = true;
        try {
            // A calendar still being made takes changes once it exists.
            await deps.surfaceCreated?.catch(() => undefined);
            let delay = 1_000;
            while (!disposed && queue.length > 0) {
                const entry = queue[0]!;
                const sentOver = entry.expectVersion;
                try {
                    const wire = await opSend(entry);
                    if (disposed) return;
                    delay = 1_000;
                    const event = happyAgentCalendarEventProject(wire);
                    eventAdopt(event);
                    queue = queue.filter((queued) => queued !== entry);
                    landed = [...landed, { op: entry.op, version: event.version }];
                    // Changes made over this one are now made over what it became.
                    for (const queued of queue)
                        if (
                            queued.op.eventId === event.id &&
                            (queued.expectVersion === undefined ||
                                queued.expectVersion === sentOver)
                        )
                            queued.expectVersion = event.version;
                    republish();
                    rereadSoon();
                } catch (error) {
                    if (disposed || life.signal.aborted) return;
                    if (error instanceof HappyAgentApiError && error.status === 409) {
                        const current = conflictEvent(error);
                        const event =
                            current === undefined
                                ? undefined
                                : happyAgentCalendarEventProject(current);
                        if (event !== undefined) eventAdopt(event);
                        const before = snapshot.events.get(entry.op.eventId);
                        opsDrop(entry.op.eventId);
                        republish({
                            failure: new UserError(
                                event?.status === "deleted"
                                    ? `Someone deleted ${eventNamed(before?.title ?? event.title)} first, so your change wasn’t saved.`
                                    : `Someone changed ${eventNamed(event?.title ?? before?.title ?? "")} first, so your change wasn’t saved. It shows their version now.`,
                                undefined,
                                error,
                            ),
                        });
                        read();
                        continue;
                    }
                    if (
                        error instanceof HappyAgentApiError &&
                        error.status >= 400 &&
                        error.status < 500
                    ) {
                        opsDrop(entry.op.eventId);
                        republish({ failure: happyAgentUserError(error) });
                        read();
                        continue;
                    }
                    // Never arrived, or the daemon failed: the same change, under
                    // the same mutation ID, once it can be heard again.
                    await waitFor(delay, life.signal);
                    delay = Math.min(delay * 2, 10_000);
                }
            }
        } finally {
            queueRunning = false;
        }
    };

    /**
     * Queues one change, made over `over` — the event version it was made
     * against, which is the one on screen unless the popover was opened on an
     * earlier one. A change that follows another of this window's still on
     * its way is made over whatever that one becomes.
     */
    const enqueue = (op: CalendarOp, over?: string): void => {
        if (disposed) return;
        const { failure: _failure, ...rest } = snapshot;
        snapshot = rest;
        const pending = queue.some((queued) => queued.op.eventId === op.eventId);
        queue = [
            ...queue,
            {
                op,
                mutationId: idCreate(),
                expectVersion: pending
                    ? undefined
                    : (over ?? authoritative.get(op.eventId)?.version),
            },
        ];
        republish();
        void queueRun();
    };

    const rangeShow = (view: HappyAgentCalendarView, anchor: string): void => {
        if (disposed) return;
        if (view === snapshot.view && anchor === snapshot.anchor) return;
        const range = happyAgentCalendarRangeOf(view, anchor, timeZone);
        const moved = range.from !== snapshot.range.from || range.to !== snapshot.range.to;
        republish({ view, anchor, range });
        if (moved) read();
    };

    const occurrenceOf = (
        eventId: HappyAgentCalendarEventId,
        index: number,
    ): HappyAgentCalendarOccurrence | undefined =>
        snapshot.occurrences.find(
            (occurrence) => occurrence.eventId === eventId && occurrence.index === index,
        );

    /** Replaces the popover's draft, keeping what it edits. */
    const draftUpdate = (update: (draft: HappyAgentCalendarDraft) => HappyAgentCalendarDraft) => {
        const editor = snapshot.editor;
        if (disposed || editor === undefined) return;
        const draft = update(editor.draft);
        if (draft === editor.draft) return;
        snapshot = { ...snapshot, editor: editorOf(editor.target, draft, editor.series) };
        notify();
    };

    /**
     * The change that takes an event from one of its occurrences' timing to
     * another's, applied to the series as a whole.
     */
    const seriesChange = (
        event: HappyAgentCalendarEvent,
        from: HappyAgentCalendarTiming,
        to: HappyAgentCalendarTiming,
        recurrence: HappyAgentCalendarRecurrence | null,
    ): { changes: Partial<EventFields>; retime?: Retime } => {
        const changes: { timing?: HappyAgentCalendarTiming; recurrence?: typeof recurrence } = {};
        let retime: Retime | undefined;
        if (!timingSame(from, to)) {
            retime = retimeOf(from, to);
            changes.timing = retimeApply(event.timing, retime);
        }
        // A rule the reader changed is sent as they made it; one they did not
        // keeps its shape around the moved start.
        const rule = recurrenceSame(recurrence, event.recurrence)
            ? recurrenceShift(event.recurrence, retime?.days ?? 0)
            : recurrence;
        if (!recurrenceSame(rule, event.recurrence)) changes.recurrence = rule;
        if (changes.timing !== undefined && timingSame(changes.timing, event.timing)) {
            delete changes.timing;
            retime = undefined;
        }
        return retime === undefined ? { changes } : { changes, retime };
    };

    /**
     * The event as it stood when the popover was opened on it. Saving changes
     * only what the reader changed from that, over that version, so an edit
     * someone else made meanwhile is never quietly undone: the daemon refuses
     * the stale version, and the page says so.
     */
    let editorBase: HappyAgentCalendarEvent | undefined;

    const editorDrop = (): void => {
        editorBase = undefined;
        const { editor: _editor, ...rest } = snapshot;
        snapshot = rest;
    };

    const store: HappyAgentCalendarStore = {
        get: () => snapshot,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        viewUpdate(view) {
            rangeShow(view, snapshot.anchor);
        },
        periodStep(step) {
            const anchor =
                snapshot.view === "week"
                    ? calendarDateAdd(snapshot.anchor, step * 7)
                    : calendarMonthAdd(snapshot.anchor, step);
            rangeShow(snapshot.view, anchor);
        },
        todayShow() {
            rangeShow(snapshot.view, calendarDateOf(now(), timeZone));
        },
        weekShow(date) {
            rangeShow("week", date);
        },
        draftOpen(timing) {
            if (disposed || snapshot.status === "missing") return;
            const draft = draftOf(
                timing,
                { title: "", notes: null, location: null, recurrence: null },
                timing.kind === "timed" ? timing.timeZone : timeZone,
            );
            editorBase = undefined;
            const { failure: _failure, ...rest } = snapshot;
            snapshot = {
                ...rest,
                editor: editorOf(
                    { kind: "new", eventId: idCreate() as HappyAgentCalendarEventId },
                    draft,
                    false,
                ),
            };
            notify();
        },
        occurrenceEditOpen(eventId, index) {
            const event = snapshot.events.get(eventId);
            const occurrence = occurrenceOf(eventId, index);
            if (disposed || event === undefined || occurrence === undefined) return;
            editorBase = event;
            const { failure: _failure, ...rest } = snapshot;
            snapshot = {
                ...rest,
                editor: editorOf(
                    { kind: "occurrence", eventId, index, timing: occurrence.timing },
                    draftOf(occurrence.timing, event, timeZone),
                    event.recurrence !== null,
                ),
            };
            notify();
        },
        editorTitleUpdate(title) {
            draftUpdate((draft) => (draft.title === title ? draft : { ...draft, title }));
        },
        editorAllDayUpdate(allDay) {
            draftUpdate((draft) => (draft.allDay === allDay ? draft : { ...draft, allDay }));
        },
        editorStartDateUpdate(date) {
            draftUpdate((draft) => {
                if (draft.startDate === date) return draft;
                if (!calendarDateValid(date) || !calendarDateValid(draft.startDate))
                    return { ...draft, startDate: date };
                const days = calendarDateDiff(draft.startDate, date);
                return {
                    ...draft,
                    startDate: date,
                    endDate: calendarDateValid(draft.endDate)
                        ? calendarDateAdd(draft.endDate, days)
                        : draft.endDate,
                };
            });
        },
        editorStartMinutesUpdate(minutes) {
            draftUpdate((draft) => {
                if (draft.startMinutes === minutes) return draft;
                if (!calendarDateValid(draft.startDate) || !calendarDateValid(draft.endDate))
                    return { ...draft, startMinutes: minutes };
                // The end moves with the start, so the event keeps its length.
                const length =
                    calendarDateDiff(draft.startDate, draft.endDate) * 1_440 +
                    draft.endMinutes -
                    draft.startMinutes;
                const end = minutes + length;
                const days = Math.floor(end / 1_440);
                return {
                    ...draft,
                    startMinutes: minutes,
                    endDate: calendarDateAdd(draft.startDate, days),
                    endMinutes: end - days * 1_440,
                };
            });
        },
        editorEndDateUpdate(date) {
            draftUpdate((draft) => (draft.endDate === date ? draft : { ...draft, endDate: date }));
        },
        editorEndMinutesUpdate(minutes) {
            draftUpdate((draft) =>
                draft.endMinutes === minutes ? draft : { ...draft, endMinutes: minutes },
            );
        },
        editorTimeZoneUpdate(zone) {
            draftUpdate((draft) =>
                draft.timeZone === zone ? draft : { ...draft, timeZone: zone },
            );
        },
        editorLocationUpdate(location) {
            draftUpdate((draft) => (draft.location === location ? draft : { ...draft, location }));
        },
        editorNotesUpdate(notes) {
            draftUpdate((draft) => (draft.notes === notes ? draft : { ...draft, notes }));
        },
        editorRecurrenceUpdate(recurrence) {
            draftUpdate((draft) =>
                recurrenceSame(draft.recurrence, recurrence) ? draft : { ...draft, recurrence },
            );
        },
        editorTimingUpdate(timing) {
            const editor = snapshot.editor;
            if (editor?.target.kind !== "new") return;
            draftUpdate((draft) => ({
                ...draftOf(
                    timing,
                    { title: "", notes: null, location: null, recurrence: null },
                    draft.timeZone,
                ),
                title: draft.title,
                location: draft.location,
                notes: draft.notes,
                recurrence: draft.recurrence,
                ...(timing.kind === "allDay"
                    ? {
                          startMinutes: draft.startMinutes,
                          endMinutes: draft.endMinutes,
                          timeZone: draft.timeZone,
                      }
                    : {}),
            }));
        },
        editorSave() {
            const editor = snapshot.editor;
            if (disposed || editor === undefined || editor.timing === undefined) return;
            const draft = editor.draft;
            const fields: EventFields = {
                title: titleClean(draft.title),
                notes: notesClean(draft.notes),
                location: locationClean(draft.location),
                timing: editor.timing,
                recurrence: draft.recurrence,
            };
            const target = editor.target;
            if (target.kind === "new") {
                editorDrop();
                enqueue({ kind: "create", eventId: target.eventId, fields, at: now() });
                return;
            }
            const event = editorBase;
            if (event === undefined || !snapshot.events.has(target.eventId)) {
                publishClosed();
                return;
            }
            const { changes, retime } = seriesChange(
                event,
                target.timing,
                editor.timing,
                fields.recurrence,
            );
            const all: Partial<EventFields> = {
                ...(fields.title === event.title ? {} : { title: fields.title }),
                ...(fields.notes === event.notes ? {} : { notes: fields.notes }),
                ...(fields.location === event.location ? {} : { location: fields.location }),
                ...changes,
            };
            editorDrop();
            if (Object.keys(all).length === 0) {
                notify();
                return;
            }
            enqueue(
                {
                    kind: "update",
                    eventId: target.eventId,
                    changes: all,
                    ...(retime === undefined ? {} : { retime }),
                },
                event.version,
            );
        },
        editorDelete() {
            const editor = snapshot.editor;
            if (disposed || editor === undefined) return;
            const base = editorBase;
            editorDrop();
            if (editor.target.kind === "new" || !snapshot.events.has(editor.target.eventId)) {
                notify();
                return;
            }
            enqueue({ kind: "delete", eventId: editor.target.eventId }, base?.version);
        },
        editorClose() {
            if (disposed || snapshot.editor === undefined) return;
            publishClosed();
        },
        occurrenceTimingUpdate(eventId, index, timing) {
            const event = snapshot.events.get(eventId);
            const occurrence = occurrenceOf(eventId, index);
            if (disposed || event === undefined || occurrence === undefined) return;
            const { changes, retime } = seriesChange(
                event,
                occurrence.timing,
                timing,
                event.recurrence,
            );
            if (changes.timing === undefined && changes.recurrence === undefined) return;
            enqueue({
                kind: "update",
                eventId,
                changes,
                ...(retime === undefined ? {} : { retime }),
            });
        },
        failureDismiss() {
            if (disposed || snapshot.failure === undefined) return;
            const { failure: _failure, ...rest } = snapshot;
            snapshot = rest;
            notify();
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            stop();
            life.abort();
            listeners.clear();
            queue = [];
            landed = [];
        },
    };

    function publishClosed(): void {
        editorDrop();
        notify();
    }

    return store;
}
