import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, cast

from dotenv import load_dotenv

API_DIR = Path(__file__).resolve().parent.parent
load_dotenv(API_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    # Allow trailing "# comments" in .env values.
    return os.getenv(name, default).split("#", 1)[0].strip()


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    llm_model: str = field(default_factory=lambda: _env("LLM_MODEL"))
    # Used after LLM_MODEL keeps returning overload/rate-limit errors. Optional.
    llm_fallback_model: str = field(default_factory=lambda: _env("LLM_FALLBACK_MODEL"))
    # Gemini thinking budget in tokens; 0 = off (fastest), "default" = model default.
    llm_thinking_budget: int | None = field(
        default_factory=lambda: (
            None
            if _env("LLM_THINKING_BUDGET", "0") == "default"
            else int(_env("LLM_THINKING_BUDGET", "0") or 0)
        )
    )
    transcribe_backend: Literal["gemini", "whisper"] = field(
        default_factory=lambda: cast(
            Literal["gemini", "whisper"], _env("TRANSCRIBE_BACKEND", "gemini") or "gemini"
        )
    )
    max_video_seconds: int = field(
        default_factory=lambda: int(_env("MAX_VIDEO_SECONDS", "180") or 180)
    )
    # Path to a recorded LLM fixture (tests/fixtures/*.json). Replaces Gemini when set.
    llm_fixture: str = field(default_factory=lambda: _env("LLM_FIXTURE"))
    max_upload_mb: int = 200
    cors_origins: list[str] = field(
        default_factory=lambda: _env("CORS_ORIGINS", "http://localhost:3000").split(",")
    )
    data_dir: Path = field(default_factory=lambda: Path(_env("DATA_DIR") or API_DIR / "data"))

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'drop2list.db'}"


settings = Settings()
