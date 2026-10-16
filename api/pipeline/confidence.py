"""Per-field confidence and the list of fields the Guide must fill in."""

import re
from collections.abc import Mapping

# Fields below this confidence are surfaced as prompts, not silently trusted.
MISSING_THRESHOLD = 0.4

# Cap for an askable field the transcript doesn't back up: below MISSING_THRESHOLD,
# so the editor asks the Guide instead of trusting the model's self-report.
UNGROUNDED_CAP = 0.3

# Share of a quote's words that must appear in the transcript, in order. Tolerates
# small paraphrases ("half hour" vs "half an hour") without accepting inventions.
QUOTE_MATCH = 0.8

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


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def quote_in_transcript(quote: str | None, transcript_text: str) -> bool:
    """True when most of the quote's words appear in the transcript in order."""
    if not quote:
        return False
    wanted = _words(quote)
    if not wanted:
        return False
    heard = _words(transcript_text)
    found, pos = 0, 0
    for word in wanted:
        try:
            # A missing word is skipped without moving the cursor.
            pos = heard.index(word, pos) + 1
            found += 1
        except ValueError:
            continue
    return found / len(wanted) >= QUOTE_MATCH


def ground(score: float, quote: str | None, transcript_text: str) -> float:
    """Keep the model's score only if its supporting quote is really in the transcript."""
    if quote_in_transcript(quote, transcript_text):
        return score
    return min(score, UNGROUNDED_CAP)
