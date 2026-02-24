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


def _temporal_adjustment(reservation_date: Optional[str]) -> float:
    """Calculate a reliability adjustment based on day-of-week and season.

    Research-backed restaurant no-show patterns:
    - Friday/Saturday evenings: lowest no-show (high demand, hard to rebook)
    - Monday/Tuesday: highest no-show (low commitment, easy to skip)
    - Holidays & special dates: lower no-show (planned in advance, emotional)
    - January (post-holiday): higher no-show (resolution fatigue)
    - Summer: slightly higher no-show (last-minute plan changes)

    Returns a reliability adjustment in [-0.08, +0.06].
    """
    from datetime import datetime

    if not reservation_date:
        try:
            dt = datetime.now()
        except Exception:
            return 0.0
    else:
        try:
            dt = datetime.fromisoformat(reservation_date)
        except (ValueError, TypeError):
            return 0.0

    adj = 0.0

    # ── Day-of-week factor ──
    weekday = dt.weekday()  # 0=Mon ... 6=Sun
    if weekday in (4, 5):      # Friday, Saturday
        adj += 0.05            # High demand → people show up
    elif weekday == 6:         # Sunday
        adj += 0.02            # Decent commitment (family day)
    elif weekday in (0, 1):    # Monday, Tuesday
        adj -= 0.04            # Easy to skip, low demand
    # Wed/Thu: neutral (0)

    # ── Seasonal factor ──
    month = dt.month
    if month == 12:
        adj += 0.04            # December: holidays, celebrations → reliable
    elif month == 2 and dt.day == 14:
        adj += 0.06            # Valentine's Day: very high commitment
    elif month == 1:
        adj -= 0.03            # January: post-holiday drop-off
    elif month in (6, 7, 8):
        adj -= 0.02            # Summer: vacation plans change

    # ── Holiday proximity (major US/universal holidays) ──
    md = (month, dt.day)
    high_commitment_dates = {
        (2, 14),   # Valentine's Day
        (12, 24),  # Christmas Eve
        (12, 25),  # Christmas
        (12, 31),  # New Year's Eve
        (1, 1),    # New Year's Day
    }
    if md in high_commitment_dates:
        adj += 0.06  # Capped — these are near-certain shows

    return round(max(-0.08, min(0.06, adj)), 3)


def _heuristic_reliability(
    booking_advance_days: int,
    previous_cancellations: int,
    previous_completions: int,
    is_repeat_guest: bool,
    estimated_spend_per_cover: float,
    party_size: int = 2,
    reservation_date: Optional[str] = None,
) -> float:
    """Rule-based reliability score tuned for restaurant domain.

    This captures risk factors the hotel ANN model doesn't respond to
    well in the restaurant context. It is blended with the ANN output
    to produce a calibrated final score.

    Factors considered:
    - Guest loyalty (repeat status, completion history)
    - Cancellation history (strongest negative signal)
    - Booking lead time
    - Spend commitment level
    - Party size coordination difficulty
    - Temporal patterns (day-of-week, season, holidays) [NEW]
    """
    score = 0.65

    # Repeat / loyalty boost
    if is_repeat_guest:
        score += 0.10
    if previous_completions >= 5:
        score += 0.12
    elif previous_completions >= 3:
        score += 0.08
    elif previous_completions >= 1:
        score += 0.03

    # Cancellation history penalty (strongest signal for no-show risk)
    if previous_cancellations >= 5:
        score -= 0.45
    elif previous_cancellations >= 3:
        score -= 0.30
    elif previous_cancellations >= 2:
        score -= 0.20
    elif previous_cancellations == 1:
        score -= 0.10

    # Lead time: very long advance bookings are riskier
    if booking_advance_days >= 30:
        score -= 0.10
    elif booking_advance_days >= 14:
        score -= 0.05
    # Same-day walk-ins are slightly risky (impulsive)
    elif booking_advance_days == 0:
        score -= 0.03

    # Spend: higher spend = more committed
    if estimated_spend_per_cover >= 150:
        score += 0.08
    elif estimated_spend_per_cover >= 80:
        score += 0.03
    elif estimated_spend_per_cover < 40:
        score -= 0.05

    # Large parties slightly riskier (harder to coordinate)
    if party_size >= 8:
        score -= 0.05
    elif party_size >= 6:
        score -= 0.02

    # Temporal patterns (day-of-week, season, holidays)
    score += _temporal_adjustment(reservation_date)

    return round(max(0.05, min(0.98, score)), 3)


