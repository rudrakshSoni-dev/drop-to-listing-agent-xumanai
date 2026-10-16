import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import db
from app.config import settings
from app.errors import ApiError, api_error_handler
from app.routes import drops, listings

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    db.init_db(settings.db_url)
    yield


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
