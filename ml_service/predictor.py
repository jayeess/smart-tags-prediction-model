"""Prediction dispatcher: routes to cold-start heuristic or personalized ANN.

Routing logic:
  - phone absent OR PHONE_HASH_SALT unset  → cold_start_heuristic
  - phone present, visit_count < 3         → cold_start_heuristic
  - phone present, visit_count >= 3        → personalized_ann (Keras ANN)
"""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from typing import Literal, Optional

import numpy as np

from .cold_start_scorer import predict as cold_start_predict
from .data_mapper import RestaurantToHotelMapper
from .guest_history_lookup import GuestHistory, get_history, hash_phone
from .model_loader import build_preprocessor, load_keras_model
from .sentiment import SentimentResult, analyze_sentiment


def _guest_segment(visit_count: int) -> Literal["new_guest", "returning", "regular"]:
    """Map raw visit count to a guest segment label."""
    if visit_count >= 10:
        return "regular"
    if visit_count >= 3:
        return "returning"
    return "new_guest"


@dataclass
class GuestPrediction:
    # --- Original fields (backwards-compatible) ---
    reliability_score: float
    no_show_risk: float
    risk_label: str
    ai_tag: str
    spend_tag: str
    sentiment: SentimentResult
    confidence: float
    # --- Phase 1 additions ---
    risk_point_estimate: float
    risk_interval_low: float
    risk_interval_high: float
    guest_segment: Literal["new_guest", "returning", "regular"]
    scorer_used: Literal["cold_start_heuristic", "personalized_ann"]
    confidence_basis: str

    def to_dict(self) -> dict:
        return asdict(self)


