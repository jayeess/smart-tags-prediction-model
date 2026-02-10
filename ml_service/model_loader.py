"""Model loading and preprocessor fitting utilities."""

import os
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler, OneHotEncoder

MODEL_DIR = Path(__file__).parent / "model"
MODEL_PATH = MODEL_DIR / "fds_model_1.keras"
DATASET_PATH = MODEL_DIR / "Hotel_reservations.csv"
PREPROCESSOR_CACHE = Path(__file__).parent / "preprocessor.pkl"

NUMERICAL_COLUMNS = [
    "no_of_adults",
    "no_of_children",
    "no_of_weekend_nights",
    "no_of_week_nights",
    "lead_time",
    "arrival_year",
    "arrival_month",
    "arrival_date",
    "repeated_guest",
    "no_of_previous_cancellations",
    "no_of_previous_bookings_not_canceled",
    "avg_price_per_room",
    "required_car_parking_space",
    "no_of_special_requests",
]

CATEGORICAL_COLUMNS = [
    "type_of_meal_plan",
    "room_type_reserved",
    "market_segment_type",
]

ALL_FEATURE_COLUMNS = NUMERICAL_COLUMNS + CATEGORICAL_COLUMNS


def load_keras_model():
    """Load the trained Keras model."""
    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
    import tensorflow as tf
    tf.get_logger().setLevel("ERROR")
    model = tf.keras.models.load_model(str(MODEL_PATH))
    return model


def build_preprocessor() -> ColumnTransformer:
    """Build and fit the preprocessor on the original training data.

    The preprocessor must be fit on the same data used during training
    to ensure consistent scaling and encoding.
    """
    if PREPROCESSOR_CACHE.exists():
        with open(PREPROCESSOR_CACHE, "rb") as f:
            return pickle.load(f)

    df = pd.read_csv(DATASET_PATH)
    df = df.drop(columns=["Booking_ID", "booking_status"])

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), NUMERICAL_COLUMNS),
            ("cat", OneHotEncoder(drop="first", sparse_output=False), CATEGORICAL_COLUMNS),
        ]
    )
    preprocessor.fit(df[ALL_FEATURE_COLUMNS])

    with open(PREPROCESSOR_CACHE, "wb") as f:
        pickle.dump(preprocessor, f)

    return preprocessor
