"""Mock instant-book: validates a requested slot against the listing. No payments."""

from datetime import date, datetime, timedelta

from app.errors import ApiError
from app.schema_gen import Listing

BOOKING_WINDOW_DAYS = 14


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def validate_slot(
    listing: Listing, day: date, start: str, today: date
) -> tuple[datetime, datetime]:
    """Return (starts_at, ends_at) in the Guide's local time, or raise a typed ApiError."""
    if listing.guardrails.status == "block":
        raise ApiError(
            409, "LISTING_BLOCKED", "This listing needs a safety review before it can be booked."
        )
    if not listing.availability:
        raise ApiError(422, "NO_AVAILABILITY", "This Guide hasn't set availability yet.")
    if not today <= day < today + timedelta(days=BOOKING_WINDOW_DAYS):
        raise ApiError(422, "SLOT_UNAVAILABLE", "Pick a day in the next two weeks.")
    slot = next(
        (s for s in listing.availability if s.weekday == day.weekday() and s.start == start), None
    )
    if slot is None:
        raise ApiError(422, "SLOT_UNAVAILABLE", "That time isn't in the Guide's availability.")
    starts_at = datetime.combine(day, datetime.min.time()) + timedelta(minutes=_minutes(start))
    return starts_at, starts_at + timedelta(minutes=listing.session.duration_min)
