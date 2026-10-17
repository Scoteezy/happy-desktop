import { useState } from "react";
import {
    calendarDateAdd,
    calendarInstantOf,
    calendarTimingShiftDays,
    calendarTimeZones,
    happyAgentCalendarRangeOf,
    type HappyAgentCalendarDraft,
    type HappyAgentCalendarEditor,
    type HappyAgentCalendarEvent,
    type HappyAgentCalendarEventId,
    type HappyAgentCalendarOccurrence,
    type HappyAgentCalendarRecurrence,
    type HappyAgentCalendarSnapshot,
    type HappyAgentCalendarTiming,
    type HappyAgentCalendarView,
    type HappyAgentSurfaceId,
} from "happy-desktop-state";
import { UserError } from "happy-desktop-state";
import { CalendarSeriesNote } from "../../src/pages/surfaces/CalendarSeriesNote";
import { HappyAgentCalendarEventPopover } from "../../src/pages/surfaces/HappyAgentCalendarEventPopover";
import { HappyAgentCalendarSurfacePage } from "../../src/pages/surfaces/HappyAgentCalendarSurfacePage";
import { HappyAgentSurfaceCreateDialog } from "../../src/pages/surfaces/HappyAgentSurfaceCreateDialog";
import type { HappyAgentSurfaceView } from "../../src/pages/surfaces/surfacePresentation";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-020";

/*
 * Every fixture is fixed in time and place, so the page is screenshot-safe:
 * Berlin, on Wednesday 14 October 2026 at 10:40.
 */
const ZONE = "Europe/Berlin";
const TODAY = "2026-10-14";
const NOW = calendarInstantOf(TODAY, 10 * 60 + 40, ZONE);
const SURFACE_ID = "surface-team" as HappyAgentSurfaceId;
const TIME_ZONES = calendarTimeZones();

const TEAM: HappyAgentSurfaceView = {
    name: "Team",
    type: { kind: "calendar" },
    creator: { name: "Steve Korshakov" },
    members: [
        { key: "u1", name: "Steve Korshakov" },
        { key: "u2", name: "Ada Park" },
        { key: "u3", name: "Grace Lin" },
    ],
};

function timed(date: string, from: string, to: string): HappyAgentCalendarTiming {
    const minutes = (time: string) => {
        const [hours, mins] = time.split(":").map(Number);
        return (hours ?? 0) * 60 + (mins ?? 0);
    };
    return {
        kind: "timed",
        start: calendarInstantOf(date, minutes(from), ZONE),
        end: calendarInstantOf(date, minutes(to), ZONE),
        timeZone: ZONE,
    };
}

function allDay(first: string, last: string): HappyAgentCalendarTiming {
    return { kind: "allDay", startDate: first, endDate: calendarDateAdd(last, 1) };
}

/** A fixture event, with the occurrences the daemon would have expanded for it. */
interface Fixture {
    readonly event: HappyAgentCalendarEvent;
    readonly occurrences: readonly HappyAgentCalendarOccurrence[];
}

function event(
    id: string,
    title: string,
    timing: HappyAgentCalendarTiming,
    extra: Partial<HappyAgentCalendarEvent> = {},
    /** Days after the first at which the daemon put the rest of the series. */
    repeats: readonly number[] = [],
): Fixture {
    const eventId = id as HappyAgentCalendarEventId;
    return {
        event: {
            id: eventId,
            surfaceId: SURFACE_ID,
            authorUserId: "u1",
            title,
            notes: null,
            location: null,
            timing,
            recurrence: null,
            status: "active",
            deletedAt: null,
            createdAt: 0,
            updatedAt: 0,
            version: "v1",
            ...extra,
        },
        occurrences: [0, ...repeats].map((days, index) => ({
            eventId,
            index,
            timing: calendarTimingShiftDays(timing, days),
        })),
    };
}

const WEEKLY_SYNC: HappyAgentCalendarRecurrence = {
    frequency: "weekly",
    interval: 1,
    weekdays: ["monday", "thursday"],
    end: { kind: "count", count: 24 },
};

/** Mondays and Thursdays from 28 September, as the daemon would expand them. */
const SYNC_DAYS = [3, 7, 10, 14, 17, 21, 24, 28, 31, 35, 38];

