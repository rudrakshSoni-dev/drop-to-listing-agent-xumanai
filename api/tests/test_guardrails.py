import pytest

from app.schema_gen import TranscriptLine
from pipeline import guardrails
from pipeline.guardrails import LLMFlag


def _lines(*texts: str) -> list[TranscriptLine]:
    return [TranscriptLine(start=i * 5.0, end=i * 5.0 + 4, text=t) for i, t in enumerate(texts)]


@pytest.mark.parametrize(
    "said",
    [
        "To access my services, you can go to my website or just call me.",  # real clip
        "you need to call me or you can go to my website and then ping me on email",  # real clip
        "DM me on Instagram for a free trial",
        "WhatsApp me on +91 98765 43210",
        "email me at coach.sam@gmail.com",
        "reach me at sam at gmail dot com",
        "follow @mathwithsam for tips",
        "book through samtutors.com",
        "link in bio!",
    ],
)
def test_contact_details_are_flagged_high_with_timestamp(said: str) -> None:
    lines = _lines("Hi, I coach cricket for kids.", said)
    result = guardrails.evaluate(lines, None, [], [])
    assert result.status == "block"
    flag = result.flags[0]
    assert flag.code == "OFF_PLATFORM_CONTACT" and flag.severity == "high"
    assert flag.timestamp_s == 5.0 and flag.evidence


@pytest.mark.parametrize(
    "said",
    [
        "I teach kids of age 10 to 15 maths online, each session is half an hour.",
        "We practise 100 problems together and review the tricky ones.",
        "I make sure kids don't get injured and work on their bowling form.",
        "Message parents after each session with a short note.",
        "I studied at the university in 2019 and 2020.",
    ],
)
def test_ordinary_teaching_talk_is_not_flagged(said: str) -> None:
    assert guardrails.evaluate(_lines(said), None, [], []).status == "pass"


def test_guarantee_alone_is_low_severity() -> None:
    result = guardrails.evaluate(_lines("Guaranteed A+ in one month."), None, [], [])
    assert [f.code for f in result.flags] == ["GUARANTEED_OUTCOME"]
    assert result.status == "pass"  # low severity alone doesn't warn (CLAUDE.md §5)


def test_post_caption_and_listing_copy_are_checked_without_timestamps() -> None:
    caption_hit = guardrails.evaluate(_lines("Hello!"), "Text me 555 123 4567", [], [])
    assert caption_hit.flags[0].timestamp_s is None
    copy_hit = guardrails.evaluate(_lines("Hello!"), None, ["Visit www.example.org"], [])
    assert copy_hit.flags[0].code == "OFF_PLATFORM_CONTACT"


def test_llm_flags_must_quote_the_video() -> None:
    lines = _lines("I'm a certified coach.", "Sessions are at my place after school.")
    grounded = guardrails.ground_llm_flags(
        [
            LLMFlag("PRIVATE_MEETING_MINOR", "Sessions are at my place", "1:1 at a private home."),
            LLMFlag("UNVERIFIED_CREDENTIAL", "former Olympic champion", "Invented quote."),
            LLMFlag("NOT_A_CODE", "certified coach", "Unknown code."),
        ],
        lines,
        None,
    )
    assert [f.code for f in grounded] == ["PRIVATE_MEETING_MINOR"]
    assert grounded[0].severity == "high" and grounded[0].timestamp_s == 5.0


def test_rules_win_dedupe_and_status_follows_worst_severity() -> None:
    lines = _lines("Call me any time.", "I'm a certified trainer.")
    llm = guardrails.ground_llm_flags(
        [
            LLMFlag("OFF_PLATFORM_CONTACT", "Call me any time", "model's duplicate"),
            LLMFlag("UNVERIFIED_CREDENTIAL", "certified trainer", "No detail given."),
        ],
        lines,
        None,
    )
    result = guardrails.evaluate(lines, None, [], llm)
    assert [f.code for f in result.flags] == ["OFF_PLATFORM_CONTACT", "UNVERIFIED_CREDENTIAL"]
    assert result.flags[0].explanation != "model's duplicate"
    warn_only = guardrails.evaluate(lines[1:], None, [], llm[1:])
    assert warn_only.status == "warn"
