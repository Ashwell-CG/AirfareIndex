# Phase 5: Supervised Regression Model Development

All numbers come from `backend/experiments/*/results.json` and `frozen.json` (run log: `experiments/run_*.log`), and the tables in `docs/05-comparison*.csv`, `05-error-analysis.csv`, `05-feature-ablation.csv`, `05-verification.json`. Nothing is hand-entered. Dataset A was not used. All fares and metrics are in INR.

Reproduce (from `backend/`): `python -X utf8 -m ml.train run --setup primary|group|stress`, then `python -X utf8 -m ml.train curves`, `python -X utf8 -m ml.verify_experiments`, `python -X utf8 -m ml.report_figures`. Seed 42 everywhere. Environment and file hashes are in `experiments/*/metadata.json`.

## 1. Protocol

| Setting | Split | Train / val / test rows | What the test set measures |
|---|---|---|---|
| **A. Primary** (date blocks) | `split_primary` | 265,235 / 90,021 / 89,966 | Known flight services on unseen journey dates, inside the training lead-time range. **99.72% of test itineraries have an exact itinerary twin in training; this is not unseen-flight generalisation.** |
| **B. Unseen flights** | `split_group` | 211,532 / 71,862 / 18,235 | Flight codes never seen in training (same date blocks). Smaller test set (18,235 rows) and **99.88% of test airline+route+class combinations also occur in training**, so routes are largely shared. |
| **C. Lead-time stress** | `split_stress` | 311,968 / 44,481 / 88,773 | Extrapolation to `days_left` 41-50, **outside the training range (1-35)**. The validation block (36-40) is also outside the training range. |

**Procedure (each split independently).** Stage 1 sees only that split's train and validation rows: random hyperparameter search on a fixed 60,000-row training subsample (scored on the full validation set, validation MAE in INR), a controlled feature ablation, then a refit of the frozen configuration on the full training set. `frozen.json` is written and its SHA-256 recorded; only then is the test set scored, once. All learned preprocessing is inside each pipeline and fitted on training rows only. Flight code is not an input. First class is excluded. Final models are fitted on the training partition only (validation is not merged back in).

**Models:** mean baseline, class-median baseline, Linear Regression, Ridge, Decision Tree, Random Forest (100 trees), scikit-learn Gradient Boosting, XGBoost. **Targets:** fare, and log1p(fare) with predictions converted back with `expm1` before every metric.

## 2. Verification of the run (all done after training finished)

| Check | Result |
|---|---|
| Expected outputs | Each split has `frozen.json`, `results.json`, `test_predictions.npz`, `results_long.csv`, `metadata.json`; 14 of 14 expected model/target entries per split; `learning_curves.json` present |
| Logs | 0 lines containing warning/error/traceback/exception in all three run logs; each ends with a "done" line; no experiment failed or was skipped |
| Frozen checksums | SHA-256 of `frozen.json` equals the value stored in `results.json` and `metadata.json` for all three splits |
| Freeze before test | In every log the `FROZEN` line precedes every test line; file modification order is frozen < results < predictions; `frozen.json` contains no test fields |
| Metrics in INR | Re-computed from stored INR predictions by independent code: maximum relative difference from reported metrics 3.9e-7; stored test targets equal the fare values of the split rows (1,307-143,019) |
| Same split definitions | One `splits.csv` hash across all runs; Phase 4 tests still pass |
| Saved artifacts | All 18 saved models load and predict; predictions match the stored test predictions to within 0.004 INR |
| Not saved | Group and stress splits save only their best model (Random Forest, both targets); other models there are in `results.json` only (policy to limit disk: each Random Forest is 80-130 MB) |

## 3. Results

Each table shows the model at the target chosen by **validation** MAE (the other target is in section 4). Test metrics were not used for any choice.

### 3.1 A. Primary (date blocks)

