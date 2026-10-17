"""Pre-processed examples: recorded pipeline runs replayed into a fresh drop.

They keep the demo working when the free-tier quota is spent, cost no model
requests, and each visitor gets their own editable copy.
"""

import asyncio
import json
import shutil
import uuid
from datetime import UTC, datetime
from functools import cache
from pathlib import Path
from typing import Any

from app import db
from app.config import settings
from app.events import bus
from app.schema_gen import Listing

SEED_DIR = Path(__file__).resolve().parent.parent / "seed"
# Replays are sped up so an example finishes in a few seconds, not the original 30.
MAX_REPLAY_S = 8.0

_tasks: set[asyncio.Task[None]] = set()


@cache
def seeds() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for meta_path in sorted(SEED_DIR.glob("*/meta.json")):
        meta = json.loads(meta_path.read_text())
        listing = json.loads((meta_path.parent / "listing.json").read_text())
        out[meta["slug"]] = {**meta, "title": listing["title"], "dir": meta_path.parent}
    return dict(sorted(out.items(), key=lambda kv: kv[1].get("order", 99)))


def list_examples() -> list[dict[str, Any]]:
    return [
        {
            "slug": s["slug"],
            "label": s["label"],
            "title": s["title"],
            "source_type": s["source_type"],
        }
        for s in seeds().values()
    ]


def create(slug: str) -> str:
    """Clone a seed into a new drop and start replaying its timeline."""
    seed = seeds()[slug]
    drop_id = uuid.uuid4().hex[:12]
    media = settings.media_dir / drop_id
    media.mkdir(parents=True, exist_ok=True)
    for frame in seed["frames"]:
        shutil.copy(seed["dir"] / frame["file"], media / frame["file"])
    with db.session() as s:
        s.add(
            db.Drop(
                id=drop_id,
                source_type=seed["source_type"],
                source_url=seed["source_url"],
                caption=seed["caption"],
                example=slug,
            )
        )
        s.commit()
    bus.reset(drop_id)
    task = asyncio.create_task(_replay(drop_id, seed))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return drop_id


async def _replay(drop_id: str, seed: dict[str, Any]) -> None:
    from app.runner import finish, persist_and_publish

    events: list[dict[str, Any]] = json.loads((seed["dir"] / "events.json").read_text())
    total_ms = max((e["t"] for e in events), default=0) or 1
    speed = max(1.0, total_ms / 1000 / MAX_REPLAY_S)
    last = 0
    for event in events:
        await asyncio.sleep(max(0, event["t"] - last) / 1000 / speed)
        last = event["t"]
        body = {k: v for k, v in event.items() if k != "t"}
        if body["kind"] == "media":
            body = {**body, "file": None}
        await persist_and_publish(drop_id, body)

    listing = Listing.model_validate_json((seed["dir"] / "listing.json").read_text())
    listing = listing.model_copy(update={"id": drop_id, "created_at": datetime.now(UTC)})
    with db.session() as s:
        s.add(
            db.ListingRow(
                id=drop_id,
                data=listing.model_dump_json(),
                llm_flags_json=(seed["dir"] / "llm_flags.json").read_text(),
            )
        )
        s.commit()
    finish(drop_id, "done")
    await bus.publish(drop_id, {"kind": "done", "listing_id": drop_id})
