"""Main prediction orchestrator - combines model inference, data mapping, and sentiment."""

from dataclasses import dataclass, asdict
from typing import Optional

import numpy as np

from .model_loader import load_keras_model, build_preprocessor
from .data_mapper import RestaurantToHotelMapper
from .sentiment import analyze_sentiment, SentimentResult


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


class GuestBehaviorPredictor:
    """Orchestrates the full prediction pipeline:
    1. Map restaurant data -> hotel feature vector
    2. Run ANN model inference
    3. Analyze note sentiment
    4. Produce guest insight tags
    """

    def __init__(self):
        self._model = None
        self._preprocessor = None

    def _ensure_loaded(self):
        if self._model is None:
            self._model = load_keras_model()
            self._preprocessor = build_preprocessor()

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
        """Generate a full guest behavior prediction.

        Args:
            tenant_id: Restaurant identifier (enforces tenant isolation).
            party_size: Total guests.
            children: Number of children.
            booking_advance_days: Days booked in advance.
            special_needs_count: Number of special requests.
            is_repeat_guest: Return visitor flag.
            estimated_spend_per_cover: Expected spend per person.
            reservation_date: Date of reservation (YYYY-MM-DD).
            previous_cancellations: Past cancellation count.
            previous_completions: Past completed visit count.
            booking_channel: Booking source.
            notes: Free-text notes for sentiment analysis.

        Returns:
            GuestPrediction with all insight fields.
        """
        self._ensure_loaded()

        # Step 1: Map restaurant data to hotel feature vector
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

        # Step 2: Preprocess and predict
        X = self._preprocessor.transform(feature_df)
        raw_prediction = self._model.predict(X, verbose=0)
        reliability_score = float(raw_prediction[0][0])
        no_show_risk = round(1.0 - reliability_score, 3)
        reliability_score = round(reliability_score, 3)

        # Confidence: how far from 0.5 the prediction is
        confidence = round(abs(reliability_score - 0.5) * 2, 3)

        # Step 3: Determine risk label
        if no_show_risk >= 0.7:
            risk_label = "High Risk"
        elif no_show_risk >= 0.4:
            risk_label = "Medium Risk"
        else:
            risk_label = "Low Risk"

        # Step 4: AI tag assignment
        if no_show_risk >= 0.6:
            ai_tag = "Likely No-Show"
        elif estimated_spend_per_cover >= 150:
            ai_tag = "High Spend Potential"
        elif is_repeat_guest and previous_completions >= 3:
            ai_tag = "Loyal Regular"
        else:
            ai_tag = "Low Risk"

        # Step 5: Spend tier tag
        if estimated_spend_per_cover >= 200:
            spend_tag = "Luxury"
        elif estimated_spend_per_cover >= 120:
            spend_tag = "Premium"
        elif estimated_spend_per_cover >= 60:
            spend_tag = "Standard"
        else:
            spend_tag = "Budget"

        # Step 6: Sentiment analysis on notes
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