# ---------------------------------------------------------------------------
# Note-based smart tag extraction
# ---------------------------------------------------------------------------
# Three categories with matched-keyword tracking

_TAG_RULES = [
    # ── Dietary (expanded with synonyms, slang, abbreviations) ──
    {"keywords": ["vegan", "plant-based", "plant based", "no animal"], "category": "Dietary", "label": "Vegan", "color": "green"},
    {"keywords": ["vegetarian", "veg ", "veggie", "no meat", "meat-free", "meat free", "pescatarian"], "category": "Dietary", "label": "Vegetarian", "color": "green"},
    {"keywords": ["gluten-free", "gluten free", "gf ", "celiac", "coeliac", "no gluten", "wheat-free", "wheat free"], "category": "Dietary", "label": "Gluten Free", "color": "green"},
    {"keywords": ["dairy-free", "dairy free", "df ", "lactose", "no dairy", "milk-free", "milk free", "non-dairy"], "category": "Dietary", "label": "Dairy Free", "color": "green"},
    {"keywords": ["nut allergy", "nut-free", "nut free", "peanut", "tree nut", "no nuts"], "category": "Dietary", "label": "Nut Allergy", "color": "green"},
    {"keywords": ["allergy", "allergic", "allergies", "epipen", "anaphylaxis", "intolerance", "intolerant", "sensitive to", "cannot eat", "can't eat"], "category": "Dietary", "label": "Allergy Alert", "color": "red"},
    {"keywords": ["halal", "zabiha"], "category": "Dietary", "label": "Halal", "color": "green"},
    {"keywords": ["kosher", "pareve"], "category": "Dietary", "label": "Kosher", "color": "green"},
    {"keywords": ["jain", "jain food"], "category": "Dietary", "label": "Jain", "color": "green"},
    {"keywords": ["keto", "low-carb", "low carb", "no carb"], "category": "Dietary", "label": "Keto/Low-Carb", "color": "green"},
    {"keywords": ["seafood allergy", "shellfish", "no fish", "fish allergy", "no seafood"], "category": "Dietary", "label": "Seafood Allergy", "color": "red"},
    # ── Occasion (expanded with slang and variations) ──
    {"keywords": ["birthday", "bday", "b-day", "birth day", "turning ", "turns "], "category": "Occasion", "label": "Birthday", "color": "purple"},
    {"keywords": ["anniversary", "anniv", "anni", "wedding anniversary", "years together"], "category": "Occasion", "label": "Anniversary", "color": "purple"},
    {"keywords": ["celebration", "celebrating", "celebrate", "party", "special occasion", "festive"], "category": "Occasion", "label": "Celebration", "color": "purple"},
    {"keywords": ["date night", "romantic", "romance", "couple", "intimate dinner", "candlelight"], "category": "Occasion", "label": "Date Night", "color": "purple"},
    {"keywords": ["honeymoon", "just married", "newlywed"], "category": "Occasion", "label": "Honeymoon", "color": "purple"},
    {"keywords": ["proposal", "proposing", "engagement", "engage", "ring", "will you marry", "pop the question"], "category": "Occasion", "label": "Proposal", "color": "purple"},
    {"keywords": ["graduation", "grad dinner", "grad party"], "category": "Occasion", "label": "Graduation", "color": "purple"},
    {"keywords": ["business dinner", "business meeting", "client dinner", "corporate dinner", "work dinner"], "category": "Occasion", "label": "Business Dinner", "color": "blue"},
    {"keywords": ["farewell", "going away", "goodbye dinner", "send-off", "sendoff"], "category": "Occasion", "label": "Farewell", "color": "purple"},
    {"keywords": ["reunion", "get together", "get-together", "catching up"], "category": "Occasion", "label": "Reunion", "color": "purple"},
    # ── Seating (expanded) ──
    {"keywords": ["window seat", "window table", "by the window", "near window"], "category": "Seating", "label": "Window Seat", "color": "blue"},
    {"keywords": ["quiet", "private", "secluded", "corner table", "away from noise", "peaceful"], "category": "Seating", "label": "Quiet Area", "color": "blue"},
    {"keywords": ["booth", "banquette"], "category": "Seating", "label": "Booth", "color": "blue"},
    {"keywords": ["terrace", "patio", "outside", "outdoor", "garden", "rooftop", "al fresco", "open air"], "category": "Seating", "label": "Outdoor", "color": "blue"},
    {"keywords": ["bar seat", "bar area", "at the bar", "counter seat", "chef's table", "chef table"], "category": "Seating", "label": "Bar/Counter", "color": "blue"},
    {"keywords": ["private room", "private dining", "private area", "separate room", "pdr"], "category": "Seating", "label": "Private Dining", "color": "blue"},
    # ── Status ──
    {"keywords": ["vip", "important", "high profile", "v.i.p", "very important"], "category": "Status", "label": "VIP", "color": "gold"},
    {"keywords": ["celebrity", "famous", "celeb guest", "public figure", "influencer", "food blogger", "food critic", "reviewer", "critic"], "category": "Status", "label": "Celebrity/Press", "color": "gold"},
    {"keywords": ["first time", "first visit", "new guest", "never been", "first timer"], "category": "Status", "label": "First Visit", "color": "cyan"},
    {"keywords": ["regular", "frequent", "loyal", "comes every", "always comes", "usual"], "category": "Status", "label": "Regular", "color": "gold"},
    # ── Accessibility ──
    {"keywords": ["wheelchair", "accessible", "disability", "disabled", "mobility", "walker", "crutches", "handicap"], "category": "Accessibility", "label": "Accessibility", "color": "purple"},
    {"keywords": ["hearing impaired", "deaf", "hard of hearing", "sign language", "hearing aid"], "category": "Accessibility", "label": "Hearing Support", "color": "purple"},
    {"keywords": ["visually impaired", "blind", "low vision", "braille"], "category": "Accessibility", "label": "Vision Support", "color": "purple"},
    # ── Family ──
    {"keywords": ["high chair", "toddler", "baby", "infant", "child seat", "booster seat", "kids menu", "children's menu"], "category": "Family", "label": "Family Needs", "color": "purple"},
    {"keywords": ["stroller", "pram", "pushchair", "buggy"], "category": "Family", "label": "Stroller Space", "color": "purple"},
    {"keywords": ["pregnant", "expecting", "maternity", "mom-to-be"], "category": "Family", "label": "Expectant Parent", "color": "purple"},
    # ── Timing ──
    {"keywords": ["early dinner", "early seating", "before 6", "5pm", "5:30"], "category": "Timing", "label": "Early Seating", "color": "cyan"},
    {"keywords": ["late dinner", "late seating", "after 9", "9:30", "10pm", "late night"], "category": "Timing", "label": "Late Seating", "color": "cyan"},
    {"keywords": ["in a rush", "quick dinner", "short on time", "tight schedule", "hurry", "fast service"], "category": "Timing", "label": "Time Pressed", "color": "cyan"},
    # ── Service ──
    {"keywords": ["cake", "dessert surprise", "bring a cake", "birthday cake", "custom cake"], "category": "Service", "label": "Cake/Dessert", "color": "pink"},
    {"keywords": ["flowers", "bouquet", "roses", "decoration", "decorate", "balloons", "banner"], "category": "Service", "label": "Decorations", "color": "pink"},
    {"keywords": ["wine pairing", "sommelier", "wine list", "wine selection", "tasting menu"], "category": "Service", "label": "Wine/Tasting", "color": "pink"},
    {"keywords": ["photographer", "photo", "pictures", "photography"], "category": "Service", "label": "Photography", "color": "pink"},
]


