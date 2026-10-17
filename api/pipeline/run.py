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

from app.schema_gen import GuardrailFlag, Listing, Source, TranscriptLine
from pipeline import extract, fetch, frames, guardrails, probe, transcribe
from pipeline.errors import ErrorCode, PipelineError
from pipeline.llm import LLM, Media

_SOURCE_LABELS = {"youtube": "YouTube", "tiktok": "TikTok", "instagram": "Instagram"}

Stage = Literal["fetching", "transcribing", "extracting_frames", "analyzing", "guardrails"]
Emit = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass(frozen=True)
class RunConfig:
    max_video_seconds: int
    transcribe_backend: Literal["gemini", "whisper", "groq"]
    whisper_model: str = "tiny.en"
    groq_api_key: str = ""


@dataclass(frozen=True)
class DropInput:
    drop_id: str
    # None for a link drop that hasn't been downloaded yet.
    video_path: Path | None
    work_dir: Path
    source_type: Literal["instagram", "tiktok", "youtube", "upload"]
    source_url: str | None
    caption: str | None


async def run_pipeline(
    drop: DropInput, llm: LLM, config: RunConfig, emit: Emit
) -> "PipelineResult":
    async def stage(name: Stage, detail: str | None = None) -> None:
        await emit({"kind": "stage", "stage": name, "detail": detail})

    caption = drop.caption
    video = drop.video_path
    if video is None or not video.exists():
        if not drop.source_url:
            raise PipelineError(ErrorCode.VIDEO_UNREADABLE, "no video and no link")
        await stage("fetching", f"Downloading from {_SOURCE_LABELS.get(drop.source_type, 'link')}")
        fetched = await run_in_threadpool(
            fetch.fetch, drop.source_url, drop.work_dir, config.max_video_seconds
        )
        video, caption = fetched.path, caption or fetched.caption
    else:
        await stage("fetching", "Reading your video")
    info = await run_in_threadpool(probe.probe, video)
    probe.check_duration(info, config.max_video_seconds)
    await emit(
        {
            "kind": "media",
            "duration_s": info.duration_s,
            "width": info.width,
            "height": info.height,
            "file": video.name,
            "caption": caption,
        }
    )

    await stage("transcribing", "Listening to the audio")
    lines: list[TranscriptLine] = []
    if info.has_audio:
        audio = await run_in_threadpool(
            transcribe.extract_audio, video, drop.work_dir / "audio.mp3"
        )
        if config.transcribe_backend == "groq" and config.groq_api_key:
            lines = await transcribe.transcribe_groq(
                audio, info.duration_s, config.groq_api_key
            )
        elif config.transcribe_backend == "whisper":
            lines = await run_in_threadpool(
                transcribe.transcribe_whisper, audio, info.duration_s, config.whisper_model
            )
        else:
            lines = await transcribe.transcribe_gemini(audio, info.duration_s, llm)
    await emit({"kind": "transcript", "lines": [line.model_dump() for line in lines]})
    if lines:
        await emit({"kind": "detail", "detail": f"Heard: “{_snippet(lines[0].text)}”"})

    await stage("extracting_frames", "Looking for scene changes")
    frame_set = frames.FrameSet(frames=[], thumbnail=None)
    if info.width:
        frame_set = await run_in_threadpool(
            frames.extract_frames, video, drop.work_dir, info.duration_s
        )
    await emit(
        {
            "kind": "frames",
            "frames": [{"file": f.file, "t": f.t} for f in frame_set.frames],
            "thumbnail": frame_set.thumbnail,
        }
    )
    await emit({"kind": "detail", "detail": f"Picked {len(frame_set.frames)} key frames"})
    images = [
        Media(data=(drop.work_dir / f.file).read_bytes(), mime_type="image/jpeg")
        for f in frame_set.frames
    ]

    await stage("analyzing", "Understanding the service")
    extracted = await extract.extract(llm, lines, info.duration_s, caption, images)
    await emit({"kind": "detail", "detail": f"Looks like: {extracted.title}"})
    listing = extract.build_listing(
        extracted,
        listing_id=drop.drop_id,
        source=Source(type=drop.source_type, url=drop.source_url, duration_s=info.duration_s),
        transcript=lines,
        created_at=datetime.now(UTC),
        caption=caption,
        thumbnail_frame=frame_set.thumbnail,
    )

    await stage("guardrails", "Checking for youth-safety risks")
    llm_flags = guardrails.ground_llm_flags(
        (guardrails.LLMFlag(f.code, f.evidence, f.explanation) for f in extracted.safety_flags),
        lines,
        caption,
    )
    listing.guardrails = guardrails.evaluate(lines, caption, listing_copy(listing), llm_flags)
    if listing.guardrails.flags:
        n = len(listing.guardrails.flags)
        await emit({"kind": "detail", "detail": f"Flagged {n} item{'s' * (n > 1)} for review"})
    return PipelineResult(listing=listing, llm_flags=llm_flags)


def listing_copy(listing: Listing) -> list[str]:
    """The Guide-editable text that gets published, re-checked on every save."""
    return [listing.title, listing.summary, listing.description, listing.caption]


@dataclass(frozen=True)
class PipelineResult:
    listing: Listing
    # Kept so later edits can re-run the rules without another model call.
    llm_flags: list[GuardrailFlag]


def _snippet(text: str, limit: int = 60) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


__all__ = ["DropInput", "ErrorCode", "PipelineError", "PipelineResult", "RunConfig", "run_pipeline"]
