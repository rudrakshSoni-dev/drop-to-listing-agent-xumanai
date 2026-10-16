"""Loads versioned prompt templates from api/prompts/*.md."""

from functools import cache
from pathlib import Path
from string import Template

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


@cache
def _template(name: str) -> Template:
    return Template((PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8"))


def render(name: str, **values: str) -> str:
    return _template(name).substitute(values)
