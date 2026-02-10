"""NLP sentiment analysis for reservation notes."""

from dataclasses import dataclass


@dataclass
class SentimentResult:
    score: float  # 0.0 (negative) to 1.0 (positive)
    label: str  # "positive", "neutral", "negative"
    emoji: str  # color-coded emoji


def analyze_sentiment(text: str) -> SentimentResult:
    """Analyze sentiment of reservation notes using TextBlob.

    Converts TextBlob polarity (-1 to 1) into a normalized score (0 to 1).

    Args:
        text: The note/review text to analyze.

    Returns:
        SentimentResult with score, label, and emoji.
    """
    if not text or not text.strip():
        return SentimentResult(score=0.5, label="neutral", emoji="\U0001F7E1")

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
