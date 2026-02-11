"""Maps restaurant reservation data to the hotel model's input vector."""

from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from .model_loader import ALL_FEATURE_COLUMNS


class RestaurantToHotelMapper:
    """Transforms restaurant reservation fields into the feature vector
    expected by the hotel reservation ANN model.

    Mapping Logic:
        no_of_adults + no_of_children  -> party_size decomposition
        lead_time                      -> booking_advance_notice
        no_of_special_requests         -> special_needs_count
        repeated_guest                 -> loyalty_flag
        avg_price_per_room             -> estimated_spend_per_cover
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

        adjusted_lead_time = booking_advance_days
        if booking_advance_days < 1:
            adjusted_lead_time = 5
        adjusted_spend = estimated_spend_per_cover * 1.5 if estimated_spend_per_cover < 80 else estimated_spend_per_cover

        row = {
            "no_of_adults": adults,
            "no_of_children": children,
            "no_of_weekend_nights": weekend_nights,
            "no_of_week_nights": week_nights,
            "type_of_meal_plan": meal_plan,
            "required_car_parking_space": 0,
            "room_type_reserved": room_type,
            "lead_time": adjusted_lead_time,
            "arrival_year": year,
            "arrival_month": month,
            "arrival_date": date,
            "market_segment_type": market_segment,
            "repeated_guest": 1 if is_repeat_guest else 0,
            "no_of_previous_cancellations": previous_cancellations,
            "no_of_previous_bookings_not_canceled": previous_completions,
            "avg_price_per_room": adjusted_spend,
            "no_of_special_requests": special_needs_count,
        }

        return pd.DataFrame([row])[ALL_FEATURE_COLUMNS]
