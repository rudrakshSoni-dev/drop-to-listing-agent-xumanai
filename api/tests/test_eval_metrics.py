import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "evals"))

import metrics  # noqa: E402


def _label(cat: str, ages: tuple[int, int] | None, group: str | None, mode: str | None,
           flags: list[str] | None = None) -> dict[str, object]:
    return {
        "category": cat,
        "age_range": {"min": ages[0], "max": ages[1]} if ages else None,
        "format": {"group": group, "mode": mode},
        "expected_flags": flags or [],
    }


def _pred(cat: str, ages: tuple[int, int], group: str, mode: str,
          flags: list[str] | None = None) -> dict[str, object]:
    return {
        "category": cat,
        "age_range": {"min": ages[0], "max": ages[1]},
        "format": {"group": group, "mode": mode},
        "flags": flags or [],
    }


def test_age_iou_uses_inclusive_years() -> None:
    assert metrics.age_iou({"min": 8, "max": 12}, {"min": 8, "max": 12}) == 1.0
    assert metrics.age_iou({"min": 8, "max": 12}, {"min": 10, "max": 14}) == 3 / 7
    assert metrics.age_iou({"min": 5, "max": 6}, {"min": 10, "max": 12}) == 0.0
    assert metrics.age_iou(None, {"min": 1, "max": 2}) is None


def test_percentile_nearest_rank() -> None:
    assert metrics.percentile([5, 1, 3, 2, 4], 50) == 3
    assert metrics.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95) == 10
    assert metrics.percentile([], 50) is None


def test_aggregate_skips_unstated_labels_and_failed_rows() -> None:
    labels = [
        _label("academic_tutoring", (11, 14), "one_on_one", "virtual"),
        _label("arts_music", None, None, "in_person", ["OFF_PLATFORM_CONTACT"]),
        _label("mentoring", (14, 18), "small_group", None),
    ]
    preds = [
        _pred("academic_tutoring", (11, 14), "one_on_one", "virtual"),
        _pred("arts_music", (6, 12), "one_on_one", "virtual", ["OFF_PLATFORM_CONTACT"]),
        None,  # pipeline failed on this row
    ]
    out = metrics.aggregate(labels, preds, latencies=[10.0, 20.0], tokens=[1000, 3000])
    assert (out["n"], out["n_scored"], out["n_failed"]) == (3, 2, 1)
    assert out["category_accuracy"] == 1.0
    assert out["age"] == {"n": 1, "mean_iou": 1.0, "accuracy_iou_50": 1.0}
    assert out["format"]["group_n"] == 1 and out["format"]["group_accuracy"] == 1.0
    assert out["format"]["mode_n"] == 2 and out["format"]["mode_accuracy"] == 0.5
    contact = out["guardrails"]["OFF_PLATFORM_CONTACT"]
    assert (contact["precision"], contact["recall"], contact["support"]) == (1.0, 1.0, 1)
    assert out["guardrails"]["GUARANTEED_OUTCOME"]["precision"] is None
    assert out["tokens_per_listing"] == 2000
    assert out["per_category"]["arts_music"] == {"n": 1, "correct": 1, "accuracy": 1.0}


def test_flag_metrics_counts_false_positives_and_misses() -> None:
    labels = [_label("a", None, None, None, ["OFF_PLATFORM_CONTACT"]),
              _label("a", None, None, None)]
    preds = [_pred("a", (1, 2), "one_on_one", "virtual"),
             _pred("a", (1, 2), "one_on_one", "virtual", ["OFF_PLATFORM_CONTACT"])]
    flags = metrics.flag_metrics(labels, preds)["OFF_PLATFORM_CONTACT"]
    assert flags["precision"] == 0.0 and flags["recall"] == 0.0
