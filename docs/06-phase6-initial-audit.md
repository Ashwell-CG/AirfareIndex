# Phase 6 Initial Audit and Proposed Experiment Plan

Status at the time of writing: **audit complete; no new model had been trained.** (The plan below was approved and executed; see `06-phase6-final-report.md`.) Everything here is read from existing Phase 5 outputs and raw files by `backend/ml/phase6_audit.py` (results in `docs/06-audit-stats.json`). Phase 5 test results are used only as historical benchmarks for diagnosis; nothing in this audit selects a model or hyperparameter. A checksum manifest of all 35 Phase 5 artifact files (`docs/phase5_artifact_manifest.sha256`) was recorded and verified, so Phase 5 can later be shown to be unchanged.

## 1. Phase 5 recap (benchmarks)

Random Forest on log fare was the Phase 5 winner. Test MAE: primary 1,868, unseen flights 3,579, stress 1,803 (INR). On the same 18,235 rows, tree models trained without seeing those flights were 1.4-2.1x worse than tree models that had seen them; Ridge was unchanged.

## 2. Hyperparameters at search boundaries

| Model | Selected value at the edge of its grid (same in all three splits unless noted) |
|---|---|
| Random Forest | `min_samples_leaf` = 5 (lowest allowed), `max_depth` = None (no limit; highest option). Only `max_features` = 0.7 was interior |
| XGBoost | `max_depth` = 10 (highest), `min_child_weight` = 20 (highest). Interior: learning rate 0.06, 600 trees, subsample 0.9, colsample 0.8 |
| Gradient Boosting | 5 of 5 at an edge: depth 6, learning rate 0.1, 300 trees, subsample 1.0 (all highest), leaf 10 (lowest) |
| Decision Tree | `max_depth` = None |
| Ridge | stress split alpha = 0.01 (lowest); primary 10 and unseen 1.0 interior |

Marginal means over the few searched configurations point the same way: Random Forest preferred smaller leaves (5: 3,237 vs 20: 3,490 mean MAE on primary) and XGBoost preferred deeper trees and a lower learning rate (depth 10: 3,054 vs depth 4: 3,507; learning rate 0.03: 3,078). With only 8 (Random Forest) and 12 (XGBoost) configurations these marginals are rough, but all point to "more capacity".

## 3. Why the unseen-flight split was tuned toward memorisation

This is the main finding of the audit. In Phase 5, hyperparameters for the unseen-flight split were chosen on that split's validation set, but **that validation set shares 99.98% of its flight codes (and 99.1% of its itineraries) with its training set** (`04-splits.json`). Only the *test* set had unseen flights. So tuning rewarded capacity to recognise known flights (deep trees, tiny leaves). Evidence: the Random Forest's validation MAE on that split was 2,803, but 3,579 on unseen test flights (+28%). The "unseen-flight" configurations were therefore not tuned for unseen flights at all. Fixing this is the core of the Phase 6 plan.

## 4. Weaknesses on unseen flights (diagnosis from the Phase 5 benchmark, no refits)

- **A route-level lookup is as good as the Random Forest.** Predicting each unseen-flight test row with the *training* median fare of the same airline + route + class + stops gives MAE 3,290 and median APE 12.2%, versus the Random Forest's 3,579 and 12.4%. A coarser lookup without route (airline + class + stops) gives 4,472 and 19.5%. So on unseen flights the Random Forest adds little beyond route-level information, and its flight-level detail (departure minute, exact duration) is not generalising. Any new model has to beat this lookup, not just the Phase 5 winner.
- **Where errors are large.** Connecting Business flights dominate: 1-stop Business has MAE 7,960 on 4,854 rows (27% of the test set); 1-stop Economy has MAPE 23.8% against 8.6% for non-stop Economy.
- **No clean sibling effect.** Error does not fall steadily as the number of training rows for the same airline/route/class rises (MAE 4,674 in the 200-500 bucket vs 3,615 above 1,000), so "not enough route data" is not a simple explanation.
- **Caveat.** The unseen-flight test set is small (18,235 rows, 264 codes) and reused as a benchmark, so these diagnoses are indicative.

## 5. Dataset A: can it be used for external validation?

