"""Key frames via ffmpeg scene-change detection, plus a thumbnail pick."""

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from pipeline.errors import ErrorCode, PipelineError

SCENE_THRESHOLD = 0.3
TARGET_FRAMES = 5
MAX_FRAMES = 6
MIN_GAP_S = 1.5
FRAME_WIDTH = 480

_PTS = re.compile(r"pts_time:([0-9.]+)")


@dataclass(frozen=True)
class Frame:
    file: str
    t: float


@dataclass(frozen=True)
class FrameSet:
    frames: list[Frame]
    thumbnail: str | None


def choose_timestamps(scene_ts: list[float], duration_s: float) -> list[float]:
    """Spread picks across scene cuts; pad with evenly spaced moments if cuts are few."""
    if duration_s <= 0:
        return []
    # Short clips still get TARGET_FRAMES picks: the gap shrinks with the clip.
    gap = min(MIN_GAP_S, duration_s / (TARGET_FRAMES + 1))
    usable = [t for t in scene_ts if 0.3 <= t <= duration_s - 0.3]
    if len(usable) > MAX_FRAMES:
        step = len(usable) / MAX_FRAMES
        usable = [usable[int(i * step)] for i in range(MAX_FRAMES)]
    even = [duration_s * f for f in (0.1, 0.3, 0.5, 0.7, 0.9)]
    picks: list[float] = []
    for t in sorted(usable) + even:
        if len(picks) >= max(TARGET_FRAMES, min(len(usable), MAX_FRAMES)):
            break
        if all(abs(t - p) >= gap for p in picks):
            picks.append(round(t, 2))
    return sorted(picks)


def scene_changes(video: Path) -> list[float]:
    cmd = [
        "ffmpeg", "-v", "info", "-i", str(video),
        "-vf", f"select='gt(scene,{SCENE_THRESHOLD})',showinfo",
        "-an", "-f", "null", "-",
    ]  # fmt: skip
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return []
    return [float(m) for m in _PTS.findall(result.stderr)]


def grab(video: Path, t: float, out: Path) -> bool:
    cmd = [
        "ffmpeg", "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", str(video),
        "-frames:v", "1", "-vf", f"scale={FRAME_WIDTH}:-2", "-q:v", "4", str(out),
    ]  # fmt: skip
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    return result.returncode == 0 and out.exists() and out.stat().st_size > 0


def pick_thumbnail(frames: list[Frame], sizes: dict[str, int], duration_s: float) -> str | None:
    """Largest JPEG ≈ most detail (not black, not motion-blurred); prefer the first half."""
    if not frames:
        return None
    early = [f for f in frames if f.t <= duration_s / 2] or frames
    return max(early, key=lambda f: sizes.get(f.file, 0)).file


def extract_frames(video: Path, out_dir: Path, duration_s: float) -> FrameSet:
    """Blocking: call through run_in_threadpool."""
    try:
        timestamps = choose_timestamps(scene_changes(video), duration_s)
        frames: list[Frame] = []
        sizes: dict[str, int] = {}
        for i, t in enumerate(timestamps):
            name = f"frame_{i:02d}.jpg"
            if grab(video, t, out_dir / name):
                frames.append(Frame(file=name, t=t))
                sizes[name] = (out_dir / name).stat().st_size
    except subprocess.TimeoutExpired as exc:
        raise PipelineError(ErrorCode.VIDEO_UNREADABLE, "frame extraction timed out") from exc
    return FrameSet(frames=frames, thumbnail=pick_thumbnail(frames, sizes, duration_s))
