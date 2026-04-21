"""Tests for ml_service/cold_start_scorer.py.

Covers: base rate, each coefficient, interval math, extreme inputs.
"""
import pytest
from ml_service.cold_start_scorer import CONFIG, ColdStartResult, predict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _no_adjustments() -> ColdStartResult:
    """Neutral inputs that fire zero adjustments (card held, mid-lead, online)."""
    return predict(
        party_size=2,
        lead_time_days=7,
        booking_channel="Online",
        card_held_flag=True,  # suppress no-card adjustment
        reservation_date=None,
        reservation_time=None,
    )


# ---------------------------------------------------------------------------
# Base rate
# ---------------------------------------------------------------------------

def test_base_rate_only():
    result = _no_adjustments()
    assert result.point_estimate == CONFIG["base_rate"]
    assert result.adjustments_applied == []


def test_result_is_cold_start_result():
    assert isinstance(_no_adjustments(), ColdStartResult)


# ---------------------------------------------------------------------------
# Individual coefficient tests
# ---------------------------------------------------------------------------

def test_large_party_fires():
    base = predict(party_size=2, lead_time_days=7, booking_channel="Online", card_held_flag=True)
    large = predict(party_size=CONFIG["large_party_threshold"], lead_time_days=7,
                    booking_channel="Online", card_held_flag=True)
    assert large.point_estimate == pytest.approx(
        base.point_estimate + CONFIG["large_party_delta"], abs=1e-6
    )
    assert any("large party" in a for a in large.adjustments_applied)


def test_large_party_threshold_boundary():
    """Party exactly at threshold fires; one below does not."""
    threshold = CONFIG["large_party_threshold"]
    at = predict(party_size=threshold, lead_time_days=7, booking_channel="Online", card_held_flag=True)
    below = predict(party_size=threshold - 1, lead_time_days=7, booking_channel="Online", card_held_flag=True)
    assert any("large party" in a for a in at.adjustments_applied)
    assert not any("large party" in a for a in below.adjustments_applied)


def test_far_future_fires():
    near = predict(party_size=2, lead_time_days=10, booking_channel="Online", card_held_flag=True)
    far = predict(party_size=2, lead_time_days=CONFIG["far_future_days"] + 1,
                  booking_channel="Online", card_held_flag=True)
    assert far.point_estimate == pytest.approx(
        near.point_estimate + CONFIG["far_future_delta"], abs=1e-6
    )
    assert any("far-future" in a for a in far.adjustments_applied)


def test_same_day_fires():
    result = predict(party_size=2, lead_time_days=0, booking_channel="Online", card_held_flag=True)
    assert result.point_estimate == pytest.approx(
        CONFIG["base_rate"] + CONFIG["same_day_delta"], abs=1e-6
    )
    assert any("same-day" in a for a in result.adjustments_applied)


def test_same_day_and_far_future_are_mutually_exclusive():
    """lead_time_days=0 → same-day fires, not far-future."""
    result = predict(party_size=2, lead_time_days=0, booking_channel="Online", card_held_flag=True)
    assert not any("far-future" in a for a in result.adjustments_applied)


def test_walk_in_channel_fires():
    for channel in ("walk-in", "Walk-In", "phone", "Phone"):
        result = predict(party_size=2, lead_time_days=7, booking_channel=channel, card_held_flag=True)
        assert any("channel" in a.lower() for a in result.adjustments_applied), (
            f"Expected walk-in adjustment for channel={channel!r}"
        )


def test_online_channel_does_not_fire_walk_in():
    result = predict(party_size=2, lead_time_days=7, booking_channel="Online", card_held_flag=True)
    assert not any("channel" in a.lower() for a in result.adjustments_applied)


def test_no_card_fires_when_card_absent():
    with_card = predict(party_size=2, lead_time_days=7, booking_channel="Online", card_held_flag=True)
    without = predict(party_size=2, lead_time_days=7, booking_channel="Online", card_held_flag=False)
    assert without.point_estimate == pytest.approx(
        with_card.point_estimate + CONFIG["no_card_delta"], abs=1e-6
    )
    assert any("no card" in a for a in without.adjustments_applied)


def test_no_card_does_not_fire_when_card_held():
    result = predict(party_size=2, lead_time_days=7, booking_channel="Online", card_held_flag=True)
    assert not any("no card" in a for a in result.adjustments_applied)


def test_peak_day_friday_fires():
    # 2024-01-05 is a Friday (weekday=4)
    result = predict(
        party_size=2, lead_time_days=7, booking_channel="Online",
        card_held_flag=True, reservation_date="2024-01-05",
    )
    assert any("Friday" in a for a in result.adjustments_applied)
    assert result.point_estimate == pytest.approx(
        CONFIG["base_rate"] + CONFIG["peak_day_delta"], abs=1e-6
    )


def test_peak_day_saturday_fires():
    # 2024-01-06 is a Saturday (weekday=5)
    result = predict(
        party_size=2, lead_time_days=7, booking_channel="Online",
        card_held_flag=True, reservation_date="2024-01-06",
    )
    assert any("Saturday" in a for a in result.adjustments_applied)


