# Phase 6: Final Model Selection, Preparation and Benchmark

Code: `backend/ml/p6_select.py`, `p6_train.py`, `p6_benchmark.py`, `p6_bench_worker.py`, `inference.py`. Results: `experiments/phase6/final_selection.json`, `benchmark/benchmark_repeated.json`. All fares in INR.

## 1. Decision rule (written into `p6_select.py` before the results were read)

1. **Eligible:** trained models and trained blends. The route lookup and the Phase 5 configurations are reference rows, not eligible.
2. Rank by **mean unseen-flight MAE** over the 10 seeds (recipe chosen by the pre-set rule: TV). Candidates **tied** with the best: mean paired MAE difference to the best of at most max(2 x SE of the paired differences, 1% of the best mean MAE).
3. Among tied candidates, lowest weighted rank sum over: seed stability (SD of MAE) weight 6; MAE and median APE (average rank) 5; Dataset A MAE and median APE 4; single-row p95 latency 3; file size 2; explainability 1 (Ridge 3 > single tree model with SHAP 2 > blend 1). This follows your priority order: unseen-flight performance, stability, MAE and median APE, external check, speed, size, explainability.

## 2. Evidence

| Candidate | Unseen MAE (10 seeds) | SD | Median APE % | Dataset A MAE / median APE % | p95 latency (ms, 1 thread, repeated) | Size |
|---|---|---|---|---|---|---|
| RF + lookup blend | **3,154** | 185 | 11.4 | 4,478 / 35.3 | 25.7 | 26.6 MB |
| Random Forest (tuned) | 3,181 | 193 | 11.8 | 4,539 / 35.8 | 13.8 | 26.6 MB |
| RF + XGBoost blend | 3,221 | 207 | 12.2 | 4,484 / 36.7 | n/a (not in repeated set) | 26.8 MB |
| XGBoost + lookup blend | 3,227 | 196 | 11.7 | 4,467 / 35.1 | n/a | 0.2 MB |
| RF + Ridge blend | 3,228 | 192 | 12.3 | 4,584 / 36.5 | n/a | 26.6 MB |
| XGBoost (tuned) | 3,409 | 225 | 13.4 | 4,537 / 37.5 | 8.0 | 0.15 MB |
| Ridge | 3,843 | 233 | 16.6 | 5,180 / 38.4 | 7.4 | 0.0 MB |
| *Reference: route lookup* | 3,225 | 185 | 11.7 | 4,663 / 33.8 | 3.2 | 0.01 MB |
| *Reference: Phase 5 RF config* | 3,636 | 289 | 12.2 | 4,626 / 35.2 | 11.8 | 146.7 MB |

**Tie analysis.** The best by unseen MAE is the RF + lookup blend. The tuned Random Forest is 27 behind (paired SE 4.9; threshold 31.5), so it is tied; no other eligible candidate is (RF+XGBoost +68, XGBoost+lookup +73, RF+Ridge +74, XGBoost +255, Ridge +689 behind). Tied set: {RF + lookup blend, Random Forest}.

**Tie-break.** The blend ranks first on stability, MAE/median APE and Dataset A; the Random Forest ranks first on latency, size and explainability. Weighted rank sums: **blend 27, Random Forest 36.** The latency used by the rule came from the first benchmark run; the repeated benchmark (section 4) gives the same ordering.

## 3. Selection

**Final model: Random Forest + route-lookup blend** (`blend_rf_lookup`): 0.75 x tuned Random Forest + 0.25 x lookup, averaged in log1p space. Random Forest: 150 trees, `min_samples_leaf` 20, `max_depth` 32, `max_features` 0.2, `max_samples` 0.5, no departure-minute input, itinerary sample weights. Lookup: training median fare by airline + route + class + stops with coarser fallbacks.

Honest strength of the choice:
- It has the lowest unseen-flight MAE (3,154 +/- 185) and was better than the tuned Random Forest in all 10 seeds, but by only 0.9% (27 INR). It beats the route lookup in 9 of 10 seeds by 2.2% (71 INR, SE 16) and the Phase 5 Random Forest configuration by 13% (10 of 10).
- Its median APE (11.4%) equals the lookup's (11.7%) within noise; the Dataset A check cannot separate any of the candidates.
- It is the more complex and less explainable option. **The tuned Random Forest alone is a defensible alternative** (a tied candidate, simpler, about 12 ms lower p95 latency, directly explainable with the SHAP results in `06-model-explainability.md`) and is saved in `saved_models/phase6_candidates/rf_tuned.joblib`. The rule, not a judgement that the blend is clearly better, selected the blend.
- **The choice trades seen-flight accuracy for robustness:** on flights seen in training on other dates, the final model has MAE 2,849 and median APE 9.9%, versus 1,839 and 4.9% for the Phase 5-style Random Forest (see `06-generalisation-study.md`).

## 4. Benchmark (repeated 3 times, separate fresh processes per model, interleaved order, one thread unless stated, 12-core machine, Python 3.14)

Single request = a one-row DataFrame including all preprocessing; 2,000 timed calls after 100 warm-up calls per run; values are medians over the 3 runs.