def _fuzzy_word_match(text_lower: str, keyword: str, threshold: int = 1) -> bool:
    """Check if any word in text is within `threshold` edits of the keyword.

    Uses simple Levenshtein-like check for single-word keywords only.
    Multi-word keywords still use exact substring matching.
    """
    if " " in keyword or len(keyword) < 4:
        return False  # Only fuzzy-match single words of 4+ chars

    words = text_lower.split()
    for word in words:
        # Strip common punctuation
        word = word.strip(".,!?;:'\"()-")
        if len(word) < 3:
            continue
        # Quick length check: skip if lengths differ by more than threshold
        if abs(len(word) - len(keyword)) > threshold:
            continue
        # Simple edit distance check (optimized for threshold=1)
        if _edit_distance_one(word, keyword):
            return True
    return False


def _edit_distance_one(a: str, b: str) -> bool:
    """Return True if strings a and b have edit distance <= 1."""
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la == lb:
        # Substitution: exactly one position differs
        diffs = sum(1 for ca, cb in zip(a, b) if ca != cb)
        return diffs <= 1
    # Insertion/deletion: shorter string is subseq of longer with one skip
    short, long_ = (a, b) if la < lb else (b, a)
    i = j = skips = 0
    while i < len(short) and j < len(long_):
        if short[i] == long_[j]:
            i += 1
            j += 1
        else:
            skips += 1
            j += 1
            if skips > 1:
                return False
    return True


