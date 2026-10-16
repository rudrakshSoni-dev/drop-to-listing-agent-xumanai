# CLAUDE.md: Drop2List

Instructions for Claude Code working in this repo. Read this file and `DESIGN.md` before writing any code. `DESIGN.md` is the source of truth for every UI decision; this file covers what to build, how the system fits together, and how to work.

---

## 1. What we're building

**Drop2List** turns a short video ("Drop") into a ready-to-publish, bookable service listing.

A provider (a tutor, coach, or mentor, called a "Guide") pastes a public Instagram, TikTok, or YouTube link, or uploads a clip. The system transcribes it, pulls key frames, extracts a structured service listing with an LLM, scores its confidence, runs safety guardrails, and shows a swipeable booking-card preview with a working mock "instant book" flow.

It's a proof-of-work project for an application to Xuman.AI (a youth-services marketplace whose tagline is "turn content into instant booking"). The audience is a founder who will spend about 60 seconds on it, so the main path must work flawlessly and look polished. Breadth matters less than that.

### Success criteria (in priority order)
1. Paste link → see a complete, editable listing in under ~30s, with live progress.
2. An eval page with real accuracy numbers on a labeled set of 20–30 videos.
3. Guardrails that flag risky listings aimed at minors, with explanations.
4. A preview that feels like a real marketplace booking card (swipe, book, confirm).
5. A clean README with a demo GIF, setup steps, eval results, and "what I'd do with real data".

### Explicit non-goals
- No real auth, payments, or user accounts. Use a single demo Guide.
- No React Native app. It's web only.
- No scraping of private content. Public links and uploads only.
- Don't clone Xuman's branding. The design is our own (see DESIGN.md).

---

## 2. Architecture

```
apps/
  web/          Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
  api/          FastAPI (Python 3.11+) — ingestion, AI pipeline, guardrails, evals
packages/
  schema/       listing.schema.json — single source of truth for the Listing shape
evals/
  dataset.jsonl hand-labeled examples
  run_evals.py  scores pipeline output vs labels, writes evals/results.json
```

**Why the split:** the video and AI tooling (yt-dlp, ffmpeg, Whisper, Pydantic) is Python-native. The UI lives in Next.js. They talk over HTTP and SSE.

### Request flow
1. `POST /api/drops` with `{ url }` or a multipart upload → returns `{ drop_id }`.
2. `GET /api/drops/{id}/events` streams pipeline stages over **SSE**:
   `fetching → transcribing → extracting_frames → analyzing → guardrails → done | error`
3. `GET /api/listings/{id}` → the full `Listing` JSON.
4. `PATCH /api/listings/{id}` → user edits from the form.
5. `POST /api/listings/{id}/book` → mock booking that returns a confirmation.
6. `GET /api/evals` → latest results from `evals/results.json`.

Supporting endpoints the UI also uses:
- `GET /api/drops/{id}` → drop status, media URL, dimensions, transcript so far.
- `POST /api/drops/{id}/retry` → re-run a failed drop on its saved media.
- `GET /api/drops/{id}/captions.vtt` → WebVTT captions built from the transcript.
- `GET /api/listings` → all listings (transcript omitted).
- `GET /api/listings/price-suggestion?category&group&mode&duration_min` → the static `pricing.py` band, so the editor can refresh the suggestion live.
- `/api/media/{drop_id}/{file}` → static media (source video, frames).

SSE events are JSON objects with a `kind`: `stage` (`stage`, `detail`), `detail`, `media` (`duration_s`, `width`, `height`, `media_url`, `caption`), `transcript` (`lines`), `frames` (`frames: [{file, t}]`, `thumbnail`), `done` (`listing_id`), or `error` (`code`, `stage`). Each carries `seq` and `t` (ms since start). A listing shares its drop's id.

### Pipeline stages (api/pipeline/)
| Stage | Module | Notes |
|---|---|---|
| Fetch | `fetch.py` | `yt-dlp` for links, max 3 min, mp4. Reject private or unavailable videos with a clear error code |
| Transcribe | `transcribe.py` | Local `faster-whisper` (`small.en` + a vocabulary hint) by default; Gemini audio behind `TRANSCRIBE_BACKEND=gemini` |
| Frames | `frames.py` | `ffmpeg` scene-change detection, keep 4–6 frames, pick a thumbnail |
| Extract | `extract.py` | One LLM call with transcript + frames + caption, returning **structured output validated by Pydantic** against the schema. Retry once on validation failure with the error fed back |
| Guardrails | `guardrails.py` | Rule checks plus one LLM classification pass (see §5) |
| Score | `confidence.py` | Per-field confidence, plus a `missing_fields` list the UI turns into prompts |

