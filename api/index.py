"""FastAPI backend for eMenu Smart Tags with predictive intelligence.

Provides endpoints for:
- Guest behavior prediction (ANN model inference)
- Sentiment analysis on reservation notes
- Smart tag generation
- Synthetic data simulation
- Demo scenarios

All endpoints enforce tenant isolation via tenant_id.
"""

import sys
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import re

# Ensure ml_service is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

app = FastAPI(
    title="eMenu Smart Tags - Predictive Intelligence API",
    version="2.0.1",
    description="AI-powered guest behavior prediction and smart tagging for restaurants.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Lazy-loaded predictor (avoid cold-start penalty on every import)
# ---------------------------------------------------------------------------
_predictor = None


def get_predictor():
    global _predictor
    if _predictor is None:
        from ml_service.predictor import GuestBehaviorPredictor
        _predictor = GuestBehaviorPredictor()
    return _predictor


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
class ReservationInput(BaseModel):
    guest_name: str = Field(..., min_length=1, max_length=200)
    party_size: int = Field(default=2, ge=1, le=20)
    children: int = Field(default=0, ge=0, le=10)
    booking_advance_days: int = Field(default=0, ge=0)
    special_needs_count: int = Field(default=0, ge=0)
    is_repeat_guest: bool = False
    estimated_spend_per_cover: float = Field(default=80.0, ge=0)
    reservation_date: Optional[str] = None
    reservation_time: Optional[str] = None
    previous_cancellations: int = Field(default=0, ge=0)
    previous_completions: int = Field(default=0, ge=0)
    booking_channel: str = Field(default="Online")
    notes: str = Field(default="")
    table_number: Optional[int] = None


class SentimentResponse(BaseModel):
    score: float
    label: str
    emoji: str


class PredictionResponse(BaseModel):
    guest_name: str
    reservation_id: Optional[str] = None
    reliability_score: float
    no_show_risk: float
    risk_label: str
    ai_tag: str
    spend_tag: str
    rule_tags: list[str]
    sentiment: SentimentResponse
    confidence: float
    tenant_id: str
    predicted_at: str


class AnalyzeTagsRequest(BaseModel):
    special_request_text: str = ""
    dietary_preferences: str = ""
    customer_name: str = ""


class TagResult(BaseModel):
    tag: str
    category: str
    color: str


class AnalyzeTagsResponse(BaseModel):
    customer_name: str
    tags: list[TagResult]
    sentiment: SentimentResponse
    confidence: float
    engine: str


class BatchPredictionRequest(BaseModel):
    reservations: list[ReservationInput]


# ---------------------------------------------------------------------------
# Tag extraction (regex-based fallback engine)
# ---------------------------------------------------------------------------
TAG_RULES = [
    {"keywords": ["vip", "important", "high profile"], "tag": "VIP", "category": "Status", "color": "gold"},
    {"keywords": ["celebrity", "famous", "celeb guest"], "tag": "Celeb", "category": "Status", "color": "gold"},
    {"keywords": ["regular", "frequent", "loyal"], "tag": "Frequent Visitor", "category": "Status", "color": "gold"},
    {"keywords": ["birthday", "bday"], "tag": "Birthday", "category": "Milestone", "color": "blue"},
    {"keywords": ["anniversary", "wedding"], "tag": "Anniversary", "category": "Milestone", "color": "blue"},
    {"keywords": ["promotion", "celebrating"], "tag": "Celebration", "category": "Milestone", "color": "blue"},
    {"keywords": ["no show", "no-show", "didn't show"], "tag": "No Shows", "category": "Behavioral", "color": "gray"},
    {"keywords": ["allergy", "allergic", "epipen", "anaphylaxis"], "tag": "Allergies", "category": "Health", "color": "red"},
    {"keywords": ["dietary", "vegetarian", "vegan", "halal", "kosher", "gluten"], "tag": "Dietary Restrictions", "category": "Health", "color": "red"},
    {"keywords": ["dairy-free", "lactose", "shellfish", "nut-free"], "tag": "Allergies", "category": "Health", "color": "red"},
    {"keywords": ["wheelchair", "accessible", "disability"], "tag": "Accessibility", "category": "Special Needs", "color": "purple"},
    {"keywords": ["high chair", "toddler", "baby", "infant"], "tag": "Family", "category": "Special Needs", "color": "purple"},
]


def extract_tags(text: str) -> list[TagResult]:
    """Extract CRM tags from text using keyword matching."""
    text_lower = text.lower()
    found = []
    seen_tags = set()
    for rule in TAG_RULES:
        if any(kw in text_lower for kw in rule["keywords"]):
            if rule["tag"] not in seen_tags:
                found.append(TagResult(tag=rule["tag"], category=rule["category"], color=rule["color"]))
                seen_tags.add(rule["tag"])
    return found


def extract_rule_tags(text: str) -> list[str]:
    t = text.lower()
    tags = []
    if any(k in t for k in ["vegan", "gluten", "allergy"]):
        tags.append("Dietary")
    if any(k in t for k in ["birthday", "anniversary"]):
        tags.append("Occasion")
    return tags


def calibrate_restaurant_data(
    booking_advance_days: int,
    estimated_spend_per_cover: float,
) -> tuple[int, float]:
    adjusted_lead = booking_advance_days
    if booking_advance_days < 2:
        adjusted_lead = 5
    adjusted_spend = estimated_spend_per_cover * 1.5 if estimated_spend_per_cover < 80 else estimated_spend_per_cover
    return adjusted_lead, adjusted_spend


def analyze_smart_tags(text: str) -> list[dict]:
    t = text.lower()
    tags = []
    dietary_words = ["vegan", "veg", "gluten", "dairy", "nut", "allergy", "halal", "kosher", "jain"]
    occasion_words = ["birthday", "bday", "anniversary", "celebration", "honeymoon", "date"]
    seating_words = ["window", "quiet", "booth", "outside", "terrace"]
    for w in dietary_words:
        if w in t:
            tags.append({"category": "Dietary", "label": w.title(), "color": "green"})
    for w in occasion_words:
        if w in t:
            tags.append({"category": "Occasion", "label": w.title(), "color": "purple"})
    for w in seating_words:
        if w in t:
            tags.append({"category": "Seating", "label": w.title(), "color": "blue"})
    return tags


# ---------------------------------------------------------------------------
# Demo scenarios
# ---------------------------------------------------------------------------
DEMO_SCENARIOS = [
    {
        "name": "VIP Anniversary",
        "reservation": {
            "guest_name": "James & Sarah Whitfield",
            "party_size": 2,
            "children": 0,
            "booking_advance_days": 14,
            "special_needs_count": 2,
            "is_repeat_guest": True,
            "estimated_spend_per_cover": 220.0,
            "previous_cancellations": 0,
            "previous_completions": 8,
            "booking_channel": "Phone",
            "notes": "Anniversary dinner - 10th year. VIP regular, knows the chef personally. Window seat preferred.",
        },
    },
    {
        "name": "Allergy Alert",
        "reservation": {
            "guest_name": "Priya Sharma",
            "party_size": 4,
            "children": 1,
            "booking_advance_days": 3,
            "special_needs_count": 3,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 75.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "Online",
            "notes": "Severe nut allergy for one guest, carries epipen. Child needs high chair. Vegetarian, no onion no garlic.",
        },
    },
    {
        "name": "Likely No-Show",
        "reservation": {
            "guest_name": "Alex Petrov",
            "party_size": 6,
            "children": 0,
            "booking_advance_days": 30,
            "special_needs_count": 0,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 50.0,
            "previous_cancellations": 3,
            "previous_completions": 1,
            "booking_channel": "Online",
            "notes": "",
        },
    },
    {
        "name": "Birthday Celebration",
        "reservation": {
            "guest_name": "Maria Garcia",
            "party_size": 8,
            "children": 2,
            "booking_advance_days": 7,
            "special_needs_count": 2,
            "is_repeat_guest": True,
            "estimated_spend_per_cover": 95.0,
            "previous_cancellations": 0,
            "previous_completions": 5,
            "booking_channel": "App",
            "notes": "Birthday celebration for Maria! Need a birthday cake arranged. One guest is gluten-free. Balloons if possible.",
        },
    },
    {
        "name": "Corporate Lunch",
        "reservation": {
            "guest_name": "David Chen (Acme Corp)",
            "party_size": 5,
            "children": 0,
            "booking_advance_days": 5,
            "special_needs_count": 1,
            "is_repeat_guest": True,
            "estimated_spend_per_cover": 180.0,
            "previous_cancellations": 0,
            "previous_completions": 12,
            "booking_channel": "Corporate",
            "notes": "Business lunch with clients. Need a private dining area. Bill to corporate account.",
        },
    },
    {
        "name": "Negative Review History",
        "reservation": {
            "guest_name": "Karen Mitchell",
            "party_size": 2,
            "children": 0,
            "booking_advance_days": 1,
            "special_needs_count": 0,
            "is_repeat_guest": True,
            "estimated_spend_per_cover": 60.0,
            "previous_cancellations": 1,
            "previous_completions": 2,
            "booking_channel": "Phone",
            "notes": "Last visit was terrible. Waiters were slow, food was cold. Giving it one more chance.",
        },
    },
]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "service": "eMenu Smart Tags - Predictive Intelligence",
        "version": "2.0.0",
        "model_loaded": _predictor is not None,
    }


