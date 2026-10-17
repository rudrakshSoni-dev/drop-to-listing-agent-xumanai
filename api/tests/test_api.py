import json
import shutil
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import httpx
import pytest

from app import runner
from app.config import settings
from app.routes import drops
from pipeline import fetch


async def _events(client: httpx.AsyncClient, drop_id: str) -> list[dict[str, object]]:
    events = []
    async with client.stream("GET", f"/api/drops/{drop_id}/events") as resp:
        async for line in resp.aiter_lines():
            if line.startswith("data:"):
                events.append(json.loads(line.removeprefix("data:").strip()))
    return events


async def test_upload_to_listing_end_to_end(client: httpx.AsyncClient, sample_video: Path) -> None:
    with sample_video.open("rb") as f:
        resp = await client.post("/api/drops", files={"file": ("clip.mp4", f, "video/mp4")})
    assert resp.status_code == 201
    drop_id = resp.json()["drop_id"]

    events = await _events(client, drop_id)
    stages = [e["stage"] for e in events if e["kind"] == "stage"]
    assert stages == ["fetching", "transcribing", "extracting_frames", "analyzing", "guardrails"]
    assert events[-1] == {**events[-1], "kind": "done", "listing_id": drop_id}
    transcript = next(e for e in events if e["kind"] == "transcript")
    assert len(transcript["lines"]) == 6  # type: ignore[arg-type]

    listing = (await client.get(f"/api/listings/{drop_id}")).json()
    assert listing["category"] == "academic_tutoring"
    assert listing["source"]["type"] == "upload" and listing["source"]["duration_s"] > 3
    assert listing["session"]["price_band"] == {"min": 30, "max": 55, "currency": "USD"}
    assert listing["missing_fields"] == ["availability"]

    drop = (await client.get(f"/api/drops/{drop_id}")).json()
    assert drop["status"] == "done" and drop["width"] == 320 and drop["height"] == 568

    vtt = await client.get(f"/api/drops/{drop_id}/captions.vtt")
    assert vtt.text.startswith("WEBVTT") and "fractions" in vtt.text

    # Reconnecting after completion replays the full history.
    replay = await _events(client, drop_id)
    assert replay[-1]["kind"] == "done"


