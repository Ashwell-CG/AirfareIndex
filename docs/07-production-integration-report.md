# Phase 7: Production Integration Report

The React frontend now talks to a FastAPI backend that serves genuine predictions from the saved Phase 6 model. All fares are in INR. Nothing in the final workflow is mocked: unit tests use stubbed `fetch` responses as test doubles, the application never does.

## 1. Initial audit (before any change)

| Finding | Detail |
|---|---|
| Backend | `app/main.py` had only `GET /health`; `routes/`, `schemas/`, `services/` were empty packages. No model loading, no predict endpoint |
| Frontend | A Phase 1 connectivity placeholder (`App.jsx` calling `/api/health`) plus Vite template leftovers; React Router, Tailwind 4, lucide-react and a Vite `/api` proxy (prefix stripped) were already installed |
| Inference module | `ml/inference.py` (`load_final_model`, `validate`, `predict_fares`) and `saved_models/final/` were ready; `data/processed/supported_options.json` lists the supported airline/class/route combinations |
| API contract to preserve | `GET /health` returns `{"status":"ok"}`; frontend reaches the backend as `/api/*` |
| Model behaviour checked empirically | six different departure times gave identical predictions: **the final model does not use departure time** (the Random Forest was trained without it and the lookup ignores it). The UI and API say so openly. Single prediction takes about 17 ms in-process |
| Missing for the brief | typical route durations (needed because the model requires duration), model-level accuracy figures for display, explainability findings in a servable form |

## 2. Architecture

```
React (Vite build) ──/api/*──> FastAPI ──> PredictorService ──> ml.inference ──> saved_models/final/airfare_model.joblib
 browser                (Vite proxy)        (loaded once)        (validate,       (preprocessing + RF/lookup blend,
                                                                   predict_fares)   predicts INR directly)
```

Backend layout: `app/main.py` (app factory, lifespan loads the model once, CORS), `app/routes/api.py`, `app/schemas/prediction.py`, `app/services/predictor.py`, `app/errors.py`, `app/resources/{duration_hints,insights}.json`, `scripts/build_app_resources.py`. Frontend layout: `src/{layouts,pages,components,components/ui,lib,hooks,services,test}`.

## 3. Model integration

- `PredictorService.load()` runs once at startup (`ml.inference.load_final_model`, single-threaded so results are reproducible). If loading fails the API still starts and answers 503 `model_unavailable`.
- Each request is validated by Pydantic and then by the existing `ml.inference.validate` (supported airline/class/route combinations, stops, duration range per stops, `days_left` 1-50). The eight model inputs are supplied exactly as in `RAW_INPUTS`; `flight_code` is never accepted.
- One batch call predicts the requested itinerary plus the same itinerary at lead times 1, 3, 7, 14, 21, 30, 40, 50 days (the "other lead times" bars; each value is a real model run).
- Output validation: shape, finite and strictly positive; otherwise HTTP 500 `prediction_failed` and nothing is returned.
- The model, preprocessing and datasets were not modified (section 12).

