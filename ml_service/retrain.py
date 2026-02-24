"""Feedback-driven model retraining pipeline.

Uses collected ground-truth feedback (showed_up / no_show / cancelled)
to fine-tune the heuristic weights and optionally retrain the ANN model.

This script can be run as:
    python -m ml_service.retrain

Two retraining strategies:
1. Heuristic calibration (fast, no GPU):
   - Adjusts _HEURISTIC_WEIGHT blend ratio based on prediction drift
   - Tunes risk thresholds based on actual outcome distribution

2. ANN fine-tuning (slower, needs TensorFlow):
   - Loads the existing Keras model
   - Creates training samples from feedback data
   - Fine-tunes for a few epochs with low learning rate
   - Saves updated model

Usage:
    # Calibrate heuristic weights from feedback data
    python -m ml_service.retrain --mode calibrate --input feedback.json

    # Fine-tune ANN model
    python -m ml_service.retrain --mode finetune --input feedback.json

    # Export feedback stats report
    python -m ml_service.retrain --mode report --input feedback.json
"""

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

FEEDBACK_DIR = Path(__file__).parent / "feedback"
MODEL_DIR = Path(__file__).parent / "model"


def load_feedback(path: Optional[str] = None) -> list[dict]:
    """Load feedback records from JSON file or default location."""
    if path:
        fp = Path(path)
    else:
        fp = FEEDBACK_DIR / "feedback_data.json"

    if not fp.exists():
        logger.warning(f"No feedback file found at {fp}")
        return []

    with open(fp) as f:
        data = json.load(f)

    records = data if isinstance(data, list) else data.get("records", [])
    logger.info(f"Loaded {len(records)} feedback records from {fp}")
    return records


def compute_drift_report(records: list[dict]) -> dict:
    """Analyze prediction accuracy from feedback data.

    Returns:
        Dictionary with accuracy metrics, drift stats, and recommendations.
    """
    if not records:
        return {"error": "No feedback records to analyze"}

    total = len(records)
    outcomes = {"showed_up": 0, "no_show": 0, "cancelled": 0}
    drifts = []
    correct = 0
    high_risk_showed = 0  # False positives
    low_risk_noshow = 0   # False negatives

    for r in records:
        outcome = r.get("outcome", "")
        outcomes[outcome] = outcomes.get(outcome, 0) + 1

        predicted_risk = r.get("predicted_risk", 0.0)
        predicted_label = r.get("predicted_label", "")
        actual_no_show = 0.0 if outcome == "showed_up" else 1.0
        drift = abs(predicted_risk - actual_no_show)
        drifts.append(drift)

        if drift < 0.3:
            correct += 1

        # Track false positives/negatives
        if predicted_label == "High Risk" and outcome == "showed_up":
            high_risk_showed += 1
        if predicted_label == "Low Risk" and outcome in ("no_show", "cancelled"):
            low_risk_noshow += 1

    accuracy = correct / total if total > 0 else 0
    avg_drift = float(np.mean(drifts)) if drifts else 0
    max_drift = float(np.max(drifts)) if drifts else 0

    report = {
        "total_feedback": total,
        "accuracy": round(accuracy, 3),
        "avg_drift": round(avg_drift, 3),
        "max_drift": round(max_drift, 3),
        "outcomes": outcomes,
        "false_positive_rate": round(high_risk_showed / max(1, outcomes.get("showed_up", 1)), 3),
        "false_negative_rate": round(low_risk_noshow / max(1, outcomes.get("no_show", 1) + outcomes.get("cancelled", 1)), 3),
        "recommendations": [],
        "generated_at": datetime.utcnow().isoformat(),
    }

    # Generate recommendations
    if accuracy < 0.6:
        report["recommendations"].append(
            "LOW ACCURACY: Consider increasing heuristic weight or retraining the ANN model."
        )
    if report["false_positive_rate"] > 0.3:
        report["recommendations"].append(
            "HIGH FALSE POSITIVES: Model is flagging too many guests as high-risk. "
            "Consider raising RISK_HIGH_THRESHOLD."
        )
    if report["false_negative_rate"] > 0.2:
        report["recommendations"].append(
            "HIGH FALSE NEGATIVES: Model is missing actual no-shows. "
            "Consider lowering RISK_MEDIUM_THRESHOLD or increasing cancel history weight."
        )
    if avg_drift > 0.4:
        report["recommendations"].append(
            "HIGH AVG DRIFT: Predictions are significantly off. "
            "ANN fine-tuning recommended with collected feedback data."
        )
    if not report["recommendations"]:
        report["recommendations"].append(
            "Model performance is acceptable. Continue collecting feedback."
        )

    return report