| Model | Target | Val MAE | Test MAE | Test RMSE | Test R² | MAPE % | MdAPE % | Bias | Train s | Infer µs/row |
|---|---|---|---|---|---|---|---|---|---|---|
| Mean baseline | fare | 16,655 | 17,217 | 19,852 | -0.007 | 146.2 | 92.9 | 1,617 | 0.0 | 0.0 |
| Class-median baseline | fare | 5,813 | 5,186 | 7,943 | 0.839 | 38.7 | 22.5 | 884 | 0.0 | 0.2 |
| Linear Regression | log1p | 4,458 | 3,917 | 6,393 | 0.896 | 21.8 | 16.4 | -703 | 1.8 | 1.9 |
| Ridge | log1p | 4,458 | 3,917 | 6,394 | 0.896 | 21.8 | 16.4 | -704 | 0.8 | 1.9 |
| Decision Tree | log1p | 3,142 | 2,059 | 4,677 | 0.944 | 9.7 | 4.1 | 272 | 1.1 | 1.1 |
| **Random Forest** | log1p | **2,845** | **1,868** | **3,952** | **0.960** | 9.0 | 5.0 | 74 | 8.6 | 2.4 |
| Gradient Boosting | fare | 3,245 | 2,494 | 4,275 | 0.953 | 14.2 | 9.9 | 338 | 174.5 | 6.3 |
| XGBoost | log1p | 2,893 | 2,124 | 4,036 | 0.958 | 10.6 | 6.8 | 489 | 6.1 | 3.3 |

### 3.2 B. Unseen flights

| Model | Target | Val MAE | Test MAE | Test RMSE | Test R² | MAPE % | MdAPE % | Bias | Train s | Infer µs/row |
|---|---|---|---|---|---|---|---|---|---|---|
| Mean baseline | fare | 16,738 | 16,952 | 19,364 | -0.012 | 146.0 | 98.7 | 2,149 | 0.0 | 0.0 |
| Class-median baseline | fare | 5,792 | 5,259 | 8,041 | 0.825 | 39.6 | 23.0 | 1,533 | 0.0 | 0.2 |
| Linear Regression | log1p | 4,384 | 4,150 | 6,579 | 0.883 | 23.5 | 17.9 | -503 | 1.3 | 3.8 |
| Ridge | log1p | 4,384 | 4,150 | 6,579 | 0.883 | 23.5 | 17.9 | -503 | 0.6 | 3.6 |
| Decision Tree | log1p | 3,135 | 4,615 | 8,019 | 0.826 | 25.3 | 16.9 | 323 | 0.9 | 2.5 |
| **Random Forest** | log1p | **2,803** | **3,579** | 6,237 | 0.895 | 19.3 | 12.4 | 52 | 6.6 | 4.8 |
| Gradient Boosting | fare | 3,190 | 3,704 | 6,021 | 0.902 | 21.7 | 14.5 | 433 | 158.4 | 10.8 |
| XGBoost | log1p | 2,866 | 3,736 | 6,260 | 0.894 | 20.7 | 14.1 | 364 | 5.5 | 3.8 |

On this small test set (18,235 rows) Gradient Boosting (fare) and XGBoost (fare, test RMSE 6,008) have a lower RMSE than the validation-selected Random Forest (6,237), while Random Forest has the lowest MAE. Differences of a few percent here should not be read as a ranking.

### 3.3 C. Lead-time stress test (days_left 41-50)

| Model | Target | Val MAE | Test MAE | Test RMSE | Test R² | MAPE % | MdAPE % | Bias | Train s | Infer µs/row |
|---|---|---|---|---|---|---|---|---|---|---|
| Mean baseline | fare | 17,414 | 17,128 | 19,183 | -0.018 | 152.4 | 99.3 | 2,527 | 0.0 | 0.0 |
| Class-median baseline | fare | 5,144 | 5,105 | 7,684 | 0.837 | 41.9 | 23.2 | 2,282 | 0.0 | 0.2 |
| Linear Regression | log1p | 4,012 | 4,267 | 7,065 | 0.862 | 21.4 | 17.8 | -2,781 | 2.1 | 1.9 |
| Ridge | log1p | 4,012 | 4,267 | 7,065 | 0.862 | 21.4 | 17.8 | -2,781 | 0.9 | 1.9 |
| Decision Tree | fare | 1,976 | 2,014 | 4,295 | 0.949 | 11.6 | 5.6 | 732 | 1.4 | 1.0 |
| **Random Forest** | log1p | **1,714** | **1,803** | **3,488** | **0.966** | 10.2 | 6.1 | 608 | 11.2 | 2.2 |
| Gradient Boosting | log1p | 2,299 | 2,384 | 4,023 | 0.955 | 14.0 | 9.6 | 499 | 151.3 | 5.9 |
| XGBoost | log1p | 1,887 | 1,944 | 3,574 | 0.965 | 11.3 | 7.2 | 585 | 6.4 | 3.0 |