class GuestBehaviorPredictor:
    """Dispatches to cold-start heuristic or personalized ANN based on guest history.

    Cold-start is used when:
      - phone is None (cannot identify guest)
      - PHONE_HASH_SALT env var is not set (cannot hash safely)
      - visit_count < 3 (insufficient history for personalization)

    Personalized ANN is used when visit_count >= 3.
    """

    def __init__(self) -> None:
        self._model = None
        self._preprocessor = None

    def _ensure_loaded(self) -> None:
        if self._model is None:
            self._model = load_keras_model()
            self._preprocessor = build_preprocessor()

    def _has_dropout(self) -> bool:
        """Return True if the loaded Keras model has any Dropout layers."""
        try:
            import tensorflow as tf
            return any(
                isinstance(layer, tf.keras.layers.Dropout)
                for layer in self._model.layers
            )
        except ImportError:
            return False

    def _ann_predict(
        self,
        feature_df,
    ) -> tuple[float, float, float, str]:
        """Run ANN inference and return (no_show_risk, interval_low, interval_high, basis).

        Uses MC Dropout (10 passes, training=True) if dropout layers are present.
        Falls back to a fixed ±10pp interval with an honest flag when they are not.
        """
        X = self._preprocessor.transform(feature_df)

        if self._has_dropout():
            preds: list[float] = []
            for _ in range(10):
                p = float(self._model(X, training=True).numpy()[0][0])
                preds.append(1.0 - p)  # reliability → no_show_risk
            risk = round(float(np.mean(preds)), 3)
            low = round(float(np.percentile(preds, 10)), 3)
            high = round(float(np.percentile(preds, 90)), 3)
            basis = (
                "Personalized ANN — MC Dropout (10 inference passes, "
                "10th–90th percentile interval)."
            )
        else:
            raw = float(self._model.predict(X, verbose=0)[0][0])
            risk = round(1.0 - raw, 3)
            low = round(max(0.01, risk - 0.10), 3)
            high = round(min(0.99, risk + 0.10), 3)
            basis = (
                "Personalized ANN — single-pass inference (no dropout layers detected). "
                "Interval is ±10pp rule-of-thumb. confidence_basis: rule-of-thumb"
            )

        return risk, low, high, basis

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
        reservation_time: Optional[str] = None,
        previous_cancellations: int = 0,
        previous_completions: int = 0,
        booking_channel: str = "Online",
        notes: str = "",
        phone: Optional[str] = None,
    ) -> GuestPrediction:
        """Dispatch prediction to cold-start heuristic or personalized ANN.

        Args:
            tenant_id: Restaurant identifier for tenant isolation.
            party_size: Total number of guests.
            children: Number of children in the party.
            booking_advance_days: Days between booking and reservation date.
            special_needs_count: Number of special requests.
            is_repeat_guest: Caller-supplied repeat-guest flag (used only by ANN path).
            estimated_spend_per_cover: Expected spend per person.
            reservation_date: ISO date string (YYYY-MM-DD).
            reservation_time: HH:MM string.
            previous_cancellations: Past cancellation count (used only by ANN path).
            previous_completions: Past completed visit count (used only by ANN path).
            booking_channel: How the reservation was made.
            notes: Free-text notes for sentiment analysis.
            phone: Raw phone number — hashed immediately, never stored or logged.

        Returns:
            GuestPrediction with both original fields and Phase 1 additions.
        """
        # ------------------------------------------------------------------
        # 1. Resolve guest history
        # ------------------------------------------------------------------
        history = GuestHistory(
            visit_count=0,
            no_show_count=0,
            completion_count=0,
            last_visit=None,
            average_spend=None,
        )
        phone_unavailable = False

        if phone:
            try:
                phone_hash = hash_phone(phone, tenant_id)
                history = get_history(tenant_id, phone_hash)
            except ValueError:
                # PHONE_HASH_SALT not set — cannot safely hash; force cold-start
                phone_unavailable = True
        else:
            phone_unavailable = True

        # ------------------------------------------------------------------
        # 2. Dispatch
        # ------------------------------------------------------------------
        use_cold_start = history.visit_count < 3
        segment = _guest_segment(history.visit_count)

        if use_cold_start:
            cs = cold_start_predict(
                party_size=party_size,
                lead_time_days=booking_advance_days,
                booking_channel=booking_channel,
                card_held_flag=False,  # card_held_flag not yet in the form
                reservation_date=reservation_date,
                reservation_time=reservation_time,
            )
            no_show_risk = cs.point_estimate
            interval_low = cs.interval_low
            interval_high = cs.interval_high
            scorer_used: Literal["cold_start_heuristic", "personalized_ann"] = (
                "cold_start_heuristic"
            )
            if phone_unavailable:
                confidence_basis = (
                    "No phone provided — cannot match guest history. "
                    + cs.confidence_basis
                )
            else:
                confidence_basis = cs.confidence_basis
            # Width of the interval as a proxy for model confidence
            confidence = round(1.0 - (interval_high - interval_low), 3)

        else:
            self._ensure_loaded()
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
            no_show_risk, interval_low, interval_high, confidence_basis = (
                self._ann_predict(feature_df)
            )
            scorer_used = "personalized_ann"
            confidence = round(abs((1.0 - no_show_risk) - 0.5) * 2, 3)

        reliability_score = round(1.0 - no_show_risk, 3)

        # ------------------------------------------------------------------
        # 3. Derived labels
        # ------------------------------------------------------------------
        if no_show_risk >= 0.7:
            risk_label = "High Risk"
        elif no_show_risk >= 0.4:
            risk_label = "Medium Risk"
        else:
            risk_label = "Low Risk"

        if no_show_risk >= 0.6:
            ai_tag = "Likely No-Show"
        elif estimated_spend_per_cover >= 150:
            ai_tag = "High Spend Potential"
        elif is_repeat_guest and previous_completions >= 3:
            ai_tag = "Loyal Regular"
        else:
            ai_tag = "Low Risk"

        if estimated_spend_per_cover >= 200:
            spend_tag = "Luxury"
        elif estimated_spend_per_cover >= 120:
            spend_tag = "Premium"
        elif estimated_spend_per_cover >= 60:
            spend_tag = "Standard"
        else:
            spend_tag = "Budget"

        # ------------------------------------------------------------------
        # 4. Sentiment
        # ------------------------------------------------------------------
        sentiment = analyze_sentiment(notes)

        return GuestPrediction(
            reliability_score=reliability_score,
            no_show_risk=no_show_risk,
            risk_label=risk_label,
            ai_tag=ai_tag,
            spend_tag=spend_tag,
            sentiment=sentiment,
            confidence=confidence,
            risk_point_estimate=no_show_risk,
            risk_interval_low=interval_low,
            risk_interval_high=interval_high,
            guest_segment=segment,
            scorer_used=scorer_used,
            confidence_basis=confidence_basis,
        )
