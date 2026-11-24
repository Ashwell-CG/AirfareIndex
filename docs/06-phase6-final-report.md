# Phase 6 Final Report

Goal: improve generalisation on unseen flights and select the most reliable model for AirfareIndex. All fares in INR. Detailed reports: `06-phase6-initial-audit.md`, `06-hyperparameter-optimisation.md`, `06-generalisation-study.md`, `06-robust-evaluation.md`, `06-external-validation.md`, `06-model-explainability.md`, `06-final-model-selection.md`.

## 1. Stages completed

| Stage | Done | Key output |
|---|---|---|
| Initial audit | yes | Phase 5 search hit its grid edges; its unseen-flight validation shared 99.98% of flight codes with training (tuning rewarded memorisation); a route-level lookup matched the Random Forest on unseen flights; Dataset A usable only as a shift check |
| Hyperparameter optimisation | yes, 2 rounds | DEV-pool flight-grouped validation; 61 Random Forest and 101 XGBoost configurations in the final round; Ridge grid widened after it hit its edge |
| Generalisation study | yes | regularisation, dropping the departure minute, itinerary weights, blends |
| 10-seed unseen-flight evaluation | yes | 10 seeds x 2 training recipes, held-out codes never in training |
| Dataset A shift check | yes | 299,137 rows; no training, tuning or recalibration |
| SHAP | yes | XGBoost (3,000 rows) and Random Forest (1,500 rows), local cases, Ridge cross-check |
| Final selection, preparation, benchmark | yes | RF + lookup blend, trained on train+validation date blocks, benchmarked 3 times |
| Tests and verification | yes | 22 tests pass; verification suite in `06-verification.json` |

Nothing was skipped. Problems met and handled: (1) the Ridge baseline selected its grid maximum, so the grid was widened and Stage A re-run before any evaluation (earlier outputs kept in `tuning_round1/` and `tuning_round2_ridge_capped/`); (2) a Phase 5 reference XGBoost configuration clashed with early stopping in a smoke test and was fixed to be fitted exactly as in Phase 5; (3) the first benchmark run was noisy (Random Forest single-row median 10.9 ms vs 24.3 ms between two runs), so it was repeated three times in quiet conditions and medians are reported; (4) a determinism test failed because multi-threaded forest prediction differs by about 1e-10 INR, so `load_final_model` now defaults to one thread (bit-identical results); (5) a statement about the class effect in my draft explainability report was corrected against the grouped SHAP values.

## 2. Experiments and results

- **Tuning (DEV validation MAE, mean of two partitions):** tuned Random Forest 4,334, tuned XGBoost 4,358, Ridge 4,777, route lookup 4,469, Phase 5 Random Forest config 4,676, Phase 5 XGBoost config 4,718. Blend candidates: XGBoost+lookup 4,199, RF+XGBoost 4,256, RF+lookup 4,278, RF+Ridge 4,342.
- **Multi-seed unseen-flight (10 seeds, train+validation recipe), mean +/- SD:**

| Model | MAE | RMSE | R^2 | Median APE |
|---|---|---|---|---|
| **RF + lookup blend (final)** | **3,154 +/- 185** | 5,742 +/- 380 | 0.918 +/- 0.006 | 11.4% +/- 0.7 |
| Random Forest (tuned) | 3,181 +/- 193 | 5,768 | 0.917 | 11.8% |
| Route lookup | 3,225 +/- 185 | 6,071 | 0.908 | 11.7% |
| XGBoost (tuned) | 3,409 +/- 225 | 5,984 | 0.911 | 13.4% |
| Random Forest, Phase 5 config | 3,636 +/- 289 | 6,765 | 0.886 | 12.2% |
| Ridge | 3,843 +/- 233 | 6,397 | 0.898 | 16.6% |

Tuning improved the Random Forest by 12.5% over its Phase 5 configuration (better in 10 of 10 seeds). The final blend beats the route lookup by 2.2% in MAE (9 of 10 seeds) and has equal median APE; within-class R^2 is only 0.38-0.56. Per-class MAE of the final model: Economy 1,563, Premium Economy 2,161, Business 6,759. Training recipe made no measurable difference (within +/-0.4%).

## 3. Final model

**Random Forest + route-lookup blend (0.75 / 0.25 in log space)**, chosen by the pre-registered rule in `p6_select.py`. It had the lowest unseen-flight MAE and was tied with the tuned Random Forest (27 INR, 0.9% apart, better in all 10 seeds); the tie-break (stability, MAE/median APE, Dataset A, latency, size, explainability) favoured the blend 27 to 36. **The margin is small; the tuned Random Forest alone is a defensible simpler alternative**, saved as a candidate. Configuration, training data, hashes and limits are in `saved_models/final/final_model_metadata.json`.

Important trade-off: on flights seen in training on other dates the final model has MAE 2,849 (median APE 9.9%), compared with 1,839 (4.9%) for the Phase 5-style Random Forest, which does much worse on unseen flights.

## 4. Dataset A findings

