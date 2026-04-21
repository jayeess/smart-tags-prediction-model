"""Tests for ml_service/llm_tags.py.

All Anthropic API calls are mocked — no real network traffic in CI.
"""
from __future__ import annotations

import os
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from ml_service.llm_tags import (
    ExtractedTag,
    LLMSentiment,
    LLMTagResult,
    LLMUnavailableError,
    clear_cache,
    extract_tags_llm,
)


# ---------------------------------------------------------------------------
# Helpers to build mock Anthropic responses
# ---------------------------------------------------------------------------

def _mock_tool_block(tool_input: dict) -> MagicMock:
    block = MagicMock()
    block.type = "tool_use"
    block.name = "emit_tags"
    block.input = tool_input
    return block


def _mock_response(tool_input: dict, input_tokens: int = 120, output_tokens: int = 80) -> MagicMock:
    resp = MagicMock()
    resp.content = [_mock_tool_block(tool_input)]
    resp.usage = MagicMock(input_tokens=input_tokens, output_tokens=output_tokens)
    return resp


def _mock_anthropic_client(tool_input: dict, **kwargs) -> MagicMock:
    client = MagicMock()
    client.messages.create.return_value = _mock_response(tool_input, **kwargs)
    return client


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clear_llm_cache():
    """Ensure a clean cache before every test."""
    clear_cache()
    yield
    clear_cache()


@pytest.fixture()
def api_key_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-real")


# ---------------------------------------------------------------------------
# LLMUnavailableError when key absent
# ---------------------------------------------------------------------------