async def test_patch_listing_updates_and_clears_missing(
    client: httpx.AsyncClient, sample_video: Path
) -> None:
    with sample_video.open("rb") as f:
        drop_id = (await client.post("/api/drops", files={"file": ("a.mp4", f)})).json()["drop_id"]
    await _events(client, drop_id)

    slots = [{"weekday": 2, "start": "16:00", "end": "17:00"}]
    resp = await client.patch(
        f"/api/listings/{drop_id}", json={"title": "New title", "availability": slots}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "New title" and body["missing_fields"] == []

    bad = await client.patch(f"/api/listings/{drop_id}", json={"title": "x" * 61})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "LISTING_INVALID"
    locked = await client.patch(f"/api/listings/{drop_id}", json={"guardrails": {}})
    assert locked.json()["error"]["code"] == "FIELD_NOT_EDITABLE"

    items = (await client.get("/api/listings")).json()["items"]
    assert any(i["id"] == drop_id and "transcript" not in i for i in items)


async def test_link_drop_fetches_then_runs_the_pipeline(
    client: httpx.AsyncClient, sample_video: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_fetch(url: str, dest_dir: Path, max_seconds: int) -> fetch.Fetched:
        dest_dir.mkdir(parents=True, exist_ok=True)
        out = dest_dir / "source.mp4"
        shutil.copy(sample_video, out)
        return fetch.Fetched(path=out, caption="Algebra help for teens")

    monkeypatch.setattr(fetch, "fetch", fake_fetch)
    resp = await client.post("/api/drops", json={"url": "https://www.youtube.com/shorts/abc"})
    assert resp.status_code == 201
    drop_id = resp.json()["drop_id"]

    events = await _events(client, drop_id)
    assert events[-1]["kind"] == "done"
    media = next(e for e in events if e["kind"] == "media")
    assert media["media_url"] == f"/api/media/{drop_id}/source.mp4"
    frames = next(e for e in events if e["kind"] == "frames")
    assert 4 <= len(frames["frames"]) <= 6 and frames["thumbnail"]  # type: ignore[arg-type]

    drop = (await client.get(f"/api/drops/{drop_id}")).json()
    assert drop["source"] == {"type": "youtube", "url": "https://www.youtube.com/shorts/abc"}
    assert drop["thumbnail"] == frames["thumbnail"] and len(drop["frames"]) == len(
        frames["frames"]  # type: ignore[arg-type]
    )
    listing = (await client.get(f"/api/listings/{drop_id}")).json()
    assert listing["thumbnail_frame"] == frames["thumbnail"]
    assert listing["source"]["type"] == "youtube"
    thumb = await client.get(f"/api/media/{drop_id}/{frames['thumbnail']}")
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/jpeg"


async def test_daily_limit_per_ip(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(drops, "settings", replace(settings, demo_drops_per_ip=1))
    monkeypatch.setattr(runner, "start", lambda *_: None)
    headers = {"x-forwarded-for": "203.0.113.9"}
    body = {"url": "https://youtu.be/abc"}
    first = await client.post("/api/drops", json=body, headers=headers)
    second = await client.post("/api/drops", json=body, headers=headers)
    assert first.status_code == 201
    assert second.status_code == 429 and second.json()["error"]["code"] == "RATE_LIMITED"


async def test_rejects_unsupported_links_and_bad_uploads(client: httpx.AsyncClient) -> None:
    link = await client.post("/api/drops", json={"url": "https://vimeo.com/123"})
    assert link.json()["error"]["code"] == "LINK_UNSUPPORTED"
    txt = await client.post("/api/drops", files={"file": ("notes.txt", b"hi")})
    assert txt.json()["error"]["code"] == "UPLOAD_INVALID"


async def test_price_suggestion_matches_pipeline_table(client: httpx.AsyncClient) -> None:
    params = {"category": "academic_tutoring", "group": "one_on_one", "mode": "virtual"}
    ok = await client.get("/api/listings/price-suggestion", params={**params, "duration_min": 60})
    assert ok.json() == {"min": 30, "max": 55, "currency": "USD"}
    bad = await client.get(
        "/api/listings/price-suggestion", params={**params, "mode": "moon", "duration_min": 60}
    )
    assert bad.status_code == 422


async def test_editing_contact_details_out_of_the_copy_clears_that_flag(
    client: httpx.AsyncClient, sample_video: Path
) -> None:
    with sample_video.open("rb") as f:
        resp = await client.post("/api/drops", files={"file": ("clip.mp4", f, "video/mp4")})
    drop_id = resp.json()["drop_id"]
    await _events(client, drop_id)
    listing = (await client.get(f"/api/listings/{drop_id}")).json()
    assert listing["guardrails"] == {"status": "pass", "flags": []}

    added = await client.patch(
        f"/api/listings/{drop_id}", json={"caption": "WhatsApp me to book: +1 415 555 0134"}
    )
    assert added.json()["guardrails"]["status"] == "block"
    flag = added.json()["guardrails"]["flags"][0]
    assert flag["code"] == "OFF_PLATFORM_CONTACT" and flag["timestamp_s"] is None

    removed = await client.patch(f"/api/listings/{drop_id}", json={"caption": "Book a session!"})
    assert removed.json()["guardrails"] == {"status": "pass", "flags": []}


async def _ready_listing(client: httpx.AsyncClient, sample_video: Path) -> str:
    with sample_video.open("rb") as f:
        resp = await client.post("/api/drops", files={"file": ("clip.mp4", f, "video/mp4")})
    drop_id: str = resp.json()["drop_id"]
    await _events(client, drop_id)
    return drop_id


async def test_booking_validates_slots_and_blocks(
    client: httpx.AsyncClient, sample_video: Path
) -> None:
    listing_id = await _ready_listing(client, sample_video)
    day = date.today() + timedelta(days=2)
    book = f"/api/listings/{listing_id}/book"

    none_yet = await client.post(book, json={"date": day.isoformat(), "start": "16:00"})
    assert none_yet.json()["error"]["code"] == "NO_AVAILABILITY"

    slots = [{"weekday": day.weekday(), "start": "16:00", "end": "17:00"}]
    await client.patch(f"/api/listings/{listing_id}", json={"availability": slots})
    ok = await client.post(book, json={"date": day.isoformat(), "start": "16:00"})
    assert ok.status_code == 201
    body = ok.json()
    assert body["starts_at"] == f"{day.isoformat()}T16:00"
    assert body["ends_at"] == f"{day.isoformat()}T17:00"  # 60-minute session
    assert body["confirmation_id"].startswith("bk_")

    again = await client.post(book, json={"date": day.isoformat(), "start": "16:00"})
    assert again.json()["error"]["code"] == "SLOT_TAKEN"
    wrong_time = await client.post(book, json={"date": day.isoformat(), "start": "09:00"})
    assert wrong_time.json()["error"]["code"] == "SLOT_UNAVAILABLE"
    too_far = (day + timedelta(days=21)).isoformat()
    far = await client.post(book, json={"date": too_far, "start": "16:00"})
    assert far.json()["error"]["code"] == "SLOT_UNAVAILABLE"

    await client.patch(f"/api/listings/{listing_id}", json={"caption": "DM me to book"})
    blocked = await client.post(
        book, json={"date": (day + timedelta(days=7)).isoformat(), "start": "16:00"}
    )
    assert blocked.status_code == 409
    assert blocked.json()["error"]["code"] == "LISTING_BLOCKED"


async def test_evals_endpoint_serves_results_or_a_typed_404(
    client: httpx.AsyncClient, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routes import evals

    monkeypatch.setattr(evals, "settings", replace(settings, evals_dir=tmp_path))
    missing = await client.get("/api/evals")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "EVALS_NOT_RUN"
    (tmp_path / "results.json").write_text('{"meta": {}, "metrics": {}, "rows": []}')
    (tmp_path / "notes.md").write_text("- Fails on silent videos.")
    ok = (await client.get("/api/evals")).json()
    assert ok["results"]["rows"] == [] and ok["notes_md"].startswith("- Fails")


async def test_example_drop_replays_a_recorded_run(
    client: httpx.AsyncClient, sample_video: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app import examples

    # Record a seed from an ordinary (fixture) run.
    source_id = await _ready_listing(client, sample_video)
    recorded = await _events(client, source_id)
    seed = tmp_path / "math"
    seed.mkdir()
    frames = next(e for e in recorded if e["kind"] == "frames")
    for frame in frames["frames"]:  # type: ignore[attr-defined]
        shutil.copy(settings.media_dir / source_id / frame["file"], seed / frame["file"])
    listing = (await client.get(f"/api/listings/{source_id}")).json()
    (seed / "listing.json").write_text(json.dumps(listing))
    (seed / "llm_flags.json").write_text("[]")
    (seed / "events.json").write_text(
        json.dumps([e for e in recorded if e["kind"] not in ("done",)])
    )
    (seed / "meta.json").write_text(json.dumps({
        "slug": "math", "label": "Math tutor", "source_type": "youtube",
        "source_url": "https://www.youtube.com/watch?v=abc", "caption": "Algebra help",
        "duration_s": 4, "width": 320, "height": 568,
        "frames": frames["frames"], "thumbnail": frames["thumbnail"],
    }))
    monkeypatch.setattr(examples, "SEED_DIR", tmp_path)
    examples.seeds.cache_clear()

    listed = (await client.get("/api/examples")).json()["items"]
    assert listed == [{"slug": "math", "label": "Math tutor", "title": listing["title"],
                       "source_type": "youtube"}]
    resp = await client.post("/api/drops", json={"example": "math"})
    drop_id = resp.json()["drop_id"]
    assert drop_id != source_id
    events = await _events(client, drop_id)
    assert [e["stage"] for e in events if e["kind"] == "stage"][0] == "fetching"
    assert events[-1]["kind"] == "done"
    assert next(e for e in events if e["kind"] == "media")["media_url"] is None

    copy = (await client.get(f"/api/listings/{drop_id}")).json()
    assert copy["id"] == drop_id and copy["title"] == listing["title"]
    drop = (await client.get(f"/api/drops/{drop_id}")).json()
    assert drop["example"] == "math" and drop["media_url"] is None
    thumb = await client.get(f"/api/media/{drop_id}/{frames['thumbnail']}")
    assert thumb.status_code == 200

    missing = await client.post("/api/drops", json={"example": "nope"})
    assert missing.status_code == 404
    bad = await client.post(
        "/api/drops", content=b"{not json", headers={"content-type": "application/json"}
    )
    assert bad.status_code == 422
    examples.seeds.cache_clear()
