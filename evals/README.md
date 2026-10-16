# Evals

`dataset.jsonl` holds 26 public YouTube videos of tutors, coaches, mentors and youth programs, with labels only (no media). `make evals` runs the real pipeline on each one (download → local transcription → key frames → one Gemini call → guardrails) and writes `results.json`, which the `/evals` page renders as is.

## How the labels were made

Candidates came from YouTube searches per category (`yt-dlp ytsearch`), kept if 15–180 s long and actually about a youth service. News reports, DVD ads, adult teacher-training and tutor-recruitment videos were dropped.

Labels were drafted from each video's own transcript and post caption, then reviewed by the author. They are **not** produced by the pipeline under test. Each row's `label_notes` cites the words the label rests on.

Rules:

- **Label only what the video or caption states.** If a video never says its format, ages or mode, that label is `null` and the row is left out of that metric. The pipeline still has to guess (it defaults to 1:1 and virtual); scoring those guesses as right or wrong would measure the default, not the model.
- **Ages:** "kids" → 5–12, "teens" → 13–18, school years converted (class 6–12 → 11–18).
- **`OFF_PLATFORM_CONTACT`:** a phone/WhatsApp number, the Guide's own website, social handles, or links selling their own courses, in the video *or* the caption. Links to other YouTube videos or to books are not contact; the regex rules may still flag them, and that shows up as lost precision.

## Known limits

- 26 rows, 11 of them academic tutoring; most categories have 1–3 rows, so per-category accuracy is noisy.
- Only `OFF_PLATFORM_CONTACT` occurs naturally in this set (9 rows). The other five codes have no positive examples, so for them the eval only measures false alarms.
- Many rows are YouTube Shorts and short ads; Instagram and TikTok are absent because they often require a login to download.
- Latency is measured on the machine that ran the evals and includes the download. Rows whose model answer came from the cache are excluded from latency.

## Re-running

```
make evals                         # reuses finished rows; failed rows are retried
make evals ARGS="--fresh"          # re-run everything (model answers still cached)
make evals ARGS="--only id1,id2"   # re-run some rows
```

Per-row runs are stored in `api/data/eval_runs/` and model responses in `api/data/llm_cache/`, so re-scoring after a label fix costs no Gemini requests. Changing the extract prompt version re-runs every row.
