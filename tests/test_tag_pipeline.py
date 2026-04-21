"""Tests for ml_service/tag_pipeline.py.

LLM calls are mocked throughout — no real API traffic in CI.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from ml_service.llm_tags import (
    ExtractedTag,
    LLMSentiment,
    LLMTagResult,
    LLMUnavailableError,
    clear_cache,
)
from ml_service.tag_pipeline import (
    PipelineTag,
    TagPipelineResult,
    _fallback_regex_tags,
    _structured_form_tags,
    run_pipeline,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _llm_result(tags: list[dict], urgency: str = "low", sentiment_score: float = 0.5) -> LLMTagResult:
    return LLMTagResult(
        tags=[
            ExtractedTag(
                tag=t["tag"],
                category=t.get("category", "occasion"),
                confidence=t.get("confidence", 0.9),
                evidence_span=t.get("evidence_span", t["tag"]),
            )
            for t in tags
        ],
        urgency=urgency,
        sentiment=LLMSentiment(
            score=sentiment_score,
            label="positive" if sentiment_score >= 0.65 else "neutral",
            rationale="test",
        ),
        cached=False,
        input_tokens=100,
        output_tokens=50,
        estimated_cost_usd=0.001,
    )


def _empty_llm_result() -> LLMTagResult:
    return _llm_result([], urgency="low", sentiment_score=0.5)


@pytest.fixture(autouse=True)
def clear_llm_cache_fixture():
    clear_cache()
    yield
    clear_cache()


# ---------------------------------------------------------------------------
# Layer 1: structured_form
# ---------------------------------------------------------------------------

class TestStructuredFormLayer:
    def test_repeat_guest_returns_returning_tag(self):
        tags = _structured_form_tags(is_repeat_guest=True, children=0, party_size=2, previous_completions=2)
        assert any(t.tag == "returning guest" for t in tags)

    def test_loyal_regular_at_five_completions(self):
        tags = _structured_form_tags(is_repeat_guest=True, children=0, party_size=2, previous_completions=5)
        assert any(t.tag == "loyal regular" for t in tags)

    def test_children_produces_family_tag(self):
        tags = _structured_form_tags(is_repeat_guest=False, children=2, party_size=4, previous_completions=0)
        assert any(t.tag == "family with children" for t in tags)

    def test_large_group_at_eight(self):
        tags = _structured_form_tags(is_repeat_guest=False, children=0, party_size=8, previous_completions=0)
        assert any(t.tag == "large group" for t in tags)

    def test_no_tags_for_plain_new_guest(self):
        tags = _structured_form_tags(is_repeat_guest=False, children=0, party_size=2, previous_completions=0)
        assert tags == []

    def test_source_is_structured_form(self):
        tags = _structured_form_tags(is_repeat_guest=True, children=1, party_size=2, previous_completions=0)
        assert all(t.source == "structured_form" for t in tags)

    def test_provenance_icon_is_notepad(self):
        tags = _structured_form_tags(is_repeat_guest=True, children=0, party_size=2, previous_completions=0)
        assert all(t.provenance_icon == "📝" for t in tags)


# ---------------------------------------------------------------------------
# Layer 4: fallback_regex
# ---------------------------------------------------------------------------

class TestFallbackRegexLayer:
    def test_birthday_detected(self):
        tags = _fallback_regex_tags("It's her birthday!")
        assert any(t.tag == "birthday" for t in tags)

    def test_anniversary_detected(self):
        tags = _fallback_regex_tags("our anniversary dinner")
        assert any(t.tag == "anniversary" for t in tags)

    def test_wheelchair_detected(self):
        tags = _fallback_regex_tags("Guest uses a wheelchair")
        assert any(t.tag == "wheelchair" for t in tags)

    def test_high_chair_detected(self):
        tags = _fallback_regex_tags("We need a high chair")
        assert any(t.tag == "high chair" for t in tags)

    def test_allergy_detected(self):
        tags = _fallback_regex_tags("nut allergy — very serious")
        assert any(t.tag == "allergy" for t in tags)

    def test_epipen_detected(self):
        tags = _fallback_regex_tags("Guest carries EpiPen")
        assert any(t.tag == "epipen / anaphylaxis" for t in tags)

    def test_anaphylaxis_detected(self):
        tags = _fallback_regex_tags("risk of anaphylaxis")
        assert any(t.tag == "epipen / anaphylaxis" for t in tags)

    def test_no_match_returns_empty(self):
        tags = _fallback_regex_tags("window seat please")
        assert tags == []

    def test_source_is_fallback_regex(self):
        tags = _fallback_regex_tags("birthday dinner")
        assert all(t.source == "fallback_regex" for t in tags)

    def test_provenance_icon_is_warning(self):
        tags = _fallback_regex_tags("birthday dinner")
        assert all("⚠" in t.provenance_icon for t in tags)


# ---------------------------------------------------------------------------
# Pipeline: LLM happy path
# ---------------------------------------------------------------------------

class TestPipelineLLMHappyPath:
    def test_llm_tags_included_in_result(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_llm_result([{"tag": "birthday", "category": "occasion"}]),
        ):
            result = run_pipeline("birthday dinner", locale="en")

        assert any(t.tag == "birthday" and t.source == "llm" for t in result.tags)
        assert result.llm_used is True

    def test_llm_urgency_propagated(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_llm_result(
                [{"tag": "epipen", "category": "dietary"}], urgency="high"
            ),
        ):
            result = run_pipeline("carries epipen", locale="en")

        assert result.urgency == "high"

    def test_llm_sentiment_propagated(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_llm_result([], urgency="low", sentiment_score=0.8),
        ):
            result = run_pipeline("lovely experience", locale="en")

        assert result.llm_sentiment is not None
        assert result.llm_sentiment.score == pytest.approx(0.8)

    def test_fallback_not_used_when_llm_returns_tags(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_llm_result([{"tag": "birthday", "category": "occasion"}]),
        ):
            result = run_pipeline("birthday dinner", locale="en")

        assert result.fallback_used is False
        assert not any(t.source == "fallback_regex" for t in result.tags)

    def test_llm_provenance_icon_is_robot(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_llm_result([{"tag": "vegan", "category": "dietary"}]),
        ):
            result = run_pipeline("strictly vegan", locale="en")

        llm_tags = [t for t in result.tags if t.source == "llm"]
        assert all(t.provenance_icon == "🤖" for t in llm_tags)


# ---------------------------------------------------------------------------
# Pipeline: fallback when LLM unavailable
# ---------------------------------------------------------------------------

class TestPipelineLLMFallback:
    def test_fallback_runs_when_llm_unavailable(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            side_effect=LLMUnavailableError("no key"),
        ):
            result = run_pipeline("birthday dinner", locale="en")

        assert result.llm_used is False
        assert result.fallback_used is True
        assert any(t.tag == "birthday" for t in result.tags)

    def test_fallback_runs_when_llm_returns_zero_tags(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_empty_llm_result(),
        ):
            result = run_pipeline("wheelchair access required", locale="en")

        assert result.fallback_used is True
        assert any(t.tag == "wheelchair" for t in result.tags)

    def test_llm_required_true_raises_on_unavailable(self, monkeypatch):
        monkeypatch.setenv("LLM_TAGS_REQUIRED", "true")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            side_effect=LLMUnavailableError("no key"),
        ):
            with pytest.raises(LLMUnavailableError):
                run_pipeline("birthday", locale="en")

    def test_llm_required_false_does_not_raise(self, monkeypatch):
        monkeypatch.setenv("LLM_TAGS_REQUIRED", "false")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            side_effect=LLMUnavailableError("no key"),
        ):
            result = run_pipeline("birthday", locale="en")

        assert result.llm_used is False

    def test_unexpected_llm_exception_falls_through(self, monkeypatch):
        monkeypatch.delenv("LLM_TAGS_REQUIRED", raising=False)
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            side_effect=RuntimeError("timeout"),
        ):
            result = run_pipeline("anniversary", locale="en")

        assert result.llm_used is False
        assert any(t.tag == "anniversary" for t in result.tags)

    def test_fallback_urgency_high_on_epipen(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            side_effect=LLMUnavailableError("no key"),
        ):
            result = run_pipeline("Guest carries EpiPen", locale="en")

        assert result.urgency == "high"


# ---------------------------------------------------------------------------
# Pipeline: structured_form + LLM together
# ---------------------------------------------------------------------------

class TestPipelineMerge:
    def test_structured_tags_always_included(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_llm_result([{"tag": "birthday", "category": "occasion"}]),
        ):
            result = run_pipeline(
                "birthday dinner", is_repeat_guest=True, previous_completions=2, locale="en"
            )

        sources = {t.source for t in result.tags}
        assert "structured_form" in sources
        assert "llm" in sources

    def test_dedup_removes_duplicate_tags(self, monkeypatch):
        """If LLM and fallback_regex both emit 'birthday', only one survives."""
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_empty_llm_result(),
        ):
            result = run_pipeline("birthday celebration", locale="en")

        birthday_tags = [t for t in result.tags if t.tag == "birthday"]
        assert len(birthday_tags) == 1

    def test_dedup_is_case_insensitive(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_llm_result([{"tag": "Birthday", "category": "occasion"}]),
        ):
            result = run_pipeline("birthday dinner", locale="en")

        birthday_tags = [t for t in result.tags if t.tag.lower() == "birthday"]
        assert len(birthday_tags) == 1

    def test_empty_note_returns_only_form_tags(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_empty_llm_result(),
        ):
            result = run_pipeline("", is_repeat_guest=True, previous_completions=0, locale="en")

        assert any(t.source == "structured_form" for t in result.tags)
        assert not any(t.source == "fallback_regex" for t in result.tags)

    def test_result_type_is_tag_pipeline_result(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
        with patch(
            "ml_service.tag_pipeline.extract_tags_llm",
            return_value=_empty_llm_result(),
        ):
            result = run_pipeline("test note")

        assert isinstance(result, TagPipelineResult)
        assert isinstance(result.tags, list)
