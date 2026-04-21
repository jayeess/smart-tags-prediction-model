"""Sentiment analysis for reservation notes.

Uses a lightweight keyword heuristic as the primary path.
The LLM pipeline (tag_pipeline.py) can supply a richer sentiment result
via the optional ``llm_sentiment`` parameter; when provided it takes precedence.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class SentimentResult:
    score: float   # 0.0 (very negative) – 1.0 (very positive)
    label: str     # "positive" | "neutral" | "negative"
    emoji: str     # colour-coded circle emoji


_POSITIVE_WORDS = frozenset([
    "great", "excellent", "amazing", "wonderful", "fantastic", "love",
    "lovely", "perfect", "outstanding", "delightful", "happy", "glad",
    "celebrate", "celebrating", "anniversary", "birthday",
    "favourite", "favorite", "enjoyed", "looking forward",
])

_NEGATIVE_WORDS = frozenset([
    "terrible", "awful", "horrible", "bad", "worst", "disappointing",
    "disappointed", "unhappy", "angry", "upset", "complaint", "complain",
    "never again", "rude", "slow", "cold", "wrong", "error", "mistake",
    "refund", "disgusting", "problem", "issue",
])


def _keyword_score(text: str) -> float:
    """Return a [0, 1] sentiment score based on positive/negative word counts."""
    words = text.lower()
    pos = sum(1 for w in _POSITIVE_WORDS if w in words)
    neg = sum(1 for w in _NEGATIVE_WORDS if w in words)
    total = pos + neg
    if total == 0:
        return 0.5
    return round(pos / total, 3)


def analyze_sentiment(
    text: str,
    llm_sentiment: Optional[dict] = None,
) -> SentimentResult:
    """Analyse the sentiment of a reservation note.

    Args:
        text:          Free-text note (may be empty).
        llm_sentiment: Optional dict with keys ``score`` (float), ``label``
                       (str), and ``rationale`` (str) from the LLM pipeline.
                       When provided it overrides the heuristic.

    Returns:
        SentimentResult with score, label, and emoji.
    """
    if llm_sentiment:
        score = float(llm_sentiment.get("score", 0.5))
        label = str(llm_sentiment.get("label", "neutral"))
        emoji = _label_to_emoji(label)
        return SentimentResult(score=round(score, 3), label=label, emoji=emoji)

    if not text or not text.strip():
        return SentimentResult(score=0.5, label="neutral", emoji="\U0001F7E1")

    score = _keyword_score(text)

    if score >= 0.65:
        return SentimentResult(score=score, label="positive", emoji="\U0001F7E2")
    elif score <= 0.35:
        return SentimentResult(score=score, label="negative", emoji="\U0001F534")
    else:
        return SentimentResult(score=score, label="neutral", emoji="\U0001F7E1")


def _label_to_emoji(label: str) -> str:
    return {
        "positive": "\U0001F7E2",
        "negative": "\U0001F534",
    }.get(label, "\U0001F7E1")
