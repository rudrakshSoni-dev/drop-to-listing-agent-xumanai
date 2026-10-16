import type { Listing } from "@/lib/schema";

type Category = Listing["category"];
type Group = Listing["format"]["group"];
type Mode = Listing["format"]["mode"];
type Ages = { min: number; max: number };

export interface FlagMetric {
  precision: number | null;
  recall: number | null;
  support: number;
  predicted: number;
}

export interface EvalRow {
  id: string;
  url: string;
  title: string | null;
  thumbnail: string | null;
  expected: {
    category: Category;
    age_range: Ages | null;
    format: { group: Group | null; mode: Mode | null } | null;
    flags: string[];
  };
  predicted: {
    title: string;
    category: Category;
    age_range: Ages;
    format: { group: Group; mode: Mode };
    flags: string[];
    status: Listing["guardrails"]["status"];
  } | null;
  score:
    | { error: true }
    | {
        error: false;
        category_ok: boolean;
        age_iou: number | null;
        group_ok: boolean | null;
        mode_ok: boolean | null;
        flags_missed: string[];
        flags_extra: string[];
      };
  error: string | null;
  latency_s: number | null;
  transcript_excerpt: string | null;
}

export interface EvalResults {
  meta: {
    run_at: string;
    dataset_size: number;
    prompt: string;
    models: string[];
    transcribe_backend: string;
    whisper_model: string;
    latency_note: string;
  };
  metrics: {
    n: number;
    n_scored: number;
    n_failed: number;
    category_accuracy: number | null;
    per_category: Record<string, { n: number; correct: number; accuracy: number }>;
    age: { n: number; mean_iou: number | null; accuracy_iou_50: number | null };
    format: {
      group_accuracy: number | null;
      group_n: number;
      mode_accuracy: number | null;
      mode_n: number;
    };
    guardrails: Record<string, FlagMetric>;
    latency_s: { p50: number | null; p95: number | null; n: number };
    tokens_per_listing: number | null;
  };
  rows: EvalRow[];
}

export interface EvalsResponse {
  results: EvalResults;
  notes_md: string | null;
}

/** 0.837 → "84%"; null (nothing to measure) → "—". */
export function pct(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

/** True when anything about the row is wrong, for the "Only failures" filter. */
export function rowFailed(row: EvalRow): boolean {
  const s = row.score;
  if (s.error) return true;
  return (
    !s.category_ok ||
    (s.age_iou !== null && s.age_iou < 0.5) ||
    s.group_ok === false ||
    s.mode_ok === false ||
    s.flags_missed.length > 0 ||
    s.flags_extra.length > 0
  );
}