@app.post("/api/v1/predict-guest-behavior", response_model=PredictionResponse)
async def predict_guest_behavior(
    reservation: ReservationInput,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
):
    """Predict guest behavior for a single reservation.

    Requires X-Tenant-ID header for tenant isolation.
    """
    predictor = get_predictor()

    prediction = predictor.predict(
        tenant_id=x_tenant_id,
        party_size=reservation.party_size,
        children=reservation.children,
        booking_advance_days=reservation.booking_advance_days,
        special_needs_count=reservation.special_needs_count,
        is_repeat_guest=reservation.is_repeat_guest,
        estimated_spend_per_cover=reservation.estimated_spend_per_cover,
        reservation_date=reservation.reservation_date,
        previous_cancellations=reservation.previous_cancellations,
        previous_completions=reservation.previous_completions,
        booking_channel=reservation.booking_channel,
        notes=reservation.notes,
    )

    return PredictionResponse(
        guest_name=reservation.guest_name,
        reliability_score=prediction.reliability_score,
        no_show_risk=prediction.no_show_risk,
        risk_label=prediction.risk_label,
        ai_tag=prediction.ai_tag,
        spend_tag=prediction.spend_tag,
        rule_tags=extract_rule_tags(reservation.notes),
        sentiment=SentimentResponse(
            score=prediction.sentiment.score,
            label=prediction.sentiment.label,
            emoji=prediction.sentiment.emoji,
        ),
        confidence=prediction.confidence,
        tenant_id=x_tenant_id,
        predicted_at=datetime.utcnow().isoformat(),
    )


