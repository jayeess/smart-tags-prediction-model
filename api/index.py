"""FastAPI backend for eMenu Smart Tags with predictive intelligence.

Provides endpoints for:
- Guest behavior prediction (ANN model inference with domain adaptation)
- Sentiment analysis on reservation notes
- Smart tag generation (rule-based + AI)
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

# Ensure ml_service is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

app = FastAPI(
    title="eMenu Smart Tags - Predictive Intelligence API",
    version="3.0.0",
    description="AI-powered guest behavior prediction and smart tagging for restaurants. "
                "Includes domain adaptation layer for hotel-trained model.",
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


class SmartTagResponse(BaseModel):
    category: str
    label: str
    color: str
    matched: Optional[str] = None


class AIPredictionResponse(BaseModel):
    risk_score: int  # 0-100 integer for display
    risk_label: str
    explanation: str


class PredictionResponse(BaseModel):
    guest_name: str
    reservation_id: Optional[str] = None
    # AI prediction block
    ai_prediction: AIPredictionResponse
    # Smart tags from notes analysis
    smart_tags: list[SmartTagResponse]
    # Legacy fields (kept for backward compat with frontend)
    reliability_score: float
    no_show_risk: float
    risk_label: str
    ai_tag: str
    spend_tag: str
    sentiment: SentimentResponse
    confidence: float
    explanation: str
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
# Tag extraction (regex-based fallback engine for /analyze-tags endpoint)
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


def _build_prediction_response(
    reservation: ReservationInput,
    prediction,
    tenant_id: str,
) -> PredictionResponse:
    """Build the unified prediction response from a GuestPrediction."""
    risk_score_pct = round(prediction.no_show_risk * 100)

    smart_tags = [
        SmartTagResponse(
            category=t["category"],
            label=t["label"],
            color=t["color"],
            matched=t.get("matched"),
        )
        for t in prediction.smart_tags
    ]

    return PredictionResponse(
        guest_name=reservation.guest_name,
        ai_prediction=AIPredictionResponse(
            risk_score=risk_score_pct,
            risk_label=prediction.risk_label,
            explanation=prediction.explanation,
        ),
        smart_tags=smart_tags,
        reliability_score=prediction.reliability_score,
        no_show_risk=prediction.no_show_risk,
        risk_label=prediction.risk_label,
        ai_tag=prediction.ai_tag,
        spend_tag=prediction.spend_tag,
        sentiment=SentimentResponse(
            score=prediction.sentiment.score,
            label=prediction.sentiment.label,
            emoji=prediction.sentiment.emoji,
        ),
        confidence=prediction.confidence,
        explanation=prediction.explanation,
        tenant_id=tenant_id,
        predicted_at=datetime.utcnow().isoformat(),
    )


# ---------------------------------------------------------------------------
# Demo scenarios
# ---------------------------------------------------------------------------
DEMO_SCENARIOS = [
    # ── HIGH RISK scenarios ──────────────────────────────────────────────
    {
        "name": "Serial No-Show",
        "reservation": {
            "guest_name": "Alex Petrov",
            "party_size": 6,
            "children": 0,
            "booking_advance_days": 0,
            "special_needs_count": 0,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 35.0,
            "previous_cancellations": 5,
            "previous_completions": 0,
            "booking_channel": "Online",
            "notes": "",
        },
    },
    {
        "name": "Ghost Booker",
        "reservation": {
            "guest_name": "Ryan Cooper",
            "party_size": 8,
            "children": 0,
            "booking_advance_days": 30,
            "special_needs_count": 0,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 40.0,
            "previous_cancellations": 4,
            "previous_completions": 1,
            "booking_channel": "Online",
            "notes": "",
        },
    },
    # ── MEDIUM RISK scenarios ────────────────────────────────────────────
    {
        "name": "Risky Walk-in",
        "reservation": {
            "guest_name": "Karen Mitchell",
            "party_size": 2,
            "children": 0,
            "booking_advance_days": 0,
            "special_needs_count": 0,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 40.0,
            "previous_cancellations": 3,
            "previous_completions": 1,
            "booking_channel": "Walk-in",
            "notes": "Last visit was terrible. Waiters were slow. Giving one more chance.",
        },
    },
    {
        "name": "Large Group Unknown",
        "reservation": {
            "guest_name": "Tom Bradley",
            "party_size": 10,
            "children": 3,
            "booking_advance_days": 14,
            "special_needs_count": 0,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 45.0,
            "previous_cancellations": 1,
            "previous_completions": 0,
            "booking_channel": "Phone",
            "notes": "",
        },
    },
    # ── LOW RISK scenarios ───────────────────────────────────────────────
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
            "notes": "Anniversary dinner - 10th year. VIP regular, knows the chef. Window seat preferred.",
        },
    },
    {
        "name": "Loyal Regular",
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
            "notes": "Business lunch with clients. Need a quiet private area.",
        },
    },
    # ── SMART TAG: Birthday / Occasion ───────────────────────────────────
    {
        "name": "Birthday Party",
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
            "notes": "Birthday celebration for Maria! Need a birthday cake. One guest is gluten-free. Balloons please.",
        },
    },
    {
        "name": "Proposal Night",
        "reservation": {
            "guest_name": "Ethan & Grace",
            "party_size": 2,
            "children": 0,
            "booking_advance_days": 10,
            "special_needs_count": 3,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 250.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "Phone",
            "notes": "Proposal night! Need the best window seat, champagne ready, quiet corner. Ring hidden with dessert.",
        },
    },
    {
        "name": "Honeymoon Dinner",
        "reservation": {
            "guest_name": "Liam & Aisha Bennett",
            "party_size": 2,
            "children": 0,
            "booking_advance_days": 7,
            "special_needs_count": 1,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 200.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "Online",
            "notes": "Honeymoon dinner! Celebrating with tasting menu. Terrace seating if weather permits.",
        },
    },
    # ── SMART TAG: Dietary / Allergy ─────────────────────────────────────
    {
        "name": "Severe Allergy",
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
            "notes": "Severe nut allergy, carries epipen. Child needs high chair. Vegetarian, no onion no garlic.",
        },
    },
    {
        "name": "Vegan + Kosher",
        "reservation": {
            "guest_name": "Rachel Goldstein",
            "party_size": 3,
            "children": 0,
            "booking_advance_days": 5,
            "special_needs_count": 2,
            "is_repeat_guest": True,
            "estimated_spend_per_cover": 110.0,
            "previous_cancellations": 0,
            "previous_completions": 3,
            "booking_channel": "Phone",
            "notes": "Strictly kosher. One guest is vegan. Please confirm menu options in advance. Dairy-free dessert needed.",
        },
    },
    {
        "name": "Halal + Jain Guest",
        "reservation": {
            "guest_name": "Mohammed & Anita",
            "party_size": 4,
            "children": 0,
            "booking_advance_days": 4,
            "special_needs_count": 2,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 90.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "App",
            "notes": "Two guests require halal food. One guest follows jain diet strictly — no root vegetables. Booth seating preferred.",
        },
    },
    # ── SMART TAG: Seating Preferences ───────────────────────────────────
    {
        "name": "Window + Quiet",
        "reservation": {
            "guest_name": "Elena Rossi",
            "party_size": 2,
            "children": 0,
            "booking_advance_days": 2,
            "special_needs_count": 1,
            "is_repeat_guest": True,
            "estimated_spend_per_cover": 130.0,
            "previous_cancellations": 0,
            "previous_completions": 6,
            "booking_channel": "Phone",
            "notes": "Date night. Window seat, quiet area please. Last time the table was too close to the kitchen.",
        },
    },
    {
        "name": "Terrace Booth",
        "reservation": {
            "guest_name": "Sofia Martinez",
            "party_size": 4,
            "children": 0,
            "booking_advance_days": 3,
            "special_needs_count": 1,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 85.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "Online",
            "notes": "Prefer terrace seating or a booth. Celebrating a promotion!",
        },
    },
    # ── SMART TAG: Family + Accessibility ────────────────────────────────
    {
        "name": "Family with Toddlers",
        "reservation": {
            "guest_name": "Raj & Meera Patel",
            "party_size": 5,
            "children": 3,
            "booking_advance_days": 1,
            "special_needs_count": 2,
            "is_repeat_guest": True,
            "estimated_spend_per_cover": 65.0,
            "previous_cancellations": 0,
            "previous_completions": 4,
            "booking_channel": "App",
            "notes": "Two toddlers need high chairs. Baby is 8 months — need a quiet spot. One child has dairy-free diet.",
        },
    },
    {
        "name": "Wheelchair Access",
        "reservation": {
            "guest_name": "Margaret Johnson",
            "party_size": 3,
            "children": 0,
            "booking_advance_days": 7,
            "special_needs_count": 2,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 100.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "Phone",
            "notes": "Wheelchair accessible table required. Guest has mobility issues. Ground floor seating only.",
        },
    },
    # ── SMART TAG: Celebrity / Status ────────────────────────────────────
    {
        "name": "Celebrity Guest",
        "reservation": {
            "guest_name": "Confidential — VIP",
            "party_size": 4,
            "children": 0,
            "booking_advance_days": 2,
            "special_needs_count": 3,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 300.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "Phone",
            "notes": "Celebrity guest, security will arrive 30 min early. VIP treatment. Private booth, no photos. Vegan menu only.",
        },
    },
    # ── EDGE CASE: New Guest, Zero History ───────────────────────────────
    {
        "name": "First Timer",
        "reservation": {
            "guest_name": "Noah Williams",
            "party_size": 2,
            "children": 0,
            "booking_advance_days": 3,
            "special_needs_count": 0,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 70.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "Online",
            "notes": "",
        },
    },
    # ── EDGE CASE: Same-Day Budget Walk-in ───────────────────────────────
    {
        "name": "Budget Walk-in",
        "reservation": {
            "guest_name": "Sam Wilson",
            "party_size": 2,
            "children": 0,
            "booking_advance_days": 0,
            "special_needs_count": 0,
            "is_repeat_guest": False,
            "estimated_spend_per_cover": 25.0,
            "previous_cancellations": 0,
            "previous_completions": 0,
            "booking_channel": "Walk-in",
            "notes": "",
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
        "version": "3.0.0",
        "model_loaded": _predictor is not None,
        "domain_adapter": "restaurant-to-hotel-v1",
    }


@app.post("/api/v1/predict-guest-behavior", response_model=PredictionResponse)
async def predict_guest_behavior(
    reservation: ReservationInput,
    x_tenant_id: str = Header(default="default", alias="X-Tenant-ID"),
):
    """Predict guest behavior for a single reservation.

    Includes domain adaptation (restaurant→hotel scaling), calibrated risk
    thresholds, smart tag extraction from notes, and explanation generation.
    """
    try:
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

        return _build_prediction_response(reservation, prediction, x_tenant_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


@app.post("/api/v1/predict-batch")
async def predict_batch(
    batch: BatchPredictionRequest,
    x_tenant_id: str = Header(default="default", alias="X-Tenant-ID"),
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
            _build_prediction_response(reservation, prediction, x_tenant_id)
        )

    return {"predictions": [r.model_dump() for r in results], "count": len(results)}


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
