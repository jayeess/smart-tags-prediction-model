"""Maps restaurant reservation data to the hotel model's input vector.

Includes a Domain Adapter layer that scales restaurant-domain inputs
(short lead times in hours/days, lower price points) into the hotel
model's expected range so the StandardScaler sees realistic variance.
"""

from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from .model_loader import ALL_FEATURE_COLUMNS


# ---------------------------------------------------------------------------
# Domain Adapter: Restaurant → Hotel input scaling
# ---------------------------------------------------------------------------
# Hotel training data ranges (from Hotel_reservations.csv):
#   lead_time:        0 – 443 days   (mean ~85, std ~85)
#   avg_price_per_room: 0 – 540      (mean ~103, std ~35)
#
# Restaurant inputs are fundamentally different:
#   booking_advance:  0 – 30 days  (often < 24 hours, i.e. same-day)
#   spend_per_cover:  $20 – $250   (avg ~$60)
#
# The adapter maps restaurant values into the hotel range so the model
# sees meaningful variance instead of "everything looks like lead_time=0".


def adapt_lead_time(restaurant_advance_days: int) -> int:
    """Scale restaurant booking advance into hotel lead_time range.

    Strategy:
    - If advance < 1 day (same-day / walk-in): map to 0-5 (very short hotel lead)
    - If advance 1-7 days: map to 15-90 (short hotel stay)
    - If advance 7-30 days: map to 90-200 (medium hotel lead)
    - If advance > 30 days: map to 200-350 (long hotel lead)

    This ensures small restaurant differences (1h vs 24h vs 7d) produce
    visible variance in the model's feature space.
    """
    d = restaurant_advance_days
    if d <= 0:
        return 0
    elif d == 1:
        return 15
    elif d <= 3:
        return int(15 + (d - 1) * 25)  # 15 → 65
    elif d <= 7:
        return int(65 + (d - 3) * 6.25)  # 65 → 90
    elif d <= 14:
        return int(90 + (d - 7) * 10)  # 90 → 160
    elif d <= 30:
        return int(160 + (d - 14) * 2.5)  # 160 → 200
    else:
        return min(350, int(200 + (d - 30) * 2))  # 200 → 350, capped


def adapt_price(restaurant_spend: float) -> float:
    """Scale restaurant spend/cover into hotel avg_price_per_room range.

    Hotel training range: $0 – $540, mean ~$103.
    Restaurant range: $20 – $250+.

    Strategy: Multiply by 1.5 for values under $80, taper off for higher.
    This puts a $40 restaurant meal at ~$60 (budget hotel) and a $200
    restaurant meal at ~$230 (premium hotel), keeping relative ordering.
    """
    if restaurant_spend <= 0:
        return 0.0
    if restaurant_spend < 80:
        return round(restaurant_spend * 1.5, 2)
    elif restaurant_spend < 150:
        # Gradual taper: 1.5x at $80 → 1.2x at $150
        factor = 1.5 - (restaurant_spend - 80) * (0.3 / 70)
        return round(restaurant_spend * factor, 2)
    else:
        # High-end: 1.2x, already in hotel range
        return round(restaurant_spend * 1.2, 2)