const FIXTURES: readonly Fixture[] = [
    event(
        "e-sync",
        "Team sync",
        timed("2026-09-28", "09:30", "10:00"),
        { recurrence: WEEKLY_SYNC, location: "Room 4", notes: "Agenda in the shared doc." },
        SYNC_DAYS,
    ),
    event("e-offsite", "Offsite in Lisbon", allDay("2026-10-21", "2026-10-23"), {
        location: "Lisbon",
    }),
    event("e-release", "Release 2.4", allDay("2026-10-14", "2026-10-14")),
    event("e-review", "Design review", timed(TODAY, "10:00", "11:30")),
    event("e-lunch", "Lunch with Ada", timed(TODAY, "12:30", "13:30"), { location: "Café Lotte" }),
    event("e-pair", "Pairing: sync engine", timed(TODAY, "10:30", "12:00")),
    event("e-blank", "", timed("2026-10-13", "15:00", "16:00")),
    event("e-1on1", "1:1 Grace", timed("2026-10-15", "14:00", "14:30")),
    event("e-dentist", "Dentist", timed("2026-10-16", "08:00", "09:00")),
    event("e-standup", "Standup", timed("2026-10-12", "09:00", "09:15")),
    event("e-board", "Board prep", timed("2026-10-12", "13:00", "15:00")),
    event("e-gym", "Gym", timed("2026-10-12", "18:00", "19:00")),
    event("e-flight", "Flight to Lisbon", timed("2026-10-20", "19:20", "22:05")),
    event("e-holiday", "Autumn break", allDay("2026-10-26", "2026-10-30")),
    event(
        "e-retro",
        "Sprint retro",
        timed("2026-10-02", "16:00", "17:00"),
        {
            recurrence: {
                frequency: "weekly",
                interval: 2,
                weekdays: null,
                end: { kind: "never" },
            },
        },
        [14, 28],
    ),
];

function snapshotOf(
    view: HappyAgentCalendarView,
    anchor: string,
    extra: Partial<HappyAgentCalendarSnapshot> = {},
): HappyAgentCalendarSnapshot {
    const range = happyAgentCalendarRangeOf(view, anchor, ZONE);
    const occurrences = FIXTURES.flatMap((fixture) => fixture.occurrences);
    return {
        surfaceId: SURFACE_ID,
        status: "ready",
        view,
        anchor,
        timeZone: ZONE,
        range,
        events: new Map(FIXTURES.map((fixture) => [fixture.event.id, fixture.event])),
        occurrences,
        truncated: false,
        ...extra,
    };
}

function draftOf(
    timing: Extract<HappyAgentCalendarTiming, { kind: "timed" }>,
    extra: Partial<HappyAgentCalendarDraft> = {},
): HappyAgentCalendarDraft {
    const minutesOf = (instant: number) =>
        Math.round((instant - calendarInstantOf(TODAY, 0, ZONE)) / 60_000) % 1_440;
    return {
        title: "",
        allDay: false,
        startDate: TODAY,
        startMinutes: minutesOf(timing.start),
        endDate: TODAY,
        endMinutes: minutesOf(timing.end),
        timeZone: ZONE,
        location: "",
        notes: "",
        recurrence: null,
        ...extra,
    };
}

const NEW_TIMING = timed("2026-10-15", "10:00", "11:30") as Extract<
    HappyAgentCalendarTiming,
    { kind: "timed" }
>;

/** A draft dragged out over Thursday morning, its popover open. */
const NEW_EDITOR: HappyAgentCalendarEditor = {
    target: { kind: "new", eventId: "e-new" as HappyAgentCalendarEventId },
    draft: { ...draftOf(NEW_TIMING), startDate: "2026-10-15", endDate: "2026-10-15" },
    timing: NEW_TIMING,
    series: false,
};

const SYNC_TIMING = calendarTimingShiftDays(timed("2026-09-28", "09:30", "10:00"), 17);

/** The Thursday Team sync opened: one of a series, so saving changes all of it. */
const SERIES_EDITOR: HappyAgentCalendarEditor = {
    target: {
        kind: "occurrence",
        eventId: "e-sync" as HappyAgentCalendarEventId,
        index: 5,
        timing: SYNC_TIMING,
    },
    draft: {
        title: "Team sync",
        allDay: false,
        startDate: "2026-10-15",
        startMinutes: 9 * 60 + 30,
        endDate: "2026-10-15",
        endMinutes: 10 * 60,
        timeZone: ZONE,
        location: "Room 4",
        notes: "Agenda in the shared doc.",
        recurrence: WEEKLY_SYNC,
    },
    timing: SYNC_TIMING,
    series: true,
};

