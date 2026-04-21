"""Tests for the refactored ml_service/sentiment.py (keyword heuristic, no TextBlob)."""
from __future__ import annotations

import pytest

from ml_service.sentiment import SentimentResult, analyze_sentiment


class TestHeuristicSentiment:
    def test_empty_text_is_neutral(self):
        result = analyze_sentiment("")
        assert result.label == "neutral"
        assert result.score == pytest.approx(0.5)

    def test_whitespace_only_is_neutral(self):
        result = analyze_sentiment("   ")
        assert result.label == "neutral"

    def test_positive_words_give_positive_label(self):
        result = analyze_sentiment("It was an amazing and wonderful experience!")
        assert result.label == "positive"

    def test_negative_words_give_negative_label(self):
        result = analyze_sentiment("Last visit was terrible, food was cold and awful.")
        assert result.label == "negative"

    def test_mixed_text_is_neutral(self):
        result = analyze_sentiment("It was okay, nothing special.")
        assert result.label == "neutral"

    def test_positive_emoji_is_green(self):
        result = analyze_sentiment("great and amazing!")
        assert result.emoji == "\U0001F7E2"

    def test_negative_emoji_is_red(self):
        result = analyze_sentiment("terrible and awful and horrible!")
        assert result.emoji == "\U0001F534"

    def test_neutral_emoji_is_yellow(self):
        result = analyze_sentiment("")
        assert result.emoji == "\U0001F7E1"

    def test_score_is_between_zero_and_one(self):
        for text in ["great", "terrible", "meh", ""]:
            result = analyze_sentiment(text)
            assert 0.0 <= result.score <= 1.0

    def test_return_type_is_sentiment_result(self):
        result = analyze_sentiment("nice dinner")
        assert isinstance(result, SentimentResult)


class TestLLMSentimentOverride:
    def test_llm_sentiment_overrides_heuristic(self):
        result = analyze_sentiment(
            "terrible experience",
            llm_sentiment={"score": 0.8, "label": "positive", "rationale": "test"},
        )
        assert result.label == "positive"
        assert result.score == pytest.approx(0.8)

    def test_llm_negative_uses_red_emoji(self):
        result = analyze_sentiment(
            "",
            llm_sentiment={"score": 0.2, "label": "negative", "rationale": "test"},
        )
        assert result.emoji == "\U0001F534"

    def test_llm_sentiment_none_falls_through_to_heuristic(self):
        result = analyze_sentiment("amazing!", llm_sentiment=None)
        assert result.label == "positive"
