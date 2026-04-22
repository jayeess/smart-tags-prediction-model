"""Tests for ml_service/sentiment.py — three-tier fallback chain.

Tier 1: LLM override (llm_sentiment dict provided)
Tier 2: TextBlob PatternAnalyzer (mocked so tests don't need NLTK corpora)
Tier 3: Keyword heuristic (TextBlob import raises, last-resort path)
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from ml_service.sentiment import SentimentResult, analyze_sentiment


# ---------------------------------------------------------------------------
# Tier 1 — LLM override
# ---------------------------------------------------------------------------

class TestLLMOverride:
    def test_llm_score_returned_directly(self):
        result = analyze_sentiment(
            "terrible food",
            llm_sentiment={"score": 0.85, "label": "positive", "rationale": "guest seemed happy"},
        )
        assert result.score == pytest.approx(0.85)
        assert result.label == "positive"

    def test_llm_negative_label(self):
        result = analyze_sentiment(
            "great evening",  # would be positive from TextBlob/keywords
            llm_sentiment={"score": 0.2, "label": "negative", "rationale": "complaint tone"},
        )
        assert result.label == "negative"

    def test_llm_override_sets_green_emoji_for_positive(self):
        result = analyze_sentiment(
            "", llm_sentiment={"score": 0.9, "label": "positive", "rationale": "x"}
        )
        assert result.emoji == "\U0001F7E2"

    def test_llm_override_sets_red_emoji_for_negative(self):
        result = analyze_sentiment(
            "", llm_sentiment={"score": 0.1, "label": "negative", "rationale": "x"}
        )
        assert result.emoji == "\U0001F534"

    def test_llm_override_sets_yellow_emoji_for_neutral(self):
        result = analyze_sentiment(
            "", llm_sentiment={"score": 0.5, "label": "neutral", "rationale": "x"}
        )
        assert result.emoji == "\U0001F7E1"

    def test_llm_none_does_not_short_circuit(self):
        # Passing None should fall through to TextBlob
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            mock_tb.return_value.sentiment.polarity = 0.8
            result = analyze_sentiment("great dinner", llm_sentiment=None)
        assert result.label == "positive"


# ---------------------------------------------------------------------------
# Tier 2 — TextBlob (mocked)
# ---------------------------------------------------------------------------

class TestTextBlobTier:
    def test_positive_polarity_gives_positive_label(self):
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            mock_tb.return_value.sentiment.polarity = 0.7
            result = analyze_sentiment("lovely anniversary")
        assert result.label == "positive"

    def test_negative_polarity_gives_negative_label(self):
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            mock_tb.return_value.sentiment.polarity = -0.6
            result = analyze_sentiment("terrible slow service")
        assert result.label == "negative"

    def test_zero_polarity_gives_neutral_label(self):
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            mock_tb.return_value.sentiment.polarity = 0.0
            result = analyze_sentiment("table for two at seven")
        assert result.label == "neutral"

    def test_score_is_normalised_from_polarity(self):
        # polarity=0.6 → score=(0.6+1)/2=0.8
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            mock_tb.return_value.sentiment.polarity = 0.6
            result = analyze_sentiment("nice place")
        assert result.score == pytest.approx(0.8, abs=1e-3)

    def test_return_type_is_sentiment_result(self):
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            mock_tb.return_value.sentiment.polarity = 0.0
            result = analyze_sentiment("standard reservation")
        assert isinstance(result, SentimentResult)

    def test_textblob_called_with_text(self):
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            mock_tb.return_value.sentiment.polarity = 0.0
            analyze_sentiment("check the text arg")
        mock_tb.assert_called_once_with("check the text arg")

    def test_score_between_zero_and_one(self):
        for polarity in [-1.0, -0.5, 0.0, 0.5, 1.0]:
            with patch("ml_service.sentiment.TextBlob") as mock_tb:
                mock_tb.return_value.sentiment.polarity = polarity
                result = analyze_sentiment("any text")
            assert 0.0 <= result.score <= 1.0

    def test_empty_text_returns_neutral_without_calling_textblob(self):
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            result = analyze_sentiment("")
        mock_tb.assert_not_called()
        assert result.label == "neutral"
        assert result.score == pytest.approx(0.5)

    def test_whitespace_only_returns_neutral_without_calling_textblob(self):
        with patch("ml_service.sentiment.TextBlob") as mock_tb:
            result = analyze_sentiment("   ")
        mock_tb.assert_not_called()
        assert result.label == "neutral"


# ---------------------------------------------------------------------------
# Tier 3 — Keyword heuristic fallback (TextBlob raises)
# ---------------------------------------------------------------------------

class TestKeywordFallbackTier:
    def test_keyword_fallback_used_when_textblob_raises(self):
        with patch("ml_service.sentiment.TextBlob", side_effect=ImportError("not installed")):
            result = analyze_sentiment("amazing wonderful dinner")
        # keyword heuristic: "amazing" and "wonderful" both in positive set
        assert result.label == "positive"

    def test_keyword_fallback_negative_path(self):
        with patch("ml_service.sentiment.TextBlob", side_effect=RuntimeError("corpus missing")):
            result = analyze_sentiment("terrible awful horrible experience")
        assert result.label == "negative"

    def test_keyword_fallback_neutral_on_no_match(self):
        with patch("ml_service.sentiment.TextBlob", side_effect=Exception("any error")):
            result = analyze_sentiment("table for four at eight pm")
        assert result.label == "neutral"
        assert result.score == pytest.approx(0.5)

    def test_warning_logged_when_textblob_raises(self, caplog):
        import logging
        with caplog.at_level(logging.WARNING, logger="ml_service.sentiment"):
            with patch("ml_service.sentiment.TextBlob", side_effect=Exception("boom")):
                analyze_sentiment("some text")
        assert any("TextBlob sentiment failed" in r.message for r in caplog.records)

    def test_fallback_returns_sentiment_result_type(self):
        with patch("ml_service.sentiment.TextBlob", side_effect=Exception("fail")):
            result = analyze_sentiment("great dinner")
        assert isinstance(result, SentimentResult)