### 3.4 Best model per evaluation setting (selected by validation MAE)

Random Forest on log1p(fare) is the validation winner in all three settings and also has the lowest test MAE in all three. Test values: primary MAE 1,868 / R² 0.960 / MAPE 9.0%; unseen flights MAE 3,579 / R² 0.895 / MAPE 19.3%; stress MAE 1,803 / R² 0.966 / MAPE 10.2%.

Margins are small relative to the limits of this study: on validation, Random Forest beats XGBoost by 1.7% (primary), 2.2% (unseen) and 9.2% (stress) MAE. Hyperparameter search was modest (section 7), so I would not claim Random Forest is intrinsically better than XGBoost.

## 4. Original fare vs log1p(fare)

Test MAE (INR), MAPE (%) and mean bias, fare target first.

| Split | Model | MAE fare | MAE log1p | Change | MAPE fare→log | Bias fare→log | Validation picked |
|---|---|---|---|---|---|---|---|
| primary | Linear Regression | 4,597 | 3,917 | -14.8% | 32.4→21.8 | 241→-703 | log1p |
| primary | Ridge | 4,575 | 3,917 | -14.4% | 32.0→21.8 | 246→-704 | log1p |
| primary | Decision Tree | 2,106 | 2,059 | -2.2% | 10.1→9.7 | 333→272 | log1p |
| primary | Random Forest | 1,930 | 1,868 | -3.2% | 9.6→9.0 | 268→74 | log1p |
| primary | Gradient Boosting | 2,494 | 2,481 | -0.5% | 14.2→13.0 | 338→-25 | fare |
| primary | XGBoost | 2,333 | 2,124 | -9.0% | 12.9→10.6 | 691→489 | log1p |
| group | Linear Regression | 4,814 | 4,150 | -13.8% | 34.0→23.5 | 549→-503 | log1p |
| group | Ridge | 4,789 | 4,150 | -13.3% | 33.4→23.5 | 578→-503 | log1p |
| group | Decision Tree | 4,507 | 4,615 | +2.4% | 25.5→25.3 | 263→323 | log1p |
| group | Random Forest | 3,625 | 3,579 | -1.3% | 20.2→19.3 | 438→52 | log1p |
| group | Gradient Boosting | 3,704 | 3,693 | -0.3% | 21.7→19.9 | 433→-120 | fare |
| group | XGBoost | 3,684 | 3,736 | +1.4% | 21.7→20.7 | 785→364 | log1p |
| stress | Linear Regression | 4,652 | 4,267 | -8.3% | 35.4→21.4 | -1,082→-2,781 | log1p |
| stress | Ridge | 4,617 | 4,267 | -7.6% | 34.7→21.4 | -1,107→-2,781 | log1p |
| stress | Decision Tree | 2,014 | 2,073 | +3.0% | 11.6→12.4 | 732→606 | fare |
| stress | Random Forest | 1,908 | 1,803 | -5.5% | 11.1→10.2 | 819→608 | log1p |
| stress | Gradient Boosting | 2,397 | 2,384 | -0.5% | 15.0→14.0 | 718→499 | log1p |
| stress | XGBoost | 2,118 | 1,944 | -8.2% | 13.2→11.3 | 739→585 | log1p |

