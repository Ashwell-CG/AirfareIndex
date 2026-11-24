"""Production-mode configuration tests (docs off, strict CORS, headers). Real model, no mocks."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app

VALID = {"source": "Delhi", "destination": "Mumbai", "airline": "Vistara", "travel_class": "Economy", "departure_time": "09:30",
         "stops": "non-stop", "duration_hours": 2.25, "days_left": 14}
FRONTEND = "https://airfareindex.example.app"


@pytest.fixture()
def prod_client(monkeypatch):
    monkeypatch.setenv("AIRFARE_ENV", "production")
    monkeypatch.setenv("AIRFARE_CORS_ORIGINS", FRONTEND + "/")        # trailing slash is normalised away
    with TestClient(create_app()) as c:
        yield c


def test_docs_and_schema_disabled_in_production(prod_client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert prod_client.get(path).status_code == 404


def test_docs_available_in_development(monkeypatch):
    monkeypatch.delenv("AIRFARE_ENV", raising=False)
    with TestClient(create_app(load_model=False)) as c:
        assert c.get("/docs").status_code == 200 and c.get("/openapi.json").status_code == 200


@pytest.mark.parametrize("origins", ["*", "", "https://a.example,*"])
def test_production_refuses_wildcard_or_empty_cors(monkeypatch, origins):
    monkeypatch.setenv("AIRFARE_ENV", "production")
    monkeypatch.setenv("AIRFARE_CORS_ORIGINS", origins)
    with pytest.raises(RuntimeError):
        create_app(load_model=False)


def test_cors_allows_only_the_configured_origin(prod_client):
    ok = prod_client.options("/predict", headers={"Origin": FRONTEND, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert ok.status_code == 200 and ok.headers["access-control-allow-origin"] == FRONTEND
    assert "access-control-allow-credentials" not in ok.headers
    bad = prod_client.options("/predict", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers
    r = prod_client.post("/predict", json=VALID, headers={"Origin": "https://evil.example"})
    assert r.status_code == 200 and "access-control-allow-origin" not in r.headers   # browsers block the response; server adds no allow header


def test_cors_header_on_real_prediction(prod_client):
    r = prod_client.post("/predict", json=VALID, headers={"Origin": FRONTEND})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == FRONTEND and r.json()["predicted_fare_inr"] > 0


def test_security_headers_and_no_store_on_predict(prod_client):
    r = prod_client.post("/predict", json=VALID)
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["referrer-policy"] == "no-referrer" and r.headers["cache-control"] == "no-store"


def test_health_and_ready_in_production(prod_client):
    assert prod_client.get("/health").json() == {"status": "ok"}
    assert prod_client.get("/ready").json()["status"] == "ready"


def test_validation_errors_do_not_echo_input_or_internals(prod_client):
    r = prod_client.post("/predict", json={**VALID, "airline": "x" * 500, "days_left": "<script>alert(1)</script>"})
    assert r.status_code == 422
    assert "script" not in r.text and "Traceback" not in r.text and "File \"" not in r.text


def test_oversized_body_rejected(prod_client):
    r = prod_client.post("/predict", content=b"x" * 20000, headers={"Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["error"] == "payload_too_large"
