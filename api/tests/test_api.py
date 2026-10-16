import json
from pathlib import Path

import httpx


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


async def test_rejects_links_and_bad_uploads(client: httpx.AsyncClient) -> None:
    link = await client.post("/api/drops", json={"url": "https://youtu.be/x"})
    assert link.json()["error"]["code"] == "LINKS_NOT_ENABLED"
    txt = await client.post("/api/drops", files={"file": ("notes.txt", b"hi")})
    assert txt.json()["error"]["code"] == "UPLOAD_INVALID"