- **Linear models gain a lot from the log target** (8-15% lower MAE, MAPE from about 33% to 22%). Fare-target linear models also predict non-positive fares for 3.7% (primary), 4.0% (unseen) and 6.6% (stress) of test rows (Ridge); log models never do.
- **Tree models gain little and inconsistently** (from -9.0% to +3.0%). Differences under about 2% should be treated as noise. Validation picked a target that the test set disagreed with in a few cases (for example Gradient Boosting in primary, where log1p was 0.5% better on test); I kept the frozen choices.
- **Retransformation bias.** `expm1(mean of log prediction)` estimates a median-like value, so the mean of the original fares is under-predicted when residual variance is large. This is visible for the linear log models (bias -703 INR on primary test, -503 unseen). I tested a smearing correction (Duan factor estimated on validation residuals and frozen before test): for the linear models the factor (1.068) overshoots (bias becomes +723 and MAE rises 3,917 to 4,057); for Random Forest it raises MAE from 1,868 to 2,275 on primary. In the stress split the factors are below 1 and smearing slightly helps. Because MAE rewards median-like predictions and smearing was inconsistent, **point predictions use plain `expm1`**; smeared results are kept in `results.json` (`test_smeared`) for reference. Anyone summing predicted fares over many tickets should expect a small systematic bias.

## 5. Why the three settings differ

**Primary vs unseen flights.** Tree models lose much more than linear ones: Random Forest MAE 1,868 → 3,579, Decision Tree 2,059 → 4,615, while Ridge goes 3,917 → 4,150. The test sets differ, so I made a controlled comparison on the **same 18,235 rows** (no new fitting): models trained on the primary split (which had seen those flights on other dates) versus models trained on the unseen-flight split.

| Model | MAE, flights seen | MAE, flights unseen | Ratio | MdAPE seen → unseen |
|---|---|---|---|---|
| Ridge (log1p) | 4,072 | 4,150 | 1.02 | 17.5% → 17.9% |
| Decision Tree (log1p) | 2,168 | 4,615 | 2.13 | 4.4% → 16.9% |
| Random Forest (log1p) | 1,923 | 3,579 | 1.86 | 5.4% → 12.4% |
| Gradient Boosting (fare) | 2,588 | 3,704 | 1.43 | 10.4% → 14.6% |
| XGBoost (log1p) | 2,196 | 3,736 | 1.70 | 7.4% → 14.1% |

Exposure to the flight on other dates roughly doubles accuracy for tree models and does nothing for linear ones. The smaller training set cannot explain it (the Random Forest learning curve improves only about 4% when training rows double from 132k to 265k). So **most of the primary-split accuracy of the tree models reflects re-identification of known itineraries, not generalisation to new flights.** As a reference, on validation rows a plain lookup of the same itinerary's median fare in other dates has a median error of 8.0%, and the Random Forest's validation median error is 7.7%; the primary score does not show much beyond that lookup. On unseen flights Random Forest's improvement over the class-median baseline is much smaller than on primary (MAE -32% vs -64%; R² 0.825 → 0.895 vs 0.839 → 0.960).

**Pooled R² overstates within-class skill.** For Random Forest, R² within each class on the primary test is 0.83 (Economy), 0.70 (Premium Economy), 0.74 (Business); on unseen flights 0.42, 0.24, 0.37. Most pooled R² comes from separating classes.

**Stress test.** Errors are not worse than primary (MAE 1,803 vs 1,868), despite the lead-time range being outside training. This should not be read as proof the models extrapolate: fares at `days_left` 41-50 sit on the flat part of the lead-time curve (Economy median about 8,500 for days 31-50 vs 13,298 at 1 day), and trees predict a constant beyond the edge, which is nearly right there. The visible cost of the shift is **positive bias** (+500 to +800 INR for tree models): test fares are cheaper than in training (median 11,865 vs 14,100; mean 21,114 vs 23,641). Extrapolation into the steep early range (1-15 days) was not tested and is not claimed. The primary test's own days_left blocks show the difference: MAE 2,283 on days 21-25 vs 1,445 on days 41-45.

## 6. Per-class and error analysis

Per-class test MAE (INR) / MAPE (%) for the validation-selected models (full tables: `05-comparison-by-class.csv`).

