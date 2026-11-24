"""HTTP routes. The frontend reaches them through the Vite proxy as /api/* (prefix stripped)."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from app.errors import ApiError
from app.schemas.prediction import ErrorResponse, PredictionRequest, PredictionResponse
from app.services.predictor import ModelUnavailable, PredictionFailed, PredictorService
from ml.inference import InvalidFlightInput

log = logging.getLogger("airfareindex")
router = APIRouter()
ERR = {422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}, 503: {"model": ErrorResponse}}
UNAVAILABLE = ("model_unavailable", "The prediction model is not available right now.")


def _clean(msg: str) -> tuple[str, list[dict]]:
    """Make an inference-module validation message user-facing and attach the form fields it concerns."""
    text = msg.split(": ", 1)[1] if msg.startswith("row ") and ": " in msg else msg
    keys = {"airline/class": ["airline", "travel_class"], "route": ["source", "destination"], "Origin and destination": ["source", "destination"],
            "stops": ["stops"], "days_left": ["days_left"], "duration_hours": ["duration_hours"], "dep_minutes": ["departure_time"]}
    fields = [{"field": f, "message": text} for k, fs in keys.items() if k in text for f in fs]
    return text[:1].upper() + text[1:], fields


def svc(request: Request) -> PredictorService:
    return request.app.state.predictor


@router.get("/health")
def health():
    return {"status": "ok"}                               # unchanged from Phase 1: liveness only


@router.get("/ready", responses={503: ERR[503]})
def ready(request: Request):
    s = svc(request)
    if not s.ready:
        raise ApiError(503, *UNAVAILABLE)
    return {"status": "ready", "model": s.meta["model_name"]}


def _guard(fn):
    try:
        return fn()
    except ModelUnavailable as e:
        raise ApiError(503, *UNAVAILABLE) from e


@router.get("/options", responses={503: ERR[503]})
def options(request: Request):
    return _guard(svc(request).public_options)


@router.get("/model/info", responses={503: ERR[503]})
def model_info(request: Request):
    return _guard(svc(request).model_info)


@router.get("/model/insights", responses={503: ERR[503]})
def model_insights(request: Request):
    s = svc(request)
    _guard(s.require_ready)
    return s.insights


@router.post("/predict", response_model=PredictionResponse, responses=ERR)
def predict(body: PredictionRequest, request: Request):
    try:
        return svc(request).predict(body)
    except ModelUnavailable as e:
        raise ApiError(503, *UNAVAILABLE) from e
    except InvalidFlightInput as e:
        msg, fields = _clean(str(e))
        raise ApiError(422, "unsupported_itinerary", msg, fields) from e
    except PredictionFailed as e:
        raise ApiError(500, "prediction_failed", "The model could not produce a valid prediction. Please try again.") from e
