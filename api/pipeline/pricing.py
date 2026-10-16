"""Static price-band heuristic. These are suggestions, never market data."""

from app.schema_gen import PriceBand

# USD per 60-minute 1:1 virtual session, (low, high).
BASE_BANDS: dict[str, tuple[int, int]] = {
    "academic_tutoring": (30, 55),
    "homework_support": (20, 35),
    "stem_coding_robotics": (35, 60),
    "arts_music": (30, 50),
    "communication_public_speaking": (35, 60),
    "sports_fitness_wellness": (30, 50),
    "leadership_life_skills": (30, 55),
    "hobbies_enrichment": (20, 40),
    "mentoring": (25, 50),
}

MODE_FACTOR: dict[str, float] = {"virtual": 1.0, "hybrid": 1.1, "in_person": 1.2}
# Small-group price is per participant.
GROUP_FACTOR: dict[str, float] = {"one_on_one": 1.0, "small_group": 0.6}


def _round5(value: float) -> int:
    return max(5, int(round(value / 5.0)) * 5)


def suggest_price_band(category: str, group: str, mode: str, duration_min: int) -> PriceBand:
    low, high = BASE_BANDS[category]
    factor = MODE_FACTOR[mode] * GROUP_FACTOR[group] * (duration_min / 60)
    return PriceBand(min=_round5(low * factor), max=_round5(high * factor), currency="USD")