| Split | Model | Economy | Premium Economy | Business |
|---|---|---|---|---|
| primary | Random Forest | 854 / 9.6 | 1,387 / 9.3 | 4,059 / 7.6 |
| primary | XGBoost | 977 / 11.1 | 1,766 / 12.4 | 4,506 / 8.7 |
| primary | Ridge | 1,969 / 24.5 | 2,774 / 22.2 | 8,245 / 16.6 |
| unseen | Random Forest | 1,782 / 21.0 | 2,403 / 19.3 | 7,599 / 16.4 |
| unseen | XGBoost | 1,870 / 22.1 | 2,794 / 22.9 | 7,749 / 17.0 |
| stress | Random Forest | 981 / 11.8 | 1,337 / 10.4 | 3,576 / 7.1 |
| stress | XGBoost | 1,090 / 13.4 | 1,493 / 11.5 | 3,768 / 7.5 |

Business has the largest absolute errors and the smallest relative errors; Economy has the largest relative errors. Ridge on the log target under-predicts Business by about 2,800 (primary) to 7,500 (stress) INR on average.

Random Forest error analysis (`05-error-analysis.csv`, figures `p5_03_*`):
- **Airline (primary):** MAE is highest for Vistara (2,712, MAPE 9.9%, the largest and most class-diverse airline) and lowest for small low-cost carriers in absolute terms; relative error is highest for Indigo (12.4%) and GO FIRST (10.8%). StarAir (13 test rows) and AllianceAir (83) are too small to interpret.
- **Stops:** non-stop MAE 741 (MAPE 7.4%), 1-stop 2,048 (9.2%), 2+ stops 1,592 (9.0%). On unseen flights, non-stop MAPE is 9.2% against about 20% for connecting flights.
- **Route:** best primary routes are Delhi-Kolkata (MAPE 5.7%) and Kolkata-Delhi (6.5%); worst are Ahmedabad routes (13.6-15.7%). On unseen flights the worst route MAPEs are 41.6-51.8% (Ahmedabad-Bangalore, Hyderabad-Chennai, Hyderabad-Bangalore), from small samples (202-511 rows).
- **Days left:** primary MAE is higher on days 21-25 (2,283, MAPE 11.0%) than on days 41-45 (1,445, 6.9%); in the stress test both halves are about 1,800.
- **Residuals** (`p5_02_*`): centred near zero for Random Forest on primary (mean +74, median +178), with errors growing with the fare level (wider spread for predicted fares above 40,000); heavy tails remain.

MAPE limitation: fares are at least 1,307 INR so it is defined, but it is dominated by cheap fares and is unbounded for over-predictions; median APE and MAE are reported alongside.

## 7. Feature experiments (controlled ablation)

Hyperparameters frozen, only the feature switches change; validation MAE on the 60,000-row subsample fits (single seed; `05-feature-ablation.csv`, figure `p5_05`). Positive = worse than the full feature set.

- **Route reference duration and duration ratio** (tree models): removing them raises validation MAE by about 0.5-2.3% for Random Forest, XGBoost and Gradient Boosting in all three splits (for example Random Forest log1p: +1.44% primary, +1.10% unseen, +2.11% stress). So they help slightly for ensembles. For the single Decision Tree the effect flips sign between splits and fits (-3.8% to +3.9%), which I read as noise. These effects are small and untested for significance; I have no confidence intervals.
- **Linear models:** removing the linear extras (route, airline×class, cyclic time, log lead time) hurts by 3.6-9.3% on the log target; removing all derived features is similar. Removing only the route-reference features makes the log-target linear models worse by 0.9-1.2% but slightly better on the fare target (-0.1% to -0.7%).
- By the validation rule, the route-reference features were switched off for the Decision Tree (validation-selected target, all three splits) and for the fare-target Linear Regression and Ridge entries (all three splits). Every Random Forest, Gradient Boosting, XGBoost and log-target linear entry keeps them. Choices are in `frozen.json`. The ablation uses 60,000-row subsample fits, so small differences are noisy.

## 8. Learning curves (primary split, validation only)