def test_slow_day_late_slot_fires():
    # 2024-01-02 is a Tuesday (weekday=1)
    result = predict(
        party_size=2, lead_time_days=7, booking_channel="Online",
        card_held_flag=True, reservation_date="2024-01-02",
        reservation_time="20:30",
    )
    assert any("Tuesday" in a for a in result.adjustments_applied)
    assert result.point_estimate == pytest.approx(
        CONFIG["base_rate"] + CONFIG["slow_day_delta"], abs=1e-6
    )


def test_slow_day_early_slot_does_not_fire():
    # Tuesday but before the late-hour threshold
    result = predict(
        party_size=2, lead_time_days=7, booking_channel="Online",
        card_held_flag=True, reservation_date="2024-01-02",
        reservation_time="12:00",
    )
    assert not any("Tuesday" in a for a in result.adjustments_applied)


def test_peak_and_slow_are_mutually_exclusive():
    """Peak day fires; slow-day logic is skipped on Fri/Sat."""
    result = predict(
        party_size=2, lead_time_days=7, booking_channel="Online",
        card_held_flag=True, reservation_date="2024-01-05",  # Friday
        reservation_time="21:00",
    )
    adj_lower = [a.lower() for a in result.adjustments_applied]
    assert any("friday" in a for a in adj_lower)
    assert not any("slow" in a for a in adj_lower)


# ---------------------------------------------------------------------------
# Interval math
# ---------------------------------------------------------------------------

def test_interval_contains_point_estimate():
    result = _no_adjustments()
    assert result.interval_low <= result.point_estimate <= result.interval_high


def test_base_interval_half_width():
    result = _no_adjustments()
    half = CONFIG["base_interval_half"]
    assert result.interval_high - result.interval_low == pytest.approx(2 * half, abs=1e-6)


def test_interval_widens_with_more_adjustments():
    """Multiple adjustments firing should produce a wider interval than one."""
    single = predict(
        party_size=2, lead_time_days=7, booking_channel="Online",
        card_held_flag=False,  # one adjustment: no-card
    )
    multi = predict(
        party_size=CONFIG["large_party_threshold"],  # large party
        lead_time_days=CONFIG["far_future_days"] + 1,  # far future
        booking_channel="Online",
        card_held_flag=False,  # no card
    )
    single_width = single.interval_high - single.interval_low
    multi_width = multi.interval_high - multi.interval_low
    assert multi_width > single_width


def test_interval_capped_at_max():
    """Stacking every possible adjustment must not exceed max_interval_half."""
    result = predict(
        party_size=CONFIG["large_party_threshold"],
        lead_time_days=CONFIG["far_future_days"] + 1,
        booking_channel="Online",
        card_held_flag=False,
        reservation_date="2024-01-02",  # Tuesday
        reservation_time="21:00",
    )
    half = (result.interval_high - result.interval_low) / 2
    assert half <= CONFIG["max_interval_half"] + 1e-6


# ---------------------------------------------------------------------------
# Extreme / edge inputs
# ---------------------------------------------------------------------------

def test_extreme_large_party_does_not_overflow():
    result = predict(party_size=100, lead_time_days=365, booking_channel="Online",
                     card_held_flag=False)
    assert 0.0 <= result.point_estimate <= 1.0
    assert result.interval_low >= 0.01
    assert result.interval_high <= 0.99


def test_zero_party_size_does_not_break():
    result = predict(party_size=0, lead_time_days=0, booking_channel="phone",
                     card_held_flag=True)
    assert 0.0 <= result.point_estimate <= 1.0


def test_malformed_date_skipped_gracefully():
    result = predict(
        party_size=2, lead_time_days=7, booking_channel="Online",
        card_held_flag=True, reservation_date="not-a-date",
    )
    assert isinstance(result, ColdStartResult)


def test_malformed_time_skipped_gracefully():
    result = predict(
        party_size=2, lead_time_days=7, booking_channel="Online",
        card_held_flag=True, reservation_date="2024-01-02",
        reservation_time="bad-time",
    )
    assert isinstance(result, ColdStartResult)


# ---------------------------------------------------------------------------
# Confidence basis
# ---------------------------------------------------------------------------

def test_confidence_basis_is_non_empty():
    assert _no_adjustments().confidence_basis != ""


def test_confidence_basis_mentions_base_rate():
    basis = _no_adjustments().confidence_basis
    assert "20%" in basis or "base rate" in basis.lower()


def test_confidence_basis_lists_active_adjustments():
    result = predict(
        party_size=CONFIG["large_party_threshold"],
        lead_time_days=7, booking_channel="Online", card_held_flag=True,
    )
    assert "large party" in result.confidence_basis


# ---------------------------------------------------------------------------
# Config override
# ---------------------------------------------------------------------------

def test_custom_cfg_base_rate():
    custom = {**CONFIG, "base_rate": 0.30}
    result = predict(party_size=2, lead_time_days=7, booking_channel="Online",
                     card_held_flag=True, cfg=custom)
    assert result.point_estimate == pytest.approx(0.30, abs=1e-6)
