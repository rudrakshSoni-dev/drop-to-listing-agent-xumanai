import { describe, expect, it } from "vitest";

import { pct, rowFailed, type EvalRow } from "@/lib/evals";

const row = (score: EvalRow["score"]): EvalRow => ({
  id: "x",
  url: "https://youtu.be/x",
  title: null,
  thumbnail: null,
  expected: { category: "mentoring", age_range: null, format: null, flags: [] },
  predicted: null,
  score,
  error: null,
  latency_s: null,
  transcript_excerpt: null,
});

const good = {
  error: false as const,
  category_ok: true,
  age_iou: 0.8,
  group_ok: null,
  mode_ok: true,
  flags_missed: [],
  flags_extra: [],
};

describe("evals helpers", () => {
  it("formats percentages and missing values", () => {
    expect(pct(0.837)).toBe("84%");
    expect(pct(null)).toBe("—");
  });

  it("treats unstated labels as not failing", () => {
    expect(rowFailed(row(good))).toBe(false);
    expect(rowFailed(row({ ...good, age_iou: 0.4 }))).toBe(true);
    expect(rowFailed(row({ ...good, flags_extra: ["GUARANTEED_OUTCOME"] }))).toBe(true);
    expect(rowFailed(row({ error: true }))).toBe(true);
  });
});
