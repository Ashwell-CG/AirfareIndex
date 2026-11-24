# Phase 9 — Production Deployment Report

## 1. Status (read this first)

**The application is production-ready and fully configured for deployment, but it has NOT been deployed to a public URL.**
Deployment needs accounts that are not available in this environment: a GitHub account/repository, a Render account and a Vercel account. The project is also not yet a git repository, and no hosting CLI, token or Docker engine is present. No deployment URL exists, and none is claimed anywhere in this report.

What was done instead:

- All production configuration and deployment files were created and checked.
- The production configuration was exercised end to end on this machine as a *production-style local stack*: strict production backend (`AIRFARE_ENV=production`), built frontend, **cross-origin** calls with CORS limited to the frontend origin, a real browser, desktop and mobile. Result: **40/40 checks passed** (section 7). This is **not** a public-URL verification.
- A one-command post-deploy verification script (`frontend/e2e/verify-deployment.mjs`) is provided. Run it against the real URLs after deploying (section 6).

Remaining manual steps are in section 5.

## 2. Hosting architecture (chosen)

| Part | Host | Why |
|---|---|---|
| React frontend (static Vite build) | **Vercel**, project root `frontend` | Free, HTTPS by default, global CDN, SPA rewrites via `frontend/vercel.json` |
| FastAPI backend + saved model | **Render** web service (Docker), blueprint `render.yaml` | Free plan, HTTPS by default, runs the model in a container with the artifacts baked into the image (persistent, read-only access to the saved model) |

Browser (HTTPS) → Vercel static site → direct cross-origin `fetch` → Render API (`https://<service>.onrender.com`). The API allows only the exact frontend origin via CORS.

Why not a single host: the model needs scikit-learn/xgboost and ~270 MB RAM, which fits a container host; the frontend is purely static and is cheaper and faster on a CDN.

