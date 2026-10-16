"""Youth-safety checks: deterministic rules first, then grounded LLM flags (CLAUDE.md §5).

Every flag cites evidence (a quote, with a timestamp when it came from the video)
and a one-line explanation. Flags are for human review; they never certify safety.
"""

import re
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal

from app.schema_gen import GuardrailFlag, Guardrails, TranscriptLine
from pipeline.confidence import quote_in_transcript

FlagCode = Literal[
    "OFF_PLATFORM_CONTACT",
    "PRIVATE_MEETING_MINOR",
    "UNVERIFIED_CREDENTIAL",
    "AGE_MISMATCH",
    "GUARANTEED_OUTCOME",
    "UNSAFE_ACTIVITY",
]

# Severity is policy, so it's fixed here rather than taken from the model.
SEVERITY: dict[str, Literal["low", "med", "high"]] = {
    "OFF_PLATFORM_CONTACT": "high",
    "PRIVATE_MEETING_MINOR": "high",
    "UNVERIFIED_CREDENTIAL": "med",
    "AGE_MISMATCH": "med",
    "UNSAFE_ACTIVITY": "med",
    "GUARANTEED_OUTCOME": "low",
}

_CONTACT = re.compile(
    r"""
    [\w.+-]+@[\w-]+\.[\w.]+                                   # email
    | \b\w+\s+(?:at|@)\s+(?:gmail|yahoo|outlook|hotmail)\s+(?:dot|\.)\s*com\b  # spoken email
    | (?<![\w@])@[A-Za-z0-9_.]{3,}                           # @handle
    | \b(?:https?://|www\.)\S+                               # url
    | \b[\w-]+\.(?:com|net|org|io|in|co|me)\b                # bare domain
    | (?<!\d)(?:\+?\d[\s().-]?){9,14}\d(?!\d)                # phone number (10+ digits)
    | \b(?:dm|direct\ message|message|text|call|e-?mail|mail|ping|whatsapp)\ (?:me|us)\b
    | \b(?:whats\s?app|telegram|snap\s?chat|signal\ app)\b
    | \bmy\ (?:website|site|number|phone|insta(?:gram)?|email)\b
    | \blink\ in\ (?:my\ )?bio\b
    | \bcontact\ me\ (?:at|on|via)\b
    """,
    re.IGNORECASE | re.VERBOSE,
)

_GUARANTEE = re.compile(
    r"\b(?:guarantee[sd]?|100\s?%|100\ percent|hundred\ percent|money[-\s]back)",
    re.IGNORECASE | re.VERBOSE,
)

_RULES: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        "OFF_PLATFORM_CONTACT",
        _CONTACT,
        "Asks families to make contact outside the platform, where messages with minors "
        "aren't visible or protected.",
    ),
    (
        "GUARANTEED_OUTCOME",
        _GUARANTEE,
        "Promises a guaranteed result, which no tutor or coach can honestly promise.",
    ),
)


@dataclass(frozen=True)
class LLMFlag:
    """What the extract call reports; grounded before it becomes a GuardrailFlag."""

    code: str
    evidence: str
    explanation: str


def _quote(text: str, match: re.Match[str], width: int = 70) -> str:
    """The sentence around a match, trimmed for display."""
    if len(text) <= width * 2:
        return text.strip()
    start = max(0, match.start() - width)
    end = min(len(text), match.end() + width)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return prefix + text[start:end].strip() + suffix


def rule_flags(
    transcript: list[TranscriptLine], post_caption: str | None, listing_copy: Iterable[str]
) -> list[GuardrailFlag]:
    """Regex rules over the video (with timestamps), the post caption, and the listing text."""
    sources: list[tuple[str, float | None]] = [(line.text, line.start) for line in transcript]
    if post_caption:
        sources.append((post_caption, None))
    sources.extend((text, None) for text in listing_copy if text)

    flags: list[GuardrailFlag] = []
    for code, pattern, explanation in _RULES:
        for text, t in sources:
            match = pattern.search(text)
            if match:
                flags.append(
                    GuardrailFlag(
                        code=code,
                        severity=SEVERITY[code],
                        evidence=_quote(text, match),
                        explanation=explanation,
                        timestamp_s=t,
                    )
                )
                break  # one flag per code; the first hit is the evidence
    return flags


def _best_line(quote: str, transcript: list[TranscriptLine]) -> TranscriptLine | None:
    words = set(re.findall(r"[a-z0-9']+", quote.lower()))
    if not words or not transcript:
        return None

    def overlap(line: TranscriptLine) -> int:
        return len(words & set(re.findall(r"[a-z0-9']+", line.text.lower())))

    best = max(transcript, key=overlap)
    return best if overlap(best) else None


def ground_llm_flags(
    flags: Iterable[LLMFlag], transcript: list[TranscriptLine], post_caption: str | None
) -> list[GuardrailFlag]:
    """Keep only flags whose quote is really in the video or caption; attach a timestamp."""
    heard = " ".join(line.text for line in transcript)
    grounded: list[GuardrailFlag] = []
    for flag in flags:
        if flag.code not in SEVERITY:
            continue
        in_video = quote_in_transcript(flag.evidence, heard)
        in_caption = bool(post_caption) and quote_in_transcript(flag.evidence, post_caption or "")
        if not (in_video or in_caption):
            continue
        line = _best_line(flag.evidence, transcript) if in_video else None
        grounded.append(
            GuardrailFlag(
                code=flag.code,
                severity=SEVERITY[flag.code],
                evidence=flag.evidence.strip(),
                explanation=flag.explanation.strip(),
                timestamp_s=line.start if line else None,
            )
        )
    return grounded


def merge(*groups: Iterable[GuardrailFlag]) -> list[GuardrailFlag]:
    """Earlier groups win on duplicate codes (rules before the LLM)."""
    seen: set[str] = set()
    merged: list[GuardrailFlag] = []
    for group in groups:
        for flag in group:
            if flag.code not in seen:
                seen.add(flag.code)
                merged.append(flag)
    order = {"high": 0, "med": 1, "low": 2}
    return sorted(merged, key=lambda f: order[f.severity])


def status_for(flags: list[GuardrailFlag]) -> Literal["pass", "warn", "block"]:
    severities = {f.severity for f in flags}
    if "high" in severities:
        return "block"
    if "med" in severities:
        return "warn"
    return "pass"


def evaluate(
    transcript: list[TranscriptLine],
    post_caption: str | None,
    listing_copy: Iterable[str],
    llm_flags: list[GuardrailFlag],
) -> Guardrails:
    flags = merge(rule_flags(transcript, post_caption, listing_copy), llm_flags)
    return Guardrails(status=status_for(flags), flags=flags)
