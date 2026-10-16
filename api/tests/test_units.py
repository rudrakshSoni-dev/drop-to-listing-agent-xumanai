import pytest

from app.routes.drops import to_webvtt
from app.schema_gen import TranscriptLine
from pipeline import confidence
from pipeline.errors import ErrorCode, PipelineError
from pipeline.extract import extract
from pipeline.llm import FixtureLLM
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
