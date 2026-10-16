"""Typed pipeline error codes. The web app maps each code to friendly copy."""

from enum import StrEnum


class ErrorCode(StrEnum):
    UPLOAD_INVALID = "UPLOAD_INVALID"
    LINKS_NOT_ENABLED = "LINKS_NOT_ENABLED"
    VIDEO_UNREADABLE = "VIDEO_UNREADABLE"
    VIDEO_TOO_LONG = "VIDEO_TOO_LONG"
    TRANSCRIBE_FAIL = "TRANSCRIBE_FAIL"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    LLM_SCHEMA_FAIL = "LLM_SCHEMA_FAIL"
    INTERNAL = "INTERNAL"


class PipelineError(Exception):
    def __init__(self, code: ErrorCode, detail: str = "") -> None:
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = detail
