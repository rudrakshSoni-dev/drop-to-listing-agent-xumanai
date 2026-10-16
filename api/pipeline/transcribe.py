"""Speech → timestamped transcript. Gemini audio by default; faster-whisper locally."""

import subprocess
from pathlib import Path

from pydantic import BaseModel, ValidationError

from app.schema_gen import TranscriptLine
from pipeline import prompts
from pipeline.errors import ErrorCode, PipelineError
from pipeline.llm import LLM, Media


class _Segment(BaseModel):
    start: float
    end: float
    text: str


class TranscriptResult(BaseModel):
    segments: list[_Segment]


def extract_audio(video: Path, out: Path) -> Path:
    """Downmix to 16 kHz mono mp3: small enough to send inline to the model."""
    cmd = [
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-i",
        str(video),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "32k",
        str(out),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise PipelineError(ErrorCode.TRANSCRIBE_FAIL, result.stderr.strip()[:200])
    return out


def clean_segments(segments: list[_Segment], duration_s: float) -> list[TranscriptLine]:
    """Drop empty lines, clamp to the clip, and keep timestamps monotonic."""
    lines: list[TranscriptLine] = []
    for seg in sorted(segments, key=lambda s: s.start):
        text = " ".join(seg.text.split())
        if not text:
            continue
        start = min(max(seg.start, 0.0), duration_s)
        end = min(max(seg.end, start), duration_s)
        lines.append(TranscriptLine(start=round(start, 2), end=round(end, 2), text=text))
    return lines


async def transcribe_gemini(audio: Path, duration_s: float, llm: LLM) -> list[TranscriptLine]:
    prompt = prompts.render("transcribe_v1", duration=f"{duration_s:.1f}")
    raw = await llm.generate_json(
        prompt=prompt,
        schema=TranscriptResult,
        media=[Media(data=audio.read_bytes(), mime_type="audio/mp3")],
    )
    try:
        result = TranscriptResult.model_validate_json(raw)
    except ValidationError as exc:
        raise PipelineError(ErrorCode.TRANSCRIBE_FAIL, "unparseable transcript") from exc
    return clean_segments(result.segments, duration_s)


def transcribe_whisper(audio: Path, duration_s: float) -> list[TranscriptLine]:
    try:
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]
    except ImportError as exc:
        raise PipelineError(
            ErrorCode.TRANSCRIBE_FAIL,
            "TRANSCRIBE_BACKEND=whisper needs `pip install faster-whisper`",
        ) from exc
    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(str(audio), vad_filter=True)
    parsed = [_Segment(start=s.start, end=s.end, text=s.text) for s in segments]
    return clean_segments(parsed, duration_s)