/** A new event whose end was set before its start. */
const PROBLEM_EDITOR: HappyAgentCalendarEditor = {
    ...NEW_EDITOR,
    draft: { ...NEW_EDITOR.draft, title: "Planning", endMinutes: 9 * 60 },
    timing: undefined,
    problem: "It ends before it starts.",
};

/** An all-day event that repeats monthly until a date, as the popover edits it. */
const ALL_DAY_EDITOR: HappyAgentCalendarEditor = {
    target: {
        kind: "occurrence",
        eventId: "e-release" as HappyAgentCalendarEventId,
        index: 0,
        timing: allDay(TODAY, TODAY),
    },
    draft: {
        title: "Release 2.4",
        allDay: true,
        startDate: TODAY,
        startMinutes: 9 * 60,
        endDate: TODAY,
        endMinutes: 10 * 60,
        timeZone: ZONE,
        location: "",
        notes: "",
        recurrence: {
            frequency: "monthly",
            interval: 1,
            weekdays: null,
            end: { kind: "until", date: "2027-06-30" },
        },
    },
    timing: allDay(TODAY, TODAY),
    series: false,
};

const noop = () => undefined;

const handlers = {
    onAllDayChange: noop,
    onClose: noop,
    onDelete: noop,
    onDraftMove: noop,
    onDraftOpen: noop,
    onEndDateChange: noop,
    onEndMinutesChange: noop,
    onFailureDismiss: noop,
    onLocationChange: noop,
    onNotesChange: noop,
    onOccurrenceMove: noop,
    onOccurrenceOpen: noop,
    onPeriodStep: noop,
    onRecurrenceChange: noop,
    onSave: noop,
    onStartDateChange: noop,
    onStartMinutesChange: noop,
    onTimeZoneChange: noop,
    onTitleChange: noop,
    onTodayShow: noop,
    onViewChange: noop,
    onWeekShow: noop,
};

/**
 * The page with its view switch and period steps live, over the fixed
 * fixtures: switching between Month and Week, and stepping, redraw at once.
 */
function NavigablePage(props: { initialView: HappyAgentCalendarView }) {
    const [view, setView] = useState(props.initialView);
    const [anchor, setAnchor] = useState(TODAY);
    return (
        <HappyAgentCalendarSurfacePage
            {...handlers}
            calendar={snapshotOf(view, anchor)}
            now={NOW}
            onPeriodStep={(step) =>
                setAnchor((current) =>
                    view === "week"
                        ? calendarDateAdd(current, step * 7)
                        : calendarDateAdd(`${current.slice(0, 7)}-15`, step * 30),
                )
            }
            onTodayShow={() => setAnchor(TODAY)}
            onViewChange={setView}
            onWeekShow={(date) => {
                setView("week");
                setAnchor(date);
            }}
            surface={TEAM}
            timeZones={TIME_ZONES}
        />
    );
}

/** The note as it stands in a view, placed 12px right of and 16px below a pointer at (8, 4). */
function SeriesNoteFrame() {
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const rect = root?.getBoundingClientRect();
    return (
        <div ref={setRoot} style={{ height: "48px", position: "relative", width: "320px" }}>
            {rect ? <CalendarSeriesNote root={root} x={rect.left + 8} y={rect.top + 4} /> : null}
        </div>
    );
}

