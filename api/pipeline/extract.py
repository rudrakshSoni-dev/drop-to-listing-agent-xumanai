"""Transcript (+ caption) → structured listing fields, validated by Pydantic."""

import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.schema_gen import (
    AgeRange,
    Format,
    Guardrails,
    Listing,
    Session,
    Source,
    TranscriptLine,
)
from pipeline import confidence, prompts
from pipeline.errors import ErrorCode, PipelineError
from pipeline.llm import LLM, Media
from pipeline.pricing import suggest_price_band

Category = Literal[
    "academic_tutoring",
    "homework_support",
    "stem_coding_robotics",
    "arts_music",
    "communication_public_speaking",
    "sports_fitness_wellness",
    "leadership_life_skills",
    "hobbies_enrichment",
    "mentoring",
]


class FieldConfidence(BaseModel):
    """Model's self-reported certainty per field, 0–1."""

    title: float
    summary: float
    category: float
    subcategory: float
    age_range: float
    format_group: float
    format_mode: float
    duration: float
    skills: float
    caption: float


class FieldEvidence(BaseModel):
    """Exact transcript words that state each askable field, or null if never said."""

    age_range: str | None
    format_group: str | None
    format_mode: str | None
    duration: str | None


class SafetyFlag(BaseModel):
    """A youth-safety concern the model noticed, with the exact words that show it."""

    code: Literal[
        "OFF_PLATFORM_CONTACT",
        "PRIVATE_MEETING_MINOR",
        "UNVERIFIED_CREDENTIAL",
        "AGE_MISMATCH",
        "GUARANTEED_OUTCOME",
        "UNSAFE_ACTIVITY",
    ]
    evidence: str
    explanation: str


class ExtractedListing(BaseModel):
    """What the LLM fills in. Kept flat because response schemas handle that best."""

    title: str = Field(max_length=60)
    summary: str = Field(max_length=280)
    description: str = Field(max_length=1200)
    category: Category
    subcategory: str | None
    age_min: int = Field(ge=3, le=18)
    age_max: int = Field(ge=3, le=18)
    group: Literal["one_on_one", "small_group"]
    mode: Literal["virtual", "in_person", "hybrid"]
    max_group_size: int | None
    # Wider than the listing's 15–240 so an unusual stated length ("six hours")
    # comes back as said; build_listing clamps it and asks the Guide.
    duration_min: int = Field(ge=5, le=720)
    skills: list[str] = Field(max_length=8)
    tags: list[str] = Field(max_length=10)
    caption: str = Field(max_length=150)
    confidence: FieldConfidence
    evidence: FieldEvidence
    safety_flags: list[SafetyFlag] = Field(default_factory=list, max_length=6)


SESSION_MIN, SESSION_MAX = 15, 240


def format_transcript(lines: list[TranscriptLine]) -> str:
    if not lines:
        return "(no speech detected)"
    return "\n".join(f"[{line.start:06.1f}] {line.text}" for line in lines)


TEXT_LIMITS = {"title": 60, "summary": 280, "description": 1200, "caption": 150}


def fit_text(text: str, limit: int) -> str:
    """Trim at a word boundary with an ellipsis. Cheaper than a retry on the free tier."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:.-–—")
    return cut + "…"


def _parse(raw: str) -> ExtractedListing:
    data = json.loads(raw)
    # Models (especially lite ones) overshoot length limits; fix those locally and
    # keep the retry for real schema problems.
    if isinstance(data, dict):
        for key, limit in TEXT_LIMITS.items():
            if isinstance(data.get(key), str):
                data[key] = fit_text(data[key], limit)
    extracted = ExtractedListing.model_validate(data)
    if extracted.age_min > extracted.age_max:
        raise ValueError("age_min must be <= age_max")
    return extracted


async def extract(
    llm: LLM,
    transcript: list[TranscriptLine],
    duration_s: float,
    caption: str | None,
    frames: list[Media] | None = None,
) -> ExtractedListing:
    prompt = prompts.render(
        "extract_v4",
        transcript=format_transcript(transcript),
        duration=f"{duration_s:.0f}",
        caption=caption or "(none)",
        frames=f"{len(frames)} images attached, in time order" if frames else "(none)",
    )
    raw = await llm.generate_json(prompt=prompt, schema=ExtractedListing, media=frames)
    try:
        return _parse(raw)
    except (ValidationError, ValueError) as first_error:  # JSONDecodeError is a ValueError
        retry_prompt = prompts.render(
            "extract_retry_v1", original=prompt, previous=raw, errors=str(first_error)
        )
        raw = await llm.generate_json(
            prompt=retry_prompt, schema=ExtractedListing, media=frames
        )
        try:
            return _parse(raw)
        except (ValidationError, ValueError) as exc:
            raise PipelineError(ErrorCode.LLM_SCHEMA_FAIL, str(exc)[:300]) from exc


def build_listing(
    extracted: ExtractedListing,
    *,
    listing_id: str,
    source: Source,
    transcript: list[TranscriptLine],
    created_at: datetime,
    caption: str | None = None,
    thumbnail_frame: str | None = None,
) -> Listing:
    c, ev = extracted.confidence, extracted.evidence
    # Evidence may come from the spoken transcript or the post's own caption.
    heard = " ".join([*(line.text for line in transcript), caption or ""])
    duration = min(max(extracted.duration_min, SESSION_MIN), SESSION_MAX)
    duration_score = confidence.ground(c.duration, ev.duration, heard)
    if duration != extracted.duration_min:
        duration_score = min(duration_score, confidence.UNGROUNDED_CAP)
    scores = confidence.clamp_scores(
        {
            "title": c.title,
            "summary": c.summary,
            "description": c.summary,
            "category": c.category,
            "subcategory": c.subcategory,
            "age_range": confidence.ground(c.age_range, ev.age_range, heard),
            "format.group": confidence.ground(c.format_group, ev.format_group, heard),
            "format.mode": confidence.ground(c.format_mode, ev.format_mode, heard),
            "session.duration_min": duration_score,
            "skills": c.skills,
            "tags": c.skills,
            "caption": c.caption,
        }
    )
    group_size = extracted.max_group_size if extracted.group == "small_group" else None
    try:
        return Listing(
            id=listing_id,
            source=source,
            title=extracted.title,
            summary=extracted.summary,
            description=extracted.description,
            category=extracted.category,
            subcategory=extracted.subcategory,
            age_range=AgeRange(min=extracted.age_min, max=extracted.age_max),
            format=Format(
                group=extracted.group,
                mode=extracted.mode,
                max_group_size=max(group_size, 2) if group_size else None,
            ),
            session=Session(
                duration_min=duration,
                price_band=suggest_price_band(
                    extracted.category, extracted.group, extracted.mode, duration
                ),
            ),
            skills=extracted.skills,
            tags=extracted.tags,
            caption=extracted.caption,
            thumbnail_frame=thumbnail_frame,
            availability=None,
            confidence=scores,
            missing_fields=confidence.missing_fields(scores, availability=None),
            guardrails=Guardrails(status="pass", flags=[]),
            transcript=transcript,
            created_at=created_at,
        )
    except ValidationError as exc:
        raise PipelineError(ErrorCode.LLM_SCHEMA_FAIL, str(exc)[:300]) from exc
