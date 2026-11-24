# AirfareIndex — Phase 1: Architecture

## Problem formulation
Supervised regression: learn f(X) -> price (INR) from labelled historical fares.
Test-set metrics (MAE, MSE, RMSE, R²) are the only source of accuracy claims.

## Layout
```
backend/app/        FastAPI (routes, services, schemas, database)
backend/ml/         offline training: preprocessing, features, per-model modules, evaluation, explainability
backend/data/raw/   downloaded datasets (git-ignored)
backend/saved_models/  joblib pipelines + metrics.json / importances.json / model_card.json
frontend/           React + Vite + Tailwind + Plotly + Framer Motion
docs/               academic documentation
```

## Data flow
1. `ml/train.py` reads raw data -> cleans -> grouped split -> fits one sklearn Pipeline per model -> writes artifacts.
2. FastAPI loads the best pipeline once at startup; ML Lab / Performance / Explainability pages read the saved JSON artifacts, so displayed numbers are the real test results.
3. `FlightProvider` interface: Amadeus adapter is optional; with no keys it reports "not configured" (never fake fares).
4. Prediction history in SQLite via SQLAlchemy.

## Environment actually used
Python 3.14.2 venv at `backend/.venv` (XGBoost 3.4.1 and SHAP 0.54.1 install and run on it; verified with a tiny smoke test, not a model result). Frontend: Vite 8, React 19, Tailwind 4 (`@tailwindcss/vite`), framer-motion, lucide-react, react-router-dom, react-plotly.js. Dev wiring: browser → Vite (5173) → `/api/*` proxy → FastAPI (8000).

## Non-negotiable rules
- No hardcoded predictions, metrics or chart data.
- Preprocessing lives inside the Pipeline (no train/serve skew).
- Splits are grouped by flight to avoid near-duplicate leakage (see blueprint §7).
- Historical records and live quotes are always labelled differently.