def calibrate_heuristic(records: list[dict]) -> dict:
    """Suggest adjusted heuristic parameters based on feedback drift patterns.

    Analyzes which input factors correlate with prediction errors
    and suggests weight adjustments for the heuristic scorer.
    """
    if len(records) < 10:
        return {
            "status": "insufficient_data",
            "message": f"Need at least 10 feedback records, have {len(records)}",
        }

    # Analyze drift patterns by factor
    high_cancel_drift = []
    repeat_guest_drift = []
    advance_booking_drift = []

    for r in records:
        predicted_risk = r.get("predicted_risk", 0.0)
        actual_no_show = 0.0 if r.get("outcome") == "showed_up" else 1.0
        drift = predicted_risk - actual_no_show  # positive = over-predicted risk

        cancels = r.get("previous_cancellations", 0)
        if cancels >= 3:
            high_cancel_drift.append(drift)

        if r.get("is_repeat_guest"):
            repeat_guest_drift.append(drift)

        advance = r.get("booking_advance_days", 0)
        if advance >= 14:
            advance_booking_drift.append(drift)

    suggestions = {}

    # If high-cancel guests show up more than expected, reduce cancel penalty
    if high_cancel_drift:
        avg = float(np.mean(high_cancel_drift))
        if avg > 0.2:
            suggestions["cancellation_penalty"] = "REDUCE — over-penalizing cancel history"
        elif avg < -0.2:
            suggestions["cancellation_penalty"] = "INCREASE — under-penalizing cancel history"

    # If repeat guests no-show more than expected, reduce loyalty boost
    if repeat_guest_drift:
        avg = float(np.mean(repeat_guest_drift))
        if avg < -0.15:
            suggestions["loyalty_boost"] = "REDUCE — repeat guests are less reliable than modeled"
        elif avg > 0.15:
            suggestions["loyalty_boost"] = "INCREASE — repeat guests are more reliable than modeled"

    # Advance booking correlation
    if advance_booking_drift:
        avg = float(np.mean(advance_booking_drift))
        if avg < -0.15:
            suggestions["advance_penalty"] = "INCREASE — long advance bookings are riskier than modeled"

    # Blend weight suggestion
    report = compute_drift_report(records)
    if report.get("accuracy", 1) < 0.5:
        suggestions["blend_ratio"] = "Consider reducing ANN weight (currently 20%) to 10%"

    return {
        "status": "calibrated",
        "sample_size": len(records),
        "suggestions": suggestions if suggestions else {"_note": "No adjustments needed"},
    }


