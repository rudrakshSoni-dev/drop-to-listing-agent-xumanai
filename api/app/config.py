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
    # Ordered list of models to try; later ones take over when earlier ones are
    # overloaded or out of daily quota (free tier: ~20 requests/day per model).
    llm_models: list[str] = field(
        default_factory=lambda: [
            m.strip() for m in (_env("LLM_MODELS") or _env("LLM_MODEL")).split(",") if m.strip()
        ]
    )
    # Gemini thinking budget in tokens; 0 = off (fastest), "default" = model default.
    llm_thinking_budget: int | None = field(
        default_factory=lambda: (
            None
            if _env("LLM_THINKING_BUDGET", "0") == "default"
            else int(_env("LLM_THINKING_BUDGET", "0") or 0)
        )
    )
    # Cache LLM responses on disk so retries and eval reruns spend no quota.
    llm_cache: bool = field(default_factory=lambda: _env("LLM_CACHE", "1") != "0")
    transcribe_backend: Literal["gemini", "whisper"] = field(
        default_factory=lambda: cast(
            Literal["gemini", "whisper"], _env("TRANSCRIBE_BACKEND", "whisper") or "whisper"
        )
    )
    whisper_model: str = field(default_factory=lambda: _env("WHISPER_MODEL") or "small.en")
    # New drops allowed per client IP per day (0 = unlimited). Protects the shared
    # free-tier key on a public demo.
    demo_drops_per_ip: int = field(
        default_factory=lambda: int(_env("DEMO_DROPS_PER_IP", "0") or 0)
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
    evals_dir: Path = field(
        default_factory=lambda: Path(_env("EVALS_DIR") or API_DIR.parent / "evals")
    )

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def llm_cache_dir(self) -> Path:
        return self.data_dir / "llm_cache"

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'drop2list.db'}"


settings = Settings()
