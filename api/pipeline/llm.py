"""Thin LLM boundary. Gemini in production; a recorded-fixture client in tests.

Free-tier Gemini allows ~20 requests/day per model, so the real client rotates
through a list of models and every response can be cached on disk.
"""

import asyncio
import hashlib
import json
import logging
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol

from pydantic import BaseModel

from pipeline.errors import ErrorCode, PipelineError

log = logging.getLogger(__name__)

# Overload and rate-limit responses are worth retrying; anything else (bad key,
# bad request) fails the same way on every attempt.
RETRYABLE_STATUS = frozenset({429, 500, 503, 504})


@dataclass(frozen=True)
class Media:
    data: bytes
    mime_type: str


@dataclass(frozen=True)
class CallRecord:
    """One generate_json call, for latency/token reporting in evals."""

    model: str
    schema: str
    input_tokens: int | None
    output_tokens: int | None
    cached: bool


class LLM(Protocol):
    async def generate_json(
        self, *, prompt: str, schema: type[BaseModel], media: list[Media] | None = None
    ) -> str:
        """Return the model's raw JSON text constrained to `schema`."""
        ...


class TransientLLMError(Exception):
    """An attempt failed in a way a retry or another model might fix."""

    def __init__(self, message: str, *, retry_same_model: bool = True) -> None:
        super().__init__(message)
        # False when this model can't succeed soon (e.g. its daily quota is spent).
        self.retry_same_model = retry_same_model


# Models that hit their daily cap in this process, until when (monotonic seconds).
# Free-tier caps reset daily; rechecking hourly costs one fast 429 at most.
_capped_until: dict[str, float] = {}
CAP_RECHECK_S = 3600.0


def reset_capped_models() -> None:
    _capped_until.clear()


async def call_with_fallback(
    call: Callable[[str], Awaitable[str]],
    models: list[str],
    *,
    attempts_per_model: int = 3,
    base_delay_s: float = 1.0,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> str:
    """Try each model in order, retrying transient failures with jittered backoff."""
    last: TransientLLMError | None = None
    capped = 0
    now = time.monotonic()
    for model in models:
        if _capped_until.get(model, 0.0) > now:
            capped += 1
            continue
        for attempt in range(attempts_per_model):
            try:
                return await call(model)
            except TransientLLMError as exc:
                last = exc
                log.warning("llm %s attempt %d failed: %s", model, attempt + 1, exc)
                if not exc.retry_same_model:
                    capped += 1
                    _capped_until[model] = time.monotonic() + CAP_RECHECK_S
                    break
                if attempt + 1 < attempts_per_model:
                    await sleep(base_delay_s * 2**attempt * random.uniform(0.75, 1.25))
    # Every model out of daily quota is a different story for the user than an outage.
    code = ErrorCode.LLM_QUOTA if models and capped == len(models) else ErrorCode.LLM_UNAVAILABLE
    raise PipelineError(code, str(last or "every model is out of daily quota")[:200])


class GeminiLLM:
    def __init__(self, api_key: str, models: list[str], thinking_budget: int | None = 0) -> None:
        if not api_key or not models:
            raise PipelineError(
                ErrorCode.LLM_UNAVAILABLE, "GEMINI_API_KEY and LLM_MODELS are required"
            )
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._models = list(dict.fromkeys(models))
        # 0 turns thinking off: these are extraction tasks and latency is the budget.
        self._thinking_budget = thinking_budget
        self.calls: list[CallRecord] = []

    async def generate_json(
        self, *, prompt: str, schema: type[BaseModel], media: list[Media] | None = None
    ) -> str:
        from google.genai import errors, types

        parts: list[types.Part] = [
            types.Part.from_bytes(data=m.data, mime_type=m.mime_type) for m in media or []
        ]
        parts.append(types.Part.from_text(text=prompt))
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.2,
            thinking_config=(
                None
                if self._thinking_budget is None
                else types.ThinkingConfig(thinking_budget=self._thinking_budget)
            ),
        )

        async def call(model: str) -> str:
            try:
                response = await self._client.aio.models.generate_content(
                    model=model, contents=parts, config=config
                )
            except errors.APIError as exc:
                if exc.code in RETRYABLE_STATUS:
                    # Free-tier daily caps reset once a day; only another model helps.
                    daily_cap = exc.code == 429 and "PerDay" in str(exc)
                    suffix = " (daily quota)" if daily_cap else ""
                    raise TransientLLMError(
                        f"{model}: {exc.code} {exc.status}{suffix}",
                        retry_same_model=not daily_cap,
                    ) from exc
                raise PipelineError(ErrorCode.LLM_UNAVAILABLE, str(exc)[:200]) from exc
            if not response.text:
                raise PipelineError(ErrorCode.LLM_SCHEMA_FAIL, "empty model response")
            usage = response.usage_metadata
            self.calls.append(
                CallRecord(
                    model=model,
                    schema=schema.__name__,
                    input_tokens=usage.prompt_token_count if usage else None,
                    output_tokens=usage.candidates_token_count if usage else None,
                    cached=False,
                )
            )
            return response.text

        return await call_with_fallback(call, self._models)


