# Local Development Guide

This document covers how to run the full stack locally — including the
personalized ANN path — and serves as the ground truth for the Phase 4
eval harness setup.

---

## Prerequisites

- Python 3.9 (matches Render's `PYTHON_VERSION: 3.9.16`; TF 2.15 does not
  support Python 3.12+)
- Node.js ≥ 18 (for the Vite frontend)
- `unzip` available on PATH

---

## Backend setup

### 1. Create and activate a Python 3.9 virtual environment

```bash
python3.9 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs TensorFlow 2.15+, which is required for the personalized ANN
path. TF is large (~500 MB); allow 5–10 minutes on a cold install.

### 3. Extract the model files

The Keras model and training CSV are committed as `FDS_PROJ(MAIN).zip` but
the model loader (`ml_service/model_loader.py`) expects them at
`ml_raw/FDS_PROJ/`. Extract once:

```bash
unzip -o "FDS_PROJ(MAIN).zip" -d ml_raw
```

Verify:
```bash
ls ml_raw/FDS_PROJ/
# fds_model_1.keras   Hotel_reservations.csv   (plus notebooks)
```

`ml_raw/` is gitignored so this never gets committed accidentally. Render's
build command runs this same `unzip` step automatically.

### 4. Set required environment variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

Minimum required for local dev:

```env
PHONE_HASH_SALT=any-random-string-at-least-32-chars
DATABASE_URL=sqlite:///./emenu_smart_tags.db
```

`ANTHROPIC_API_KEY` is required from Phase 2 onwards (LLM tag extraction).
It is NOT required for Phase 1 predictions.

### 5. Start the API

```bash
uvicorn api.index:app --host 127.0.0.1 --port 8000 --reload
```

The `--reload` flag restarts on code changes. Omit it for a stable eval run.

On first startup, SQLAlchemy creates `emenu_smart_tags.db` with the
`guest_visits` and `tenant_config` tables.

### 6. Verify the full stack

```bash
# Health check
curl http://localhost:8000/api/health

# Cold-start prediction (no phone — always safe to test)
curl -X POST http://localhost:8000/api/v1/predict-guest-behavior \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: restaurant_001" \
  -d '{"guest_name":"Test Guest","party_size":2,"booking_advance_days":3,
       "booking_channel":"Online","notes":"Testing locally"}'
```

Expected response includes `"scorer_used": "cold_start_heuristic"`.

### 7. Test the ANN path end-to-end

Seed 3 visits for a phone number, then send a prediction with that phone:

```python
# seed_test_guest.py
import os, hashlib
from datetime import date
os.environ.setdefault("PHONE_HASH_SALT", "your-local-salt")
os.environ.setdefault("DATABASE_URL", "sqlite:///./emenu_smart_tags.db")

from ml_service.database import GuestVisit, create_tables, engine
from sqlalchemy.orm import Session

create_tables()
salt = os.environ["PHONE_HASH_SALT"]
phone = "+971501234567"
tenant = "restaurant_001"
phone_hash = hashlib.sha256(f"{salt}:{tenant}:{phone}".encode()).hexdigest()

with Session(engine) as session:
    for i, (d, status) in enumerate([
        (date(2024, 1, 10), "completed"),
        (date(2024, 3, 20), "completed"),
        (date(2024, 6, 5),  "completed"),
    ]):
        session.add(GuestVisit(
            tenant_id=tenant, phone_hash=phone_hash,
            visit_date=d, status=status, party_size=2, spend_aed=95.0,
        ))
    session.commit()
    print(f"Seeded 3 visits for phone_hash={phone_hash[:16]}...")
```

```bash
python seed_test_guest.py

curl -X POST http://localhost:8000/api/v1/predict-guest-behavior \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: restaurant_001" \
  -d '{"guest_name":"Ahmed (Returning)","party_size":2,"booking_advance_days":7,
       "booking_channel":"Online","notes":"Regular Friday dinner",
       "phone":"+971501234567"}'
```

Expected: `"scorer_used": "personalized_ann"`, `"guest_segment": "returning"`.

If you see `"scorer_used": "cold_start_heuristic"` and `"ANN unavailable"` in
`confidence_basis`, the model file is not extracted — re-run step 3.

---

## Frontend setup

```bash
npm install
npm run dev
```

The Vite dev server starts at `http://localhost:5173` and proxies `/api`
requests to the FastAPI backend at `:8000`. See `vite.config.ts` for the
proxy config.

---

## Running tests

```bash
# All backend tests (fast — no TF required)
python -m pytest tests/ -v

# Single module
python -m pytest tests/test_cold_start_scorer.py -v
```

The test suite mocks the Keras model so TF is never loaded during tests.
Tests run in ~2 seconds regardless of whether TF is installed.

---

## Why `ml_raw/` is gitignored

The Keras model and training dataset are ~100 MB combined. They're
distributed via the committed `FDS_PROJ(MAIN).zip` archive (which IS in
git) and extracted at build/dev time. This keeps the repo clone fast while
still making the model reproducible without external downloads.

---

## Known V1 limitations (pre Phase 4)

- The ANN was trained on 2017–2018 hotel reservation data. The
  `RestaurantToHotelMapper` compensates with field shims, but the
  personalized path is a rough approximation until Phase 4 retraining.
  See `ml_service/data_mapper.py` `TODO-PHASE-4` comments.
- `preprocessor.pkl` is rebuilt from `Hotel_reservations.csv` on first
  run if the cache doesn't exist. This adds ~5 seconds to the first
  request on a fresh environment.
