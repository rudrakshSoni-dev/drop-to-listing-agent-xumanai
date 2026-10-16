"""Pipeline orchestrator: runs each stage in order and streams progress events.

Stages stay pure-ish; file IO and blocking subprocess calls happen here, pushed
off the event loop. Persistence is the caller's job (see app/runner.py).
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from starlette.concurrency import run_in_threadpool

from app.schema_gen import Listing, Source, TranscriptLine
from pipeline import extract, probe, transcribe
from pipeline.errors import ErrorCode, PipelineError
from pipeline.llm import LLM

Stage = Literal["fetching", "transcribing", "extracting_frames", "analyzing", "guardrails"]
Emit = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass(frozen=True)
class RunConfig:
    max_video_seconds: int
    transcribe_backend: Literal["gemini", "whisper"]


@dataclass(frozen=True)
class DropInput:
    drop_id: str
    video_path: Path
    work_dir: Path
    source_type: Literal["instagram", "tiktok", "youtube", "upload"]
    source_url: str | None
    caption: str | None


async def run_pipeline(drop: DropInput, llm: LLM, config: RunConfig, emit: Emit) -> Listing:
    async def stage(name: Stage, detail: str | None = None) -> None:
        await emit({"kind": "stage", "stage": name, "detail": detail})

    await stage("fetching", "Reading your video")
    info = await run_in_threadpool(probe.probe, drop.video_path)
    probe.check_duration(info, config.max_video_seconds)
    await emit(
        {"kind": "media", "duration_s": info.duration_s, "width": info.width, "height": info.height}
    )

    await stage("transcribing", "Listening to the audio")
    lines: list[TranscriptLine] = []
    if info.has_audio:
        audio = await run_in_threadpool(
            transcribe.extract_audio, drop.video_path, drop.work_dir / "audio.mp3"
        )
        if config.transcribe_backend == "whisper":
            lines = await run_in_threadpool(transcribe.transcribe_whisper, audio, info.duration_s)
        else:
            lines = await transcribe.transcribe_gemini(audio, info.duration_s, llm)
    await emit({"kind": "transcript", "lines": [line.model_dump() for line in lines]})
    if lines:
        await emit({"kind": "detail", "detail": f"Heard: “{_snippet(lines[0].text)}”"})

    # Key frames and thumbnails arrive in build step 4.
    await stage("extracting_frames", "Skipped for uploads in this build")

    await stage("analyzing", "Understanding the service")
    extracted = await extract.extract(llm, lines, info.duration_s, drop.caption)
    await emit({"kind": "detail", "detail": f"Looks like: {extracted.title}"})
    listing = extract.build_listing(
        extracted,
        listing_id=drop.drop_id,
        source=Source(type=drop.source_type, url=drop.source_url, duration_s=info.duration_s),
        transcript=lines,
        created_at=datetime.now(UTC),
    )

    # Guardrail rules and the LLM safety pass arrive in build step 5.
    await stage("guardrails", "Checking for youth-safety risks")
    return listing


def _snippet(text: str, limit: int = 60) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


__all__ = ["DropInput", "ErrorCode", "PipelineError", "RunConfig", "run_pipeline"]
