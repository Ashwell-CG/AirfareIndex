"""Pydantic request/response schemas. The frontend mirrors these field names exactly."""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TravelClass = Literal["Economy", "Premium Economy", "Business"]       # First class is not supported by the model
Stops = Literal["non-stop", "1-stop", "2+-stop"]


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: str = Field(min_length=1, max_length=40, examples=["Delhi"])
    destination: str = Field(min_length=1, max_length=40, examples=["Mumbai"])
    airline: str = Field(min_length=1, max_length=40, examples=["Vistara"])
    travel_class: TravelClass
    departure_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="24-hour HH:MM", examples=["09:30"])
    stops: Stops
    duration_hours: float = Field(gt=0, le=60, description="Total itinerary duration in hours", examples=[2.25])
    days_left: int = Field(ge=1, le=50, description="Days between booking and departure (supported: 1-50)", examples=[14])

    @field_validator("duration_hours")
    @classmethod
    def _finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("duration_hours must be a finite number")
        return v

    @property
    def dep_minutes(self) -> int:
        h, m = self.departure_time.split(":")
        return int(h) * 60 + int(m)


class Itinerary(BaseModel):
    source: str
    destination: str
    airline: str
    travel_class: str
    departure_time: str
    stops: str
    duration_hours: float
    days_left: int


class LeadTimePoint(BaseModel):
    days_left: int
    predicted_fare_inr: int


class TypicalError(BaseModel):
    metric: str
    value_pct: float
    sd_across_draws_pct: float
    draws: int
    basis: str
    is_per_prediction_confidence: bool = False
    note: str


class ModelSummary(BaseModel):
    name: str
    description: str
    trained_on: str
    training_period: str
    evaluated_on: str


class Driver(BaseModel):
    factor: str
    value: str
    text: str


class PredictionResponse(BaseModel):
    predicted_fare_inr: int
    currency: Literal["INR"] = "INR"
    itinerary: Itinerary
    departure_time_used_by_model: bool = False
    lead_time_profile: list[LeadTimePoint]
    drivers: list[Driver]
    typical_error: TypicalError
    model: ModelSummary
    limitations: list[str]


class ErrorField(BaseModel):
    field: str | None = None
    message: str


class ErrorResponse(BaseModel):
    error: str
    message: str
    fields: list[ErrorField] = []