## 4. API

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /health` | liveness | unchanged: `{"status":"ok"}` |
| `GET /ready` | model availability | 200 `{"status":"ready","model":"blend_rf_lookup"}` or 503 |
| `GET /options` | supported cities, stops, ranges, airline→class→routes, typical durations | drives every dropdown |
| `GET /model/info` | model description, hash, training summary, evaluation summary | |
| `GET /model/insights` | factor shares (SHAP, Random Forest), evaluation numbers, directions | numbers come from Phase 6 experiment files via `scripts/build_app_resources.py` |
| `POST /predict` | fare estimate | below |

`POST /predict` request (`extra` fields forbidden): `source`, `destination`, `airline`, `travel_class` (`Economy` / `Premium Economy` / `Business`; First is rejected), `departure_time` (`HH:MM`), `stops` (`non-stop` / `1-stop` / `2+-stop`), `duration_hours` (>0, ≤60), `days_left` (integer 1-50).

Response: `predicted_fare_inr` (integer), `currency` ("INR"), `itinerary` (echo), `departure_time_used_by_model` (false), `lead_time_profile` (8 points), `drivers` (5 plain-language factors), `typical_error` (`metric`, `value_pct` 11.4, `sd_across_draws_pct` 0.7, `draws` 10, `is_per_prediction_confidence` false, note), `model` (name, description, training data/period, evaluation), `limitations` (6 statements).

Errors share one body `{"error", "message", "fields":[{"field","message"}]}`: 422 `validation_error` (missing/invalid inputs), 422 `unsupported_itinerary` (for example Indigo Premium Economy, a route an airline does not serve, same origin and destination, duration outside the stops range), 503 `model_unavailable`, 500 `prediction_failed` / `internal_error` (no internal detail is leaked), 404/405 `http_error`.

## 5. Frontend functionality

- **Pages:** *Estimate fare* (form + results) and *About the model* (accuracy, factor bars, comparison with simpler approaches, limits), plus a not-found page. Navigation is a top bar that becomes a menu button below 640 px.
- **Form:** From → To → Airline → Travel class are dependent dropdowns built from `/options` (destinations exclude the origin; airlines are those serving the route; classes are those the airline sells on that route, auto-selected when only one exists); Stops as three large radio buttons; departure time; duration in hours and minutes, prefilled with the typical duration for the route and stops (with a "Use typical" shortcut); lead time as a number field plus slider. First class and unsupported airlines/routes/classes cannot be selected.
- **Validation:** the same rules as the backend run on the client before a request (lead time 1-50, duration range per stops, supported combination, required fields); the backend re-validates everything and its field errors are shown next to the fields.
- **States:** options loading and options error with retry; empty state before the first estimate; "Running the model…" while waiting; success; error banners for unsupported itinerary (422), model unavailable (503), prediction failure (500) and backend unreachable (with recovery on the next attempt); a notice when the form changed since the shown estimate.
- **Duplicate submissions:** the button is disabled while a request runs and a second in-flight guard ignores extra submits (tested: three clicks/Enter presses produce one POST).
- **Accessibility measures:** labelled controls, `aria-invalid`/described-by on errors, `aria-live` results region, focus moves to the result heading, skip link, 16 px+ inputs (no iOS zoom), controls at least 44 px, visible focus rings.

## 6. Result presentation and transparency

The result shows the fare in ₹ with Indian digit grouping, the itinerary (route, airline, class, departure time, stops, duration, days ahead), a note that departure time is not used, and then:
- **Accuracy:** "on flights the model had not seen in training, its typical error was about **11.4%** (median absolute percentage error, ±0.7 points across 10 evaluation draws)", followed by "**This is a model-level statistic, not a confidence score for this prediction.**"
- **Other lead times:** bars (from ₹0) of the model's estimate at 8 lead times, with the selected one highlighted.
- **What the model pays attention to:** class, airline, duration, days ahead, stops, with associations stated as associations, not causes. The days-ahead sentence uses the model's own predictions for this itinerary. No SHAP is computed per request; the About page uses the stored Phase 6 SHAP results.
- **Limits (always visible):** historical listed fares from one platform, not live or real-time; training data January-March 2023; actual market fares may differ; supported lead time 1-50 days; unseen airlines, routes and future periods not independently validated (a 2022 check over-predicted Economy fares about 1.65x); departure time not used. The app never claims live prediction, real-time prices or guaranteed accuracy.

## 7. Testing

### Backend (`pytest`): 74 passed
1 health, 7 Phase 4, 14 Phase 6, **52 new API tests** against the real saved model: model loaded once, `/ready`, options contract (no First class), prediction equals a direct `predict_fares` call, 8-point profile consistent with the main fare, typical-error and limitation text, determinism, departure time ignored (and lead time/class change the estimate), all 8 missing-input cases, 16 invalid-input cases (bad time, `days_left` 0/51/2.5, bad stops, First class, extra fields incl. `flight_code`, negative/zero/non-numeric/over-range duration, empty city), malformed JSON, 7 unsupported combinations plus a real route an airline does not serve, **every one of the 379 supported airline/class/route combinations returns a valid prediction**, six broken-model cases (NaN, negative, zero, infinite, wrong shape, exception) that must return 500 without leaking detail, model-unavailable 503s with `/health` still up, unexpected-exception handler, 404 body, model hash unchanged, CORS.

### Frontend (`vitest` + Testing Library): 54 passed
lib helpers and validation (21), API client error mapping incl. timeout/abort/non-JSON (7), form dependent dropdowns, validation, payload and duplicate-submit guard (14), page flows with a stubbed backend: options loading and failure/retry, submission payload, fare rendering, transparency text, loading and duplicate prevention, 422/503/500 and network failure with recovery, repeated predictions and the stale notice, navigation, 404, mobile menu (12). A deliberate mutation of a validation rule was caught by the tests and reverted. Options in the tests come from the real backend files.

### Build and lint
`npm run build` succeeds: JS 296.7 kB (93.8 kB gzip), CSS 26.8 kB (6.0 kB gzip). `npm run lint` (oxlint): no warnings.

### End-to-end (real stack: browser → Vite preview `:4173` → `/api` proxy → FastAPI `:8000` → saved model)
- Built-in browser: Delhi→Mumbai Vistara Economy, non-stop, 2h 15m, 14 days → page showed **₹7,220**, identical to a direct model call; Air India Business Bangalore→Kolkata, 1 stop, 7h 30m, 21 days → page **₹60,658**, direct model call 60,658.05. Console: no messages; network: all 200/304.
- `e2e/crossbrowser.mjs` in installed browsers (below): the displayed fare equals a direct `/api/predict` call in every browser and viewport.
- Live API latency (50 sequential POSTs through the proxy): median 19.9 ms, p95 24.6 ms, max 71.6 ms.

## 8. Cross-device verification

Method: the built-in browser (Chromium) was resized to each viewport and a scripted audit ran six UI states per viewport (empty form, validation errors, result, backend-unreachable error, About page, and the mobile menu below 640 px). It measures horizontal overflow, elements beyond the viewport, clipped text, interactive targets under 44 px and the smallest font. Widths under 768 px also emulated a touch Android phone (touch points 5); 768 px and above were not touch-emulated.

| Viewport | Layout | Overflow | Clipped | Targets < 44 px | Min font | Result |
|---|---|---|---|---|---|---|
| 320 × 568 | 1 column, menu button | none | none | none | 12 px (fine print), 14 px body | pass |
| 375 × 812 | 1 column | none | none | none | 12/14 px | pass |
| 430 × 932 | 1 column | none | none | none | 12/14 px | pass |
| 768 × 1024 | 1 column, inline nav | none | none | none | 12/14 px | pass |
| 1366 × 768 | 2 columns (form + results, form sticky) | none | none | none | 12/14 px | pass |
| 1920 × 1080 | 2 columns, content max 1600 px | none | none | none | 12/14 px | pass |
| 2560 × 1440 | 2 columns, centred 1600 px | none | none | none | 12/14 px | pass |

Issues found and fixed during this testing: (1) the logo link was 36 px tall (now 44 px); (2) factor labels on the About page were truncated at 320 px (labels now wrap and the label column is wider); (3) ISO dates in the limitation text were replaced by "16 Jan 2023 to 6 Mar 2023". A second audit at 320 px after the fixes showed none of these.

Responsive design: mobile-first single column; the two-column field pairs start at 480 px; the form and results become side by side at 1024 px; the content column is capped at 1600 px for large and ultrawide screens; dropdowns are native selects (good touch behaviour); inputs and buttons are at least 44 px high (48 px for form controls); the lead-time and factor charts are CSS bars that scale to any width, so no chart or table needs horizontal scrolling. Portrait and landscape were covered by the 768 × 1024 and 1366 × 768 sizes; a phone in landscape (for example 812 × 375) was not separately tested.

## 9. Browser compatibility

| Browser | Version | How tested | Result |
|---|---|---|---|
| Google Chrome | 158.0.8127.38 | `e2e/crossbrowser.mjs`: fill, submit, compare fare with direct API, overflow, console errors, About page, at 375×812 (mobile emulation), 768×1024, 1366×768 | pass at all three; no console errors |
| Microsoft Edge | 158.0.4370.33 | same script, attached to a dedicated Edge instance (a normal launch hands off to the already-running Edge) | pass at all three |
| Mozilla Firefox | 160.0 | same script via WebDriver BiDi (viewport only, no touch emulation) | pass at all three; no console errors |
| Chromium in the app's built-in browser | n/a | the 7-viewport audit above, console and network checks | pass |
| **Safari / iOS Safari** | not tested | no Apple device or Safari is available on this Windows machine | **unverified** |

The code avoids known iOS Safari pitfalls by design (16 px inputs, `min-h-dvh`, text-size-adjust, native selects and time input), but that is not a test.

## 10. Screenshots (`docs/screenshots/`)

`{chrome,edge,firefox}-mobile-375x812-result.png` (full page), `-mobile-375x812-validation.png`, `-tablet-768x1024-result.png`, `-laptop-1366x768-result.png`. Raw results: `docs/07-crossbrowser-results.json`. The 2560 × 1440 and 1920 × 1080 sizes were verified by the programmatic audit only (no screenshot saved).

## 11. Known limitations

- Safari and iOS Safari untested; tablet touch behaviour not emulated (target sizes measured instead); no screen-reader or automated accessibility (axe) audit was run; phone landscape not separately tested.
- Departure time is collected but has no effect on the estimate (disclosed in the UI and API).
- Typical durations are medians over all airlines and classes for the route and stops; for one-stop and two-stop itineraries the user's real duration can differ widely.
- Estimates are integers in rupees; the profile bars are separate model runs, not forecasts.
- Model limits carry over from Phase 6: typical error about 11-12% on unseen flights, large Business errors, Jan-Mar 2023 price regime only, rare airlines (StarAir, AllianceAir, Akasa) rest on little data.
- Development/preview servers only: no authentication, rate limiting, HTTPS or deployment configuration; CORS defaults to localhost origins (`AIRFARE_CORS_ORIGINS`).
- Unused Phase 1 dependencies (plotly, react-plotly, framer-motion) remain installed; `puppeteer-core`, `vitest`, Testing Library and jsdom were added as dev dependencies (no browser downloads).
- Prediction history, analytics and flight-explorer modules from the original blueprint were out of scope.

## 12. Model and data integrity

Verified after all work: the Phase 7 start manifest (final model, candidate models, processed data, frozen tuning, 13 files) 13 of 13 match; the Phase 5 manifest 35 of 35 match; raw Dataset E hashes match; `airfare_model.joblib` hash equals the metadata hash (also asserted by an API test). The model was not retrained or modified, and no dataset was changed. New files are only code, tests, two small resource JSON files (`backend/app/resources/`) and documentation.

## 13. How to run

```powershell
# terminal 1, from backend/
.\.venv\Scripts\python -m uvicorn app.main:app --port 8000
# terminal 2, from frontend/
npm install
npm run build
npm run preview        # http://localhost:4173  (or: npm run dev -> http://localhost:5173)
```
Tests: `python -m pytest` (backend), `npm run test:run` and `npm run lint` (frontend), `node e2e/crossbrowser.mjs` with both servers running. API docs at http://127.0.0.1:8000/docs.

## 14. Recommendations for the next phase

1. The dedicated visual redesign, keeping the component and API structure.
2. Real-device and Safari testing (BrowserStack or devices) and an accessibility audit (axe plus a screen reader).
3. Deployment: container images, HTTPS, a static-hosting setup with a real reverse proxy, rate limiting, request logging.
4. The two-mode predictor idea from Phase 6 (known itineraries vs new ones), if known-flight accuracy matters.
5. Remaining blueprint modules as separate scoped work: prediction history, analytics pages, flight explorer.
6. Add this phase's browser script to CI, and remove unused dependencies during the redesign.
