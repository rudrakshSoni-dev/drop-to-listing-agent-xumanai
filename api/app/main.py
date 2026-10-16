import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import db
from app.config import settings
from app.errors import ApiError, api_error_handler
from app.routes import drops, listings
from pipeline import transcribe

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    db.init_db(settings.db_url)
    if settings.transcribe_backend == "whisper" and not settings.llm_fixture:
        # Off the event loop and not awaited: the API is usable while it loads.
        threading.Thread(
            target=_preload_whisper, name="whisper-preload", daemon=True
        ).start()
    yield


def _preload_whisper() -> None:
    try:
        transcribe.preload_whisper(settings.whisper_model)
    except Exception:
        logging.getLogger(__name__).exception("whisper preload failed; will retry on first drop")


app = FastAPI(title="Drop2List API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(ApiError, api_error_handler)
app.include_router(drops.router)
app.include_router(listings.router)

settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/media", StaticFiles(directory=settings.media_dir), name="media")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
