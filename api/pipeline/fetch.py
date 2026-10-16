"""Public video links → a local mp4 plus the post's caption, via yt-dlp."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from pipeline.errors import ErrorCode, PipelineError

LinkSource = Literal["instagram", "tiktok", "youtube"]

_HOSTS: dict[str, LinkSource] = {
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "tiktok.com": "tiktok",
    "instagram.com": "instagram",
}

# ≤720p mp4 keeps downloads small; fall back to whatever single file exists.
_FORMAT = (
    "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b"
)

CAPTION_LIMIT = 1000


@dataclass(frozen=True)
class Fetched:
    path: Path
    caption: str | None


def detect_source(url: str) -> LinkSource:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise PipelineError(ErrorCode.LINK_UNSUPPORTED, "not an http(s) link")
    host = parsed.hostname.lower().removeprefix("www.").removeprefix("m.").removeprefix("vm.")
    for domain, source in _HOSTS.items():
        if host == domain or host.endswith("." + domain):
            return source
    raise PipelineError(ErrorCode.LINK_UNSUPPORTED, host)


def classify_error(message: str) -> ErrorCode:
    """Map yt-dlp's free-text errors to codes the UI can explain."""
    m = message.lower()
    if "private" in m:
        return ErrorCode.VIDEO_PRIVATE
    if any(
        s in m
        for s in ("sign in", "log in", "login", "cookies", "confirm you", "rate-limit", "403")
    ):
        return ErrorCode.FETCH_BLOCKED
    return ErrorCode.VIDEO_UNAVAILABLE


def caption_from_info(info: dict[str, Any]) -> str | None:
    parts = [str(info[k]).strip() for k in ("title", "description") if info.get(k)]
    # Shorts often repeat the title as the description.
    unique = list(dict.fromkeys(p for p in parts if p))
    text = "\n\n".join(unique)
    return text[:CAPTION_LIMIT] or None


def fetch(url: str, dest_dir: Path, max_seconds: int) -> Fetched:
    """Blocking: call through run_in_threadpool."""
    from yt_dlp import YoutubeDL  # type: ignore[import-untyped]
    from yt_dlp.utils import DownloadError  # type: ignore[import-untyped]

    dest_dir.mkdir(parents=True, exist_ok=True)
    options: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "format": _FORMAT,
        "merge_output_format": "mp4",
        "outtmpl": str(dest_dir / "source.%(ext)s"),
        "socket_timeout": 20,
        # YouTube now needs a JS challenge solver (yt-dlp-ejs) run by a JS runtime.
        # Node ships with the web toolchain; Deno is yt-dlp's default if present.
        "js_runtimes": {"deno": {}, "node": {}},
        "retries": 2,
    }
    try:
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                raise PipelineError(ErrorCode.VIDEO_UNAVAILABLE, "no metadata")
            if info.get("is_live"):
                raise PipelineError(ErrorCode.VIDEO_UNAVAILABLE, "live streams aren't supported")
            duration = info.get("duration")
            # Reject before downloading; probe re-checks the real file afterwards.
            if duration and duration > max_seconds:
                raise PipelineError(ErrorCode.VIDEO_TOO_LONG, f"{duration:.0f}s > {max_seconds}s")
            info = ydl.process_ie_result(info, download=True)
    except DownloadError as exc:
        raise PipelineError(classify_error(str(exc)), str(exc)[:200]) from exc

    files = sorted(p for p in dest_dir.glob("source.*") if p.suffix not in (".part", ".ytdl"))
    if not files:
        raise PipelineError(ErrorCode.VIDEO_UNAVAILABLE, "download produced no file")
    return Fetched(path=files[0], caption=caption_from_info(info))
