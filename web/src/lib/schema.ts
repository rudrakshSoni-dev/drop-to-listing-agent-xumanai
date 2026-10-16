// GENERATED from packages/schema/listing.schema.json by `make schema`. Do not edit.

import { z } from "zod";

export const SourceTypeSchema = z.enum(["instagram", "tiktok", "youtube", "upload"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceSchema = z
  .object({
    type: SourceTypeSchema,
    url: z.string().nullable(),
    duration_s: z.number().min(0),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

export const CategorySchema = z.enum([
  "academic_tutoring",
  "homework_support",
  "stem_coding_robotics",
  "arts_music",
  "communication_public_speaking",
  "sports_fitness_wellness",
  "leadership_life_skills",
  "hobbies_enrichment",
  "mentoring",
]);
export type Category = z.infer<typeof CategorySchema>;

export const AgeRangeSchema = z
  .object({
    min: z.number().int().min(0).max(18),
    max: z.number().int().min(0).max(18),
  })
  .strict();
export type AgeRange = z.infer<typeof AgeRangeSchema>;

export const GroupSchema = z.enum(["one_on_one", "small_group"]);
export type Group = z.infer<typeof GroupSchema>;

export const ModeSchema = z.enum(["virtual", "in_person", "hybrid"]);
export type Mode = z.infer<typeof ModeSchema>;

export const FormatSchema = z
  .object({
    group: GroupSchema,
    mode: ModeSchema,
    max_group_size: z.number().int().min(2).nullable(),
  })
  .strict();
export type Format = z.infer<typeof FormatSchema>;

export const PriceBandSchema = z
  .object({
    min: z.number().min(0),
    max: z.number().min(0),
    currency: z.string().min(3).max(3),
  })
  .strict();
export type PriceBand = z.infer<typeof PriceBandSchema>;

export const SessionSchema = z
  .object({
    duration_min: z.number().int().min(15).max(240),
    price_band: PriceBandSchema,
  })
  .strict();
export type Session = z.infer<typeof SessionSchema>;

export const AvailabilitySlotSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: z.string().regex(new RegExp("^[0-2][0-9]:[0-5][0-9]$")),
    end: z.string().regex(new RegExp("^[0-2][0-9]:[0-5][0-9]$")),
  })
  .strict();
export type AvailabilitySlot = z.infer<typeof AvailabilitySlotSchema>;

export const GuardrailStatusSchema = z.enum(["pass", "warn", "block"]);
export type GuardrailStatus = z.infer<typeof GuardrailStatusSchema>;

export const SeveritySchema = z.enum(["low", "med", "high"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const GuardrailFlagSchema = z
  .object({
    code: z.string(),
    severity: SeveritySchema,
    evidence: z.string(),
    explanation: z.string(),
    timestamp_s: z.number().nullable().optional(),
  })
  .strict();
export type GuardrailFlag = z.infer<typeof GuardrailFlagSchema>;

export const GuardrailsSchema = z
  .object({
    status: GuardrailStatusSchema,
    flags: z.array(GuardrailFlagSchema),
  })
  .strict();
export type Guardrails = z.infer<typeof GuardrailsSchema>;

export const TranscriptLineSchema = z
  .object({
    start: z.number().min(0),
    end: z.number().min(0),
    text: z.string(),
  })
  .strict();
export type TranscriptLine = z.infer<typeof TranscriptLineSchema>;

export const ListingSchema = z
  .object({
    id: z.string(),
    source: SourceSchema,
    title: z.string().max(60),
    summary: z.string().max(280),
    description: z.string().max(1200),
    category: CategorySchema,
    subcategory: z.string().nullable(),
    age_range: AgeRangeSchema,
    format: FormatSchema,
    session: SessionSchema,
    skills: z.array(z.string()),
    tags: z.array(z.string()),
    caption: z.string().max(150),
    thumbnail_frame: z.string().nullable(),
    availability: z.union([z.array(AvailabilitySlotSchema), z.null()]),
    confidence: z.record(z.string(), z.number().min(0).max(1)),
    missing_fields: z.array(z.string()),
    guardrails: GuardrailsSchema,
    transcript: z.array(TranscriptLineSchema),
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict();
export type Listing = z.infer<typeof ListingSchema>;
