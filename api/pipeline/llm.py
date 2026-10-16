"""Thin LLM boundary. Gemini in production; a recorded-fixture client in tests."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel

from pipeline.errors import ErrorCode, PipelineError


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


class GeminiLLM:
    def __init__(self, api_key: str, model: str) -> None:
        if not api_key or not model:
            raise PipelineError(ErrorCode.LLM_UNAVAILABLE, "GEMINI_API_KEY and LLM_MODEL required")
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model

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
        )
        try:
            response = await self._client.aio.models.generate_content(
                model=self._model, contents=parts, config=config
            )
        except errors.APIError as exc:
            raise PipelineError(ErrorCode.LLM_UNAVAILABLE, str(exc)[:200]) from exc
        if not response.text:
            raise PipelineError(ErrorCode.LLM_SCHEMA_FAIL, "empty model response")
        return response.text


class FixtureLLM:
    """Replays recorded responses in order, keyed by the response schema's name."""

    def __init__(self, responses: dict[str, list[str]]) -> None:
        self._responses = {k: list(v) for k, v in responses.items()}
        self.prompts: list[str] = []

    async def generate_json(
        self, *, prompt: str, schema: type[BaseModel], media: list[Media] | None = None
    ) -> str:
        self.prompts.append(prompt)
        queue = self._responses.get(schema.__name__)
        if not queue:
            raise AssertionError(f"no recorded response left for {schema.__name__}")
        return queue.pop(0)


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
