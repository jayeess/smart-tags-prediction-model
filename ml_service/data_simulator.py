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

    # Dinner service time slots (weighted toward prime time)
    _DINNER_SLOTS = [
        ("18:00", 0.08), ("18:15", 0.06), ("18:30", 0.10), ("18:45", 0.06),
        ("19:00", 0.14), ("19:15", 0.06), ("19:30", 0.12), ("19:45", 0.04),
        ("20:00", 0.10), ("20:15", 0.04), ("20:30", 0.08), ("20:45", 0.02),
        ("21:00", 0.06), ("21:30", 0.04),
    ]

    @classmethod
    def generate(
        cls,
        n: int = 500,
        tenant_id: str = "restaurant_001",
        seed: Optional[int] = None,
    ) -> pd.DataFrame:
        """Generate n synthetic restaurant reservations for tonight.

        Args:
            n: Number of reservations to generate.
            tenant_id: Restaurant/tenant identifier for isolation.
            seed: Random seed (None = random each time).

        Returns:
            DataFrame with restaurant reservation fields, all dated today.
        """
        if seed is not None:
            random.seed(seed)
            np.random.seed(seed)

        records = []
        today = datetime.now()
        today_str = today.strftime("%Y-%m-%d")

        # Pre-compute time slot distribution
        slots = [s[0] for s in cls._DINNER_SLOTS]
        slot_weights = [s[1] for s in cls._DINNER_SLOTS]

        # Assign tables: distribute across available tables
        table_pool = list(range(1, max(n + 5, 25)))
        random.shuffle(table_pool)

        for i in range(n):
            # Party composition
            adults = np.random.choice([1, 2, 3, 4, 5, 6], p=[0.15, 0.40, 0.20, 0.15, 0.07, 0.03])
            children = np.random.choice([0, 0, 0, 0, 1, 1, 2, 3])
            party_size = adults + children

            # Booking characteristics
            advance_days = int(np.random.exponential(scale=5))
            is_repeat = random.random() < 0.25
            prev_cancellations = np.random.choice([0, 0, 0, 0, 0, 1, 1, 2, 3, 5])
            prev_completions = np.random.poisson(4) if is_repeat else 0

            # Spend estimation (per cover)
            base_spend = np.random.lognormal(mean=4.0, sigma=0.5)
            spend_per_cover = round(min(max(base_spend, 15.0), 500.0), 2)

            # Special requests
            special_count = np.random.choice([0, 0, 0, 1, 1, 2, 2, 3])

            # Notes
            note_template = random.choice(cls.NOTES_TEMPLATES)
            note = note_template.format(name=random.choice(cls.FIRST_NAMES)) if "{name}" in note_template else note_template

            # Channel
            channel = random.choice(cls.CHANNELS)

            # Guest name
            guest_name = f"{random.choice(cls.FIRST_NAMES)} {random.choice(cls.LAST_NAMES)}"

            # Dinner time slot (weighted toward prime time 7-8pm)
            res_time = np.random.choice(slots, p=slot_weights)

            records.append({
                "reservation_id": f"RES-{tenant_id[-3:]}-{i+1:05d}",
                "tenant_id": tenant_id,
                "guest_name": guest_name,
                "party_size": int(party_size),
                "adults": int(adults),
                "children": int(children),
                "booking_advance_days": advance_days,
                "reservation_date": today_str,
                "reservation_time": res_time,
                "estimated_spend_per_cover": spend_per_cover,
                "is_repeat_guest": is_repeat,
                "previous_cancellations": int(prev_cancellations),
                "previous_completions": int(prev_completions),
                "special_needs_count": int(special_count),
                "notes": note,
                "booking_channel": channel,
                "table_number": table_pool[i % len(table_pool)],
            })

        # Sort by reservation time for natural ordering
        df = pd.DataFrame(records)
        df = df.sort_values("reservation_time").reset_index(drop=True)
        return df
