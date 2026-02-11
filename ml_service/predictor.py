"""Main prediction orchestrator - combines model inference, data mapping, and sentiment.

Includes calibrated risk thresholds for restaurant domain and human-readable
explanation generation for each prediction.
"""

import logging
from dataclasses import dataclass, asdict
from typing import Optional, List

import numpy as np

from .sentiment import analyze_sentiment, SentimentResult

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Restaurant-calibrated risk thresholds
# ---------------------------------------------------------------------------
# The raw model output is P(not_canceled) from hotel data. After domain
# adaptation, we re-calibrate the thresholds so restaurant operators see
# meaningful differentiation:
#   > 0.7 no-show risk  = High Risk   (was 0.6)
#   0.4 - 0.7           = Medium Risk  (was 0.35 - 0.6)
#   < 0.4               = Low Risk     (was < 0.35)
RISK_HIGH_THRESHOLD = 0.70
RISK_MEDIUM_THRESHOLD = 0.40


@dataclass
class GuestPrediction:
    reliability_score: float  # 0-1, probability of showing up (not canceling)
    no_show_risk: float  # 0-1, probability of no-show/cancellation
    risk_label: str  # "Low Risk", "Medium Risk", "High Risk"
    ai_tag: str  # "Low Risk", "High Spend Potential", "Likely No-Show"
    spend_tag: str  # "Budget", "Standard", "Premium", "Luxury"
    sentiment: SentimentResult
    confidence: float  # Model confidence
    explanation: str  # Human-readable reason for the risk score
    smart_tags: List[dict]  # Rule-based tags from notes analysis

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def _build_explanation(
    no_show_risk: float,
    risk_label: str,
    booking_advance_days: int,
    previous_cancellations: int,
    previous_completions: int,
    is_repeat_guest: bool,
    estimated_spend_per_cover: float,
    booking_channel: str,
) -> str:
    """Generate a concise, human-readable explanation for the risk score."""
    factors: list[str] = []

    # Lead time factor
    if booking_advance_days <= 1:
        factors.append("Same-day booking")
    elif booking_advance_days <= 3:
        factors.append("Short lead time")
    elif booking_advance_days >= 14:
        factors.append("Long advance booking")

    # History factors
    if previous_cancellations >= 3:
        factors.append(f"High cancel history ({previous_cancellations}x)")
    elif previous_cancellations >= 1:
        factors.append(f"Past cancellation ({previous_cancellations}x)")

    if previous_completions >= 5:
        factors.append(f"Strong visit history ({previous_completions}x)")
    elif previous_completions >= 2:
        factors.append(f"Return visitor ({previous_completions}x)")

    # Guest type
    if is_repeat_guest:
        factors.append("Repeat guest")

    # Spend
    if estimated_spend_per_cover >= 150:
        factors.append("High spend")
    elif estimated_spend_per_cover < 40:
        factors.append("Low spend")

    # Channel
    if booking_channel.lower() in ("walk-in",):
        factors.append("Walk-in")
    elif booking_channel.lower() in ("corporate",):
        factors.append("Corporate booking")

    if not factors:
        factors.append("Standard profile")

    return " + ".join(factors[:3])


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


# ---------------------------------------------------------------------------
# Note-based smart tag extraction
# ---------------------------------------------------------------------------
# Three categories with matched-keyword tracking

