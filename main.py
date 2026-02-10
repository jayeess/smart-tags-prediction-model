"""Entry point for Render deployment.

Render auto-detects Python and looks for main:app by default.
This file re-exports the FastAPI app from api/index.py.
"""

from api.index import app  # noqa: F401