@app.post("/api/v1/predict-batch")
async def predict_batch(
    batch: BatchPredictionRequest,
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
):
    """Predict guest behavior for multiple reservations (e.g., tonight's table list)."""
    predictor = get_predictor()
    results = []

    for reservation in batch.reservations:
        prediction = predictor.predict(
            tenant_id=x_tenant_id,
            party_size=reservation.party_size,
            children=reservation.children,
            booking_advance_days=reservation.booking_advance_days,
            special_needs_count=reservation.special_needs_count,
            is_repeat_guest=reservation.is_repeat_guest,
            estimated_spend_per_cover=reservation.estimated_spend_per_cover,
            reservation_date=reservation.reservation_date,
            previous_cancellations=reservation.previous_cancellations,
            previous_completions=reservation.previous_completions,
            booking_channel=reservation.booking_channel,
            notes=reservation.notes,
        )
        results.append(
            PredictionResponse(
                guest_name=reservation.guest_name,
                reliability_score=prediction.reliability_score,
                no_show_risk=prediction.no_show_risk,
                risk_label=prediction.risk_label,
                ai_tag=prediction.ai_tag,
                spend_tag=prediction.spend_tag,
                rule_tags=extract_rule_tags(reservation.notes),
                sentiment=SentimentResponse(
                    score=prediction.sentiment.score,
                    label=prediction.sentiment.label,
                    emoji=prediction.sentiment.emoji,
                ),
                confidence=prediction.confidence,
                tenant_id=x_tenant_id,
                predicted_at=datetime.utcnow().isoformat(),
            )
        )

    return {"predictions": [r.model_dump() for r in results], "count": len(results)}


