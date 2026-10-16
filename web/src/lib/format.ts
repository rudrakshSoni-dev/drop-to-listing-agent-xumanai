import type { Listing } from "@/lib/schema";

export const GROUP_LABELS: Record<Listing["format"]["group"], string> = {
  one_on_one: "1:1",
  small_group: "Small group",
};

export const MODE_LABELS: Record<Listing["format"]["mode"], string> = {
  virtual: "Virtual",
  in_person: "In person",
  hybrid: "Hybrid",
};

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function ageLabel(range: Listing["age_range"]): string {
  return range.min === range.max ? `Age ${range.min}` : `Ages ${range.min}–${range.max}`;
}

export function priceLabel(band: Listing["session"]["price_band"]): string {
  const symbol = band.currency === "USD" ? "$" : `${band.currency} `;
  return band.min === band.max ? `${symbol}${band.min}` : `${symbol}${band.min}–${band.max}`;
}

/** 0:42 or 1:05:09 */
export function timestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export type GuardrailStatus = Listing["guardrails"]["status"];

export const STATUS_LABELS: Record<GuardrailStatus, string> = {
  pass: "Ready to publish",
  warn: "Needs review",
  block: "Blocked",
};

/** 45 → "45 min", 120 → "2 h", 210 → "3 h 30 min". */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
