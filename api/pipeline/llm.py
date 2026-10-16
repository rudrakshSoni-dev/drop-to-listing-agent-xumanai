"""Thin LLM boundary. Gemini in production; a recorded-fixture client in tests."""

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
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
    for model in models:
        for attempt in range(attempts_per_model):
            try:
                return await call(model)
            except TransientLLMError as exc:
                last = exc
                log.warning("llm %s attempt %d failed: %s", model, attempt + 1, exc)
                if not exc.retry_same_model:
                    break
                if attempt + 1 < attempts_per_model:
                    await sleep(base_delay_s * 2**attempt * random.uniform(0.75, 1.25))
    raise PipelineError(ErrorCode.LLM_UNAVAILABLE, str(last)[:200])


class GeminiLLM:
    def __init__(
        self,
        api_key: str,
        model: str,
        fallback_model: str = "",
        thinking_budget: int | None = 0,
    ) -> None:
        if not api_key or not model:
            raise PipelineError(ErrorCode.LLM_UNAVAILABLE, "GEMINI_API_KEY and LLM_MODEL required")
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._models = [model]
        if fallback_model and fallback_model != model:
            self._models.append(fallback_model)
        # 0 turns thinking off: these are extraction tasks and latency is the budget.
        self._thinking_budget = thinking_budget

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
            return response.text

        return await call_with_fallback(call, self._models)


class FixtureLLM:
    """Replays recorded responses in order, keyed by the response schema's name.

    With `cycle=True` the last response repeats forever (offline dev and smoke tests).
    """

    def __init__(self, responses: dict[str, list[str]], cycle: bool = False) -> None:
        self._responses = {k: list(v) for k, v in responses.items()}
        self._cycle = cycle
        self.prompts: list[str] = []

    async def generate_json(
        self, *, prompt: str, schema: type[BaseModel], media: list[Media] | None = None
    ) -> str:
        self.prompts.append(prompt)
        queue = self._responses.get(schema.__name__)
        if not queue:
            raise AssertionError(f"no recorded response left for {schema.__name__}")
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
