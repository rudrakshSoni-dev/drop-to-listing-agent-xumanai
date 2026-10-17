"""Run the real pipeline on evals/dataset.jsonl and write evals/results.json.

    make evals                      # every row; reuses finished rows (free)
    make evals ARGS="--fresh"       # re-run every row (LLM responses still cached)
    make evals ARGS="--only id1,id2"
    make evals ARGS="--only id1 --no-cache"   # re-time a row (one model request)

Each row downloads the public video, transcribes it locally and makes one Gemini
call (cached on disk). Per-row results are kept in api/data/eval_runs/, so a rerun
with the same prompt version costs no requests and gives identical metrics.
Media is never written to the repo.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "evals"))

import metrics  # noqa: E402

from app.config import settings  # noqa: E402
from pipeline import fetch  # noqa: E402
from pipeline.errors import PipelineError  # noqa: E402
from pipeline.extract import EXTRACT_PROMPT  # noqa: E402
from pipeline.llm import LLM, CachedLLM, GeminiLLM, GroqLLM  # noqa: E402
from pipeline.run import DropInput, RunConfig, run_pipeline  # noqa: E402

DATASET = ROOT / "evals" / "dataset.jsonl"
RESULTS = ROOT / "evals" / "results.json"
RUNS = settings.data_dir / "eval_runs"


def load_dataset(path: Path) -> list[dict[str, Any]]:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    ids = [r["id"] for r in rows]
    if len(ids) != len(set(ids)):
        raise SystemExit("dataset.jsonl has duplicate ids")
    return rows


async def run_row(row: dict[str, Any], llm: CachedLLM) -> dict[str, Any]:
    """One pipeline run; returns the stored record (prediction or error)."""
    calls_before = len(llm.calls)
    with tempfile.TemporaryDirectory(prefix="drop2list-eval-") as tmp:
        drop = DropInput(
            drop_id=row["id"],
            video_path=None,
            work_dir=Path(tmp),
            source_type=fetch.detect_source(row["url"]),
            source_url=row["url"],
            caption=None,
        )
        config = RunConfig(
            max_video_seconds=settings.max_video_seconds,
            transcribe_backend=settings.transcribe_backend,
            whisper_model=settings.whisper_model,
        )

        async def emit(_: dict[str, Any]) -> None:
            return None

        started = time.perf_counter()
        try:
            result = await run_pipeline(drop, llm, config, emit)
        except PipelineError as exc:
            return {"id": row["id"], "prompt": EXTRACT_PROMPT, "error": str(exc.code)}
        latency = time.perf_counter() - started

    calls = llm.calls[calls_before:]
    listing = result.listing
    return {
        "id": row["id"],
        "prompt": EXTRACT_PROMPT,
        "error": None,
        "latency_s": round(latency, 2),
        # Cached calls skip the model, so their latency isn't representative.
        "llm_cached": any(c.cached for c in calls),
        "model": next((c.model for c in calls if not c.cached), calls[0].model if calls else None),
        "tokens": sum((c.input_tokens or 0) + (c.output_tokens or 0) for c in calls if not c.cached)
        or None,
        "prediction": {
            "title": listing.title,
            "category": listing.category,
            "age_range": listing.age_range.model_dump(),
            "format": {"group": listing.format.group, "mode": listing.format.mode},
            "flags": [f.code for f in listing.guardrails.flags],
            "flag_evidence": [
                {"code": f.code, "evidence": f.evidence, "timestamp_s": f.timestamp_s}
                for f in listing.guardrails.flags
            ],
            "status": listing.guardrails.status,
        },
        "transcript_excerpt": " ".join(line.text for line in listing.transcript)[:280],
    }


def build_results(
    dataset: list[dict[str, Any]], records: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    def prediction(row_id: str) -> dict[str, Any] | None:
        rec = records.get(row_id)
        return None if rec is None or rec.get("error") else rec["prediction"]

    preds = [prediction(r["id"]) for r in dataset]
    timed = [rec for rec in records.values() if rec.get("latency_s") and not rec.get("llm_cached")]
    token_counts = [rec["tokens"] for rec in records.values() if rec.get("tokens")]
    summary = metrics.aggregate(dataset, preds, [rec["latency_s"] for rec in timed], token_counts)

    rows = []
    for label, pred in zip(dataset, preds, strict=True):
        rec = records.get(label["id"], {})
        rows.append(
            {
                "id": label["id"],
                "url": label["url"],
                "title": label.get("title"),
                "thumbnail": f"https://i.ytimg.com/vi/{label['id']}/default.jpg"
                if "youtube" in label["url"]
                else None,
                "expected": {
                    "category": label["category"],
                    "age_range": label.get("age_range"),
                    "format": label.get("format"),
                    "flags": label.get("expected_flags", []),
                },
                "predicted": pred,
                "score": metrics.score_row(label, pred),
                "error": rec.get("error"),
                "latency_s": rec.get("latency_s"),
                "transcript_excerpt": rec.get("transcript_excerpt"),
            }
        )

    # Free-tier rotation means one run can mix models; say how many rows each answered.
    rows_per_model = dict(
        Counter(rec["model"] for rec in records.values() if rec.get("model")).most_common()
    )
    return {
        "meta": {
            "run_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "dataset_size": len(dataset),
            "prompt": EXTRACT_PROMPT,
            "models": list(rows_per_model),
            "rows_per_model": rows_per_model,
            "transcribe_backend": settings.transcribe_backend,
            "whisper_model": settings.whisper_model,
            "latency_note": "Wall time per video on the machine that ran the evals (download, "
            "local transcription, frames, one model call); rows whose model answer came from "
            "cache are excluded.",
        },
        "metrics": summary,
        "rows": rows,
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--fresh", action="store_true", help="ignore stored per-row runs")
    parser.add_argument("--only", default="", help="comma-separated row ids")
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="call the model even when a cached answer exists (to re-time rows)",
    )
    args = parser.parse_args()

    dataset = load_dataset(args.dataset)
    only = {i for i in args.only.split(",") if i}
    if settings.llm_provider == "groq":
        underlying: LLM = GroqLLM(settings.groq_api_key, settings.llm_models)
    else:
        underlying = GeminiLLM(
            settings.gemini_api_key, settings.llm_models, settings.llm_thinking_budget
        )
    llm = CachedLLM(
        underlying,
        settings.llm_cache_dir,
        read=not args.no_cache,
    )
    RUNS.mkdir(parents=True, exist_ok=True)

    records: dict[str, dict[str, Any]] = {}
    for i, row in enumerate(dataset, 1):
        path = RUNS / f"{row['id']}.json"
        stored = json.loads(path.read_text()) if path.exists() else None
        if only:
            run = row["id"] in only
        else:
            # Failed rows are retried: most failures are quota or network.
            run = (
                args.fresh
                or stored is None
                or stored.get("prompt") != EXTRACT_PROMPT
                or bool(stored.get("error"))
            )
        if not run:
            if stored:
                records[row["id"]] = stored
            continue
        record = await run_row(row, llm)
        path.write_text(json.dumps(record, indent=1))
        records[row["id"]] = record
        status = record["error"] or f"{record['latency_s']}s {record['prediction']['category']}"
        print(f"[{i}/{len(dataset)}] {row['id']}: {status}", flush=True)

    results = build_results(dataset, records)
    RESULTS.write_text(json.dumps(results, indent=1) + "\n")
    m = results["metrics"]
    print(
        f"\nwrote {RESULTS.relative_to(ROOT)}: {m['n_scored']}/{m['n']} scored, "
        f"category {m['category_accuracy']}, age IoU≥0.5 {m['age']['accuracy_iou_50']}, "
        f"guardrail recall {m['guardrails']['ALL']['recall']}"
    )


if __name__ == "__main__":
    asyncio.run(main())
