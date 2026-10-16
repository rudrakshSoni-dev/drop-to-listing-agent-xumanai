import { z } from "zod";

import type { ListingPatch } from "@/lib/api";
import { ListingSchema, type Listing } from "@/lib/schema";

export const listingFormSchema = ListingSchema.pick({
  title: true,
  summary: true,
  description: true,
  category: true,
  subcategory: true,
  age_range: true,
  format: true,
  session: true,
  skills: true,
  tags: true,
  caption: true,
  availability: true,
})
  .extend({
    title: ListingSchema.shape.title.min(1, "Add a title."),
    summary: ListingSchema.shape.summary.min(1, "Add a short summary."),
  })
  .refine((v) => v.age_range.min <= v.age_range.max, {
    path: ["age_range"],
    message: "Minimum age must be at or below maximum age.",
  })
  .refine((v) => v.session.price_band.min <= v.session.price_band.max, {
    path: ["session", "price_band", "max"],
    message: "Max price must be at least the min price.",
  });

export type ListingFormValues = z.infer<typeof listingFormSchema>;
export type FormKey = keyof ListingFormValues;

export function toFormValues(listing: Listing): ListingFormValues {
  return {
    title: listing.title,
    summary: listing.summary,
    description: listing.description,
    category: listing.category,
    subcategory: listing.subcategory,
    age_range: listing.age_range,
    format: listing.format,
    session: listing.session,
    skills: listing.skills,
    tags: listing.tags,
    caption: listing.caption,
    availability: listing.availability,
  };
}

/** Only top-level keys the Guide changed, so the API can clear matching missing fields. */
export function buildPatch(values: ListingFormValues, dirtyKeys: string[]): ListingPatch {
  const patch: Record<string, unknown> = {};
  for (const key of dirtyKeys) {
    if (key in values) patch[key] = values[key as FormKey];
  }
  if (patch.format) {
    const format = patch.format as Listing["format"];
    patch.format = {
      ...format,
      max_group_size: format.group === "small_group" ? format.max_group_size : null,
    };
  }
  return patch as ListingPatch;
}

/** Confidence key → DOM id of the field wrapper (for "jump to field" links). */
export const FIELD_IDS: Record<string, string> = {
  availability: "field-availability",
  age_range: "field-age-range",
  "format.group": "field-format-group",
  "format.mode": "field-format-mode",
  "session.duration_min": "field-duration",
  title: "field-title",
  category: "field-category",
};

export const FIELD_LABELS: Record<string, string> = {
  availability: "Availability",
  age_range: "Age range",
  "format.group": "1:1 or small group",
  "format.mode": "Virtual or in person",
  "session.duration_min": "Session length",
};

export function focusField(key: string) {
  const el = document.getElementById(FIELD_IDS[key] ?? "");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.querySelector<HTMLElement>("button, input, textarea, [tabindex]")?.focus({
    preventScroll: true,
  });
}
