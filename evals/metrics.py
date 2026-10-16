"""Scoring for the eval set (CLAUDE.md §6). Pure functions over labels + predictions.

A label of null means "the video doesn't say"; that row is left out of that metric
rather than rewarding the pipeline's default guess.
"""

from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Sequence
from typing import Any

FLAG_CODES = (
    "OFF_PLATFORM_CONTACT",
    "PRIVATE_MEETING_MINOR",
    "UNVERIFIED_CREDENTIAL",
    "AGE_MISMATCH",
    "GUARANTEED_OUTCOME",
    "UNSAFE_ACTIVITY",
)


def age_iou(expected: dict[str, int] | None, predicted: dict[str, int] | None) -> float | None:
    """IoU of inclusive integer year ranges: ages 8–12 vs 10–14 → 3/7."""
    if not expected or not predicted:
        return None
    lo = max(expected["min"], predicted["min"])
    hi = min(expected["max"], predicted["max"])
    inter = max(0, hi - lo + 1)
    union = (expected["max"] - expected["min"] + 1) + (predicted["max"] - predicted["min"] + 1)
    return inter / (union - inter)


def _ratio(hits: int, total: int) -> float | None:
    return hits / total if total else None


def percentile(values: Sequence[float], p: float) -> float | None:
    """Nearest-rank percentile; None for an empty list."""
    if not values:
        return None
    ordered = sorted(values)
    rank = max(1, math.ceil(p / 100 * len(ordered)))
    return ordered[rank - 1]


def score_row(label: dict[str, Any], pred: dict[str, Any] | None) -> dict[str, Any]:
    """Per-row comparison used by both the aggregate metrics and the UI table."""
    if pred is None:
        return {"error": True}
    fmt = label.get("format") or {}
    iou = age_iou(label.get("age_range"), pred.get("age_range"))
    expected_flags = set(label.get("expected_flags") or [])
    found_flags = set(pred.get("flags") or [])
    return {
        "error": False,
        "category_ok": label["category"] == pred["category"],
        "age_iou": None if iou is None else round(iou, 3),
        "group_ok": None if fmt.get("group") is None else fmt["group"] == pred["format"]["group"],
        "mode_ok": None if fmt.get("mode") is None else fmt["mode"] == pred["format"]["mode"],
        "flags_missed": sorted(expected_flags - found_flags),
        "flags_extra": sorted(found_flags - expected_flags),
    }


def flag_metrics(
    labels: Iterable[dict[str, Any]], preds: Iterable[dict[str, Any] | None]
) -> dict[str, dict[str, Any]]:
    """Precision and recall per flag code, plus support (how many rows expect it)."""
    tp: dict[str, int] = defaultdict(int)
    fp: dict[str, int] = defaultdict(int)
    fn: dict[str, int] = defaultdict(int)
    for label, pred in zip(labels, preds, strict=True):
        if pred is None:
            continue
        expected = set(label.get("expected_flags") or [])
        found = set(pred.get("flags") or [])
        for code in expected & found:
            tp[code] += 1
        for code in found - expected:
            fp[code] += 1
        for code in expected - found:
            fn[code] += 1
    out: dict[str, dict[str, Any]] = {}
    for code in FLAG_CODES:
        out[code] = {
            "precision": _ratio(tp[code], tp[code] + fp[code]),
            "recall": _ratio(tp[code], tp[code] + fn[code]),
            "support": tp[code] + fn[code],
            "predicted": tp[code] + fp[code],
        }
    total_tp, total_fp, total_fn = sum(tp.values()), sum(fp.values()), sum(fn.values())
    out["ALL"] = {
        "precision": _ratio(total_tp, total_tp + total_fp),
        "recall": _ratio(total_tp, total_tp + total_fn),
        "support": total_tp + total_fn,
        "predicted": total_tp + total_fp,
    }
    return out


def aggregate(
    labels: Sequence[dict[str, Any]],
    preds: Sequence[dict[str, Any] | None],
    latencies: Sequence[float],
    tokens: Sequence[int],
) -> dict[str, Any]:
    rows = [score_row(lbl, p) for lbl, p in zip(labels, preds, strict=True)]
    ok = [r for r in rows if not r["error"]]
    ious = [r["age_iou"] for r in ok if r["age_iou"] is not None]
    groups = [r["group_ok"] for r in ok if r["group_ok"] is not None]
    modes = [r["mode_ok"] for r in ok if r["mode_ok"] is not None]

    per_category: dict[str, dict[str, Any]] = {}
    for label, row in zip(labels, rows, strict=True):
        if row["error"]:
            continue
        bucket = per_category.setdefault(label["category"], {"n": 0, "correct": 0})
        bucket["n"] += 1
        bucket["correct"] += int(row["category_ok"])
    for bucket in per_category.values():
        bucket["accuracy"] = bucket["correct"] / bucket["n"]

    return {
        "n": len(labels),
        "n_scored": len(ok),
        "n_failed": len(rows) - len(ok),
        "category_accuracy": _ratio(sum(r["category_ok"] for r in ok), len(ok)),
        "per_category": per_category,
        "age": {
            "n": len(ious),
            "mean_iou": sum(ious) / len(ious) if ious else None,
            "accuracy_iou_50": _ratio(sum(i >= 0.5 for i in ious), len(ious)),
        },
        "format": {
            "group_accuracy": _ratio(sum(groups), len(groups)),
            "group_n": len(groups),
            "mode_accuracy": _ratio(sum(modes), len(modes)),
            "mode_n": len(modes),
        },
        "guardrails": flag_metrics(labels, preds),
        "latency_s": {
            "p50": percentile(latencies, 50),
            "p95": percentile(latencies, 95),
            "n": len(latencies),
        },
        "tokens_per_listing": sum(tokens) / len(tokens) if tokens else None,
    }
