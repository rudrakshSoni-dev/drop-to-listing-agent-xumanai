import pytest

from app.routes.drops import to_webvtt
from app.schema_gen import TranscriptLine
from pipeline import confidence
from pipeline.errors import ErrorCode, PipelineError
from pipeline.extract import extract
from pipeline.llm import FixtureLLM, TransientLLMError, call_with_fallback
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
