import { describe, expect, it } from "vitest";
import { localDayTime, localMoment } from "./localTime";

/* A reset time is one absolute instant. Each case tells it on a pinned viewer
   clock, so the day it falls on is the viewer's calendar day, never the host's
   or UTC's. */

const LA = { locale: "en-US", timeZone: "America/Los_Angeles" } as const;
const TOKYO = { locale: "en-US", timeZone: "Asia/Tokyo" } as const;
const LONDON = { locale: "en-GB", timeZone: "Europe/London" } as const;
const BERLIN = { locale: "de-DE", timeZone: "Europe/Berlin" } as const;

const at = (iso: string) => Date.parse(iso);

describe("localMoment", () => {
    it("tells a reset later today as its local time alone", () => {
        // 2:05 PM in Los Angeles; resets 3:40 PM there.
        expect(localMoment(at("2026-10-19T22:40:00Z"), at("2026-10-19T21:05:00Z"), LA)).toBe(
            "3:40 PM",
        );
    });

    it("puts the same instants on each viewer's own calendar", () => {
        const now = at("2026-10-19T21:05:00Z");
        const reset = at("2026-10-20T08:00:00Z");
        // 2:05 PM Monday in LA, the reset is 1:00 AM there tomorrow…
        expect(localMoment(reset, now, LA)).toBe("tomorrow at 1:00 AM");
        // …while in Tokyo it is already Tuesday morning, and the reset is this afternoon.
        expect(localMoment(reset, now, TOKYO)).toBe("5:00 PM");
        // London sees 9:00 AM tomorrow in its own 24-hour style.
        expect(localMoment(reset, now, LONDON)).toMatch(/^tomorrow at 0?9:00$/u);
    });

    it("crosses midnight by the calendar, not by 24 hours", () => {
        // 11:50 PM; ten minutes later is already tomorrow.
        expect(localMoment(at("2026-10-20T07:00:00Z"), at("2026-10-20T06:50:00Z"), LA)).toBe(
            "tomorrow at 12:00 AM",
        );
        // 12:10 AM; nearly 24 hours later is still today.
        expect(localMoment(at("2026-10-21T06:50:00Z"), at("2026-10-20T07:10:00Z"), LA)).toBe(
            "11:50 PM",
        );
    });

    it("keeps a 25-hour fall-back day as one day", () => {
        // US clocks fall back at 2:00 AM on Sunday 1 November 2026.
        const now = at("2026-11-01T07:30:00Z"); // 12:30 AM PDT
        const sameDay = at("2026-11-02T07:30:00Z"); // 11:30 PM PST, 25 hours later
        expect(localMoment(sameDay, now, LA)).toBe("11:30 PM");
        const nextDay = at("2026-11-02T08:30:00Z"); // 12:30 AM PST on Monday
        expect(localMoment(nextDay, now, LA)).toBe("tomorrow at 12:30 AM");
        // The repeated hour still reads as the wall clock shows it.
        expect(localMoment(at("2026-11-01T09:30:00Z"), now, LA)).toBe("1:30 AM");
    });

    it("keeps a 23-hour spring-forward day as one day", () => {
        // US clocks spring forward at 2:00 AM on Sunday 8 March 2026.
        const now = at("2026-03-08T07:30:00Z"); // 11:30 PM PST on Saturday
        expect(localMoment(at("2026-03-09T06:30:00Z"), now, LA)).toBe("tomorrow at 11:30 PM");
        // 23 hours after 12:30 AM is still the same Sunday.
        expect(localMoment(at("2026-03-09T06:30:00Z"), at("2026-03-08T08:30:00Z"), LA)).toBe(
            "11:30 PM",
        );
    });

    it("tells European DST on Europe's own date", () => {
        // Europe falls back a week before the US, on Sunday 25 October 2026.
        const now = at("2026-10-24T20:00:00Z"); // 10:00 PM CEST Saturday
        expect(localMoment(at("2026-10-25T22:30:00Z"), now, BERLIN)).toBe("tomorrow at 23:30");
    });

    it("names a weekday within the week, then a date, then a year", () => {
        const now = at("2026-10-19T21:05:00Z"); // Monday 19 October, LA
        expect(localMoment(at("2026-10-22T22:40:00Z"), now, LA)).toBe("Thursday at 3:40 PM");
        expect(localMoment(at("2026-10-29T22:40:00Z"), now, LA)).toBe("Oct 29 at 3:40 PM");
        expect(localMoment(at("2027-01-05T23:40:00Z"), now, LA)).toBe("Jan 5, 2027 at 3:40 PM");
        // A reset already past still gets its day rather than reading as later today.
        expect(localMoment(at("2026-10-18T22:40:00Z"), now, LA)).toBe("Oct 18 at 3:40 PM");
    });

    it("always gives the date when the viewer's clock is unknown", () => {
        expect(localMoment(at("2026-10-19T22:40:00Z"), undefined, LA)).toBe(
            "Oct 19, 2026 at 3:40 PM",
        );
    });

    it("never shows UTC, a zone offset or an ISO timestamp", () => {
        const now = at("2026-10-19T21:05:00Z");
        for (const zone of [LA, TOKYO, LONDON, BERLIN])
            for (const reset of [
                at("2026-10-19T22:40:00Z"),
                at("2026-10-21T03:15:00Z"),
                at("2027-02-01T12:00:00Z"),
            ])
                for (const text of [
                    localMoment(reset, now, zone),
                    localMoment(reset, undefined, zone),
                ])
                    expect(text).not.toMatch(
                        /UTC|GMT|Z\b|\d{4}-\d{2}-\d{2}|T\d{2}:|[+-]\d{2}:?\d{2}\b/u,
                    );
    });
});

describe("localDayTime", () => {
    it("leads with the weekday on any day but today, on the viewer's calendar", () => {
        const now = at("2026-10-19T21:05:00Z");
        const reset = at("2026-10-20T08:00:00Z");
        expect(localDayTime(reset, now, LA)).toBe("Tue 1:00 AM");
        expect(localDayTime(reset, now, TOKYO)).toBe("5:00 PM");
    });
});
