import { describe, expect, it } from "vitest";

import { bookableDays, buildIcs, isoDate, startTimes, weekdayOf } from "@/lib/booking";

// Friday 16 Oct 2026, local time.
const today = new Date(2026, 9, 16, 21, 30);
const slots = [
  { weekday: 1, start: "17:00", end: "18:00" }, // Tue
  { weekday: 1, start: "16:00", end: "17:00" },
  { weekday: 5, start: "10:00", end: "11:00" }, // Sat
];

describe("booking slots", () => {
  it("maps JS days to Mon=0 weekdays", () => {
    expect(weekdayOf(new Date(2026, 9, 19))).toBe(0); // Monday
    expect(weekdayOf(new Date(2026, 9, 18))).toBe(6); // Sunday
  });

  it("offers only days with availability inside the 14-day window", () => {
    const days = bookableDays(slots, today).map(isoDate);
    expect(days).toEqual(["2026-10-17", "2026-10-20", "2026-10-24", "2026-10-27"]);
    expect(bookableDays(null, today)).toEqual([]);
  });

  it("lists that day's start times in order", () => {
    expect(startTimes(slots, new Date(2026, 9, 20))).toEqual(["16:00", "17:00"]);
    expect(startTimes(slots, new Date(2026, 9, 21))).toEqual([]);
  });
});

describe("buildIcs", () => {
  it("writes a floating-time event with escaped text", () => {
    const ics = buildIcs({
      uid: "bk_123",
      title: "Algebra, step by step",
      description: "Line one\nLine two",
      startsAt: "2026-10-20T16:00",
      endsAt: "2026-10-20T17:00",
      now: new Date(Date.UTC(2026, 9, 16, 12, 0, 0)),
    });
    expect(ics).toContain("DTSTART:20261020T160000\r\n");
    expect(ics).toContain("DTEND:20261020T170000\r\n");
    expect(ics).toContain("SUMMARY:Algebra\\, step by step\r\n");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\r\n");
    expect(ics).toContain("DTSTAMP:20261016T120000Z\r\n");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});