Persist state in **SQLite** (`api/data/drop2list.db`) via SQLModel. Store media under `api/data/media/{drop_id}/`. No external database.

---

## 3. The Listing schema

The source of truth is `packages/schema/listing.schema.json`. Generate the Pydantic models (api) and TS types (web) from it; never hand-edit the generated files. Run `make schema` after changing it.

```jsonc
{
  "id": "string",
  "source": { "type": "instagram|tiktok|youtube|upload", "url": "string|null", "duration_s": 0 },
  "title": "string (≤ 60 chars)",
  "summary": "string (≤ 280 chars)",
  "description": "string (markdown, ≤ 1200 chars)",
  "category": "academic_tutoring|homework_support|stem_coding_robotics|arts_music|communication_public_speaking|sports_fitness_wellness|leadership_life_skills|hobbies_enrichment|mentoring",
  "subcategory": "string|null",
  "age_range": { "min": 0, "max": 18 },
  "format": { "group": "one_on_one|small_group", "mode": "virtual|in_person|hybrid", "max_group_size": null },
  "session": { "duration_min": 60, "price_band": { "min": 0, "max": 0, "currency": "USD" } },
  "skills": ["string"],
  "tags": ["string"],
  "caption": "string (social-ready, ≤ 150 chars)",
  "thumbnail_frame": "string (path)",
  "availability": null,
  "confidence": { "<field>": 0.0 },
  "missing_fields": ["availability", "..."],
  "guardrails": { "status": "pass|warn|block", "flags": [{ "code": "string", "severity": "low|med|high", "evidence": "string", "explanation": "string" }] },
  "transcript": [{ "start": 0.0, "end": 0.0, "text": "string" }],
  "created_at": "iso8601"
}
```

Rules:
- The category enum mirrors Xuman's public category list. Don't add categories without updating the evals.
- `availability` is never inferred. It's always a `missing_field` the Guide fills in. When set, it's a list of weekly slots `{ weekday: 0–6 (Mon=0), start: "HH:MM", end: "HH:MM" }`.
- Guardrail flags may carry `timestamp_s` so the UI can jump the video to the evidence.
- Price bands are **suggestions**. Base them on a static table in `api/pipeline/pricing.py` keyed by category, format, and mode, and label them "suggested" in the UI. Never present them as market data.

---

## 4. Environment

