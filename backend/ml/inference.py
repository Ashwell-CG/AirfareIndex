"""Loading and using the final Phase 6 model from the FastAPI backend (no routes are defined here).

    from ml.inference import load_final_model, predict_fares
    model = load_final_model()
    predict_fares(model, [{"airline": "Vistara", "travel_class": "Economy", "source": "Delhi", "destination": "Mumbai",
                           "stops": "non-stop", "duration_hours": 2.17, "days_left": 14, "dep_minutes": 540}])

The model object predicts INR directly (the log1p target transform is inside it). Inputs are validated against
supported_options.json: only airline/class/route combinations observed in training are accepted.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.feature_engineering import RAW_INPUTS

BACKEND = Path(__file__).resolve().parents[1]
FINAL_DIR = BACKEND / "saved_models" / "final"
OPTIONS = BACKEND / "data" / "processed" / "supported_options.json"


class InvalidFlightInput(ValueError):
    pass


def _members(obj):
    return [x for m in obj.members for x in _members(m)] if hasattr(obj, "members") else [obj]


def set_threads(obj, n: int) -> None:
    """Limit tree-model prediction threads. With 1 thread predictions are bit-for-bit reproducible
    (multi-threaded forests add trees in a different order: differences ~1e-10 INR) and single requests are not slowed by pool start-up."""
    for m in _members(obj):
        est = getattr(getattr(m, "regressor_", None), "named_steps", {}).get("model")
        if est is not None:
            if hasattr(est, "n_jobs"):
                est.set_params(n_jobs=n)
            if hasattr(est, "get_booster"):
                est.get_booster().set_param({"nthread": n})


def load_final_model(path: Path | None = None, n_jobs: int = 1):
    model = joblib.load(path or FINAL_DIR / "airfare_model.joblib")
    set_threads(model, n_jobs)
    return model


def load_options() -> dict:
    return json.loads(OPTIONS.read_text(encoding="utf-8"))


def validate(df: pd.DataFrame, options: dict | None = None) -> None:
    o = options or load_options()
    missing = [c for c in RAW_INPUTS if c not in df.columns]
    if missing:
        raise InvalidFlightInput(f"missing inputs: {missing}")
    if "flight_code" in df.columns:
        raise InvalidFlightInput("flight_code is not a model input")
    for i, r in df[RAW_INPUTS].iterrows():
        cls = o["airline_class_routes"].get(r.airline, {}).get(r.travel_class)
        if cls is None:
            raise InvalidFlightInput(f"row {i}: unsupported airline/class combination {r.airline}/{r.travel_class}")
        if f"{r.source}-{r.destination}" not in cls["routes"]:
            raise InvalidFlightInput(f"row {i}: route {r.source}-{r.destination} not supported for {r.airline}/{r.travel_class}")
        if r.stops not in o["stops"]:
            raise InvalidFlightInput(f"row {i}: stops must be one of {o['stops']}")
        lo, hi = o["days_left_range"]
        if not lo <= r.days_left <= hi:
            raise InvalidFlightInput(f"row {i}: days_left must be in [{lo}, {hi}] (training range)")
        if not 0 <= r.dep_minutes <= 1439:
            raise InvalidFlightInput(f"row {i}: dep_minutes must be 0-1439")
        dlo, dhi = o["duration_hours_range_by_stops"][r.stops]
        if not dlo <= r.duration_hours <= dhi:
            raise InvalidFlightInput(f"row {i}: duration_hours for {r.stops} must be in [{dlo}, {dhi}]")


def predict_fares(model, records: list[dict] | pd.DataFrame, check: bool = True) -> np.ndarray:
    df = records if isinstance(records, pd.DataFrame) else pd.DataFrame(records)
    if check:
        validate(df)
    p = np.asarray(model.predict(df[RAW_INPUTS]), float)
    if not (np.isfinite(p).all() and (p > 0).all()):
        raise RuntimeError("model produced a non-finite or non-positive fare")
    return p
