# AirfareIndex — Real-Time Airfare Price Predictor

Supervised-learning (regression) project: predict flight ticket prices from historical labelled data, compare Linear Regression, Decision Tree, Random Forest, Gradient Boosting and XGBoost, and expose it through a FastAPI + React app.

**Status:** Phases 1-8 complete pending review (3D React frontend + FastAPI + saved Phase 6 model). Frontend design and testing: `docs/08-frontend-transformation-report.md`. Docs: `docs/01-architecture.md` ... `docs/06-phase6-final-report.md`. Final model: `backend/saved_models/final/` (load with `ml.inference.load_final_model`).

## Environment (verified)
- Windows 11, Python 3.14.2, Node 24.18.0, npm 11.16.0
- Python 3.14 works for the full ML stack (prebuilt wheels incl. XGBoost 3.4.1 and SHAP 0.54.1), so Python 3.12 was not needed.
- Exact backend versions are pinned in `backend/requirements.txt`.

## Backend setup and run
Run from the project root in PowerShell:
```powershell
python -m venv backend\.venv
backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
cd backend
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000 --reload
.\.venv\Scripts\python -m pytest
```
Health check: http://127.0.0.1:8000/health (docs at `/docs`).

## Frontend setup and run
```powershell
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```
Vite proxies `/api/*` to the backend at `127.0.0.1:8000` (prefix stripped), so the browser calls `/api/health`. Open the app via `localhost` (not `127.0.0.1`).

## Known notes
- `uvicorn[standard]` extras were installed but `requirements.txt` pins plain `uvicorn`; run `pip install "uvicorn[standard]==0.54.0"` if you want them on a fresh machine.
- pytest shows a Starlette deprecation warning about `httpx`; harmless for now.

## Data / EDA
Raw data is git-ignored in `backend/data/raw/` (see `docs/02-dataset-research.md` for sources). From `backend/`:
```powershell
.\.venv\Scripts\python -X utf8 -m ml.preprocessing
.\.venv\Scripts\python -X utf8 -m ml.eda
```

Feature engineering (Phase 4), from `backend/`: `python -X utf8 -m ml.splits` then `python -X utf8 -m ml.feature_engineering`; tests: `python -m pytest`.

Model development (Phase 5), from `backend/`: `python -X utf8 -m ml.train run --setup primary|group|stress`, `python -X utf8 -m ml.train curves`, `python -X utf8 -m ml.verify_experiments`, `python -X utf8 -m ml.report_figures`.

Phase 6, from `backend/`: `python -X utf8 -m ml.p6_tune`, `ml.p6_eval`, `ml.p6_train`, `ml.p6_external`, `ml.p6_benchmark`, `ml.p6_select`, `ml.p6_explain`, `ml.p6_verify`; tests: `python -m pytest`.

## Run the application (Phase 7)
Backend (from `backend/`; loads the saved model once at startup):
```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000
```
Frontend, production build (from `frontend/`), served at http://localhost:4173 with the `/api` proxy to the backend:
```powershell
npm install
npm run build
npm run preview
```
or `npm run dev` for development at http://localhost:5173. Use `localhost`, not `127.0.0.1`.
API docs: http://127.0.0.1:8000/docs. Endpoints: `GET /health`, `GET /ready`, `GET /options`, `GET /model/info`, `GET /model/insights`, `POST /predict`.
Tests: `python -m pytest` (backend), `npm run test:run` and `npm run lint` (frontend), `node e2e/crossbrowser.mjs`, `node e2e/a11y-motion.mjs`, `node e2e/capture-large.mjs` (installed Chrome/Edge/Firefox against the running app). Pages: `/` landing (WebGL hero), `/predict` estimator, `/methodology`.
Regenerate the small API resource files: `python scripts/build_app_resources.py` (from `backend/`). Optional env var `AIRFARE_CORS_ORIGINS` (comma-separated).

## Deployment (Phase 9)
Not yet deployed: needs your GitHub, Render and Vercel accounts. Everything is prepared; full steps and verification results in `docs/09-production-deployment-report.md`.
- Backend: Render blueprint `render.yaml` (Docker, `backend/Dockerfile`). Env vars: `AIRFARE_ENV=production`, `AIRFARE_CORS_ORIGINS` (exact frontend origin, no wildcard), optional `AIRFARE_LOG_LEVEL`.
- Frontend: Vercel, root directory `frontend`. Env var `VITE_API_BASE_URL` = backend URL (see `frontend/.env.example`). SPA routing in `frontend/vercel.json`.
- Verify after deploy: `node e2e/verify-deployment.mjs https://<frontend> https://<api> --browser` (from `frontend/`).