```
# api/.env (see api/.env.example for comments)
GEMINI_API_KEY=
LLM_MODELS=           # ordered comma list; later models take over on 503 / daily-quota 429
LLM_THINKING_BUDGET=0 # 0 = thinking off (fastest); token count; or "default"
LLM_CACHE=1           # disk cache of LLM responses (data/llm_cache)
TRANSCRIBE_BACKEND=whisper  # whisper (local, default) | gemini
WHISPER_MODEL=small.en
DEMO_DROPS_PER_IP=0   # per-visitor daily cap on new drops for a public demo; 0 = off
MAX_VIDEO_SECONDS=180

# web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Read the model names from env everywhere. Never commit keys. `.env.example` files must exist in both apps.

### Free-tier budget
The demo runs on Gemini's free tier (~20 requests/day **per model**). Design rule: **one Gemini request per new video.**
- Transcription is local (`faster-whisper`), not Gemini.
- Guardrails' LLM classification shares the extract call (one structured response) instead of a separate pass.
- `CachedLLM` keys responses on prompt + schema + media bytes, so retries, repeated links and eval reruns cost nothing.
- `LLM_MODELS` rotates across models; a model that hits its daily cap is skipped for an hour. When all are capped, drops fail with `LLM_QUOTA` and friendly copy.
- Over-length text from the model is trimmed locally (word boundary + "…") instead of spending a retry.

System deps: `ffmpeg`, `yt-dlp` (pinned in `api/requirements.txt` as a Python package).

---

## 5. Guardrails (youth-safety layer)

Youth services is a trust business, so this layer is a feature, not an afterthought. Each flag must cite **evidence** (a transcript quote with a timestamp, or a frame) and give a one-line explanation.

| Code | Severity | Trigger |
|---|---|---|
| `OFF_PLATFORM_CONTACT` | high | Phone numbers, handles, "DM me", "WhatsApp" when the audience includes minors |
| `PRIVATE_MEETING_MINOR` | high | 1:1 in-person sessions with minors at a private location with no guardian mention |
| `UNVERIFIED_CREDENTIAL` | med | Claims like "certified" or "former teacher at X" with no supporting detail |
| `AGE_MISMATCH` | med | Content or tone inconsistent with the inferred age range |
| `GUARANTEED_OUTCOME` | low | "Guaranteed A+", "100% admission" |
| `UNSAFE_ACTIVITY` | med | Physical activity without a safety mention, for young ages |

Status rules: any `high` → `block` (the listing can't be published); any `med` → `warn`; otherwise `pass`. Regex rules run first and the LLM pass second; deduplicate by code.

---

## 6. Evals

- `evals/dataset.jsonl`: 20–30 **public** tutor, coach, and mentor videos. Each row has `url`, `category`, `age_range`, `format.group`, `format.mode`, and `expected_flags`. Store labels only, never the media.
- `run_evals.py` runs the full pipeline on each row and writes `evals/results.json` with these metrics:
  - category accuracy (exact match)
  - age-range IoU (mean), and accuracy at IoU ≥ 0.5
  - format accuracy (group and mode separately)
  - guardrail precision and recall per flag code
  - latency p50/p95, plus cost per listing if the API reports token usage
  - a per-row breakdown for the UI table
- Make 2–3 of the rows deliberately include a guardrail trigger, so recall is measurable.
- `make evals` runs the whole thing. Commit `results.json` so the deployed demo shows real numbers.

---

## 7. Commands

```
make setup     # install web + api deps
make dev       # run api on :8000 and web on :3000 together
make schema    # regenerate Pydantic + TS types from listing.schema.json
make evals     # run evals, write evals/results.json
make test      # pytest (api) + vitest (web) + typecheck + lint
```

---

## 8. Coding conventions

**General**
- Small, focused modules. Write functions, not god-classes.
- Every pipeline stage is pure-ish: input → output, with side effects only in the orchestrator (`api/pipeline/run.py`).
- Errors use typed codes (`VIDEO_PRIVATE`, `VIDEO_TOO_LONG`, `LLM_SCHEMA_FAIL`, …) that map to friendly copy in the UI. Never surface raw stack traces.

**Python (api)**
- Python 3.11+, FastAPI, Pydantic v2, SQLModel, `ruff` + `mypy --strict` on `pipeline/`.
- Async endpoints. Wrap blocking work (ffmpeg, yt-dlp) in `run_in_threadpool`.
- Keep LLM prompts in `api/prompts/*.md`, never as inline strings. Version them in the filename (`extract_v2.md`).
- Tests: pytest with a recorded LLM fixture (no network in CI).

**TypeScript (web)**
- Next.js 15 App Router, Server Components by default. Use `"use client"` only where needed (forms, SSE, swipe).
- shadcn/ui + Tailwind only. No other component libraries. Follow DESIGN.md tokens. No hex colors in components.
- Forms: `react-hook-form` + `zod`, with the zod schema generated from the shared JSON schema.
- Data: `@tanstack/react-query` for client fetching; SSE through a small `useDropEvents(dropId)` hook.
- `strict: true`, no `any`. ESLint + Prettier.
- Tests: vitest + Testing Library for hooks and key components. One Playwright smoke test for the main path.

**Git**
- Conventional commits (`feat:`, `fix:`, `chore:`, `eval:`).
- Don't commit media, `.env`, `api/data/`, or the DB.

---

## 9. Build order

Work in this order. After each step, run it end to end before moving on.

1. Repo scaffold, Makefile, schema + codegen, `.env.example` files.
2. API: upload path only (skip links) → transcribe → extract → return a Listing. Check it against 3 local clips.
3. Web: Home input + SSE progress + Listing editor (DESIGN.md §6.1–6.3).
4. Link ingestion via yt-dlp + frames + thumbnail.
5. Guardrails + the Safety panel in the UI.
6. Booking preview card + mock instant-book flow.
7. Evals dataset + runner + Evals page.
8. Polish pass against the DESIGN.md checklist (§11). README, demo GIF, deploy (web on Vercel, api on Render/Fly/Cloud Run).

---

## 10. Things to avoid

- Don't invent data in the UI. Every number on the Evals page comes from `results.json`.
- Don't claim "AI-verified" credentials or safety. The copy says "flagged for review", never "safe".
- Don't over-engineer: no queues, Redis, or microservices. An in-process background task per drop is enough.
- Don't change the schema or categories without updating evals and both generated type files.
- Don't block the UI on a long LLM call. Always stream stages.
