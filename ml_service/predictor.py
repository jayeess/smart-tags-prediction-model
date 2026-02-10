"""Main prediction orchestrator - combines model inference, data mapping, and sentiment."""

import logging
from dataclasses import dataclass, asdict
from typing import Optional

import numpy as np

from .sentiment import analyze_sentiment, SentimentResult

logger = logging.getLogger(__name__)


@dataclass
class GuestPrediction:
    reliability_score: float  # 0-1, probability of showing up (not canceling)
    no_show_risk: float  # 0-1, probability of no-show/cancellation
    risk_label: str  # "Low Risk", "Medium Risk", "High Risk"
    ai_tag: str  # "Low Risk", "High Spend Potential", "Likely No-Show"
    spend_tag: str  # "Budget", "Standard", "Premium", "Luxury"
    sentiment: SentimentResult
    confidence: float  # Model confidence

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def _heuristic_reliability(
    booking_advance_days: int,
    previous_cancellations: int,
    previous_completions: int,
    is_repeat_guest: bool,
    estimated_spend_per_cover: float,
) -> float:
    """Rule-based fallback when the ANN model is unavailable."""
    score = 0.65

    if is_repeat_guest:
        score += 0.10
    if previous_completions >= 3:
        score += 0.10
    if previous_cancellations >= 2:
        score -= 0.25
    elif previous_cancellations == 1:
        score -= 0.10
    if booking_advance_days > 30:
        score -= 0.05
    if estimated_spend_per_cover >= 150:
        score += 0.05

    return round(max(0.0, min(1.0, score)), 3)


class GuestBehaviorPredictor:
    """Orchestrates the full prediction pipeline:
    1. Map restaurant data -> hotel feature vector
    2. Run ANN model inference (or heuristic fallback)
    3. Analyze note sentiment
    4. Produce guest insight tags
    """

    def __init__(self):
        self._model = None
        self._preprocessor = None
        self._model_available = None  # None = not tried yet

    def _ensure_loaded(self):
        if self._model_available is not None:
            return
        try:
            from .model_loader import load_keras_model, build_preprocessor
            self._model = load_keras_model()
            self._preprocessor = build_preprocessor()
            self._model_available = True
            logger.info("ANN model loaded successfully")
        except Exception as e:
            logger.warning(f"ANN model unavailable, using heuristic fallback: {e}")
            self._model_available = False

    def predict(
        self,
        tenant_id: str,
        party_size: int = 2,
        children: int = 0,
        booking_advance_days: int = 0,
        special_needs_count: int = 0,
        is_repeat_guest: bool = False,
        estimated_spend_per_cover: float = 80.0,
        reservation_date: Optional[str] = None,
        previous_cancellations: int = 0,
        previous_completions: int = 0,
        booking_channel: str = "Online",
        notes: str = "",
    ) -> GuestPrediction:
        """Generate a full guest behavior prediction."""
        self._ensure_loaded()

        if self._model_available:
            from .data_mapper import RestaurantToHotelMapper

            feature_df = RestaurantToHotelMapper.map_reservation(
                party_size=party_size,
                children=children,
                booking_advance_days=booking_advance_days,
                special_needs_count=special_needs_count,
                is_repeat_guest=is_repeat_guest,
                estimated_spend_per_cover=estimated_spend_per_cover,
                reservation_date=reservation_date,
                previous_cancellations=previous_cancellations,
                previous_completions=previous_completions,
                booking_channel=booking_channel,
            )

            X = self._preprocessor.transform(feature_df)
            raw_prediction = self._model.predict(X, verbose=0)
            reliability_score = float(raw_prediction[0][0])
            confidence = round(abs(reliability_score - 0.5) * 2, 3)
        else:
            reliability_score = _heuristic_reliability(
                booking_advance_days=booking_advance_days,
                previous_cancellations=previous_cancellations,
                previous_completions=previous_completions,
                is_repeat_guest=is_repeat_guest,
                estimated_spend_per_cover=estimated_spend_per_cover,
            )
            confidence = 0.55  # lower confidence for heuristic

        no_show_risk = round(1.0 - reliability_score, 3)
        reliability_score = round(reliability_score, 3)

        # Risk label
        if no_show_risk >= 0.6:
            risk_label = "High Risk"
        elif no_show_risk >= 0.35:
            risk_label = "Medium Risk"
        else:
            risk_label = "Low Risk"

        # AI tag
        if no_show_risk >= 0.6:
            ai_tag = "Likely No-Show"
        elif estimated_spend_per_cover >= 150:
            ai_tag = "High Spend Potential"
        elif is_repeat_guest and previous_completions >= 3:
            ai_tag = "Loyal Regular"
        else:
            ai_tag = "Low Risk"

        # Spend tier
        if estimated_spend_per_cover >= 200:
            spend_tag = "Luxury"
        elif estimated_spend_per_cover >= 120:
            spend_tag = "Premium"
        elif estimated_spend_per_cover >= 60:
            spend_tag = "Standard"
        else:
            spend_tag = "Budget"

        # Sentiment
        sentiment = analyze_sentiment(notes)

        return GuestPrediction(
            reliability_score=reliability_score,
            no_show_risk=no_show_risk,
            risk_label=risk_label,
            ai_tag=ai_tag,
            spend_tag=spend_tag,
            sentiment=sentiment,
            confidence=confidence,
        )
