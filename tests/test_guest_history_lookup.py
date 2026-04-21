"""Tests for ml_service/guest_history_lookup.py.

Uses an isolated in-memory SQLite engine so no real DB is touched.
Each test gets a fresh schema via the test_engine fixture.
"""
from __future__ import annotations

import os
from datetime import date
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from ml_service.database import Base, GuestVisit


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def test_engine():
    """Fresh in-memory SQLite engine with all tables created."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture(autouse=True)
def _patch_engine(test_engine):
    """Replace the module-level engine in guest_history_lookup for every test."""
    with patch("ml_service.guest_history_lookup.engine", test_engine):
        yield


@pytest.fixture()
def salt_env(monkeypatch):
    """Ensure PHONE_HASH_SALT is set for tests that need hashing."""
    monkeypatch.setenv("PHONE_HASH_SALT", "test-salt-abc123")


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _insert_visit(engine, *, tenant_id: str, phone_hash: str,
                  visit_date: date, status: str,
                  party_size: int = 2, spend_aed: float | None = None) -> None:
    with Session(engine) as session:
        session.add(GuestVisit(
            tenant_id=tenant_id,
            phone_hash=phone_hash,
            visit_date=visit_date,
            status=status,
            party_size=party_size,
            spend_aed=spend_aed,
        ))
        session.commit()


# ---------------------------------------------------------------------------
# hash_phone
# ---------------------------------------------------------------------------

class TestHashPhone:
    def test_returns_64_char_hex(self, salt_env):
        from ml_service.guest_history_lookup import hash_phone
        h = hash_phone("0501234567", "tenant_a")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_deterministic_same_inputs(self, salt_env):
        from ml_service.guest_history_lookup import hash_phone
        h1 = hash_phone("0501234567", "tenant_a")
        h2 = hash_phone("0501234567", "tenant_a")
        assert h1 == h2

    def test_different_phones_produce_different_hashes(self, salt_env):
        from ml_service.guest_history_lookup import hash_phone
        assert hash_phone("0501234567", "t") != hash_phone("0509999999", "t")

    def test_cross_tenant_isolation_same_phone(self, salt_env):
        """Same phone number must produce different hashes across tenants."""
        from ml_service.guest_history_lookup import hash_phone
        h_a = hash_phone("0501234567", "tenant_a")
        h_b = hash_phone("0501234567", "tenant_b")
        assert h_a != h_b

    def test_raises_when_salt_not_set(self, monkeypatch):
        monkeypatch.delenv("PHONE_HASH_SALT", raising=False)
        from ml_service.guest_history_lookup import hash_phone
        with pytest.raises(ValueError, match="PHONE_HASH_SALT"):
            hash_phone("0501234567", "tenant_a")


# ---------------------------------------------------------------------------
# get_history — new guest (no records)
# ---------------------------------------------------------------------------

class TestGetHistoryNewGuest:
    def test_new_guest_returns_zero_counts(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        h = get_history("tenant_a", "nonexistent-hash")
        assert h.visit_count == 0
        assert h.no_show_count == 0
        assert h.completion_count == 0
        assert h.last_visit is None
        assert h.average_spend is None


# ---------------------------------------------------------------------------
# get_history — returning guest
# ---------------------------------------------------------------------------

class TestGetHistoryReturningGuest:
    def test_visit_count(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        for d in (date(2024, 1, 1), date(2024, 3, 15), date(2024, 6, 20)):
            _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                          visit_date=d, status="completed")
        h = get_history("t1", "hash_x")
        assert h.visit_count == 3

    def test_no_show_count(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                      visit_date=date(2024, 1, 1), status="completed")
        _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                      visit_date=date(2024, 2, 1), status="no_show")
        _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                      visit_date=date(2024, 3, 1), status="no_show")
        h = get_history("t1", "hash_x")
        assert h.no_show_count == 2
        assert h.completion_count == 1

    def test_last_visit_is_most_recent(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        for d in (date(2024, 1, 1), date(2024, 6, 15), date(2023, 12, 31)):
            _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                          visit_date=d, status="completed")
        h = get_history("t1", "hash_x")
        assert h.last_visit == date(2024, 6, 15)

    def test_average_spend_computed(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                      visit_date=date(2024, 1, 1), status="completed", spend_aed=100.0)
        _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                      visit_date=date(2024, 2, 1), status="completed", spend_aed=200.0)
        h = get_history("t1", "hash_x")
        assert h.average_spend == pytest.approx(150.0)

    def test_average_spend_none_when_no_spend_recorded(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                      visit_date=date(2024, 1, 1), status="completed", spend_aed=None)
        h = get_history("t1", "hash_x")
        assert h.average_spend is None

    def test_average_spend_skips_null_entries(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                      visit_date=date(2024, 1, 1), status="completed", spend_aed=120.0)
        _insert_visit(test_engine, tenant_id="t1", phone_hash="hash_x",
                      visit_date=date(2024, 2, 1), status="completed", spend_aed=None)
        h = get_history("t1", "hash_x")
        assert h.average_spend == pytest.approx(120.0)


# ---------------------------------------------------------------------------
# Cross-tenant isolation
# ---------------------------------------------------------------------------

class TestCrossTenantIsolation:
    def test_tenant_a_visits_not_visible_to_tenant_b(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        for i in range(5):
            _insert_visit(test_engine, tenant_id="tenant_a", phone_hash="shared_hash",
                          visit_date=date(2024, i + 1, 1), status="completed")
        # tenant_b has no visits for the same hash
        h = get_history("tenant_b", "shared_hash")
        assert h.visit_count == 0

    def test_each_tenant_sees_only_own_visits(self, test_engine):
        from ml_service.guest_history_lookup import get_history
        for i in range(3):
            _insert_visit(test_engine, tenant_id="tenant_a", phone_hash="hash_y",
                          visit_date=date(2024, i + 1, 1), status="completed")
        for i in range(7):
            _insert_visit(test_engine, tenant_id="tenant_b", phone_hash="hash_y",
                          visit_date=date(2024, i + 1, 1), status="completed")
        assert get_history("tenant_a", "hash_y").visit_count == 3
        assert get_history("tenant_b", "hash_y").visit_count == 7