def cache_key(prompt: str, schema: type[BaseModel], media: list[Media] | None) -> str:
    h = hashlib.sha256()
    h.update(schema.__name__.encode())
    h.update(json.dumps(schema.model_json_schema(), sort_keys=True).encode())
    h.update(prompt.encode())
    for m in media or []:
        h.update(m.mime_type.encode())
        h.update(hashlib.sha256(m.data).digest())
    return h.hexdigest()


@dataclass
class CachedLLM:
    """Disk cache in front of any LLM. Same inputs → same answer, no request spent.

    Key covers the prompt (which embeds the prompt version), the response schema,
    and the media bytes, so changing any of them misses the cache.
    """

    inner: LLM
    cache_dir: Path
    # False still writes answers but never serves them (fresh calls, e.g. for timing).
    read: bool = True
    calls: list[CallRecord] = field(default_factory=list)

    async def generate_json(
        self, *, prompt: str, schema: type[BaseModel], media: list[Media] | None = None
    ) -> str:
        path = self.cache_dir / f"{cache_key(prompt, schema, media)}.json"
        if self.read and path.exists():
            entry = json.loads(path.read_text())
            self.calls.append(
                CallRecord(entry.get("model", "?"), schema.__name__, None, None, cached=True)
            )
            return str(entry["raw"])
        raw = await self.inner.generate_json(prompt=prompt, schema=schema, media=media)
        inner_calls: list[CallRecord] = getattr(self.inner, "calls", [])
        record = inner_calls[-1] if inner_calls else None
        if record:
            self.calls.append(record)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        entry = {
            "schema": schema.__name__,
            "model": record.model if record else None,
            "created_at": datetime.now(UTC).isoformat(),
            "raw": raw,
        }
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(entry))
        tmp.replace(path)
        return raw


class FixtureLLM:
    """Replays recorded responses in order, keyed by the response schema's name.

    With `cycle=True` the last response repeats forever (offline dev and smoke tests).
    """

    def __init__(self, responses: dict[str, list[str]], cycle: bool = False) -> None:
        self._responses = {k: list(v) for k, v in responses.items()}
        self._cycle = cycle
        self.prompts: list[str] = []
        self.calls: list[CallRecord] = []

    async def generate_json(
        self, *, prompt: str, schema: type[BaseModel], media: list[Media] | None = None
    ) -> str:
        self.prompts.append(prompt)
        queue = self._responses.get(schema.__name__)
        if not queue:
            raise AssertionError(f"no recorded response left for {schema.__name__}")
        self.calls.append(CallRecord("fixture", schema.__name__, None, None, cached=False))
        return queue[0] if self._cycle and len(queue) == 1 else queue.pop(0)


class LazyLLM:
    """Builds the real client on first use, so config errors surface at the stage that needs it."""

    def __init__(self, factory: Callable[[], LLM]) -> None:
        self._factory = factory
        self._llm: LLM | None = None

    async def generate_json(
        self, *, prompt: str, schema: type[BaseModel], media: list[Media] | None = None
    ) -> str:
        if self._llm is None:
            self._llm = self._factory()
        return await self._llm.generate_json(prompt=prompt, schema=schema, media=media)