Same platform, one year earlier. All models over-predict 2022 Economy fares by about 1.65x (A's Economy median 5,772 vs 9,494 in E), giving negative within-Economy R^2; Business is predicted well (final model median APE 8.5%, bias -879). Overall MAE 4,478, median APE 35.3%, R^2 0.93 (class separation inflates R^2). The check does not separate the candidates and shows the model is calibrated to the Jan-Mar 2023 price level.

## 5. SHAP

Pooled importance is dominated by class (mean |SHAP| 0.53-0.59), then airline, duration, days_left (0.05-0.11 each). Within Economy: airline, duration, days_left; within Business: duration, airline, days_left. Direction: more lead time lowers fares, non-stop lowers and 2+ stops raises, very short durations lower, Vistara raises, Indigo and AirAsia lower. These describe the fitted models, not causes; inputs are correlated and `days_left` equals the journey date in this data.

## 6. Benchmarks (median of 3 repeated runs)

Final model: 26.6 MB on disk, 86.5 MB RAM after load, 171 MB peak on a 100,000-row batch; single request (1 thread) median 15.2 ms, mean 16.7 ms, p95 25.7 ms, p99 33.5 ms; batch throughput 24k rows/s at 1,000 rows, 56k rows/s at 100,000 (1 thread), 200k rows/s with all 12 cores. The tuned Random Forest alone: 11.1 ms median, 13.8 ms p95, 57k rows/s. Full table in `06-final-model-selection.md`.

## 7. Saved model and API compatibility

`backend/saved_models/final/airfare_model.joblib` (SHA-256 `12b0279375f3...2964`) contains preprocessing and both models. `ml/inference.py` loads it, validates inputs against supported airline/class/route combinations and returns positive INR fares. In a fresh process it loads, predicts finite positive fares, matches across two processes bit-for-bit, and coexists with `app.main` (`/health` ok). No routes were added or changed.

## 8. Tests and verification (all run)

`pytest`: 22 passed. `ml/p6_verify.py` (`06-verification.json`): Phase 5 artifacts, all 35 files match the checksum manifest taken at the start of Phase 6; raw Dataset E hashes match; frozen configuration written before the multi-seed results and used by them; held-out flight codes never in training for 10 seeds x 2 recipes (0 violations); final model reproducibility and finite-positive checks (30,699 supported-input rows, 89,966 test-block rows, 100,000 benchmark rows). Dataset A raw files were only read (no hash manifest existed for them).

## 9. Limitations

- **Accuracy on unseen flights is modest:** typical error about 11-12% (median APE), MAE about 3,150, with large Business errors; the model barely beats a route-level lookup, so the eight inputs carry limited flight-specific information.
- **Robustness costs seen-flight accuracy** (above).
- **Price-level shift:** valid for the Jan-Mar 2023 regime only; fares in other periods will be mis-estimated (Dataset A shows about 1.65x over-prediction for Economy).
- One platform, one 7-week window, listed (not transacted) fares; `days_left` and calendar effects are confounded; `days_left` must be 1-50.
- Only flight codes were held out: unseen airlines, routes and periods were not tested. Seeds overlap in which codes are held out.
- Selection between the top two candidates rests on a small margin and a rank-based tie-break (ranks ignore the size of differences). Gradient Boosting was not re-tuned in Phase 6.
- The benchmarks come from one machine (Python 3.14, 12 cores) with fresh single-process workers; latency includes pandas/scikit-learn preprocessing and will vary elsewhere.

## 10. Recommendations for Phase 7

1. Use the final model through `ml.inference` (validate, predict) and show model-level typical error (median APE about 11%, from the 10-seed evaluation) rather than a per-prediction confidence percentage.
2. Show the training period and warn when a prediction relies on `days_left` outside 1-50; do not present predictions as valid for other periods.
3. Consider a two-mode predictor: when the exact itinerary occurred in the training data, use a high-capacity model or lookup (median APE about 5%); otherwise use the final model. Not built or tested here.
4. If simplicity matters more than the 0.9% accuracy gain, serve the tuned Random Forest alone (about 12 ms lower p95 latency, directly explainable).
5. Display SHAP-style factors only as descriptions of model behaviour, with the limits above.
6. Keep Dataset A out of any training; if period coverage matters, collect more recent fares from the same source and re-run this protocol.

## 11. Files created or changed in Phase 6

Code: `backend/ml/p6_common.py`, `p6_tune.py`, `p6_eval.py`, `p6_train.py`, `p6_external.py`, `p6_explain.py`, `p6_select.py`, `p6_benchmark.py`, `p6_bench_worker.py`, `p6_seen_benchmark.py`, `p6_figures.py`, `p6_verify.py`, `phase6_audit.py`, `inference.py`; `backend/tests/test_phase6.py`; `backend/requirements.txt` (psutil). Outputs: `backend/experiments/phase6/` (tuning, multiseed, external, explain, benchmark, seen_flight, logs), `backend/saved_models/final/`, `backend/saved_models/phase6_candidates/`. Docs: the eight `06-*.md` reports, `06-audit-stats.json`, `06-verification.json`, `phase5_artifact_manifest.sha256`, figures `p6_*.png`. Phase 5 artifacts, raw data and cleaned data were not modified. Nothing is committed to git.
