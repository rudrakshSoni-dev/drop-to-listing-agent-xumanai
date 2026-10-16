import json
from pathlib import Path

import pytest

from app.routes.drops import to_webvtt
from app.schema_gen import TranscriptLine
from pipeline import confidence, fetch, frames
from pipeline.errors import ErrorCode, PipelineError
from pipeline.extract import ExtractedListing, extract
from pipeline.llm import (
    CachedLLM,
    FixtureLLM,
    TransientLLMError,
    call_with_fallback,
    reset_capped_models,
)
from pipeline.pricing import suggest_price_band
from pipeline.transcribe import _Segment, clean_segments
from tests.conftest import load_fixture


def test_price_band_scales_with_mode_group_and_duration() -> None:
    base = suggest_price_band("academic_tutoring", "one_on_one", "virtual", 60)
    assert (base.min, base.max, base.currency) == (30, 55, "USD")
    in_person = suggest_price_band("academic_tutoring", "one_on_one", "in_person", 60)
    assert in_person.min > base.min
    group = suggest_price_band("academic_tutoring", "small_group", "virtual", 60)
    assert group.max < base.max
    short = suggest_price_band("academic_tutoring", "one_on_one", "virtual", 30)
    assert short.max < base.max


def test_missing_fields_always_asks_for_availability() -> None:
    scores = {"age_range": 0.9, "format.mode": 0.2, "format.group": 0.9,
              "session.duration_min": 0.9}
    assert confidence.missing_fields(scores, availability=None) == ["availability", "format.mode"]
    slots = [{"weekday": 1, "start": "16:00", "end": "17:00"}]
    assert confidence.missing_fields(scores, availability=slots) == ["format.mode"]


def test_clean_segments_clamps_and_sorts() -> None:
    segs = [_Segment(start=5, end=99, text=" b  "), _Segment(start=-1, end=2, text="a"),
            _Segment(start=3, end=4, text="   ")]
    lines = clean_segments(segs, duration_s=10)
    assert [(line.start, line.end, line.text) for line in lines] == [
        (0.0, 2.0, "a"), (5.0, 10.0, "b")]


def test_webvtt_format() -> None:
    vtt = to_webvtt([TranscriptLine(start=61.5, end=63, text="hello")])
    assert vtt.startswith("WEBVTT")
    assert "00:01:01.500 --> 00:01:03.000\nhello" in vtt


async def test_extract_retries_once_with_validation_error() -> None:
    good = load_fixture("llm_math_tutor.json")["ExtractedListing"][0]
    llm = FixtureLLM({"ExtractedListing": ['{"title": "x"}', good]})
    result = await extract(llm, [], 10, None)
    assert result.category == "academic_tutoring"
    assert "failed validation" in llm.prompts[1]


async def test_extract_gives_up_after_second_failure() -> None:
    llm = FixtureLLM({"ExtractedListing": ['{"title": "x"}', "not json"]})
    with pytest.raises(PipelineError) as err:
        await extract(llm, [], 10, None)
    assert err.value.code == ErrorCode.LLM_SCHEMA_FAIL


async def _no_sleep(_: float) -> None:
    return None


@pytest.fixture(autouse=True)
def _fresh_model_caps() -> None:
    reset_capped_models()


async def test_llm_retries_transient_errors_then_falls_back() -> None:
    calls: list[str] = []

    async def call(model: str) -> str:
        calls.append(model)
        if model == "primary":
            raise TransientLLMError("503")
        return "{}"

    out = await call_with_fallback(call, ["primary", "backup"], sleep=_no_sleep)
    assert out == "{}"
    assert calls == ["primary", "primary", "primary", "backup"]


async def test_llm_gives_typed_error_when_every_model_is_overloaded() -> None:
    async def call(model: str) -> str:
        raise TransientLLMError(f"{model}: 503")

    with pytest.raises(PipelineError) as err:
        await call_with_fallback(call, ["a", "b"], attempts_per_model=2, sleep=_no_sleep)
    assert err.value.code == ErrorCode.LLM_UNAVAILABLE


