import { describe, expect, it } from "vitest";

import { summarize, toSlots } from "@/components/availability-picker";
import { anyDirty } from "@/components/listing-editor";
import { durationOptions } from "@/components/listing-form";
import { durationLabel } from "@/lib/format";
import { buildPatch, toFormValues } from "@/lib/listing-form";
import { ListingSchema, type Listing } from "@/lib/schema";

const listing: Listing = ListingSchema.parse({
  id: "abc",
  source: { type: "upload", url: null, duration_s: 12 },
  title: "Algebra help",
  summary: "Quadratics for teens",
  description: "Hands-on algebra.",
  category: "academic_tutoring",
  subcategory: "Algebra",
  age_range: { min: 12, max: 16 },
  format: { group: "small_group", mode: "virtual", max_group_size: 4 },
  session: { duration_min: 60, price_band: { min: 30, max: 55, currency: "USD" } },
  skills: ["Factoring"],
  tags: ["math"],
  caption: "Algebra, simplified.",
  thumbnail_frame: null,
  availability: null,
  confidence: { title: 0.9 },
  missing_fields: ["availability"],
  guardrails: { status: "pass", flags: [] },
  transcript: [],
  created_at: "2026-10-16T10:00:00+00:00",
});

describe("availability slots", () => {
  it("builds weekday × start-time slots using the session length", () => {
    expect(toSlots([3, 1], ["16:00"], 45)).toEqual([
      { weekday: 1, start: "16:00", end: "16:45" },
      { weekday: 3, start: "16:00", end: "16:45" },
    ]);
    expect(summarize(toSlots([1, 3], ["16:00"], 60))).toBe("Tue, Thu · 16:00");
    expect(summarize(null)).toBeNull();
  });
});

describe("form → patch", () => {
  it("sends only dirty top-level keys and clears group size for 1:1", () => {
    const values = toFormValues(listing);
    values.format = { ...values.format, group: "one_on_one" };
    expect(buildPatch(values, ["format"])).toEqual({
      format: { group: "one_on_one", mode: "virtual", max_group_size: null },
    });
  });

  it("detects nested dirty flags", () => {
    expect(anyDirty({ age_range: { min: true } })).toBe(true);
    expect(anyDirty({ skills: [false, undefined] })).toBe(false);
    expect(anyDirty(undefined)).toBe(false);
  });
});

describe("durations", () => {
  it("labels long sessions in hours", () => {
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(120)).toBe("2 h");
    expect(durationLabel(210)).toBe("3 h 30 min");
  });

  it("always offers the current length so the select never blanks", () => {
    expect(durationOptions(60)).toEqual([30, 45, 60, 90, 120, 180, 240]);
    expect(durationOptions(210)).toContain(210);
  });
});

describe("youtubeId", () => {
  it("reads watch, short, shorts and embed links", async () => {
    const { youtubeId } = await import("@/lib/sources");
    expect(youtubeId("https://www.youtube.com/watch?v=abc_123")).toBe("abc_123");
    expect(youtubeId("https://youtu.be/abc")).toBe("abc");
    expect(youtubeId("https://m.youtube.com/shorts/xyz-9")).toBe("xyz-9");
    expect(youtubeId("https://www.tiktok.com/@a/video/1")).toBeNull();
    expect(youtubeId(null)).toBeNull();
  });
});