_TAG_RULES = [
    # Dietary
    {"keywords": ["vegan"], "category": "Dietary", "label": "Vegan", "color": "green"},
    {"keywords": ["vegetarian", "veg "], "category": "Dietary", "label": "Vegetarian", "color": "green"},
    {"keywords": ["gluten-free", "gluten free", "celiac", "coeliac"], "category": "Dietary", "label": "Gluten Free", "color": "green"},
    {"keywords": ["dairy-free", "dairy free", "lactose"], "category": "Dietary", "label": "Dairy Free", "color": "green"},
    {"keywords": ["nut allergy", "nut-free", "peanut"], "category": "Dietary", "label": "Nut Allergy", "color": "green"},
    {"keywords": ["allergy", "allergic", "epipen", "anaphylaxis"], "category": "Dietary", "label": "Allergy Alert", "color": "red"},
    {"keywords": ["halal"], "category": "Dietary", "label": "Halal", "color": "green"},
    {"keywords": ["kosher"], "category": "Dietary", "label": "Kosher", "color": "green"},
    {"keywords": ["jain"], "category": "Dietary", "label": "Jain", "color": "green"},
    # Occasion
    {"keywords": ["birthday", "bday", "b-day"], "category": "Occasion", "label": "Birthday", "color": "purple"},
    {"keywords": ["anniversary", "anniv"], "category": "Occasion", "label": "Anniversary", "color": "purple"},
    {"keywords": ["celebration", "celebrating"], "category": "Occasion", "label": "Celebration", "color": "purple"},
    {"keywords": ["date night", "romantic"], "category": "Occasion", "label": "Date Night", "color": "purple"},
    {"keywords": ["honeymoon"], "category": "Occasion", "label": "Honeymoon", "color": "purple"},
    {"keywords": ["proposal", "proposing", "engagement"], "category": "Occasion", "label": "Proposal", "color": "purple"},
    # Seating
    {"keywords": ["window seat", "window table"], "category": "Seating", "label": "Window Seat", "color": "blue"},
    {"keywords": ["quiet", "private"], "category": "Seating", "label": "Quiet Area", "color": "blue"},
    {"keywords": ["booth"], "category": "Seating", "label": "Booth", "color": "blue"},
    {"keywords": ["terrace", "patio", "outside", "outdoor"], "category": "Seating", "label": "Outdoor", "color": "blue"},
    # Status (kept from original)
    {"keywords": ["vip", "important", "high profile"], "category": "Status", "label": "VIP", "color": "gold"},
    {"keywords": ["celebrity", "famous", "celeb guest"], "category": "Status", "label": "Celebrity", "color": "gold"},
    {"keywords": ["wheelchair", "accessible", "disability"], "category": "Accessibility", "label": "Accessibility", "color": "purple"},
    {"keywords": ["high chair", "toddler", "baby", "infant"], "category": "Family", "label": "Family Needs", "color": "purple"},
]


def analyze_notes(text: str) -> list[dict]:
    """Scan reservation notes for dietary, occasion, seating, and other tags.

    Returns a list of matched smart tags with category, label, and color.
    """
    if not text or not text.strip():
        return []

    text_lower = text.lower()
    found: list[dict] = []
    seen_labels: set[str] = set()

    for rule in _TAG_RULES:
        if rule["label"] in seen_labels:
            continue
        for kw in rule["keywords"]:
            if kw in text_lower:
                found.append({
                    "category": rule["category"],
                    "label": rule["label"],
                    "color": rule["color"],
                    "matched": kw,
                })
                seen_labels.add(rule["label"])
                break

    return found


class GuestBehaviorPredictor:
    """Orchestrates the full prediction pipeline:
    1. Map restaurant data -> hotel feature vector (with domain adaptation)
    2. Run ANN model inference (or heuristic fallback)
    3. Calibrate output with restaurant-tuned thresholds
    4. Analyze note sentiment and extract smart tags
    5. Generate human-readable explanation
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
        """Generate a full guest behavior prediction with domain adaptation."""
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

        # Risk label — restaurant-calibrated thresholds
        if no_show_risk >= RISK_HIGH_THRESHOLD:
            risk_label = "High Risk"
        elif no_show_risk >= RISK_MEDIUM_THRESHOLD:
            risk_label = "Medium Risk"
        else:
            risk_label = "Low Risk"

        # AI tag
        if no_show_risk >= RISK_HIGH_THRESHOLD:
            ai_tag = "Likely No-Show"
        elif estimated_spend_per_cover >= 150:
            ai_tag = "High Spend Potential"
        elif is_repeat_guest and previous_completions >= 3:
            ai_tag = "Loyal Regular"
        elif no_show_risk >= RISK_MEDIUM_THRESHOLD:
            ai_tag = "Watch List"
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

        # Smart tags from notes
        smart_tags = analyze_notes(notes)

        # Explanation
        explanation = _build_explanation(
            no_show_risk=no_show_risk,
            risk_label=risk_label,
            booking_advance_days=booking_advance_days,
            previous_cancellations=previous_cancellations,
            previous_completions=previous_completions,
            is_repeat_guest=is_repeat_guest,
            estimated_spend_per_cover=estimated_spend_per_cover,
            booking_channel=booking_channel,
        )

        return GuestPrediction(
            reliability_score=reliability_score,
            no_show_risk=no_show_risk,
            risk_label=risk_label,
            ai_tag=ai_tag,
            spend_tag=spend_tag,
            sentiment=sentiment,
            confidence=confidence,
            explanation=explanation,
            smart_tags=smart_tags,
        )
