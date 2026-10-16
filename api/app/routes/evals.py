import json
from typing import Any

from fastapi import APIRouter

from app.config import settings
from app.errors import ApiError

router = APIRouter(prefix="/api/evals", tags=["evals"])


@router.get("")
async def get_evals() -> dict[str, Any]:
    """The committed evals/results.json plus the hand-written notes. Never synthesized."""
    results_path = settings.evals_dir / "results.json"
    if not results_path.exists():
        raise ApiError(404, "EVALS_NOT_RUN", "No eval results yet. Run `make evals`.")
    notes_path = settings.evals_dir / "notes.md"
    return {
        "results": json.loads(results_path.read_text()),
        "notes_md": notes_path.read_text() if notes_path.exists() else None,
    }