export function HappyAgentCalendarBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A shared calendar Surface: a month of days with all-day bars, timed lines, and “+N more”; a week of hours with overlapping events side by side and a line at now; the popover an event is made and changed in, with recurrence; and the notices for a change that was not saved."
            title="HappyAgentCalendar"
        >
            <FullScreenSpecimen
                detail="October 2026 in Berlin, today the 14th. Offsite in Lisbon and Autumn break are bars across days; Release 2.4 is all day; Team sync repeats on Mondays and Thursdays and Sprint retro every other Friday. The 12th and 14th hold more than their cells and give the last line to “+N more”, which opens that week. The view switch and the arrows are live here."
                label="Month"
                number="01"
                screen="01-month-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <NavigablePage initialView="month" />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The week of 12 October. Design review and Pairing overlap on the 14th and share its width; the red line is now, 10:40. Release 2.4 sits in the all-day row, and an event with no title reads “(No title)”."
                label="Week"
                number="02"
                screen="02-week-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <NavigablePage initialView="week" />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A drag over Thursday 10:00–11:30 made a draft, drawn where it would go and chosen, with its popover beside it. Saving makes the event; a click beside the popover drops it."
                label="New event"
                number="03"
                screen="03-new-event-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentCalendarSurfacePage
                    {...handlers}
                    calendar={snapshotOf("week", TODAY, { editor: NEW_EDITOR })}
                    now={NOW}
                    surface={TEAM}
                    timeZones={TIME_ZONES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Thursday’s Team sync opened: one of a weekly series on Mondays and Thursdays, 24 times. The popover says saving changes all events in the series, and Delete deletes the series."
                label="Recurring event"
                number="04"
                screen="04-recurring-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentCalendarSurfacePage
                    {...handlers}
                    calendar={snapshotOf("week", TODAY, { editor: SERIES_EDITOR })}
                    now={NOW}
                    surface={TEAM}
                    timeZones={TIME_ZONES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Someone else changed the event first. The change made here was not sent over theirs; the calendar shows their version and says so, until dismissed or another change is made."
                label="Not saved"
                number="05"
                screen="05-conflict-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentCalendarSurfacePage
                    {...handlers}
                    calendar={snapshotOf("month", TODAY, {
                        failure: new UserError(
                            "Someone changed “Design review” first, so your change wasn’t saved. It shows their version now.",
                        ),
                    })}
                    now={NOW}
                    surface={TEAM}
                    timeZones={TIME_ZONES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="At the minimum window: the month keeps whole weeks and fewer lines per day."
                label="Month, minimum window"
                number="06"
                screen="06-month-720x640"
            >
                <HappyAgentCalendarSurfacePage
                    {...handlers}
                    calendar={snapshotOf("month", TODAY)}
                    now={NOW}
                    surface={TEAM}
                    timeZones={TIME_ZONES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="At the minimum window, with the recurring event’s popover open."
                label="Week, minimum window"
                number="07"
                screen="07-week-720x640"
            >
                <HappyAgentCalendarSurfacePage
                    {...handlers}
                    calendar={snapshotOf("week", TODAY, { editor: SERIES_EDITOR })}
                    now={NOW}
                    surface={TEAM}
                    timeZones={TIME_ZONES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A calendar just made here, not read yet: the grid is already there to click on."
                label="Empty"
                number="08"
                screen="08-empty-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <HappyAgentCalendarSurfacePage
                    {...handlers}
                    calendar={{
                        ...snapshotOf("month", TODAY),
                        status: "loading",
                        events: new Map(),
                        occurrences: [],
                    }}
                    now={NOW}
                    surface={{ ...TEAM, members: TEAM.members.slice(0, 1) }}
                    timeZones={TIME_ZONES}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The daemon has no such calendar any more."
                label="Missing"
                number="09"
                screen="09-missing-720x640"
            >
                <HappyAgentCalendarSurfacePage
                    {...handlers}
                    calendar={{ ...snapshotOf("month", TODAY), status: "missing" }}
                    now={NOW}
                    surface={TEAM}
                    timeZones={TIME_ZONES}
                />
            </FullScreenSpecimen>

            <Specimen
                detail="360px wide, at most 560px tall; the body scrolls between the title and the actions. A new event: no Delete."
                label="Popover, new"
                number="10"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                    <HappyAgentCalendarEventPopover
                        {...handlers}
                        editor={NEW_EDITOR}
                        timeZones={TIME_ZONES}
                    />
                    <HappyAgentCalendarEventPopover
                        {...handlers}
                        editor={PROBLEM_EDITOR}
                        timeZones={TIME_ZONES}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="One of a weekly series on named days, ending after 24 times; and an all-day event repeating monthly until a date."
                label="Popover, recurring"
                number="11"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                    <HappyAgentCalendarEventPopover
                        {...handlers}
                        editor={SERIES_EDITOR}
                        timeZones={TIME_ZONES}
                    />
                    <HappyAgentCalendarEventPopover
                        {...handlers}
                        editor={ALL_DAY_EDITOR}
                        timeZones={TIME_ZONES}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="Beside the pointer while an occurrence of a series is dragged or resized in either view: the drop moves every event in the series by as much."
                label="Dragging a series"
                number="11b"
                stage="surface"
            >
                <SeriesNoteFrame />
            </Specimen>

            <Specimen
                detail="The + menu’s New calendar: a name and, if wanted, a picture. Shown in a window-sized frame, which holds the dialog’s fixed overlay."
                label="New calendar"
                number="12"
            >
                <div
                    style={{
                        background: "var(--groupped-background)",
                        height: "480px",
                        overflow: "hidden",
                        position: "relative",
                        transform: "translateZ(0)",
                        width: "720px",
                    }}
                >
                    <HappyAgentSurfaceCreateDialog kind="calendar" onClose={noop} onSubmit={noop} />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
