"""Sentiment analysis for reservation notes.

Three-tier fallback chain
--------------------------
1. LLM override  — when the v2 tag pipeline (llm_tags.py) has already called
   Claude and the emit_tags tool response includes a sentiment block, pass
   that dict via ``llm_sentiment=``.  This is the best possible signal and
   is used as-is without any further processing.

2. TextBlob      — default path for all callers that do not have LLM output
   (predictor, v1 analyze-tags endpoint, etc.).  Uses TextBlob's bundled
   PatternAnalyzer, which does NOT require NLTK corpus downloads.

3. Keyword heuristic — last-resort fallback triggered only when TextBlob
   raises (e.g. package not installed, import error on a degraded deploy).
   A WARNING is logged so the degradation is visible in Render logs.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

try:
    from textblob import TextBlob
except ImportError:
    TextBlob = None  # type: ignore[assignment,misc]

logger = logging.getLogger(__name__)


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
    words = text.lower()
    pos = sum(1 for w in _POSITIVE_WORDS if w in words)
    neg = sum(1 for w in _NEGATIVE_WORDS if w in words)
    total = pos + neg
    if total == 0:
        return 0.5
    return round(pos / total, 3)


def _score_to_result(score: float) -> SentimentResult:
    if score >= 0.65:
        return SentimentResult(score=score, label="positive", emoji="\U0001F7E2")
    if score <= 0.35:
        return SentimentResult(score=score, label="negative", emoji="\U0001F534")
    return SentimentResult(score=score, label="neutral", emoji="\U0001F7E1")


def _label_to_emoji(label: str) -> str:
    return {
        "positive": "\U0001F7E2",
        "negative": "\U0001F534",
    }.get(label, "\U0001F7E1")


def analyze_sentiment(
    text: str,
    llm_sentiment: Optional[dict] = None,
) -> SentimentResult:
    """Analyse the sentiment of a reservation note.

    Args:
        text:          Free-text note (may be empty).
        llm_sentiment: Optional dict with keys ``score`` (float), ``label``
                       (str), and ``rationale`` (str) from the LLM pipeline
                       (emit_tags tool response).  When provided, it is
                       returned directly without further processing.

    Returns:
        SentimentResult with score, label, and emoji.
    """
    # --- Tier 1: LLM override ---
    if llm_sentiment:
        score = round(float(llm_sentiment.get("score", 0.5)), 3)
        label = str(llm_sentiment.get("label", "neutral"))
        return SentimentResult(score=score, label=label, emoji=_label_to_emoji(label))

    # --- Empty text ---
    if not text or not text.strip():
        return SentimentResult(score=0.5, label="neutral", emoji="\U0001F7E1")

    # --- Tier 2: TextBlob (PatternAnalyzer, no NLTK corpora needed) ---
    if TextBlob is not None:
        try:
            polarity = TextBlob(text).sentiment.polarity  # -1.0 … +1.0
            score = round((polarity + 1.0) / 2.0, 3)
            return _score_to_result(score)
        except Exception as exc:
            logger.warning("TextBlob sentiment failed (%s), using keyword fallback", exc)
    else:
        logger.warning("TextBlob not installed, using keyword fallback")

    # --- Tier 3: keyword heuristic (last resort) ---
    score = _keyword_score(text)
    return _score_to_result(score)
