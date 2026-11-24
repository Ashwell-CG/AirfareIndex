"""Phase 7 API tests. Most use the REAL saved model (no mocks); only the failure-path tests substitute a broken model on purpose."""
import hashlib
import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from ml.inference import FINAL_DIR, load_final_model, predict_fares

VALID = {"source": "Delhi", "destination": "Mumbai", "airline": "Vistara", "travel_class": "Economy", "departure_time": "09:30",
         "stops": "non-stop", "duration_hours": 2.25, "days_left": 14}


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


def test_health_unchanged(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_model_loaded_once_and_ready(client):
    s = client.app.state.predictor
    first = s.model
    client.post("/predict", json=VALID)
    client.post("/predict", json=VALID)
    assert s.model is first and s.ready
    r = client.get("/ready")
    assert r.status_code == 200 and r.json()["model"] == "blend_rf_lookup"


def test_options_contract(client):
    o = client.get("/options").json()
    assert o["days_left_range"] == [1, 50] and o["stops"] == ["non-stop", "1-stop", "2+-stop"]
    assert "First" in o["excluded_classes"]
    classes = {c for a in o["airline_class_routes"].values() for c in a}
    assert classes == {"Economy", "Premium Economy", "Business"}
    assert set(o["airline_class_routes"]) == {"Air India", "AirAsia", "AkasaAir", "AllianceAir", "GO FIRST", "Indigo", "SpiceJet", "StarAir", "Vistara"}
    assert "Delhi-Mumbai" in o["duration_hints"] and "non-stop" in o["duration_hints"]["Delhi-Mumbai"]


def test_valid_prediction_is_genuine_model_output(client):
    r = client.post("/predict", json=VALID)
    assert r.status_code == 200
    j = r.json()
    assert j["currency"] == "INR" and isinstance(j["predicted_fare_inr"], int) and j["predicted_fare_inr"] > 0
    assert j["itinerary"] == VALID and j["departure_time_used_by_model"] is False
    # identical to calling the saved model directly through the existing inference module
    direct = predict_fares(load_final_model(), [{"airline": "Vistara", "travel_class": "Economy", "source": "Delhi", "destination": "Mumbai",
                                                 "stops": "non-stop", "duration_hours": 2.25, "days_left": 14, "dep_minutes": 570}])
    assert j["predicted_fare_inr"] == int(round(direct[0]))
    assert [p["days_left"] for p in j["lead_time_profile"]] == [1, 3, 7, 14, 21, 30, 40, 50]
    assert all(p["predicted_fare_inr"] > 0 for p in j["lead_time_profile"])
    at14 = next(p for p in j["lead_time_profile"] if p["days_left"] == 14)
    assert at14["predicted_fare_inr"] == j["predicted_fare_inr"]
    te = j["typical_error"]
    assert 11 <= te["value_pct"] <= 12 and te["is_per_prediction_confidence"] is False and "not a confidence score" in te["note"]
    text = " ".join(j["limitations"])
    for phrase in ["not live or real-time", "January to March 2023", "1 to 50 days", "not been independently validated", "does not use it"]:
        assert phrase in text
    assert len(j["drivers"]) == 5


def test_prediction_varies_with_inputs_and_ignores_departure_time(client):
    base = client.post("/predict", json=VALID).json()["predicted_fare_inr"]
    assert client.post("/predict", json={**VALID, "departure_time": "23:59"}).json()["predicted_fare_inr"] == base
    assert client.post("/predict", json={**VALID, "days_left": 1}).json()["predicted_fare_inr"] != base
    assert client.post("/predict", json={**VALID, "travel_class": "Business"}).json()["predicted_fare_inr"] > 3 * base


def test_deterministic(client):
    a = client.post("/predict", json=VALID).json()
    b = client.post("/predict", json=VALID).json()
    assert a == b


@pytest.mark.parametrize("missing", list(VALID))
def test_missing_inputs_rejected(client, missing):
    body = {k: v for k, v in VALID.items() if k != missing}
    r = client.post("/predict", json=body)
    j = r.json()
    assert r.status_code == 422 and j["error"] == "validation_error" and any(f["field"] == missing for f in j["fields"])


@pytest.mark.parametrize("patch", [
    {"departure_time": "9:30"}, {"departure_time": "25:00"}, {"departure_time": "09:60"}, {"days_left": 0}, {"days_left": 51}, {"days_left": 2.5},
    {"stops": "3-stop"}, {"travel_class": "First"}, {"travel_class": "economy"}, {"duration_hours": -1}, {"duration_hours": 0}, {"duration_hours": "abc"},
    {"duration_hours": 61}, {"source": ""}, {"extra_field": 1}, {"flight_code": "UK-1"},
])
def test_invalid_inputs_rejected(client, patch):
    r = client.post("/predict", json={**VALID, **patch})
    assert r.status_code == 422 and r.json()["error"] == "validation_error"


def test_malformed_body(client):
    assert client.post("/predict", content="not json", headers={"content-type": "application/json"}).status_code == 422
    assert client.post("/predict", json=[1, 2]).status_code == 422


@pytest.mark.parametrize("patch,fields", [
    ({"airline": "Indigo", "travel_class": "Premium Economy"}, {"airline", "travel_class"}),
    ({"airline": "Indigo", "travel_class": "Business"}, {"airline", "travel_class"}),
    ({"airline": "NoSuchAir"}, {"airline", "travel_class"}),
    ({"destination": "Delhi"}, {"source", "destination"}),
    ({"source": "Atlantis"}, {"source", "destination"}),
    ({"duration_hours": 10.0}, {"duration_hours"}),
    ({"stops": "1-stop", "duration_hours": 1.0}, {"duration_hours"}),
])
def test_unsupported_combinations(client, patch, fields):
    r = client.post("/predict", json={**VALID, **patch})
    j = r.json()
    assert r.status_code == 422 and j["error"] in ("unsupported_itinerary", "validation_error")
    assert fields <= {f["field"] for f in j["fields"]} or j["error"] == "validation_error"
    assert not j["message"].startswith("row ")


def test_route_not_served_by_airline_is_rejected(client):
    o = client.get("/options").json()
    served = set(o["airline_class_routes"]["AllianceAir"]["Economy"]["routes"])
    unserved = next(r for r in o["duration_hints"] if r not in served)          # a real route that this airline does not serve
    s, d = unserved.split("-")
    r = client.post("/predict", json={**VALID, "airline": "AllianceAir", "source": s, "destination": d, "duration_hours": o["duration_hints"][unserved]["non-stop"]["typical"]})
    assert r.status_code == 422 and r.json()["error"] == "unsupported_itinerary"
    assert {"source", "destination"} <= {f["field"] for f in r.json()["fields"]}


def test_every_supported_combination_gives_valid_prediction(client):
    o = client.get("/options").json()
    n = 0
    for airline, classes in o["airline_class_routes"].items():
        for cls, v in classes.items():
            for route in v["routes"]:
                s, d = route.split("-")
                dur = o["duration_hints"][route]["non-stop"]["typical"]
                r = client.post("/predict", json={**VALID, "airline": airline, "travel_class": cls, "source": s, "destination": d, "duration_hours": dur})
                assert r.status_code == 200, (airline, cls, route, r.json())
                assert r.json()["predicted_fare_inr"] > 0
                n += 1
    assert n == sum(len(v["routes"]) for a in o["airline_class_routes"].values() for v in a.values())


class _Broken:
    def __init__(self, out=None, exc=None):
        self.out, self.exc = out, exc

    def predict(self, X):
        if self.exc:
            raise self.exc
        return self.out(len(X)) if callable(self.out) else self.out


@pytest.mark.parametrize("model", [
    _Broken(out=lambda n: np.full(n, np.nan)), _Broken(out=lambda n: np.full(n, -5.0)), _Broken(out=lambda n: np.zeros(n)),
    _Broken(out=lambda n: np.full(n, np.inf)), _Broken(out=lambda n: np.ones(n - 1)), _Broken(exc=RuntimeError("boom")),
])
def test_invalid_model_output_is_never_returned(model):
    with TestClient(create_app()) as c:
        c.app.state.predictor.model = model
        r = c.post("/predict", json=VALID)
        assert r.status_code == 500 and r.json()["error"] == "prediction_failed"
        assert "predicted_fare_inr" not in r.json() and "boom" not in r.text


def test_model_unavailable_returns_503_and_health_stays_up():
    with TestClient(create_app(load_model=False)) as c:
        assert c.get("/health").status_code == 200
        for r in (c.get("/ready"), c.get("/options"), c.get("/model/info"), c.get("/model/insights"), c.post("/predict", json=VALID)):
            assert r.status_code == 503 and r.json()["error"] == "model_unavailable"


def test_unexpected_exception_is_handled():
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        c.app.state.predictor.predict = lambda req: (_ for _ in ()).throw(ZeroDivisionError("secret"))
        r = c.post("/predict", json=VALID)
        assert r.status_code == 500 and r.json()["error"] == "internal_error" and "secret" not in r.text


def test_unknown_route_uses_error_body(client):
    r = client.get("/nope")
    assert r.status_code == 404 and r.json()["error"] == "http_error"


def test_model_info_and_insights(client):
    i = client.get("/model/info").json()
    assert i["name"] == "blend_rf_lookup" and "flight_code" not in i["input_columns"]
    ins = client.get("/model/insights").json()
    assert ins["evaluation"]["unseen_flights"]["median_ape_pct"] == 11.4 and len(ins["factors"]) >= 5


def test_saved_model_artifact_unchanged():
    meta = json.loads((FINAL_DIR / "final_model_metadata.json").read_text())
    assert hashlib.sha256((FINAL_DIR / "airfare_model.joblib").read_bytes()).hexdigest() == meta["sha256"]


def test_cors_allows_dev_frontend(client):
    r = client.options("/predict", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"
