# GENERATED from packages/schema/listing.schema.json by `make schema`. Do not edit.

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel


class Source(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    type: Literal['instagram', 'tiktok', 'youtube', 'upload']
    url: str | None = None
    duration_s: float = Field(..., ge=0.0)


class AgeRange(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    min: int = Field(..., ge=0, le=18)
    max: int = Field(..., ge=0, le=18)


class Format(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    group: Literal['one_on_one', 'small_group']
    mode: Literal['virtual', 'in_person', 'hybrid']
    max_group_size: int | None = Field(..., ge=2)


class PriceBand(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    min: float = Field(..., ge=0.0)
    max: float = Field(..., ge=0.0)
    currency: str = Field(..., max_length=3, min_length=3)


class Session(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    duration_min: int = Field(..., ge=15, le=240)
    price_band: PriceBand


class AvailabilitySlot(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    weekday: int = Field(..., ge=0, le=6)
    start: str = Field(..., pattern='^[0-2][0-9]:[0-5][0-9]$')
    end: str = Field(..., pattern='^[0-2][0-9]:[0-5][0-9]$')


class GuardrailFlag(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    code: str
    severity: Literal['low', 'med', 'high']
    evidence: str
    explanation: str
    timestamp_s: float | None = None


class Guardrails(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    status: Literal['pass', 'warn', 'block']
    flags: list[GuardrailFlag]


class TranscriptLine(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    start: float = Field(..., ge=0.0)
    end: float = Field(..., ge=0.0)
    text: str


class Listing(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: str
    source: Source
    title: str = Field(..., max_length=60)
    summary: str = Field(..., max_length=280)
    description: str = Field(..., max_length=1200)
    category: Literal[
        'academic_tutoring',
        'homework_support',
        'stem_coding_robotics',
        'arts_music',
        'communication_public_speaking',
        'sports_fitness_wellness',
        'leadership_life_skills',
        'hobbies_enrichment',
        'mentoring',
    ]
    subcategory: str | None = None
    age_range: AgeRange
    format: Format
    session: Session
    skills: list[str]
    tags: list[str]
    caption: str = Field(..., max_length=150)
    thumbnail_frame: str | None = None
    availability: list[AvailabilitySlot] | None = None
    confidence: dict[str, float]
    missing_fields: list[str]
    guardrails: Guardrails
    transcript: list[TranscriptLine]
    created_at: datetime