def finetune_ann(records: list[dict], epochs: int = 5, lr: float = 0.0001) -> dict:
    """Fine-tune the Keras ANN model using feedback data.

    Creates labeled training samples from feedback records:
    - showed_up -> label 1.0 (reliable)
    - no_show/cancelled -> label 0.0 (unreliable)

    Uses a very low learning rate to avoid catastrophic forgetting.
    """
    if len(records) < 20:
        return {
            "status": "insufficient_data",
            "message": f"Need at least 20 records for fine-tuning, have {len(records)}",
        }

    try:
        import os
        os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
        import tensorflow as tf
        tf.get_logger().setLevel("ERROR")
    except ImportError:
        return {"status": "error", "message": "TensorFlow not available"}

    from .model_loader import load_keras_model, build_preprocessor, MODEL_PATH
    from .data_mapper import RestaurantToHotelMapper

    model = load_keras_model()
    preprocessor = build_preprocessor()

    # Build training data from feedback
    X_rows = []
    y_labels = []

    for r in records:
        try:
            feature_df = RestaurantToHotelMapper.map_reservation(
                party_size=r.get("party_size", 2),
                children=r.get("children", 0),
                booking_advance_days=r.get("booking_advance_days", 0),
                special_needs_count=r.get("special_needs_count", 0),
                is_repeat_guest=r.get("is_repeat_guest", False),
                estimated_spend_per_cover=r.get("estimated_spend_per_cover", 80.0),
                reservation_date=r.get("reservation_date"),
                previous_cancellations=r.get("previous_cancellations", 0),
                previous_completions=r.get("previous_completions", 0),
                booking_channel=r.get("booking_channel", "Online"),
            )
            X_processed = preprocessor.transform(feature_df)
            X_rows.append(X_processed[0])
            # Label: 1.0 = showed up (reliable), 0.0 = no-show/cancelled
            y_labels.append(1.0 if r["outcome"] == "showed_up" else 0.0)
        except Exception as e:
            logger.warning(f"Skipping record {r.get('record_id', '?')}: {e}")
            continue

    if len(X_rows) < 10:
        return {
            "status": "insufficient_valid_data",
            "message": f"Only {len(X_rows)} valid training samples after processing",
        }

    X_train = np.array(X_rows)
    y_train = np.array(y_labels)

    # Fine-tune with very low learning rate
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=lr),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )

    history = model.fit(
        X_train,
        y_train,
        epochs=epochs,
        batch_size=min(32, len(X_rows)),
        verbose=0,
    )

    # Save updated model
    backup_path = MODEL_PATH.with_suffix(f".keras.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    import shutil
    shutil.copy2(MODEL_PATH, backup_path)
    model.save(str(MODEL_PATH))

    final_loss = float(history.history["loss"][-1])
    final_acc = float(history.history["accuracy"][-1])

    return {
        "status": "fine_tuned",
        "samples": len(X_rows),
        "epochs": epochs,
        "learning_rate": lr,
        "final_loss": round(final_loss, 4),
        "final_accuracy": round(final_acc, 4),
        "backup_saved": str(backup_path),
    }


def main():
    parser = argparse.ArgumentParser(
        description="eMenu Smart Tags — Feedback-driven retraining pipeline"
    )
    parser.add_argument(
        "--mode",
        choices=["report", "calibrate", "finetune"],
        default="report",
        help="Retraining mode: report (drift analysis), calibrate (heuristic tuning), finetune (ANN update)",
    )
    parser.add_argument(
        "--input",
        type=str,
        default=None,
        help="Path to feedback JSON file",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=5,
        help="Number of fine-tuning epochs (finetune mode only)",
    )
    parser.add_argument(
        "--lr",
        type=float,
        default=0.0001,
        help="Learning rate for fine-tuning",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    records = load_feedback(args.input)
    if not records:
        print("No feedback data found. Collect feedback via the app first.")
        sys.exit(1)

    if args.mode == "report":
        result = compute_drift_report(records)
        print("\n=== DRIFT REPORT ===")
        print(json.dumps(result, indent=2))

    elif args.mode == "calibrate":
        result = calibrate_heuristic(records)
        print("\n=== HEURISTIC CALIBRATION ===")
        print(json.dumps(result, indent=2))

    elif args.mode == "finetune":
        print(f"Fine-tuning ANN model ({args.epochs} epochs, lr={args.lr})...")
        result = finetune_ann(records, epochs=args.epochs, lr=args.lr)
        print("\n=== FINE-TUNING RESULT ===")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