| Model | 13k rows | 66k | 132k | 265k (full) |
|---|---|---|---|---|
| Random Forest: train / val MAE | 2,525 / 3,646 | 2,124 / 3,137 | 1,934 / 2,962 | 1,766 / 2,846 |
| XGBoost: train / val MAE | 1,638 / 3,508 | 1,870 / 3,066 | 1,904 / 2,946 | 1,921 / 2,903 |
| Ridge: train / val MAE | 4,620 / 4,469 | 4,635 / 4,472 | 4,639 / 4,466 | 4,636 / 4,458 |

Ridge is flat with a train/validation gap near zero (high bias; more rows will not help). Random Forest and XGBoost validation error is still falling at 265k rows (about -4% and -1.5% for the last doubling), with a large train/validation gap; more data or stronger regularisation could help. (Ridge's validation MAE is below its training MAE because the validation blocks happen to be easier.) Figure: `p5_06_learning_curves.png`.

## 9. Recommended candidates

1. **Random Forest on log1p(fare)**: best validation and test MAE in all three settings. Size 78-132 MB per model, inference 2.2-4.8 µs/row, training 6.6-11 s with 12 cores.
2. **XGBoost on log1p(fare)**: close second (primary MAE 2,124 vs 1,868; stress 1,944 vs 1,803), 5-6 MB, 3-4 µs/row. Its search hit grid boundaries, so it may be under-tuned; it is the better artifact to ship if size matters.
3. **Ridge on log1p(fare)**: interpretable, immune to memorisation (MAE 3,917 primary, 4,150 unseen), useful as a floor for explainability and sanity checks.

Not recommended: single Decision Tree (collapses on unseen flights), Gradient Boosting (slowest to train, 105-185 s, no accuracy advantage), fare-target linear models (negative fares).

**For the application**, the prediction form asks users for airline, route, class, times and duration, which will often not match a scheduled flight in the data. The **unseen-flight numbers are the realistic expectation** (typical error about 12% median, 19% mean absolute percentage), while the primary numbers apply to flights that were observed on other dates. The app should say so and should not present a confidence percentage.

## 10. Limitations and issues

- **Failed or incomplete experiments:** none failed. A figure-script bug (sample larger than the 18,235-row unseen-flight test set) failed once and was fixed; no model results were affected. A small subsampled smoke run preceded the real run and was discarded.
- **Search was modest.** Random search over 6-12 configurations per model on a 60,000-row subsample; selected values sit on grid boundaries (Random Forest minimum leaf 5 and no depth limit; Gradient Boosting depth 6, learning rate 0.1; XGBoost depth 10, min child weight 20), so Gradient Boosting and XGBoost are likely under-tuned and model rankings could change. Selected hyperparameters are identical across splits for Random Forest, Gradient Boosting and XGBoost, which also shows the search discriminates little.
- **Single seed, no confidence intervals;** the unseen-flight test set is small and depends on which 280 codes were held out (seed 42).
- **Validation vs test disagreements:** validation-selected targets disagreed with test MAE in several tree-model cases; effects are within about 3%.
- **Train-only final fit:** validation rows were not added back; a Phase 6/7 refit on train+validation is a choice for you.
- **Timings** are for this machine (Random Forest and XGBoost on all 12 cores; scikit-learn Gradient Boosting, trees and linear models single-threaded).
- **Scope:** First class excluded; one platform, one 7-week window, listed fares; the calendar and lead-time effects remain confounded (Phase 4). No claim is made about forecasting beyond the data window. Dataset A external validation remains for a later phase.

## 11. Generated files

Code: `backend/ml/models.py`, `evaluation.py`, `train.py`, `report_figures.py`, `verify_experiments.py`; `build_preprocessor` gained two ablation switches (defaults unchanged). Experiments: `backend/experiments/{primary,group,stress}/` (`frozen.json`, `results.json`, `results_long.csv`, `test_predictions.npz`, `metadata.json`), `primary/learning_curves.json`, run logs. Models: `backend/saved_models/primary/` (14 artifacts), `group/` and `stress/` (2 each). Docs: `05-comparison.csv`, `05-comparison-by-class.csv`, `05-error-analysis.csv`, `05-feature-ablation.csv`, `05-verification.json`, figures `docs/figures/p5_*.png`.
