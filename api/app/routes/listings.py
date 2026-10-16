import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Query
from pydantic import ValidationError
from sqlmodel import col, select

from app import db
from app.errors import ApiError
from app.schema_gen import GuardrailFlag, Listing, PriceBand
from pipeline import confidence, guardrails, pricing
from pipeline.run import listing_copy

router = APIRouter(prefix="/api/listings", tags=["listings"])

# Fields a Guide can edit. Everything else is pipeline-owned.
EDITABLE = {
    "title",
    "summary",
    "description",
    "category",
    "subcategory",
    "age_range",
    "format",
    "session",
    "skills",
    "tags",
    "caption",
    "thumbnail_frame",
    "availability",
}


def _load(listing_id: str) -> Listing:
    with db.session() as s:
        row = s.get(db.ListingRow, listing_id)
    if row is None:
        raise ApiError(404, "NOT_FOUND", "No listing with that id.")
    return Listing.model_validate_json(row.data)


@router.get("/price-suggestion")
async def price_suggestion(
    category: str, group: str, mode: str, duration_min: int = Query(ge=15, le=240)
) -> PriceBand:
    """The same static heuristic the pipeline uses, for live updates in the editor."""
    if (
        category not in pricing.BASE_BANDS
        or group not in pricing.GROUP_FACTOR
        or mode not in pricing.MODE_FACTOR
    ):
        raise ApiError(422, "PRICE_INPUT_INVALID", "Unknown category, group or mode.")
    return pricing.suggest_price_band(category, group, mode, duration_min)


@router.get("")
async def list_listings() -> dict[str, list[dict[str, Any]]]:
    with db.session() as s:
        rows = s.exec(select(db.ListingRow).order_by(col(db.ListingRow.updated_at).desc())).all()
    items = [Listing.model_validate_json(r.data).model_dump(mode="json") for r in rows]
    for item in items:
        item.pop("transcript", None)
    return {"items": items}


@router.get("/{listing_id}")
async def get_listing(listing_id: str) -> dict[str, Any]:
    return _load(listing_id).model_dump(mode="json")


def apply_patch(listing: Listing, patch: dict[str, Any]) -> Listing:
    unknown = set(patch) - EDITABLE
    if unknown:
        raise ApiError(422, "FIELD_NOT_EDITABLE", f"Can't edit: {', '.join(sorted(unknown))}.")
    merged = {**listing.model_dump(mode="json"), **patch}
    if merged["format"]["group"] == "one_on_one":
        merged["format"]["max_group_size"] = None
    # A field the Guide filled in is no longer missing; availability is re-derived.
    merged["missing_fields"] = [
        f
        for f in confidence.missing_fields(listing.confidence, merged["availability"])
        if f == "availability" or (f in listing.missing_fields and f.split(".")[0] not in patch)
    ]
    try:
        return Listing.model_validate(merged)
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"])
        raise ApiError(422, "LISTING_INVALID", f"{where}: {first['msg']}") from exc


def recheck_guardrails(listing: Listing, row: db.ListingRow, post_caption: str | None) -> Listing:
    """Re-run the rules on the edited text; the video's own flags (and the LLM's) persist."""
    raw = json.loads(row.llm_flags_json) if row.llm_flags_json else []
    llm_flags = [GuardrailFlag.model_validate(f) for f in raw]
    listing.guardrails = guardrails.evaluate(
        listing.transcript, post_caption, listing_copy(listing), llm_flags
    )
    return listing


@router.patch("/{listing_id}")
async def patch_listing(listing_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    updated = apply_patch(_load(listing_id), patch)
    with db.session() as s:
        row = s.get(db.ListingRow, listing_id)
        assert row is not None
        drop = s.get(db.Drop, listing_id)
        updated = recheck_guardrails(updated, row, drop.caption if drop else None)
        row.data = updated.model_dump_json()
        row.updated_at = datetime.now(UTC)
        s.add(row)
        s.commit()
    return updated.model_dump(mode="json")
