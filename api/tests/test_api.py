import json
import shutil
from dataclasses import replace
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
