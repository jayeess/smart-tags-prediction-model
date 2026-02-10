"""Generates synthetic restaurant reservation data modeled on the Hotel_reservations.csv schema."""

import random
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd


class RestaurantDataSimulator:
    """Generates synthetic restaurant-specific reservations that map onto
    the hotel model's feature space, enabling the ANN to produce
    meaningful predictions in a dining context.
    """

    FIRST_NAMES = [
        "James", "Sarah", "Mohammed", "Priya", "Carlos", "Mei",
        "Oliver", "Fatima", "Liam", "Aisha", "Noah", "Sofia",
        "Elena", "Raj", "Chen", "Maria", "David", "Yuki",
    ]
    LAST_NAMES = [
        "Smith", "Patel", "Kim", "Garcia", "Ali", "Chen",
        "Williams", "Kumar", "Tanaka", "Martinez", "Brown", "Singh",
    ]

    NOTES_TEMPLATES = [
        "Birthday celebration for {name}",
        "Anniversary dinner - need a quiet corner",
        "Severe nut allergy, carries epipen",
        "Vegetarian, no onion no garlic",
        "Gluten-free required for one guest",
        "VIP client from corporate account",
        "First time visitor, recommended by {name}",
        "Wheelchair accessible seating needed",
        "High chair needed for toddler",
        "Celebrating promotion, would like champagne",
        "Prefers window seat, good view",
        "Regular customer, knows the chef",
        "Late arrival expected, hold table until 8pm",
        "Dairy-free and shellfish allergy",
        "Business lunch with clients",
        "",
        "",
        "",
    ]

    CHANNELS = ["Online", "Phone", "Walk-in", "App", "Corporate"]

    @classmethod
    def generate(
        cls,
        n: int = 500,
        tenant_id: str = "restaurant_001",
        seed: Optional[int] = 42,
    ) -> pd.DataFrame:
        """Generate n synthetic restaurant reservations.

        Args:
            n: Number of reservations to generate.
            tenant_id: Restaurant/tenant identifier for isolation.
            seed: Random seed for reproducibility.

        Returns:
            DataFrame with restaurant reservation fields.
        """
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        records = []
        base_date = datetime(2026, 1, 1)

        for i in range(n):
            # Party composition
            adults = np.random.choice([1, 2, 3, 4, 5, 6], p=[0.15, 0.40, 0.20, 0.15, 0.07, 0.03])
            children = np.random.choice([0, 0, 0, 0, 1, 1, 2, 3])
            party_size = adults + children

            # Booking characteristics
            advance_days = int(np.random.exponential(scale=7))
            is_repeat = random.random() < 0.25
            prev_cancellations = np.random.choice([0, 0, 0, 0, 1, 1, 2, 3])
            prev_completions = np.random.poisson(3) if is_repeat else 0

            # Spend estimation (per cover)
            base_spend = np.random.lognormal(mean=4.0, sigma=0.5)
            spend_per_cover = round(min(max(base_spend, 15.0), 500.0), 2)

            # Reservation date
            res_date = base_date + timedelta(days=random.randint(0, 365))

            # Special requests
            special_count = np.random.choice([0, 0, 0, 1, 1, 2, 2, 3])

            # Notes
            note_template = random.choice(cls.NOTES_TEMPLATES)
            note = note_template.format(name=random.choice(cls.FIRST_NAMES)) if "{name}" in note_template else note_template

            # Channel
            channel = random.choice(cls.CHANNELS)

            # Guest name
            guest_name = f"{random.choice(cls.FIRST_NAMES)} {random.choice(cls.LAST_NAMES)}"

            records.append({
                "reservation_id": f"RES-{tenant_id[-3:]}-{i+1:05d}",
                "tenant_id": tenant_id,
                "guest_name": guest_name,
                "party_size": int(party_size),
                "adults": int(adults),
                "children": int(children),
                "booking_advance_days": advance_days,
                "reservation_date": res_date.strftime("%Y-%m-%d"),
                "reservation_time": f"{random.choice(range(11, 22))}:{random.choice(['00', '15', '30', '45'])}",
                "estimated_spend_per_cover": spend_per_cover,
                "is_repeat_guest": is_repeat,
                "previous_cancellations": int(prev_cancellations),
                "previous_completions": int(prev_completions),
                "special_needs_count": int(special_count),
                "notes": note,
                "booking_channel": channel,
                "table_number": random.randint(1, 30),
            })

        return pd.DataFrame(records)
