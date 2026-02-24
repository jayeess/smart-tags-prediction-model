"""NLP sentiment analysis for reservation notes using VADER.

VADER (Valence Aware Dictionary and sEntiment Reasoner) is specifically
designed for short, social-media-style text. Unlike TextBlob's pattern-based
approach, VADER correctly handles:
  - Negations:    "not bad" → positive (TextBlob: negative)
  - Intensifiers: "really great" → strongly positive
  - Punctuation:  "amazing!!!" → stronger than "amazing"
  - Slang/emojis: "food was lit 🔥" → positive

Falls back to TextBlob if VADER is unavailable.
"""

from dataclasses import dataclass


@dataclass
class SentimentResult:
    score: float  # 0.0 (negative) to 1.0 (positive)
    label: str  # "positive", "neutral", "negative"
    emoji: str  # color-coded emoji


def analyze_sentiment(text: str) -> SentimentResult:
    """Analyze sentiment of reservation notes.

    Primary:  VADER (handles negations, intensifiers, slang)
    Fallback: TextBlob (if VADER not installed)

    Args:
        text: The note/review text to analyze.

    Returns:
        SentimentResult with score, label, and emoji.
    """
    if not text or not text.strip():
        return SentimentResult(score=0.5, label="neutral", emoji="\U0001F7E1")

    try:
        return _vader_sentiment(text)
    except ImportError:
        return _textblob_sentiment(text)


def _vader_sentiment(text: str) -> SentimentResult:
    """VADER sentiment analysis — better for short informal text."""
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

    analyzer = SentimentIntensityAnalyzer()
    scores = analyzer.polarity_scores(text)
    compound = scores["compound"]  # -1.0 to 1.0

    # Normalize compound to 0-1 range
    score = round((compound + 1.0) / 2.0, 3)

    if compound >= 0.05:
        return SentimentResult(score=score, label="positive", emoji="\U0001F7E2")
    elif compound <= -0.05:
        return SentimentResult(score=score, label="negative", emoji="\U0001F534")
    else:
        return SentimentResult(score=score, label="neutral", emoji="\U0001F7E1")


def _textblob_sentiment(text: str) -> SentimentResult:
    """TextBlob fallback — rule-based polarity analysis."""
    from textblob import TextBlob

    blob = TextBlob(text)
    polarity = blob.sentiment.polarity  # -1.0 to 1.0

    # Normalize to 0-1 range
    score = round((polarity + 1.0) / 2.0, 3)

    if score >= 0.65:
        return SentimentResult(score=score, label="positive", emoji="\U0001F7E2")
    elif score <= 0.35:
        return SentimentResult(score=score, label="negative", emoji="\U0001F534")
    else:
        return SentimentResult(score=score, label="neutral", emoji="\U0001F7E1")
