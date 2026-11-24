"""Model service: loads the saved Phase 6 model ONCE and turns validated requests into genuine model predictions.
Uses the existing inference module (ml.inference); nothing here retrains or alters the model."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np
import pandas as pd

from app.schemas.prediction import PredictionRequest
from ml.feature_engineering import RAW_INPUTS
from ml.inference import FINAL_DIR, InvalidFlightInput, load_final_model, load_options, validate

log = logging.getLogger("airfareindex")
RESOURCES = Path(__file__).resolve().parents[1] / "resources"
PROFILE_DAYS = [1, 3, 7, 14, 21, 30, 40, 50]


class ModelUnavailable(RuntimeError):
    pass


class PredictionFailed(RuntimeError):
    pass


class PredictorService:
    def __init__(self) -> None:
        self.model = None
        self.options: dict | None = None
        self.meta: dict | None = None
        self.hints: dict = {}
        self.insights: dict = {}
        self.load_error: str | None = None

    # ------------------------------------------------------------------ lifecycle
    def load(self) -> "PredictorService":
        try:
            self.model = load_final_model()                      # single-threaded, deterministic (see ml.inference)
            self.options = load_options()
            self.meta = json.loads((FINAL_DIR / "final_model_metadata.json").read_text(encoding="utf-8"))
            self.hints = json.loads((RESOURCES / "duration_hints.json").read_text(encoding="utf-8"))
            self.insights = json.loads((RESOURCES / "insights.json").read_text(encoding="utf-8"))
            self.load_error = None
            log.info("model loaded: %s", self.meta["model_name"])
        except Exception as exc:  # noqa: BLE001 - the API must still start and report 503 instead of crashing
            self.model = None
            self.load_error = f"{type(exc).__name__}: {exc}"
            log.exception("model failed to load")
        return self

    @property
    def ready(self) -> bool:
        return self.model is not None and self.options is not None and self.meta is not None

    def require_ready(self) -> None:
        if not self.ready:
            raise ModelUnavailable(self.load_error or "model not loaded")

    # ------------------------------------------------------------------ public data
    def public_options(self) -> dict:
        self.require_ready()
        o = self.options
        return {"cities": o["cities"], "stops": o["stops"], "days_left_range": o["days_left_range"],
                "duration_hours_range_by_stops": o["duration_hours_range_by_stops"], "airline_class_routes": o["airline_class_routes"],
                "duration_hints": self.hints, "excluded_classes": o["excluded_classes"]}

    def model_info(self) -> dict:
        self.require_ready()
        m = self.meta
        return {"name": m["model_name"], "description": self._describe(), "sha256": m["sha256"], "training": m["training"],
                "input_columns": m["predict_contract"]["input_columns"], "evaluation_summary": m["evaluation_summary"], "limitations": m["limitations"]}

    @staticmethod
    def _describe() -> str:
        return "Random Forest (75%) blended with a route-level median-fare lookup (25%), trained on historical listed fares"

    # ------------------------------------------------------------------ prediction
    def predict(self, req: PredictionRequest) -> dict:
        self.require_ready()
        if req.source == req.destination:
            raise InvalidFlightInput("Origin and destination must be different cities.")
        row = {"airline": req.airline, "travel_class": req.travel_class, "source": req.source, "destination": req.destination,
               "stops": req.stops, "duration_hours": req.duration_hours, "days_left": req.days_left, "dep_minutes": req.dep_minutes}
        frame = pd.DataFrame([row])
        validate(frame, self.options)                            # supported airline/class/route, stops, days_left, duration ranges
        # one batch: the requested itinerary first, then the same itinerary at the other lead times (model what-ifs)
        batch = pd.concat([frame] + [frame.assign(days_left=d) for d in PROFILE_DAYS], ignore_index=True)
        try:
            pred = np.asarray(self.model.predict(batch[RAW_INPUTS]), dtype=float)
        except Exception as exc:  # noqa: BLE001
            log.exception("model.predict failed")
            raise PredictionFailed("the model could not produce a prediction") from exc
        if pred.shape != (len(batch),) or not np.isfinite(pred).all() or not (pred > 0).all():
            log.error("invalid model output: %s", pred)
            raise PredictionFailed("the model returned an invalid prediction")
        fare = int(round(float(pred[0])))
        profile = [{"days_left": d, "predicted_fare_inr": int(round(float(p)))} for d, p in zip(PROFILE_DAYS, pred[1:])]
        return {
            "predicted_fare_inr": fare, "currency": "INR",
            "itinerary": {"source": req.source, "destination": req.destination, "airline": req.airline, "travel_class": req.travel_class,
                          "departure_time": req.departure_time, "stops": req.stops, "duration_hours": req.duration_hours, "days_left": req.days_left},
            "departure_time_used_by_model": False,
            "lead_time_profile": profile,
            "drivers": self._drivers(req, profile),
            "typical_error": self._typical_error(),
            "model": self._model_summary(),
            "limitations": self._limitations(),
        }

    # ------------------------------------------------------------------ transparency content (numbers come from experiment outputs)
    def _typical_error(self) -> dict:
        ev = self.insights["evaluation"]["unseen_flights"]
        return {"metric": "median absolute percentage error", "value_pct": ev["median_ape_pct"], "sd_across_draws_pct": ev["median_ape_sd_pct"], "draws": ev["draws"],
                "basis": f"{ev['draws']} evaluation draws of flights the model had not seen in training",
                "is_per_prediction_confidence": False,
                "note": "This is a model-level evaluation statistic, not a confidence score for this particular prediction."}

    def _model_summary(self) -> dict:
        t = self.meta["training"]
        return {"name": self.meta["model_name"], "description": self._describe(), "trained_on": "historical listed fares from one booking platform",
                "training_period": f"journeys {self._nice_date(t['journey_dates'][0])} to {self._nice_date(t['journey_dates'][1])}",
                "evaluated_on": "held-out flights from the same data (10 draws), plus a 2022 check from the same platform"}

    @staticmethod
    def _nice_date(iso: str) -> str:
        d = pd.Timestamp(iso)
        return f"{d.day} {d.strftime('%b %Y')}"

    def _limitations(self) -> list[str]:
        t = self.meta["training"]
        ev = self.insights["evaluation"]
        return [
            "Estimates come from a model trained on historical listed fares from one platform. They are not live or real-time fares and not a booking quote.",
            f"Training data covers journeys from {self._nice_date(t['journey_dates'][0])} to {self._nice_date(t['journey_dates'][1])} (January to March 2023). Actual market fares may differ.",
            "Supported lead time is 1 to 50 days before departure.",
            f"Typical error on flights the model had not seen in training is about {ev['unseen_flights']['median_ape_pct']:.0f}-12% (median absolute percentage error). "
            "This is a model-level statistic, not a confidence score for this prediction.",
            "Unseen airlines, routes and future market periods have not been independently validated. A check on 2022 data from the same platform showed the model "
            f"over-predicting Economy fares by about {ev['other_period_2022']['economy_median_pred_over_actual']:.2f}x, so it should not be used for other periods.",
            "Departure time is accepted but this model version does not use it: changing it does not change the estimate.",
        ]

    @staticmethod
    def _drivers(req: PredictionRequest, profile: list[dict]) -> list[dict]:
        by_day = {p["days_left"]: p["predicted_fare_inr"] for p in profile}
        hi, lo = by_day[1], by_day[50]
        lead = (f"For this itinerary the model's estimate is about ₹{abs(hi - lo):,} {'lower' if lo < hi else 'higher'} at 50 days than at 1 day ahead "
                "(a description of the model, not a rule about real fares).")
        return [
            {"factor": "Travel class", "value": req.travel_class, "text": "The strongest factor in the model: Business fares are several times Economy fares in the training data."},
            {"factor": "Airline", "value": req.airline, "text": "Airlines sit at different typical price levels in the training data; this also reflects which classes each airline offers."},
            {"factor": "Flight duration", "value": f"{req.duration_hours:g} h", "text": "Very short itineraries are estimated lower; beyond a few hours the estimate changes little."},
            {"factor": "Days before departure", "value": f"{req.days_left} days", "text": lead},
            {"factor": "Number of stops", "value": req.stops, "text": "Non-stop itineraries tend to be estimated lower than itineraries with stops. These are associations in the data, not causes."},
        ]