| Model | Size on disk | RAM after load | Peak RAM, 100k-row batch | 1-row mean / median / p95 / p99 (ms) | Rows/s, 1k / 10k / 100k (1 thread) | Rows/s, 100k, all cores |
|---|---|---|---|---|---|---|
| Route lookup | 0.01 MB | 0.3 MB | 77 MB | 2.40 / 2.24 / 3.20 / 4.40 | 329k / 975k / 1.11M | 1.12M |
| Ridge | 0.00 MB | 0.5 MB | 173 MB | 6.08 / 5.90 / 7.42 / 10.20 | 127k / 391k / 460k | 473k |
| Random Forest (tuned) | 26.63 MB | 83.9 MB | 166 MB | 11.48 / 11.05 / 13.80 / 21.93 | 25.8k / 50.8k / 57.5k | 268k |
| XGBoost (tuned) | 0.15 MB | 127.7 MB* | 206 MB | 6.44 / 6.13 / 7.98 / 9.82 | 107k / 351k / 447k | 621k |
| Random Forest, Phase 5 config | 146.74 MB | 467.9 MB | 929 MB | 9.83 / 9.59 / 11.80 / 15.25 | 19.4k / 40.1k / 49.3k | 177k |
| XGBoost, Phase 5 config | 6.83 MB | 157.1 MB* | 239 MB | 7.04 / 6.77 / 9.05 / 12.46 | 34.3k / 56.8k / 58.6k | 215k |
| **Final model (RF + lookup blend)** | **26.64 MB** | **86.5 MB** | **171 MB** | **16.70 / 15.22 / 25.69 / 33.45** | **24.4k / 48.4k / 56.1k** | **200k** |

*includes loading the XGBoost native library. Single-request latency is dominated by pandas/scikit-learn preprocessing, not tree evaluation (even Ridge takes about 6 ms, the lookup 2.2 ms), so every candidate is well under 50 ms per request on this machine; times will differ elsewhere. The tuned Random Forest is 5.5x smaller on disk and about 5.6x smaller in memory than the Phase 5 configuration. All predictions in the 100,000-row batches were finite and positive.

## 5. Final model preparation

- **Configuration frozen** in `experiments/phase6/tuning/frozen_candidates.json` (SHA-256 `8ce0e37aac62...`) before any evaluation.
- **Training data:** Dataset E **train + validation date blocks, 355,256 rows**, journey dates 2023-01-16 to 2023-03-06, `days_left` 1-50, Economy / Premium Economy / Business, all 1,404 flight codes in those blocks (used for nothing but counting; `flight_code` is not an input). **Never used:** test date blocks, First class, Dataset A. Fit time 5.8 s.
- **Train+validation decision (your instruction: refit only after the configuration is established).** The configuration was established on DEV flights first. Refitting on validation blocks too is supported by: (1) no measurable accuracy effect in either direction (all finalists within +/-0.4% MAE between recipes; `06-robust-evaluation.md`); (2) it adds the lead-time ranges 11-15 and 31-35 days that would otherwise be absent from training; (3) it is the same recipe the 10-seed evaluation used for the selected model.
- **Artifact:** `backend/saved_models/final/airfare_model.joblib` (26.6 MB, joblib, compress 3, SHA-256 `12b0279375f3b4a8e93863697ed09fbe55b1597b00c3dbfe49ac6407a2bc2964`) holds preprocessing and models together; `final_model_metadata.json` holds the feature specification, frozen configuration, training summary, hashes, selection record, evaluation summary and limitations. Candidates are in `saved_models/phase6_candidates/`. Phase 5 artifacts were not modified.
- **Prediction contract** (`ml/inference.py`): `predict_fares(model, records)` takes the 8 inputs (airline, travel_class, source, destination, stops, duration_hours, days_left, dep_minutes), validates them against `supported_options.json` (only supported airline/class/route combinations, `days_left` 1-50, stops and duration ranges, no `flight_code`), and returns positive INR fares. `load_final_model()` limits prediction to one thread, which makes predictions bit-for-bit reproducible (multi-threaded forests differ by about 1e-10 INR) and avoids thread-pool start-up for single requests.

## 6. Verification performed (all executed; results in `docs/06-verification.json` and below)

| Check | Result |
|---|---|
| Final model loads in a fresh process, 5,000 rows | all predictions finite and positive; identical across two loads |
| Two separate processes, same rows | identical predictions |
| File hash equals the hash in the metadata | yes |
| Retrained final model vs assembling the saved candidate artifacts (Random Forest + lookup, same weights), 89,966 test-block rows | bit-identical (max difference 0.0) |
| Every supported airline/class/route x stops x duration (min, mid, max) x days_left (1, 25, 50) x departure (0, 720, 1439) combination, 30,699 rows | all predictions finite and positive, range 2,030 to 71,906 |
| Dataset E test date blocks, 89,966 rows | all predictions finite and positive |
| Existing FastAPI backend | `app.main` imports in the same process as the model, `/health` returns ok through TestClient; no API routes were added or changed |
| Test suite | `pytest`: 22 passed (1 health, 7 Phase 4, 14 Phase 6: pools, grouped splits, 10-seed non-leakage, flight_code guard, Dataset A not referenced by training code, frozen-before-results, input validation, final model loading) |
| Phase 5 artifacts | all 35 files match the checksum manifest recorded at the start of Phase 6 |
| Raw Dataset E | both files match their recorded SHA-256 values |
| Held-out flight codes never in training | re-derived for 10 seeds x 2 recipes, 0 violations |
