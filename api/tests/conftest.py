import json
import os
import subprocess
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

# Must be set before app.config is imported anywhere.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="drop2list-test-")
os.environ["GEMINI_API_KEY"] = ""
# Tests replay recorded Gemini transcripts instead of loading a whisper model.
os.environ["TRANSCRIBE_BACKEND"] = "gemini"
os.environ["LLM_CACHE"] = "0"

import httpx  # noqa: E402
from sse_starlette.sse import AppStatus  # noqa: E402

from app import db  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.routes.drops import get_llm_factory  # noqa: E402
from pipeline.llm import FixtureLLM  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict[str, list[str]]:
    data: dict[str, list[str]] = json.loads((FIXTURES / name).read_text())
    return data


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A 4-second synthetic clip with a test tone, built with ffmpeg."""
    out = tmp_path_factory.mktemp("media") / "clip.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", "testsrc=size=320x568:rate=15:duration=4",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
            "-shortest", "-pix_fmt", "yuv420p", str(out),
        ],
        check=True,
    )
    return out


@pytest.fixture
async def client() -> AsyncIterator[httpx.AsyncClient]:
    # sse-starlette keeps a module-global exit Event bound to the first test's loop.
    AppStatus.should_exit_event = None
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    db.init_db(settings.db_url)
    fixture_llm = FixtureLLM(load_fixture("llm_math_tutor.json"))
    app.dependency_overrides[get_llm_factory] = lambda: (lambda: fixture_llm)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
