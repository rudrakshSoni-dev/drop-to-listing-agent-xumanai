"""SQLite persistence via SQLModel. Listings are stored as validated JSON blobs."""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy import Engine, inspect, text
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
    frames_json: str | None = None
    thumbnail: str | None = None
    client_ip: str | None = None
    created_at: datetime = Field(default_factory=_now)


class ListingRow(SQLModel, table=True):
    id: str = Field(primary_key=True)  # same id as its Drop
    data: str
    # Grounded LLM safety flags (JSON list), so saves re-run rules without a model call.
    llm_flags_json: str | None = None
    updated_at: datetime = Field(default_factory=_now)


class Booking(SQLModel, table=True):
    """A mock booking. The book route rejects a second booking for the same start time."""

    id: str = Field(primary_key=True)
    listing_id: str = Field(index=True)
    starts_at: datetime
    ends_at: datetime
    created_at: datetime = Field(default_factory=_now)


_engine: Engine | None = None


def init_db(url: str) -> None:
    global _engine
    _engine = create_engine(url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(_engine)
    _add_missing_columns(_engine)


def _add_missing_columns(engine: Engine) -> None:
    """create_all() never alters existing tables; add new nullable columns in place."""
    existing = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            have = {c["name"] for c in existing.get_columns(table.name)}
            for column in table.columns:
                if column.name not in have and column.nullable:
                    ddl = column.type.compile(engine.dialect)
                    sql = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {ddl}'
                    conn.execute(text(sql))


@contextmanager
def session() -> Iterator[Session]:
    assert _engine is not None, "init_db() not called"
    with Session(_engine, expire_on_commit=False) as s:
        yield s
