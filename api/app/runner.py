"""Runs the pipeline for one drop as an in-process background task and persists results."""

import asyncio
import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal, cast

from app import db
from app.config import settings
from app.events import bus
from pipeline.errors import ErrorCode, PipelineError
from pipeline.llm import LLM, LazyLLM
from pipeline.run import DropInput, RunConfig, run_pipeline

log = logging.getLogger(__name__)
_tasks: set[asyncio.Task[None]] = set()

SourceType = Literal["instagram", "tiktok", "youtube", "upload"]


def start(drop_id: str, llm_factory: Callable[[], LLM]) -> None:
    bus.reset(drop_id)
    task = asyncio.create_task(_run(drop_id, llm_factory))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def persist_and_publish(drop_id: str, event: dict[str, Any]) -> None:
    if event["kind"] == "media":
        with db.session() as s:
            drop = s.get(db.Drop, drop_id)
            if drop:
                drop.duration_s = event["duration_s"]
                drop.width, drop.height = event["width"], event["height"]
                drop.media_file = event.get("file")
                drop.caption = drop.caption or event.get("caption")
                s.add(drop)
                s.commit()
        media_url = f"/api/media/{drop_id}/{event['file']}" if event.get("file") else None
        event = {**event, "media_url": media_url}
    elif event["kind"] == "frames":
        with db.session() as s:
            drop = s.get(db.Drop, drop_id)
            if drop:
                drop.frames_json = json.dumps(event["frames"])
                drop.thumbnail = event["thumbnail"]
                s.add(drop)
                s.commit()
    elif event["kind"] == "transcript":
        with db.session() as s:
            drop = s.get(db.Drop, drop_id)
            if drop:
                drop.transcript_json = json.dumps(event["lines"])
                s.add(drop)
                s.commit()
    await bus.publish(drop_id, event)


def finish(drop_id: str, status: str, error_code: str | None = None) -> None:
    with db.session() as s:
        drop = s.get(db.Drop, drop_id)
        if drop:
            drop.status, drop.error_code = status, error_code
            s.add(drop)
            s.commit()


async def _run(drop_id: str, llm_factory: Callable[[], LLM]) -> None:
    with db.session() as s:
        drop = s.get(db.Drop, drop_id)
        if drop is None or (drop.media_file is None and drop.source_url is None):
            return
        work_dir = settings.media_dir / drop_id
        drop_input = DropInput(
            drop_id=drop_id,
            video_path=work_dir / drop.media_file if drop.media_file else None,
            work_dir=work_dir,
            source_type=cast(SourceType, drop.source_type),
            source_url=drop.source_url,
            caption=drop.caption,
        )
    config = RunConfig(
        max_video_seconds=settings.max_video_seconds,
        transcribe_backend=settings.transcribe_backend,
        whisper_model=settings.whisper_model,
    )

    current_stage: str | None = None

    async def emit(event: dict[str, Any]) -> None:
        nonlocal current_stage
        if event["kind"] == "stage":
            current_stage = event["stage"]
        await persist_and_publish(drop_id, event)

    try:
        result = await run_pipeline(drop_input, LazyLLM(llm_factory), config, emit)
    except PipelineError as exc:
        log.warning("drop %s failed: %s", drop_id, exc)
        finish(drop_id, "error", exc.code)
        await bus.publish(drop_id, {"kind": "error", "code": exc.code, "stage": current_stage})
        return
    except Exception:
        log.exception("drop %s crashed", drop_id)
        finish(drop_id, "error", ErrorCode.INTERNAL)
        await bus.publish(
            drop_id, {"kind": "error", "code": ErrorCode.INTERNAL, "stage": current_stage}
        )
        return

    with db.session() as s:
        row = s.get(db.ListingRow, drop_id) or db.ListingRow(id=drop_id, data="")
        row.data = result.listing.model_dump_json()
        row.llm_flags_json = json.dumps([f.model_dump() for f in result.llm_flags])
        s.add(row)
        s.commit()
    finish(drop_id, "done")
    await bus.publish(drop_id, {"kind": "done", "listing_id": drop_id})


def media_path(drop_id: str, filename: str) -> Path:
    return settings.media_dir / drop_id / filename
