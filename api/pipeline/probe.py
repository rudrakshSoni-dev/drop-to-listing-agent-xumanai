"""ffprobe wrapper: duration, dimensions and whether the file has audio."""

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

from pipeline.errors import ErrorCode, PipelineError


@dataclass(frozen=True)
class MediaInfo:
    duration_s: float
    width: int | None
    height: int | None
    has_audio: bool


def probe(path: Path) -> MediaInfo:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise PipelineError(ErrorCode.VIDEO_UNREADABLE, result.stderr.strip()[:200])
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise PipelineError(ErrorCode.VIDEO_UNREADABLE, "no video stream")
    try:
        duration = float(data["format"]["duration"])
    except (KeyError, ValueError) as exc:
        raise PipelineError(ErrorCode.VIDEO_UNREADABLE, "unknown duration") from exc
    return MediaInfo(
        duration_s=round(duration, 2),
        width=video.get("width"),
        height=video.get("height"),
        has_audio=any(s.get("codec_type") == "audio" for s in streams),
    )


def check_duration(info: MediaInfo, max_seconds: int) -> None:
    if info.duration_s > max_seconds:
        raise PipelineError(
            ErrorCode.VIDEO_TOO_LONG, f"{info.duration_s:.0f}s exceeds {max_seconds}s"
        )
