"""SQLite persistence via SQLModel. Listings are stored as validated JSON blobs."""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy import Engine
from sqlmodel import Field, Session, SQLModel, create_engine


def _now() -> datetime:
    return datetime.now(UTC)


class Drop(SQLModel, table=True):
    id: str = Field(primary_key=True)
    status: str = "running"  # running | done | error
    error_code: str | None = None
    source_type: str
    source_url: str | None = None
    caption: str | None = None
    media_file: str | None = None
    duration_s: float | None = None
    width: int | None = None
    height: int | None = None
    transcript_json: str | None = None
    created_at: datetime = Field(default_factory=_now)


class ListingRow(SQLModel, table=True):
    id: str = Field(primary_key=True)  # same id as its Drop
    data: str
    updated_at: datetime = Field(default_factory=_now)


_engine: Engine | None = None


def init_db(url: str) -> None:
    global _engine
    _engine = create_engine(url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(_engine)


@contextmanager
def session() -> Iterator[Session]:
    assert _engine is not None, "init_db() not called"
    with Session(_engine, expire_on_commit=False) as s:
        yield s
