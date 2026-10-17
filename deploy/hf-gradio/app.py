import datetime
import enum
import os
import sys
from pathlib import Path

# Polyfill datetime.UTC and enum.StrEnum for Python 3.10 runtimes
if not hasattr(datetime, "UTC"):
    datetime.UTC = datetime.timezone.utc  # type: ignore[attr-defined]

if not hasattr(enum, "StrEnum"):
    class StrEnum(str, enum.Enum):
        def __str__(self) -> str:
            return str(self.value)
    enum.StrEnum = StrEnum

# Ensure root directory is on Python path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Sane defaults for Hugging Face Spaces
os.environ.setdefault("DATA_DIR", "/tmp/drop2list")
os.environ.setdefault("EVALS_DIR", str(ROOT / "evals"))
os.environ.setdefault("CORS_ORIGINS", "*")
os.environ.setdefault("TRANSCRIBE_BACKEND", "whisper")
os.environ.setdefault("WHISPER_MODEL", "small.en")

import uvicorn
from app.main import app

# ZeroGPU requirement: at least one @spaces.GPU function detected during startup
try:
    import spaces

    @spaces.GPU(duration=60)
    def _spaces_gpu_task():
        pass
except ImportError:
    pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
