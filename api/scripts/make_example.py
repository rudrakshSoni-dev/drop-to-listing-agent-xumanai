"""Record one real pipeline run as a replayable example (api/seed/<slug>/).

    cd api && .venv/bin/python scripts/make_example.py SLUG "Chip label" URL

Stores the listing, the SSE timeline and the key frames (small JPEGs, the only
media in git; see CLAUDE.md). The source video is not stored: examples play it
from the platform's own embed.
"""

import asyncio
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from pipeline import fetch  # noqa: E402
from pipeline.llm import LLM, CachedLLM, GeminiLLM, GroqLLM  # noqa: E402
from pipeline.run import DropInput, RunConfig, run_pipeline  # noqa: E402

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"


async def main(slug: str, label: str, url: str) -> None:
    if settings.llm_provider == "groq":
        underlying: LLM = GroqLLM(settings.groq_api_key, settings.llm_models)
    else:
        underlying = GeminiLLM(
            settings.gemini_api_key, settings.llm_models, settings.llm_thinking_budget
        )
    llm = CachedLLM(
        underlying,
        settings.llm_cache_dir,
    )
    events: list[dict[str, Any]] = []
    loop = asyncio.get_running_loop()
    started = loop.time()

    async def emit(event: dict[str, Any]) -> None:
        events.append({**event, "t": round((loop.time() - started) * 1000)})

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        drop = DropInput(
            drop_id=slug,
            video_path=None,
            work_dir=work,
            source_type=fetch.detect_source(url),
            source_url=url,
            caption=None,
        )
        config = RunConfig(
            max_video_seconds=settings.max_video_seconds,
            transcribe_backend=settings.transcribe_backend,
            whisper_model=settings.whisper_model,
        )
        result = await run_pipeline(drop, llm, config, emit)

        out = SEED_DIR / slug
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        frames = next(e for e in events if e["kind"] == "frames")
        for frame in frames["frames"]:
            shutil.copy(work / frame["file"], out / frame["file"])

    media = next(e for e in events if e["kind"] == "media")
    meta = {
        "slug": slug,
        "label": label,
        "source_type": drop.source_type,
        "source_url": url,
        "caption": media.get("caption"),
        "duration_s": media["duration_s"],
        "width": media["width"],
        "height": media["height"],
        "frames": frames["frames"],
        "thumbnail": frames["thumbnail"],
    }
    # The replayed media event has no local video file.
    timeline = [
        {k: v for k, v in e.items() if k not in ("file", "media_url")} for e in events
    ]
    (out / "meta.json").write_text(json.dumps(meta, indent=1) + "\n")
    (out / "events.json").write_text(json.dumps(timeline, indent=1) + "\n")
    (out / "listing.json").write_text(result.listing.model_dump_json(indent=1) + "\n")
    (out / "llm_flags.json").write_text(
        json.dumps([f.model_dump() for f in result.llm_flags], indent=1) + "\n"
    )
    print(f"wrote {out}: {result.listing.title} | {result.listing.guardrails.status}")


if __name__ == "__main__":
    asyncio.run(main(*sys.argv[1:4]))
