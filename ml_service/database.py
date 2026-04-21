"""SQLAlchemy engine, session factory, and ORM table definitions.

Engine selection:
  - Dev default: SQLite at ./emenu_smart_tags.db (created automatically)
  - Production:  set DATABASE_URL=postgresql://... env var

Tables are created via create_tables(), called from the FastAPI lifespan
hook — not on import, so importing this module is always safe.
"""
from __future__ import annotations

import os
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, Integer, String, create_engine, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./emenu_smart_tags.db")

if _DATABASE_URL.startswith("sqlite"):
    # StaticPool shares one connection across threads — required for SQLite
    # in-process use with FastAPI's thread pool.
    engine = create_engine(
        _DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    engine = create_engine(_DATABASE_URL)


class Base(DeclarativeBase):
    pass


class GuestVisit(Base):
    """One row per guest visit recorded for a tenant."""

    __tablename__ = "guest_visits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    phone_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)
    # completed | no_show | cancelled
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    party_size: Mapped[int] = mapped_column(Integer, nullable=False)
    spend_aed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # Truncated to 200 chars on write — never store full notes
    notes_excerpt: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class TenantConfig(Base):
    """Per-tenant calibration values (e.g. historical no-show rate)."""

    __tablename__ = "tenant_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # Recomputed on each CSV import (Phase 3)
    base_no_show_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_reservations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


def create_tables() -> None:
    """Create all tables if they do not already exist. Safe to call repeatedly."""
    Base.metadata.create_all(engine)


def get_session() -> Session:
    """Return a new SQLAlchemy Session bound to the module-level engine.

    Callers are responsible for closing: use as a context manager —
        with get_session() as session: ...
    """
    return Session(engine)