def analyze_notes(text: str) -> list[dict]:
    """Scan reservation notes for dietary, occasion, seating, and other tags.

    Uses exact substring matching first, then falls back to fuzzy matching
    for single-word keywords (edit distance <= 1) to catch typos like
    "vegitarian", "aniversary", "birtday", etc.

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
        matched_kw = None
        # Pass 1: exact substring match (fast)
        for kw in rule["keywords"]:
            if kw in text_lower:
                matched_kw = kw
                break
        # Pass 2: fuzzy match for single-word keywords (catches typos)
        if not matched_kw:
            for kw in rule["keywords"]:
                if _fuzzy_word_match(text_lower, kw):
                    matched_kw = f"~{kw}"  # prefix ~ indicates fuzzy match
                    break

        if matched_kw:
            found.append({
                "category": rule["category"],
                "label": rule["label"],
                "color": rule["color"],
                "matched": matched_kw,
            })
            seen_labels.add(rule["label"])

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

    # Blending weights: how much the heuristic vs ANN contributes.
    # The hotel ANN is weak on restaurant-domain risk factors, so we
    # weight the heuristic heavily to ensure the score reflects the
    # factors shown in the explanation.
    _ANN_WEIGHT = 0.20
    _HEURISTIC_WEIGHT = 0.80

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
        """Generate a full guest behavior prediction with domain adaptation.

        The final score blends the ANN model output with a restaurant-tuned
        heuristic so that risk factors (cancel history, lead time, spend)
        are properly reflected in the displayed score.
        """
        self._ensure_loaded()

        # Always compute the heuristic score (restaurant-domain tuned)
        heuristic_reliability = _heuristic_reliability(
            booking_advance_days=booking_advance_days,
            previous_cancellations=previous_cancellations,
            previous_completions=previous_completions,
            is_repeat_guest=is_repeat_guest,
            estimated_spend_per_cover=estimated_spend_per_cover,
            party_size=party_size,
            reservation_date=reservation_date,
        )

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
            ann_reliability = float(raw_prediction[0][0])

            # Blend ANN with heuristic for calibrated output
            reliability_score = (
                self._ANN_WEIGHT * ann_reliability
                + self._HEURISTIC_WEIGHT * heuristic_reliability
            )

            # Confidence: high when ANN and heuristic agree, lower when they diverge
            agreement = 1.0 - abs(ann_reliability - heuristic_reliability)
            confidence = round(0.5 + agreement * 0.4, 3)  # range 0.5 – 0.9
        else:
            reliability_score = heuristic_reliability
            confidence = 0.55  # lower confidence for heuristic-only

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
