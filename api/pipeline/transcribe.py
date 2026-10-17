"""Speech → timestamped transcript. Local faster-whisper by default; Gemini audio opt-in."""

import re
import subprocess
import threading
from pathlib import Path
from typing import Any

import numpy as np
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


async def transcribe_groq(
    audio: Path,
    duration_s: float,
    api_key: str,
    base_url: str = "https://api.groq.com/openai/v1",
) -> list[TranscriptLine]:
    import httpx

    hint = prompts.render("whisper_hint_v1")
    url = f"{base_url}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {api_key}"}
    data = {
        "model": "whisper-large-v3-turbo",
        "response_format": "verbose_json",
        "prompt": hint,
    }
    files = {"file": (audio.name, audio.read_bytes(), "audio/mp3")}
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(url, headers=headers, data=data, files=files)
        except httpx.RequestError as exc:
                raise PipelineError(
                    ErrorCode.TRANSCRIBE_FAIL, f"Groq Whisper network error: {exc}"
                ) from exc

    if resp.status_code != 200:
        raise PipelineError(
            ErrorCode.TRANSCRIBE_FAIL,
            f"Groq Whisper error {resp.status_code}: {resp.text[:200]}",
        )

    try:
        payload = resp.json()
    except Exception as exc:
        raise PipelineError(ErrorCode.TRANSCRIBE_FAIL, "Invalid JSON from Groq Whisper") from exc

    raw_segments = payload.get("segments", [])
    parsed = [
        _Segment(start=float(s["start"]), end=float(s["end"]), text=str(s["text"]))
        for s in raw_segments
    ]
    return clean_segments(drop_hint_echoes(parsed, hint), duration_s)


_whisper_models: dict[str, Any] = {}
_whisper_lock = threading.Lock()


def _whisper(model_name: str) -> Any:
    """Load once per process; the first call downloads the weights (~250 MB for small.en)."""
    with _whisper_lock:
        if model_name not in _whisper_models:
            try:
                from faster_whisper import WhisperModel  # type: ignore[import-untyped]
            except ImportError as exc:
                raise PipelineError(
                    ErrorCode.TRANSCRIBE_FAIL,
                    "TRANSCRIBE_BACKEND=whisper needs `pip install faster-whisper`",
                ) from exc
            _whisper_models[model_name] = WhisperModel(
                model_name, device="cpu", compute_type="int8"
            )
        return _whisper_models[model_name]


def preload_whisper(model_name: str) -> None:
    """Warm the model at startup so the first drop doesn't pay the load (or download)."""
    _whisper(model_name)


def decode_pcm(audio: Path) -> "np.ndarray[Any, np.dtype[np.float32]]":
    """16 kHz mono float32 via ffmpeg (avoids faster-whisper's PyAV decoder)."""
    cmd = [
        "ffmpeg", "-v", "error", "-i", str(audio),
        "-f", "s16le", "-ac", "1", "-ar", "16000", "-",
    ]  # fmt: skip
    result = subprocess.run(cmd, capture_output=True, timeout=120)
    if result.returncode != 0:
        raise PipelineError(ErrorCode.TRANSCRIBE_FAIL, result.stderr.decode()[:200])
    return np.frombuffer(result.stdout, np.int16).astype(np.float32) / 32768.0


def transcribe_whisper(
    audio: Path, duration_s: float, model_name: str = "small.en"
) -> list[TranscriptLine]:
    """Local, free, and no quota. The hint primes vocabulary like "one-on-one"."""
    model = _whisper(model_name)
    hint = prompts.render("whisper_hint_v1")
    segments, _ = model.transcribe(decode_pcm(audio), vad_filter=True, initial_prompt=hint)
    parsed = [_Segment(start=s.start, end=s.end, text=s.text) for s in segments]
    return clean_segments(drop_hint_echoes(parsed, hint), duration_s)


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", text.lower())


def drop_hint_echoes(segments: list[_Segment], hint: str) -> list[_Segment]:
    """On music-only audio Whisper can "hear" its own prompt. Drop segments that are
    mostly words from the hint, so they never reach the model as fake speech."""
    hint_words = set(_words(hint))
    kept = []
    for seg in segments:
        words = _words(seg.text)
        if words and sum(w in hint_words for w in words) / len(words) >= 0.8 and len(words) >= 4:
            continue
        kept.append(seg)
    return kept