@app.post("/api/predict-guest-behavior")
async def predict_guest_behavior_unified(
    reservation: ReservationInput,
    x_tenant_id: str = Header(default="restaurant_001", alias="X-Tenant-ID"),
):
    predictor = get_predictor()
    adj_lead, adj_spend = calibrate_restaurant_data(
        reservation.booking_advance_days, reservation.estimated_spend_per_cover
    )
    prediction = predictor.predict(
        tenant_id=x_tenant_id,
        party_size=reservation.party_size,
        children=reservation.children,
        booking_advance_days=adj_lead,
        special_needs_count=reservation.special_needs_count,
        is_repeat_guest=reservation.is_repeat_guest,
        estimated_spend_per_cover=adj_spend,
        reservation_date=reservation.reservation_date,
        previous_cancellations=reservation.previous_cancellations,
        previous_completions=reservation.previous_completions,
        booking_channel=reservation.booking_channel,
        notes=reservation.notes,
    )
    risk_score = prediction.no_show_risk
    if risk_score > 0.65:
        risk_label = "High Risk"
    elif risk_score >= 0.35:
        risk_label = "Medium Risk"
    else:
        risk_label = "Low Risk"
    parts = []
    if reservation.booking_advance_days < 2:
        parts.append("Short lead time")
    if adj_spend >= 120:
        parts.append("High spend")
    explanation = " + ".join(parts) if parts else "Calibrated restaurant inputs"
    smart_tags = analyze_smart_tags(reservation.notes)
    return {
        "ai_prediction": {
            "risk_score": round(risk_score, 3),
            "risk_label": risk_label,
            "explanation": explanation,
        },
        "smart_tags": smart_tags,
    }


@app.post("/api/v1/reservations/analyze-tags", response_model=AnalyzeTagsResponse)
async def analyze_tags(
    request: AnalyzeTagsRequest,
    x_tenant_id: str = Header(default="default", alias="X-Tenant-ID"),
):
    """Extract CRM smart tags and sentiment from reservation text."""
    combined_text = f"{request.special_request_text} {request.dietary_preferences}".strip()
    tags = extract_tags(combined_text)

    from ml_service.sentiment import analyze_sentiment
    sentiment = analyze_sentiment(combined_text)

    confidence = 0.55 if not tags else 0.85

    return AnalyzeTagsResponse(
        customer_name=request.customer_name,
        tags=tags,
        sentiment=SentimentResponse(
            score=sentiment.score,
            label=sentiment.label,
            emoji=sentiment.emoji,
        ),
        confidence=confidence,
        engine="regex-v2",
    )


@app.get("/api/v1/demo-scenarios")
async def get_demo_scenarios():
    """Return pre-built demo scenarios for testing."""
    return {"scenarios": DEMO_SCENARIOS}


@app.get("/api/v1/simulate-reservations")
async def simulate_reservations(
    count: int = Query(default=20, ge=1, le=500),
    x_tenant_id: str = Header(default="restaurant_001", alias="X-Tenant-ID"),
):
    """Generate synthetic restaurant reservation data for testing."""
    from ml_service.data_simulator import RestaurantDataSimulator
    df = RestaurantDataSimulator.generate(n=count, tenant_id=x_tenant_id)
    return {"reservations": df.to_dict(orient="records"), "count": len(df)}


@app.get("/api/v1/analysis-history")
async def get_analysis_history():
    """Placeholder for session-based analysis history."""
    return {"history": [], "message": "History is stored client-side in this version."}
