# eMenu Tables — Smart Tagging & Sentiment Analysis

Full-stack AI-powered guest tagging and sentiment analysis application for the eMenu Tables SaaS platform. Deployed on Vercel with a React (Vite + Tailwind CSS) frontend and Python (FastAPI) serverless API.

Analyzes reservation special requests and dietary preferences to produce structured CRM tags, detect urgent allergy/medical alerts, and trigger staff notifications — powered by Groq Llama-3.

## Deploy to Vercel

### One-Click Deploy

1. Push this repository to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository
3. Add the `GROQ_API_KEY` environment variable (optional — works without it using the fallback engine)
4. Click **Deploy**

### Environment Variables (Vercel Dashboard)

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | No* | API key from [console.groq.com](https://console.groq.com). Without it, the regex fallback engine is used. |
| `GROQ_MODEL` | No | Groq model ID (default: `llama-3.1-70b-versatile`) |

*The app is fully functional without a Groq API key — it uses a deterministic regex-based tagger as fallback.

## Architecture

```
├── api/
│   └── index.py                   # FastAPI serverless function (Vercel Python runtime)
├── src/
│   ├── components/
│   │   ├── Layout.tsx             # Dashboard sidebar + header layout
│   │   ├── SmartTagBadge.tsx      # Tag badges, sentiment badges, confidence meter
│   │   └── ResultCard.tsx         # Analysis result display card
│   ├── pages/
│   │   ├── DashboardPage.tsx      # Overview with stats, features, recent analyses
│   │   ├── AnalyzePage.tsx        # Tag analysis form with demo scenarios
│   │   ├── HistoryPage.tsx        # Analysis history browser
│   │   └── SettingsPage.tsx       # System status and configuration reference
│   ├── lib/
│   │   ├── api.ts                 # API client functions
│   │   └── types.ts               # TypeScript type definitions
│   ├── App.tsx                    # Route definitions
│   ├── main.tsx                   # React entry point
│   └── index.css                  # Tailwind CSS + custom animations
├── backend/                       # Standalone backend (for non-Vercel deployments)
│   ├── app/                       # Full FastAPI app with SQLAlchemy, UoW pattern
│   └── tests/                     # 34 passing tests
├── vercel.json                    # Vercel build + rewrite configuration
├── package.json                   # Frontend dependencies
├── requirements.txt               # Python dependencies (Vercel serverless)
└── vite.config.ts                 # Vite + Tailwind configuration
```

## Local Development

```bash
# Install frontend dependencies
npm install

# Start frontend dev server (with API proxy)
npm run dev

# In a separate terminal — start the Python API
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Run backend tests
cd backend && pytest tests/ -v
```

## Features

- **AI Tag Extraction** — Groq Llama-3 analyzes free-text to auto-generate CRM tags
- **Urgent Detection** — Dual-layer (regex + LLM) catches anaphylaxis, epipen, severe allergies
- **6 Demo Scenarios** — Pre-built test cases covering VIP, allergies, birthdays, medical alerts
- **Real-time History** — Session-based analysis history with filtering
- **Notification Triggers** — Urgent sentiment fires in-system/WhatsApp/Email alerts
- **Graceful Fallback** — Works without Groq API key using regex engine (55% confidence)
- **Multi-Tenant Isolation** — All data scoped by tenant_id

## CRM Tag Specification

| Tag | Category | Badge Color |
|---|---|---|
| VIP | Status | Gold |
| Celeb | Status | Gold |
| frequent visitors | Status | Gold |
| Birthday | Milestone | Blue |
| Anniversary | Milestone | Blue |
| No shows | Behavioral | Gray |
| Dietary restrictions | Health | Red |
| allergies | Health | Red |

## API Reference

### POST `/api/v1/reservations/analyze-tags`

```json
{
  "special_request_text": "Anniversary dinner. Severe nut allergy, carries epipen.",
  "dietary_preferences": "Nut-free, vegetarian",
  "customer_name": "James Whitfield"
}
```

### GET `/api/v1/analysis-history`

Returns all analyses from the current session.

### GET `/api/v1/demo-scenarios`

Returns 6 pre-built demo scenarios for testing.

### GET `/api/health`

Health check with Groq configuration status.
