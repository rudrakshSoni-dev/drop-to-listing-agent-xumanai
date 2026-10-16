"""Per-field confidence and the list of fields the Guide must fill in."""

from collections.abc import Mapping

# Fields below this confidence are surfaced as prompts, not silently trusted.
MISSING_THRESHOLD = 0.4

# Fields that matter enough to ask about when the model is unsure.
ASKABLE_FIELDS = ("age_range", "format.mode", "format.group", "session.duration_min")


def clamp_scores(raw: Mapping[str, float]) -> dict[str, float]:
    return {k: round(min(max(v, 0.0), 1.0), 2) for k, v in raw.items()}


def missing_fields(confidence: Mapping[str, float], availability: object | None) -> list[str]:
    """Availability is never inferred, so it is missing until the Guide sets it."""
    missing = [f for f in ASKABLE_FIELDS if confidence.get(f, 0.0) < MISSING_THRESHOLD]
    if not availability:
        missing.insert(0, "availability")
    return missing