Model artifacts: `backend/saved_models/final/` is copied into the Docker image (≈ tens of MB; the repo `.gitignore` excludes only experiment artifacts above GitHub's 100 MB limit). The model is loaded once at startup, not per request. No database or writable storage is needed.

## 3. Production configuration

### Environment variables (names only; no secrets exist in this project)

| Variable | Where | Purpose |
|---|---|---|
| `AIRFARE_ENV` | backend | `production` disables `/docs`, `/redoc`, `/openapi.json` and rejects empty or `*` CORS |
| `AIRFARE_CORS_ORIGINS` | backend | exact frontend origin(s), comma-separated, no trailing slash, no wildcard (**must be set by hand**; `sync: false` in `render.yaml`) |
| `AIRFARE_LOG_LEVEL` | backend | optional, default `INFO` |
| `PORT` | backend | supplied by the platform |
| `VITE_API_BASE_URL` | frontend build | public backend URL (build-time); defaults to `/api` for local dev/preview |

### Files added or changed (production only)

- `backend/app/main.py` — env-driven CORS (GET/POST/OPTIONS, `Content-Type`/`Accept`, no credentials), production mode, startup log, 16 KB body limit (413), `nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` on `/predict`, request log without bodies.
- `backend/requirements-prod.txt` — pinned minimum runtime dependencies.
- `backend/Dockerfile`, `backend/.dockerignore` — slim image, non-root user, HEALTHCHECK, single uvicorn worker, `--timeout-keep-alive 30`, `--limit-concurrency 64`, proxy headers, no server header.
- `render.yaml` — Render blueprint (Docker, free plan, Singapore, health check `/ready`).
- `frontend/vercel.json`, `frontend/public/_redirects` — SPA fallback so refresh and direct routes work.
- `frontend/.env.example` — documents `VITE_API_BASE_URL`.
- `frontend/src/services/api.js` — API base from `VITE_API_BASE_URL`; request timeout raised to 60 s so a free-tier cold start does not show a false error.
- `frontend/e2e/verify-deployment.mjs` — post-deploy verification.
- `backend/tests/test_production.py` — 10 tests (docs off, strict CORS, headers, no leakage, body limit).
- `.gitignore`, `.gitattributes` — ignore venv/node_modules/dist/env files/raw data/experiments; keep `saved_models/final/` and `supported_options.json` (the old rules would have dropped the latter and pushed files above 100 MB). A trial run shows 161 files, about 29 MB.

### Health checks

`GET /health` (process alive, never touches the model) and `GET /ready` (200 only when the model is loaded; used by Render).

## 4. Protected items — unchanged

Not retrained, not replaced, no mock predictions. Verified after all Phase 9 work:

- `docs/phase7_start_manifest.sha256`: 13 files, 0 mismatches (processed data, `supported_options.json`, final model files).
- `docs/phase5_artifact_manifest.sha256`: 35 files, 0 mismatches.
- Prediction methodology, routes, airlines, classes (9 airlines, 7 cities, no First class) and the 3D design are unchanged.

## 5. Deployment instructions (remaining manual steps)

1. **Create a GitHub repository and push** (the folder is not a git repo yet). From the project root: `git init`, `git add .`, commit, add the remote, push. `.gitignore` keeps the push small.
2. **Backend on Render.** Dashboard → New → Blueprint → pick the repository (reads `render.yaml`). When asked, set `AIRFARE_CORS_ORIGINS`. The Vercel URL is not known yet; enter a placeholder and correct it in step 4. Wait for the deploy to turn healthy; note the URL `https://airfareindex-api.onrender.com` (or the one Render assigns).
3. **Frontend on Vercel.** New Project → same repository → Root Directory `frontend` (framework Vite, build `npm run build`, output `dist`). Add env `VITE_API_BASE_URL` = the Render URL, no trailing slash. Deploy; note the Vercel URL.
4. **Set CORS.** In Render, set `AIRFARE_CORS_ORIGINS` to the exact Vercel origin (e.g. `https://<project>.vercel.app`, plus any custom domain). The service redeploys.
5. **Verify** with the script in section 6, then open the site by hand.
6. **Custom domain (optional).** Add it in Vercel, then add that origin to `AIRFARE_CORS_ORIGINS`. Not purchased or configured.

## 6. Post-deploy verification

```powershell
cd frontend
node e2e/verify-deployment.mjs https://<your-frontend> https://<your-api> --browser
```

It checks: health/ready (this also wakes a sleeping instance), HTTPS, options, genuine predictions across routes and classes, determinism, validation rejects (First class, days 0/51, same city, bad duration, unknown/missing fields, malformed JSON), CORS allowed/blocked, docs not public, direct-route loads (`/`, `/predict`, `/methodology`), and with `--browser` desktop and mobile Chrome (3D canvas, prediction through the real UI, validation errors, unreachable-API error, refresh on `/methodology`, console errors). It writes `docs/09-verification-run.json` and screenshots to `docs/screenshots/phase9/`.

The current `docs/09-verification-run.json` was produced by the **local** run described below, and the next run overwrites it.

## 7. Verification actually performed (local production-style stack, not public)

Setup: API from a clean virtualenv containing only `requirements-prod.txt` and the exact file set the Docker image copies, run with `AIRFARE_ENV=production` and `AIRFARE_CORS_ORIGINS=http://localhost:4173`; frontend built and served by `vite preview` on another origin, so every call was cross-origin and subject to CORS.

Result: **40 of 40 checks passed** (run twice, the second after the body-size guard was added).

- Model loaded, `/ready` = `blend_rf_lookup`; API memory ≈ 270 MB; warm `/predict` median 44 ms.
- Genuine model fares (INR), same model as Phase 6: Delhi–Mumbai Vistara Economy ₹7,220, Business ₹31,112, Premium Economy ₹9,859; Bangalore–Kolkata Air India Business 1-stop ₹60,658; Chennai–Hyderabad IndiGo Economy ₹4,363. Repeat call returns identical fares. These are model estimates, not live airfare prices.
- Invalid inputs return 422 with a safe body (no input echo, no traceback); oversized body returns 413; unreachable API shows the friendly error in the UI.
- Docs, ReDoc and OpenAPI return 404; a foreign origin gets no CORS header; no wildcard.
- Direct loads and refresh of `/`, `/predict`, `/methodology` return the app; the unknown path also serves the SPA.
- Desktop and mobile browser runs: 3D canvas renders, no horizontal overflow, prediction through the UI succeeds (₹7,220), validation errors shown, 0 console errors. "About the Model" is the `/methodology` page.
- Test suites: backend 85 passed; frontend tests and lint passed earlier in the phase.

Not verified because no deployment exists: the real public URLs, real HTTPS, Render cold start, Vercel headers/caching, real mobile devices.

## 8. Security checks

- Secret scan of the source: no keys, tokens or credentials; `.env*` ignored except `.env.example`.
- `npm audit`: 0 vulnerabilities. `pip-audit` on `requirements-prod.txt`: no known vulnerabilities.
- CORS: exact origins only, no credentials, no wildcard (the app refuses to start in production with `*` or empty).
- Input validation: strict Pydantic schema plus supported-options cross-check; unknown fields rejected; 16 KB body cap.
- Error handling: custom error body; no stack traces or input echo (tested).
- Public surface: only `/health`, `/ready`, `/options`, `/model/info`, `/model/insights`, `/predict`; docs disabled in production.
- Container runs as non-root, allow-list `.dockerignore`.

## 9. Known limitations

- **No live deployment or public URL** (see section 1).
- The Docker image was **not built** here (no Docker engine). The same dependency and file set was run from a clean venv instead; the first Render build is the real test.
- Render free plan sleeps after about 15 minutes idle: the first request can take 30–60 s. The frontend timeout is 60 s, and `/health` can be hit first to wake it. A paid plan or a keep-alive pinger removes this.
- No per-client rate limiting (only a concurrency cap and body limit); add a gateway or a middleware if abused.
- Safari/WebKit not tested; Chrome, Edge and Firefox were covered in earlier phases.
- No custom domain. Vercel `*.vercel.app` URLs change per project name.
- Predictions are statistical estimates from the historical dataset, not live airfares; departure time is not a model input.
