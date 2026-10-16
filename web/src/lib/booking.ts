import type { AvailabilitySlot } from "@/lib/schema";

export const BOOKING_WINDOW_DAYS = 14;

/** Mon=0 … Sun=6, matching the schema (JS getDay() starts on Sunday). */
export function weekdayOf(day: Date): number {
  return (day.getDay() + 6) % 7;
}

/** Local calendar date as YYYY-MM-DD (toISOString would shift it to UTC). */
export function isoDate(day: Date): string {
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${m}-${d}`;
}

function startOfDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate());
}

/** Days in the booking window that have at least one weekly slot. */
export function bookableDays(
  availability: AvailabilitySlot[] | null | undefined,
  today: Date,
  days = BOOKING_WINDOW_DAYS,
): Date[] {
  const weekdays = new Set((availability ?? []).map((s) => s.weekday));
  const first = startOfDay(today);
  return Array.from(
    { length: days },
    (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i),
  ).filter((d) => weekdays.has(weekdayOf(d)));
}

/** Sorted start times offered on that day. */
export function startTimes(
  availability: AvailabilitySlot[] | null | undefined,
  day: Date,
): string[] {
  const weekday = weekdayOf(day);
  return [
    ...new Set((availability ?? []).filter((s) => s.weekday === weekday).map((s) => s.start)),
  ].sort();
}

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([;,])/g, "\\$1")
    .replace(/\r?\n/g, "\\n");
}

/** "2026-10-20T16:00" → "20261020T160000" (floating local time, like the booking). */
function icsTime(local: string): string {
  return local.replace(/[-:]/g, "") + "00";
}

export function buildIcs(event: {
  uid: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  now?: Date;
}): string {
  const stamp = (event.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Drop2List//Demo booking//EN",
    "BEGIN:VEVENT",
    `UID:${event.uid}@drop2list.demo`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTime(event.startsAt)}`,
    `DTEND:${icsTime(event.endsAt)}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `DESCRIPTION:${icsEscape(event.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function downloadFile(filename: string, text: string, type = "text/calendar") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