class TestMissingApiKey:
    def test_raises_llm_unavailable_when_key_absent(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with patch("ml_service.llm_tags.anthropic", MagicMock()):
            with pytest.raises(LLMUnavailableError, match="ANTHROPIC_API_KEY"):
                extract_tags_llm("birthday dinner")

    def test_error_message_mentions_key_name(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        with patch("ml_service.llm_tags.anthropic", MagicMock()):
            try:
                extract_tags_llm("test")
            except LLMUnavailableError as exc:
                assert "ANTHROPIC_API_KEY" in str(exc)


# ---------------------------------------------------------------------------
# Happy-path: tags extracted correctly
# ---------------------------------------------------------------------------

class TestHappyPath:
    def test_birthday_tag_extracted(self, api_key_env):
        tool_input = {
            "tags": [
                {"tag": "birthday", "category": "occasion", "confidence": 0.97,
                 "evidence_span": "celebrating her birthday"},
            ],
            "urgency": "medium",
            "sentiment": {"score": 0.75, "label": "positive", "rationale": "Celebratory note."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm("We are celebrating her birthday tonight", locale="en")

        assert len(result.tags) == 1
        tag = result.tags[0]
        assert tag.tag == "birthday"
        assert tag.category == "occasion"
        assert tag.confidence == pytest.approx(0.97)
        assert tag.evidence_span == "celebrating her birthday"

    def test_urgency_high_on_epipen(self, api_key_env):
        tool_input = {
            "tags": [
                {"tag": "epipen", "category": "dietary", "confidence": 0.99,
                 "evidence_span": "carries an EpiPen"},
                {"tag": "shellfish allergy", "category": "dietary", "confidence": 0.99,
                 "evidence_span": "severe shellfish allergy"},
            ],
            "urgency": "high",
            "sentiment": {"score": 0.45, "label": "neutral", "rationale": "Factual safety note."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm("Guest carries an EpiPen. Severe shellfish allergy.", locale="en")

        assert result.urgency == "high"
        assert len(result.tags) == 2

    def test_sentiment_populated(self, api_key_env):
        tool_input = {
            "tags": [],
            "urgency": "low",
            "sentiment": {"score": 0.8, "label": "positive", "rationale": "Very positive tone."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm("Amazing experience last time!", locale="en")

        assert result.sentiment is not None
        assert result.sentiment.label == "positive"
        assert result.sentiment.score == pytest.approx(0.8)

    def test_empty_note_returns_empty_tags(self, api_key_env):
        tool_input = {
            "tags": [],
            "urgency": "low",
            "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note provided."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm("", locale="en")

        assert result.tags == []
        assert result.urgency == "low"

    def test_arabic_locale_returns_english_tags(self, api_key_env):
        tool_input = {
            "tags": [
                {"tag": "birthday", "category": "occasion", "confidence": 0.97,
                 "evidence_span": "عيد ميلاد زوجتي"},
            ],
            "urgency": "medium",
            "sentiment": {"score": 0.7, "label": "positive", "rationale": "Birthday celebration."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm("عيد ميلاد زوجتي", locale="ar")

        assert result.tags[0].tag == "birthday"
        assert result.tags[0].evidence_span == "عيد ميلاد زوجتي"

    def test_multiple_tags_all_returned(self, api_key_env):
        tool_input = {
            "tags": [
                {"tag": "anniversary", "category": "occasion", "confidence": 0.97,
                 "evidence_span": "our anniversary"},
                {"tag": "gluten-free", "category": "dietary", "confidence": 0.98,
                 "evidence_span": "strictly gluten-free"},
                {"tag": "dessert check required", "category": "operational", "confidence": 0.85,
                 "evidence_span": "make sure the dessert is safe"},
            ],
            "urgency": "medium",
            "sentiment": {"score": 0.65, "label": "positive", "rationale": "Celebratory note."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm(
                "It's our anniversary and my wife is strictly gluten-free. "
                "Please make sure the dessert is safe.",
                locale="en",
            )

        assert len(result.tags) == 3
        categories = {t.category for t in result.tags}
        assert "occasion" in categories
        assert "dietary" in categories


# ---------------------------------------------------------------------------
# Token counts and cost estimate
# ---------------------------------------------------------------------------

class TestCostTracking:
    def test_token_counts_captured(self, api_key_env):
        tool_input = {"tags": [], "urgency": "low",
                      "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note."}}
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(
                tool_input, input_tokens=200, output_tokens=50
            )
            result = extract_tags_llm("test note", locale="en")

        assert result.input_tokens == 200
        assert result.output_tokens == 50

    def test_estimated_cost_positive(self, api_key_env):
        tool_input = {"tags": [], "urgency": "low",
                      "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note."}}
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(
                tool_input, input_tokens=150, output_tokens=60
            )
            result = extract_tags_llm("test note", locale="en")

        assert result.estimated_cost_usd > 0

    def test_cost_formula(self, api_key_env):
        tool_input = {"tags": [], "urgency": "low",
                      "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note."}}
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(
                tool_input, input_tokens=1_000_000, output_tokens=1_000_000
            )
            result = extract_tags_llm("cost test", locale="en")

        # $3/M input + $15/M output = $18 for 1M each
        assert result.estimated_cost_usd == pytest.approx(18.0, rel=1e-4)


# ---------------------------------------------------------------------------
# Caching
# ---------------------------------------------------------------------------

class TestCaching:
    def test_second_call_is_cached(self, api_key_env):
        tool_input = {
            "tags": [{"tag": "vegan", "category": "dietary", "confidence": 0.95,
                      "evidence_span": "vegan"}],
            "urgency": "low",
            "sentiment": {"score": 0.5, "label": "neutral", "rationale": "Plain note."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            client_mock = _mock_anthropic_client(tool_input)
            mock_anthropic.Anthropic.return_value = client_mock

            result1 = extract_tags_llm("I am vegan", locale="en")
            result2 = extract_tags_llm("I am vegan", locale="en")

        # API called only once
        assert client_mock.messages.create.call_count == 1
        assert result1.cached is False
        assert result2.cached is True

    def test_different_locale_is_different_cache_entry(self, api_key_env):
        tool_input = {"tags": [], "urgency": "low",
                      "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note."}}
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            client_mock = _mock_anthropic_client(tool_input)
            mock_anthropic.Anthropic.return_value = client_mock

            extract_tags_llm("test", locale="en")
            extract_tags_llm("test", locale="ar")

        assert client_mock.messages.create.call_count == 2

    def test_different_text_is_different_cache_entry(self, api_key_env):
        tool_input = {"tags": [], "urgency": "low",
                      "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note."}}
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            client_mock = _mock_anthropic_client(tool_input)
            mock_anthropic.Anthropic.return_value = client_mock

            extract_tags_llm("note one", locale="en")
            extract_tags_llm("note two", locale="en")

        assert client_mock.messages.create.call_count == 2

    def test_clear_cache_forces_new_call(self, api_key_env):
        tool_input = {"tags": [], "urgency": "low",
                      "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note."}}
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            client_mock = _mock_anthropic_client(tool_input)
            mock_anthropic.Anthropic.return_value = client_mock

            extract_tags_llm("same note", locale="en")
            clear_cache()
            extract_tags_llm("same note", locale="en")

        assert client_mock.messages.create.call_count == 2

    def test_cache_fifo_eviction(self, api_key_env):
        """After filling 1001 entries the oldest is evicted."""
        from ml_service.llm_tags import _cache, _CACHE_MAX

        tool_input = {"tags": [], "urgency": "low",
                      "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note."}}
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            client_mock = _mock_anthropic_client(tool_input)
            mock_anthropic.Anthropic.return_value = client_mock

            # Fill cache to exactly _CACHE_MAX + 1
            for i in range(_CACHE_MAX + 1):
                extract_tags_llm(f"unique note {i}", locale="en")

        assert len(_cache) == _CACHE_MAX


# ---------------------------------------------------------------------------
# Result structure
# ---------------------------------------------------------------------------

class TestResultStructure:
    def test_not_cached_on_first_call(self, api_key_env):
        tool_input = {"tags": [], "urgency": "low",
                      "sentiment": {"score": 0.5, "label": "neutral", "rationale": "No note."}}
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm("fresh note", locale="en")

        assert result.cached is False

    def test_extracted_tag_fields_present(self, api_key_env):
        tool_input = {
            "tags": [
                {"tag": "wheelchair", "category": "accessibility",
                 "confidence": 0.98, "evidence_span": "wheelchair user"},
            ],
            "urgency": "medium",
            "sentiment": {"score": 0.5, "label": "neutral", "rationale": "Accessibility request."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm("Guest is a wheelchair user", locale="en")

        tag = result.tags[0]
        assert isinstance(tag, ExtractedTag)
        assert tag.tag == "wheelchair"
        assert tag.category == "accessibility"
        assert 0.0 <= tag.confidence <= 1.0
        assert isinstance(tag.evidence_span, str)

    def test_sentiment_fields_present(self, api_key_env):
        tool_input = {
            "tags": [],
            "urgency": "low",
            "sentiment": {"score": 0.3, "label": "negative", "rationale": "Complaint-like tone."},
        }
        with patch("ml_service.llm_tags.anthropic") as mock_anthropic:
            mock_anthropic.Anthropic.return_value = _mock_anthropic_client(tool_input)
            result = extract_tags_llm("Very unhappy with last visit", locale="en")

        assert isinstance(result.sentiment, LLMSentiment)
        assert result.sentiment.label == "negative"
        assert isinstance(result.sentiment.rationale, str)