async def test_llm_skips_to_fallback_when_daily_quota_is_spent() -> None:
    calls: list[str] = []

    async def call(model: str) -> str:
        calls.append(model)
        if model == "primary":
            raise TransientLLMError("429 daily", retry_same_model=False)
        return "{}"

    assert await call_with_fallback(call, ["primary", "backup"], sleep=_no_sleep) == "{}"
    assert calls == ["primary", "backup"]


async def test_llm_does_not_retry_permanent_errors() -> None:
    calls: list[str] = []

    async def call(model: str) -> str:
        calls.append(model)
        raise PipelineError(ErrorCode.LLM_UNAVAILABLE, "400 bad key")

    with pytest.raises(PipelineError):
        await call_with_fallback(call, ["a", "b"], sleep=_no_sleep)
    assert calls == ["a"]


@pytest.mark.parametrize("schema", ["extract.ExtractedListing", "transcribe.TranscriptResult"])
def test_response_schemas_are_accepted_by_gemini_sdk(schema: str) -> None:
    # The SDK rejects some valid Pydantic shapes (e.g. integer enums) before any
    # request is sent; the fixture LLM can't catch that, so convert them here.
    from google.genai import _transformers, client

    from pipeline import extract, transcribe

    module, name = schema.split(".")
    model = getattr({"extract": extract, "transcribe": transcribe}[module], name)
    _transformers.t_schema(client.Client(api_key="offline")._api_client, model)


def test_grounding_keeps_quoted_scores_and_caps_unsupported_ones() -> None:
    heard = "I usually take sessions online and each session is of half an hour."
    assert confidence.ground(0.9, "each session is of half an hour", heard) == 0.9
    # Small paraphrase still counts.
    assert confidence.ground(0.9, "each session is half an hour", heard) == 0.9
    # No quote, or words that were never said, fall below the ask threshold.
    assert confidence.ground(0.9, None, heard) < confidence.MISSING_THRESHOLD
    assert confidence.ground(0.9, "small groups of four", heard) < confidence.MISSING_THRESHOLD
    # A low self-report is never raised.
    assert confidence.ground(0.2, "sessions online", heard) == 0.2


def test_out_of_range_duration_is_clamped_and_asked() -> None:
    from datetime import UTC, datetime

    from app.schema_gen import Source
    from pipeline.extract import ExtractedListing, build_listing

    raw = json.loads(load_fixture("llm_math_tutor.json")["ExtractedListing"][0])
    raw["duration_min"] = 360
    line = TranscriptLine(start=0, end=3, text="My session is about six hours long")
    raw["evidence"]["duration"] = "six hours long"
    listing = build_listing(
        ExtractedListing.model_validate(raw),
        listing_id="x",
        source=Source(type="upload", url=None, duration_s=3),
        transcript=[line],
        created_at=datetime.now(UTC),
    )
    assert listing.session.duration_min == 240
    assert "session.duration_min" in listing.missing_fields



@pytest.mark.parametrize(
    ("url", "source"),
    [
        ("https://www.youtube.com/shorts/abc", "youtube"),
        ("https://youtu.be/abc", "youtube"),
        ("https://m.youtube.com/watch?v=abc", "youtube"),
        ("https://www.tiktok.com/@coach/video/1", "tiktok"),
        ("https://vm.tiktok.com/ZM123/", "tiktok"),
        ("https://www.instagram.com/reel/abc/", "instagram"),
    ],
)
def test_detect_source(url: str, source: str) -> None:
    assert fetch.detect_source(url) == source


@pytest.mark.parametrize("url", ["https://vimeo.com/1", "ftp://youtube.com/x", "youtube.com/x",
                                 "https://notyoutube.com/x"])
def test_detect_source_rejects(url: str) -> None:
    with pytest.raises(PipelineError) as err:
        fetch.detect_source(url)
    assert err.value.code == ErrorCode.LINK_UNSUPPORTED


@pytest.mark.parametrize(
    ("message", "code"),
    [
        ("ERROR: [youtube] abc: Private video. Sign in if you've been granted access",
         ErrorCode.VIDEO_PRIVATE),
        ("ERROR: [youtube] abc: Sign in to confirm you're not a bot", ErrorCode.FETCH_BLOCKED),
        ("ERROR: [Instagram] abc: login required to access this content",
         ErrorCode.FETCH_BLOCKED),
        ("ERROR: [youtube] abc: Video unavailable", ErrorCode.VIDEO_UNAVAILABLE),
    ],
)
def test_classify_fetch_errors(message: str, code: ErrorCode) -> None:
    assert fetch.classify_error(message) == code


