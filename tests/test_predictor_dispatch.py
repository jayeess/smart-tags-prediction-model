"""Tests for ml_service/predictor.py dispatch logic.

All heavy dependencies (Keras model, DB) are mocked so these tests are
fast and do not require TensorFlow or a live database.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from ml_service.guest_history_lookup import GuestHistory
from ml_service.predictor import GuestBehaviorPredictor, _guest_segment


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _history(visit_count: int, no_show: int = 0) -> GuestHistory:
    return GuestHistory(
        visit_count=visit_count,
        no_show_count=no_show,
        completion_count=visit_count - no_show,
        last_visit=None,
        average_spend=None,
    )


def _predictor_with_mocked_ann() -> GuestBehaviorPredictor:
    """Return a predictor whose ANN path is fully mocked out."""
    p = GuestBehaviorPredictor()
    p._model = MagicMock()
    p._preprocessor = MagicMock()
    # _preprocessor.transform returns something the model can consume
    p._preprocessor.transform.return_value = MagicMock()
    return p


# ---------------------------------------------------------------------------
# _guest_segment helper
# ---------------------------------------------------------------------------

class TestGuestSegment:
    def test_new_guest_zero(self):
        assert _guest_segment(0) == "new_guest"

    def test_new_guest_two(self):
        assert _guest_segment(2) == "new_guest"

    def test_returning_three(self):
        assert _guest_segment(3) == "returning"

    def test_returning_nine(self):
        assert _guest_segment(9) == "returning"

    def test_regular_ten(self):
        assert _guest_segment(10) == "regular"

    def test_regular_many(self):
        assert _guest_segment(100) == "regular"


# ---------------------------------------------------------------------------
# Routing to cold-start
# ---------------------------------------------------------------------------

class TestColdStartRouting:
    def test_no_phone_routes_to_cold_start(self):
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1", phone=None)
        assert result.scorer_used == "cold_start_heuristic"

    def test_no_phone_confidence_basis_mentions_no_phone(self):
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1", phone=None)
        assert "No phone provided" in result.confidence_basis

    def test_missing_salt_routes_to_cold_start(self, monkeypatch):
        monkeypatch.delenv("PHONE_HASH_SALT", raising=False)
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1", phone="0501234567")
        assert result.scorer_used == "cold_start_heuristic"

    @patch("ml_service.predictor.hash_phone", return_value="h1")
    @patch("ml_service.predictor.get_history")
    def test_zero_visits_routes_to_cold_start(self, mock_hist, mock_hash):
        mock_hist.return_value = _history(0)
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1", phone="0501234567")
        assert result.scorer_used == "cold_start_heuristic"
        assert result.guest_segment == "new_guest"

    @patch("ml_service.predictor.hash_phone", return_value="h1")
    @patch("ml_service.predictor.get_history")
    def test_one_visit_routes_to_cold_start(self, mock_hist, mock_hash):
        mock_hist.return_value = _history(1)
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1", phone="0501234567")
        assert result.scorer_used == "cold_start_heuristic"

    @patch("ml_service.predictor.hash_phone", return_value="h1")
    @patch("ml_service.predictor.get_history")
    def test_two_visits_routes_to_cold_start(self, mock_hist, mock_hash):
        mock_hist.return_value = _history(2)
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1", phone="0501234567")
        assert result.scorer_used == "cold_start_heuristic"


# ---------------------------------------------------------------------------
# Routing to personalized ANN
# ---------------------------------------------------------------------------

class TestPersonalizedANNRouting:
    @patch("ml_service.predictor.hash_phone", return_value="h1")
    @patch("ml_service.predictor.get_history")
    def test_three_visits_routes_to_ann(self, mock_hist, mock_hash):
        mock_hist.return_value = _history(3)
        predictor = _predictor_with_mocked_ann()

        with patch.object(predictor, "_ensure_loaded"):
            with patch.object(
                predictor, "_ann_predict",
                return_value=(0.30, 0.20, 0.40, "mocked ANN basis")
            ):
                result = predictor.predict(tenant_id="t1", phone="0501234567")

        assert result.scorer_used == "personalized_ann"
        assert result.guest_segment == "returning"

    @patch("ml_service.predictor.hash_phone", return_value="h1")
    @patch("ml_service.predictor.get_history")
    def test_ten_visits_gives_regular_segment(self, mock_hist, mock_hash):
        mock_hist.return_value = _history(10)
        predictor = _predictor_with_mocked_ann()

        with patch.object(predictor, "_ensure_loaded"):
            with patch.object(
                predictor, "_ann_predict",
                return_value=(0.20, 0.10, 0.30, "mocked basis")
            ):
                result = predictor.predict(tenant_id="t1", phone="0501234567")

        assert result.scorer_used == "personalized_ann"
        assert result.guest_segment == "regular"

    @patch("ml_service.predictor.hash_phone", return_value="h1")
    @patch("ml_service.predictor.get_history")
    def test_ann_interval_values_passed_through(self, mock_hist, mock_hash):
        mock_hist.return_value = _history(5)
        predictor = _predictor_with_mocked_ann()

        with patch.object(predictor, "_ensure_loaded"):
            with patch.object(
                predictor, "_ann_predict",
                return_value=(0.35, 0.25, 0.45, "basis text")
            ):
                result = predictor.predict(tenant_id="t1", phone="0501234567")

        assert result.risk_point_estimate == pytest.approx(0.35)
        assert result.risk_interval_low == pytest.approx(0.25)
        assert result.risk_interval_high == pytest.approx(0.45)
        assert result.confidence_basis == "basis text"


# ---------------------------------------------------------------------------
# Cold-start output shape
# ---------------------------------------------------------------------------

class TestColdStartOutput:
    def test_interval_present(self):
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1", phone=None)
        assert 0.0 <= result.risk_interval_low <= result.risk_point_estimate
        assert result.risk_point_estimate <= result.risk_interval_high <= 1.0

    def test_risk_point_estimate_matches_no_show_risk(self):
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1")
        assert result.risk_point_estimate == result.no_show_risk

    def test_reliability_score_is_complement(self):
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1")
        assert result.reliability_score == pytest.approx(
            1.0 - result.no_show_risk, abs=1e-3
        )

    def test_risk_label_boundaries(self):
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1")
        if result.no_show_risk >= 0.7:
            assert result.risk_label == "High Risk"
        elif result.no_show_risk >= 0.4:
            assert result.risk_label == "Medium Risk"
        else:
            assert result.risk_label == "Low Risk"

    def test_sentiment_present(self):
        predictor = GuestBehaviorPredictor()
        result = predictor.predict(tenant_id="t1", notes="Great experience!")
        assert result.sentiment is not None
        assert result.sentiment.label in ("positive", "neutral", "negative")