Findings (raw `economy.csv` + `business.csv`, which contain the date, exact times, duration text, stops text and price needed to build E's 8 inputs):

- **Mappable:** 300,261 rows; Economy and Business; 6 cities (all in E); `days_left` 1-49 (within E's 1-50) using the date minus 2022-02-10 relation verified in Phase 2. Fares are INR.
- **Exclusions to document:** 4 rows with malformed durations (such as "1.03h m"), 41 Trujet rows (airline not in E), 1,085 rows in total outside E's supported airline/class/route combinations, about 35 exact duplicate rows, and a few durations above E's range (A's maximum 49.8 h vs E's 43.6 h).
- **Not independent in two ways.** Same platform (EaseMyTrip), and 80.5% of A's rows have a flight code that also occurs in E (14.3% an exact itinerary). So A cannot test unseen platforms; it tests a *different year*.
- **Large price-level shift.** Economy median 5,772 (A, 2022) vs 9,494 (E, 2023); Business 53,164 vs 50,409. On 32,307 matched itinerary + days_left pairs, A/E fare ratio has median 0.83 (10th to 90th percentile 0.45 to 1.20). Absolute errors on A will therefore mix model error with year-to-year level shift.

Conclusion: usable as an **external temporal/market-shift check** (no tuning, no recalibration, no merging), not as an independent-platform validation. Results must be reported with that wording.

## 6. Proposed experiment plan (needs your approval before anything expensive runs)

### 6.1 New tuning and evaluation protocol (fixes section 3)

- **Flight-code pools.** Split the 1,405 flight codes (stratified by airline, fixed seed) into a **DEV pool (50%)** and an **EVAL pool (50%)**. All tuning uses DEV-pool flights only; no EVAL-pool flight label ever influences a hyperparameter.
- **Flight-grouped validation inside DEV.** Train on train-date-block rows of some DEV codes, validate on validation-date-block rows of *other* DEV codes (two different code partitions for stability). This keeps date and flight separation and finally rewards generalisation to unseen flights.
- **Multi-seed unseen-flight evaluation (5 seeds; 10 if time allows).** For each seed, draw ~20% of codes per airline from the EVAL pool as test codes; train on every other code (DEV plus remaining EVAL) with the frozen configuration; test on test-date-block rows of the held-out codes. By construction held-out codes never appear in training. Report mean and standard deviation of MAE, RMSE, R², MAPE, median APE, with per-class results. Seeds overlap partially in which codes are held out, which I will state.
- Phase 5 numbers stay as historical benchmarks in the tables.

### 6.2 What will be tuned and tried (Random Forest and XGBoost on log fare; Ridge as baseline)

| Area | Settings |
|---|---|
| Random Forest (about 30 random configs) | min_samples_leaf {5, 10, 20, 40, 80}, max_depth {12, 16, 24, None}, max_features {0.2, 0.33, 0.5, 0.7, 1.0}, max_samples {0.3, 0.5, 0.8, 1.0}, 150 trees |
| XGBoost (about 50 random configs) | max_depth {3, 4, 6, 8, 10}, min_child_weight {1, 5, 20, 50, 100}, reg_lambda {1, 10, 50}, reg_alpha {0, 1, 10}, gamma {0, 1, 5}, subsample/colsample {0.5, 0.7, 0.9}, early stopping on DEV validation (tuning only) |
| Ridge | alpha over 1e-3 to 1e3 (11 values) |
| Feature representations (controlled, same config) | drop `dep_minutes`; coarse departure window instead of exact minute; duration rounded to 0.5 h; both combined. Purpose: reduce re-identifying an itinerary |
| Sample weighting | down-weight heavily repeated itineraries (1/sqrt(n) and 1/n) so memorising common flights counts less |
| Additional candidates | Ridge + Random Forest blend; Random Forest + XGBoost blend; the **route-level lookup as a reference baseline** |

Not planned: target encoding of route/airline (leakage risk without out-of-fold handling and little expected gain), any use of `flight_code`.

### 6.3 Remaining stages

1. **External check on Dataset A** with the frozen finalists: INR metrics overall and per class, split by whether the itinerary/flight code is also in E, plus bias and level-shift diagnostics; no tuning on A.
2. **SHAP** (TreeExplainer in log-fare space on about 3,000 sampled rows) for the top tree candidates: importance grouped back to original features, summary plot, dependence plots (days_left, duration, stops, route reference, departure time), local explanations for 4 representative fares, plus Ridge coefficients as a cross-check.
3. **Final selection** using your priority order: unseen-flight performance, multi-seed stability, MAE and median APE, external check, latency, size, explainability. I will state the decision rule before looking at results. If no trained model beats the route-level lookup on unseen flights, I will say so and decide on the remaining criteria.
4. **Final model**: freeze the configuration; train with permitted data only (never the test date blocks); save preprocessing and model together plus metadata; confirm it loads in a fresh process, gives finite positive INR predictions, and works with the existing FastAPI backend without API changes.
5. **Benchmark** all finalists under identical conditions: file size, memory, single-row latency (mean, median, 95th percentile), batch throughput.
6. **Tests and the 8 reports** requested.

### 6.4 Estimated compute

About 30-40 min for tuning (two code partitions), 30-60 min for 5 seeds with two training recipes, 15 min SHAP, 15 min external and benchmarks, 5 min final fit: roughly **2-2.5 hours** on this machine, run in the background in stages with logs. I would stop after the tuning stage to check it actually improved unseen-flight error before spending the multi-seed time.

### 6.5 Decisions I need from you

1. **Protocol:** approve the DEV/EVAL flight-code pool design and 5 seeds (10 optional).
2. **Candidates:** approve feature-representation variants, sample weighting, blends and the route-lookup reference baseline.
3. **Dataset A wording:** accept it as a temporal/market-shift check on the same platform, with no recalibration.
4. **Train + validation refit for the final model.** My recommendation is yes, because it adds about a third more rows and covers lead times (days_left 11-15 and 31-35) missing from training, and the configuration is frozen beforehand; I will first check in the multi-seed runs that it does not hurt held-out flights, and keep train-only if it does.
5. **Dependency:** add `psutil` for memory measurement (small, dev only).

## 7. Files created or modified in this stage

Created: `backend/ml/phase6_audit.py`, `docs/06-audit-stats.json`, `docs/phase5_artifact_manifest.sha256`, this document. Nothing in Phase 5 was modified (manifest verified: 35 of 35 files match).