def test_caption_from_info_dedupes_title_and_description() -> None:
    info = {"title": "Math tips", "description": "Math tips"}
    assert fetch.caption_from_info(info) == "Math tips"
    assert fetch.caption_from_info({}) is None


def test_choose_timestamps_spreads_and_pads() -> None:
    # Few scene cuts: padded with evenly spaced moments, never closer than MIN_GAP_S.
    picks = frames.choose_timestamps([2.0], 30.0)
    assert len(picks) == frames.TARGET_FRAMES and 2.0 in picks
    assert all(b - a >= frames.MIN_GAP_S for a, b in zip(picks, picks[1:], strict=False))
    # Many cuts: capped and spread across the clip.
    many = frames.choose_timestamps([i * 0.9 for i in range(1, 60)], 60.0)
    assert len(many) <= frames.MAX_FRAMES and many[-1] > 30
    assert frames.choose_timestamps([], 0) == []


def test_thumbnail_prefers_detailed_frame_in_first_half() -> None:
    picked = [frames.Frame("a.jpg", 1.0), frames.Frame("b.jpg", 4.0), frames.Frame("c.jpg", 9.0)]
    sizes = {"a.jpg": 10, "b.jpg": 50, "c.jpg": 999}
    assert frames.pick_thumbnail(picked, sizes, 10.0) == "b.jpg"


async def test_cached_llm_spends_one_request_per_unique_input(tmp_path: Path) -> None:
    good = load_fixture("llm_math_tutor.json")["ExtractedListing"][0]
    inner = FixtureLLM({"ExtractedListing": [good]})  # a second real call would fail
    cached = CachedLLM(inner, tmp_path)
    first = await cached.generate_json(prompt="p", schema=ExtractedListing)
    again = await cached.generate_json(prompt="p", schema=ExtractedListing)
    assert first == again == good
    assert [c.cached for c in cached.calls] == [False, True]
    with pytest.raises(AssertionError):  # a different prompt is a cache miss
        await cached.generate_json(prompt="other", schema=ExtractedListing)


async def test_llm_reports_quota_when_every_model_is_capped() -> None:
    async def call(model: str) -> str:
        raise TransientLLMError(f"{model}: 429", retry_same_model=False)

    with pytest.raises(PipelineError) as err:
        await call_with_fallback(call, ["a", "b"], sleep=_no_sleep)
    assert err.value.code == ErrorCode.LLM_QUOTA


async def test_capped_models_are_skipped_on_later_calls() -> None:
    calls: list[str] = []

    async def call(model: str) -> str:
        calls.append(model)
        if model == "primary":
            raise TransientLLMError("429 daily", retry_same_model=False)
        return "{}"

    await call_with_fallback(call, ["primary", "backup"], sleep=_no_sleep)
    await call_with_fallback(call, ["primary", "backup"], sleep=_no_sleep)
    assert calls == ["primary", "backup", "backup"]


def test_fit_text_trims_at_word_boundary() -> None:
    from pipeline.extract import fit_text

    assert fit_text("short", 150) == "short"
    trimmed = fit_text("word " * 40, 150)
    assert len(trimmed) <= 150 and trimmed.endswith("word…")


async def test_overlong_caption_is_trimmed_without_a_retry() -> None:
    good = json.loads(load_fixture("llm_math_tutor.json")["ExtractedListing"][0])
    good["caption"] = "x " * 100
    llm = FixtureLLM({"ExtractedListing": [json.dumps(good)]})  # only one response recorded
    result = await extract(llm, [], 10, None)
    assert len(result.caption) <= 150 and len(llm.prompts) == 1


def test_whisper_prompt_echo_is_dropped() -> None:
    from pipeline.transcribe import drop_hint_echoes

    hint = "A tutor, coach or mentor describes their sessions for kids and teens."
    echo = _Segment(start=0, end=5, text=" A tutor, coach or mentor describes their sessions.")
    real = _Segment(start=5, end=9, text="I coach cricket for kids on weekends.")
    assert drop_hint_echoes([echo, real], hint) == [real]
