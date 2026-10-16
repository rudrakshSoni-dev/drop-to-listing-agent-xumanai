"""Transcript (+ caption) → structured listing fields, validated by Pydantic."""

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
from pipeline.llm import LLM
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
    duration_min: Literal[30, 45, 60, 90]
    skills: list[str] = Field(max_length=8)
    tags: list[str] = Field(max_length=10)
    caption: str = Field(max_length=150)
    confidence: FieldConfidence


def format_transcript(lines: list[TranscriptLine]) -> str:
    if not lines:
        return "(no speech detected)"
    return "\n".join(f"[{line.start:06.1f}] {line.text}" for line in lines)


def _parse(raw: str) -> ExtractedListing:
    extracted = ExtractedListing.model_validate_json(raw)
    if extracted.age_min > extracted.age_max:
        raise ValueError("age_min must be <= age_max")
    return extracted


async def extract(
    llm: LLM, transcript: list[TranscriptLine], duration_s: float, caption: str | None
) -> ExtractedListing:
    prompt = prompts.render(
        "extract_v1",
        transcript=format_transcript(transcript),
        duration=f"{duration_s:.0f}",
        caption=caption or "(none)",
    )
    raw = await llm.generate_json(prompt=prompt, schema=ExtractedListing)
    try:
        return _parse(raw)
    except (ValidationError, ValueError) as first_error:
        retry_prompt = prompts.render(
            "extract_retry_v1", original=prompt, previous=raw, errors=str(first_error)
        )
        raw = await llm.generate_json(prompt=retry_prompt, schema=ExtractedListing)
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
) -> Listing:
    c = extracted.confidence
    scores = confidence.clamp_scores(
        {
            "title": c.title,
            "summary": c.summary,
            "description": c.summary,
            "category": c.category,
            "subcategory": c.subcategory,
            "age_range": c.age_range,
            "format.group": c.format_group,
            "format.mode": c.format_mode,
            "session.duration_min": c.duration,
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
                duration_min=extracted.duration_min,
                price_band=suggest_price_band(
                    extracted.category, extracted.group, extracted.mode, extracted.duration_min
                ),
            ),
            skills=extracted.skills,
            tags=extracted.tags,
            caption=extracted.caption,
            thumbnail_frame=None,
            availability=None,
            confidence=scores,
            missing_fields=confidence.missing_fields(scores, availability=None),
            guardrails=Guardrails(status="pass", flags=[]),
            transcript=transcript,
            created_at=created_at,
        )
    except ValidationError as exc:
        raise PipelineError(ErrorCode.LLM_SCHEMA_FAIL, str(exc)[:300]) from exc