class RestaurantToHotelMapper:
    """Transforms restaurant reservation fields into the feature vector
    expected by the hotel reservation ANN model.

    Includes a Domain Adapter that rescales lead_time and price so that
    restaurant-scale inputs produce meaningful variance in the hotel model.

    Mapping Logic:
        no_of_adults + no_of_children  -> party_size decomposition
        lead_time                      -> booking_advance (domain-adapted)
        no_of_special_requests         -> special_needs_count
        repeated_guest                 -> loyalty_flag
        avg_price_per_room             -> estimated_spend (domain-adapted)
    """

    # The model was trained on 2017-2018 data. We map real dates into the
    # training range so the StandardScaler produces values in the expected
    # distribution. Month and day are kept as-is (same range).
    _TRAINING_YEAR = 2018

    # Default mappings for fields that don't have restaurant equivalents
    DEFAULTS = {
        "no_of_weekend_nights": 0,
        "no_of_week_nights": 0,
        "type_of_meal_plan": "Meal Plan 1",
        "required_car_parking_space": 0,
        "room_type_reserved": "Room_Type 1",
        "arrival_year": _TRAINING_YEAR,
        "arrival_month": 1,
        "arrival_date": 1,
        "market_segment_type": "Online",
        "no_of_previous_cancellations": 0,
        "no_of_previous_bookings_not_canceled": 0,
    }

    @classmethod
    def map_reservation(
        cls,
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
    ) -> pd.DataFrame:
        """Convert restaurant reservation data into the hotel model feature format.

        The Domain Adapter automatically scales lead_time and price into the
        hotel model's expected range before feature construction.

        Args:
            party_size: Total number of guests (adults + children).
            children: Number of children in the party.
            booking_advance_days: Days between booking and reservation date.
            special_needs_count: Number of special requests (allergies, preferences).
            is_repeat_guest: Whether the guest has visited before.
            estimated_spend_per_cover: Expected spend per person.
            reservation_date: ISO date string of the reservation (YYYY-MM-DD).
            previous_cancellations: Number of past no-shows/cancellations.
            previous_completions: Number of past completed visits.
            booking_channel: How the reservation was made.

        Returns:
            DataFrame with one row in the hotel model's expected feature format.
        """
        adults = max(1, party_size - children)

        # ---- Domain Adapter: scale restaurant inputs to hotel range ----
        adapted_lead_time = adapt_lead_time(booking_advance_days)
        adapted_price = adapt_price(estimated_spend_per_cover)

        if reservation_date:
            dt = datetime.fromisoformat(reservation_date)
            month, date = dt.month, dt.day
            weekday = dt.weekday()
            weekend_nights = 1 if weekday >= 4 else 0  # Fri/Sat = weekend
            week_nights = 1 if weekday < 4 else 0
        else:
            now = datetime.now()
            month, date = now.month, now.day
            weekend_nights = cls.DEFAULTS["no_of_weekend_nights"]
            week_nights = cls.DEFAULTS["no_of_week_nights"]

        # Always use the training-era year so the scaler produces valid values
        year = cls._TRAINING_YEAR

        # Map booking channel to market segment
        channel_map = {
            "online": "Online",
            "phone": "Offline",
            "walk-in": "Offline",
            "corporate": "Corporate",
            "app": "Online",
        }
        market_segment = channel_map.get(booking_channel.lower(), "Online")

        # Map spend level to room type (proxy for service tier)
        # Uses original restaurant spend for tier logic, adapted price for model
        if estimated_spend_per_cover >= 200:
            room_type = "Room_Type 4"  # Premium
        elif estimated_spend_per_cover >= 120:
            room_type = "Room_Type 2"  # Mid-high
        elif estimated_spend_per_cover >= 60:
            room_type = "Room_Type 1"  # Standard
        else:
            room_type = "Room_Type 6"  # Budget

        # Map special needs to meal plan
        if special_needs_count >= 3:
            meal_plan = "Meal Plan 3"
        elif special_needs_count >= 1:
            meal_plan = "Meal Plan 1"
        else:
            meal_plan = "Not Selected"

        row = {
            "no_of_adults": adults,
            "no_of_children": children,
            "no_of_weekend_nights": weekend_nights,
            "no_of_week_nights": week_nights,
            "type_of_meal_plan": meal_plan,
            "required_car_parking_space": 0,
            "room_type_reserved": room_type,
            "lead_time": adapted_lead_time,
            "arrival_year": year,
            "arrival_month": month,
            "arrival_date": date,
            "market_segment_type": market_segment,
            "repeated_guest": 1 if is_repeat_guest else 0,
            "no_of_previous_cancellations": previous_cancellations,
            "no_of_previous_bookings_not_canceled": previous_completions,
            "avg_price_per_room": adapted_price,
            "no_of_special_requests": special_needs_count,
        }

        return pd.DataFrame([row])[ALL_FEATURE_COLUMNS]
