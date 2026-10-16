import json
import uuid
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sse_starlette.sse import EventSourceResponse
from starlette.datastructures import UploadFile

from app import db, runner
from app.config import settings
from app.errors import ApiError
from app.events import TERMINAL, bus
from app.schema_gen import TranscriptLine
from pipeline.errors import ErrorCode
from pipeline.llm import LLM, GeminiLLM

router = APIRouter(prefix="/api/drops", tags=["drops"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".m4v", ".webm"}


def get_llm_factory() -> Callable[[], LLM]:
    return lambda: GeminiLLM(settings.gemini_api_key, settings.llm_model)


LLMFactory = Annotated[Callable[[], LLM], Depends(get_llm_factory)]


def _get_drop(drop_id: str) -> db.Drop:
    with db.session() as s:
        drop = s.get(db.Drop, drop_id)
    if drop is None:
        raise ApiError(404, "NOT_FOUND", "No drop with that id.")
    return drop


async def _save_upload(upload: UploadFile, dest: Path) -> None:
    limit = settings.max_upload_mb * 1024 * 1024
    written = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as out:
        while chunk := await upload.read(1024 * 1024):
            written += len(chunk)
            if written > limit:
                out.close()
                dest.unlink(missing_ok=True)
                raise ApiError(413, ErrorCode.UPLOAD_INVALID, "File is too large.")
            out.write(chunk)


@router.post("", status_code=201)
async def create_drop(request: Request, llm_factory: LLMFactory) -> dict[str, str]:
    content_type = request.headers.get("content-type", "")
    if not content_type.startswith("multipart/form-data"):
        # Link ingestion (yt-dlp) lands in build step 4.
        raise ApiError(422, ErrorCode.LINKS_NOT_ENABLED, "Link import isn't enabled yet.")

    form = await request.form()
    upload = form.get("file")
    if not isinstance(upload, UploadFile) or not upload.filename:
        raise ApiError(422, ErrorCode.UPLOAD_INVALID, "Attach a video file.")
    ext = Path(upload.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ApiError(422, ErrorCode.UPLOAD_INVALID, "Upload an mp4, mov, m4v or webm file.")
    caption = form.get("caption")

    drop_id = uuid.uuid4().hex[:12]
    filename = f"source{ext}"
    await _save_upload(upload, settings.media_dir / drop_id / filename)
    with db.session() as s:
        s.add(
            db.Drop(
                id=drop_id,
                source_type="upload",
                media_file=filename,
                caption=caption if isinstance(caption, str) and caption.strip() else None,
            )
        )
        s.commit()
    runner.start(drop_id, llm_factory)
    return {"drop_id": drop_id}


@router.get("/{drop_id}")
async def get_drop(drop_id: str) -> dict[str, Any]:
    drop = _get_drop(drop_id)
    return {
        "id": drop.id,
        "status": drop.status,
        "error_code": drop.error_code,
        "source": {"type": drop.source_type, "url": drop.source_url},
        "media_url": f"/api/media/{drop.id}/{drop.media_file}" if drop.media_file else None,
        "duration_s": drop.duration_s,
        "width": drop.width,
        "height": drop.height,
        "transcript": json.loads(drop.transcript_json) if drop.transcript_json else None,
        "created_at": drop.created_at.isoformat(),
    }


def _synthesized_events(drop: db.Drop) -> list[dict[str, Any]]:
    """For drops not in memory (e.g. after a restart), describe the final state."""
    events: list[dict[str, Any]] = []
    if drop.transcript_json:
        events.append({"kind": "transcript", "lines": json.loads(drop.transcript_json)})
    if drop.status == "done":
        events.append({"kind": "done", "listing_id": drop.id})
    else:
        # A "running" drop with no live task was interrupted by a restart.
        events.append({"kind": "error", "code": drop.error_code or ErrorCode.INTERNAL})
    return [{**e, "seq": i, "t": 0, "replayed": True} for i, e in enumerate(events)]


@router.get("/{drop_id}/events")
async def drop_events(drop_id: str, request: Request) -> EventSourceResponse:
    drop = _get_drop(drop_id)

    async def stream() -> AsyncIterator[dict[str, str]]:
        if not bus.has(drop_id):
            for event in _synthesized_events(drop):
                yield {"data": json.dumps(event)}
            return
        history, queue = bus.subscribe(drop_id)
        try:
            for event in history:
                yield {"data": json.dumps(event)}
                if event["kind"] in TERMINAL:
                    return
            while not await request.is_disconnected():
                event = await queue.get()
                yield {"data": json.dumps(event)}
                if event["kind"] in TERMINAL:
                    return
        finally:
            bus.unsubscribe(drop_id, queue)

    return EventSourceResponse(stream(), ping=15)


@router.post("/{drop_id}/retry", status_code=202)
async def retry_drop(drop_id: str, llm_factory: LLMFactory) -> dict[str, str]:
    drop = _get_drop(drop_id)
    if drop.status != "error":
        raise ApiError(409, "NOT_RETRYABLE", "Only failed drops can be retried.")
    with db.session() as s:
        drop.status, drop.error_code, drop.transcript_json = "running", None, None
        s.add(drop)
        s.commit()
    runner.start(drop_id, llm_factory)
    return {"drop_id": drop_id}


def _vtt_time(seconds: float) -> str:
    ms = round(seconds * 1000)
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def to_webvtt(lines: list[TranscriptLine]) -> str:
    cues = [
        f"{_vtt_time(line.start)} --> {_vtt_time(max(line.end, line.start + 0.5))}\n{line.text}"
        for line in lines
    ]
    return "WEBVTT\n\n" + "\n\n".join(cues) + "\n"


@router.get("/{drop_id}/captions.vtt", response_class=PlainTextResponse)
async def captions(drop_id: str) -> PlainTextResponse:
    drop = _get_drop(drop_id)
    raw = json.loads(drop.transcript_json) if drop.transcript_json else []
    lines = [TranscriptLine.model_validate(line) for line in raw]
    return PlainTextResponse(to_webvtt(lines), media_type="text/vtt")
