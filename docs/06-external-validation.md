# Phase 6: Dataset A as a Temporal/Market-Shift Check

Code: `backend/ml/p6_external.py`; results: `backend/experiments/phase6/external/results.json`; figure `p6_external_level_shift.png`. All fares in INR.

**What this is and is not.** Dataset A (EaseMyTrip, journeys 11 Feb to 31 Mar 2022) is the same platform as Dataset E and shares flight codes with it, so it is **not** an independent-platform validation. It tests how models trained on Jan-Mar 2023 fares behave on the same platform one year earlier. Per your approval it was used only for this check: **no training, no tuning, no feature selection, no recalibration, never merged with E.** The models are the frozen candidates, trained on Dataset E's train+validation date blocks only.

## Compatibility and exclusions

| Item | Result |
|---|---|
| Source files | raw `economy.csv` (206,774) + `business.csv` (93,487) = 300,261 rows (they carry the date, exact times, duration text, stops text and price needed for E's 8 inputs) |
| Target | `price` string with commas, converted to integer INR; same currency as E |
| Mapped inputs | airline, class (Economy/Business), source, destination, stops (non-stop, 1-stop, 2+-stop from the text), duration (hours), departure minute, `days_left` = date - 2022-02-10 (the relation verified in Phase 2 on matched rows; assumed for all rows) |
| Excluded: malformed duration | 4 rows (such as "1.03h m"), not guessed |
| Excluded: exact duplicates | 35 |
| Excluded: airline not in E | Trujet, 41 rows |
| Excluded: airline/class/route outside E's supported combinations (total, includes Trujet) | 1,085 |
| **Rows evaluated** | **299,137** (Economy 205,650; Business 93,487) |
| Range differences | `days_left` 1-49 (inside E's 1-50); 9 rows have duration above E's maximum of 43.6 h; Premium Economy and Ahmedabad routes do not exist in A |
| Overlap with E's training data | 80.7% of A rows have a flight code that also occurs in E's training rows; only 14.4% have an exact itinerary (same flight, route, class, departure minute, duration, stops) |

## Results (overall, INR)

| Candidate | MAE | RMSE | R^2 | Median APE % | Bias (pred - actual) |
|---|---|---|---|---|---|
| RF + XGBoost blend | 4,484 | 5,793 | 0.935 | 36.7 | 1,948 |
| XGBoost + lookup blend | 4,467 | 5,861 | 0.933 | 35.1 | 1,865 |
| **RF + lookup blend (final)** | 4,478 | 5,886 | 0.933 | 35.3 | 1,897 |
| Random Forest (tuned) | 4,539 | 5,942 | 0.932 | 35.8 | 1,954 |
| XGBoost (tuned) | 4,537 | 5,838 | 0.934 | 37.5 | 1,974 |
| Route lookup | 4,663 | 6,416 | 0.920 | 33.8 | 1,860 |
| Random Forest, Phase 5 config | 4,626 | 6,252 | 0.924 | 35.2 | 2,446 |
| XGBoost, Phase 5 config | 4,629 | 6,104 | 0.928 | 35.8 | 2,310 |
| Ridge | 5,180 | 6,840 | 0.909 | 38.4 | 1,739 |

## What the shift looks like

| Class | Actual median in A | Median predicted by the final model | Median predicted/actual | Final model: MAE, median APE, bias, R^2 |
|---|---|---|---|---|
| Economy (205,650 rows) | 5,772 | 9,528 | **1.65** | 3,819; 65.4%; +3,159; **-0.41** |
| Business (93,487 rows) | 53,164 | 52,505 | 0.99 | 5,927; 8.5%; -879; 0.60 |

Every candidate over-predicts 2022 Economy fares by about 1.65-1.71 times, because Economy prices were about 40% lower in A than in E (E's Economy median is 9,494). Business fares are predicted well (median APE 7.6-13.6% across candidates). The overall R^2 of 0.93 is misleading for the same reason as before: it mostly reflects class separation, and within Economy R^2 is negative for every candidate. On 32,307 matched itinerary + `days_left` pairs the A/E fare ratio had a median of 0.83 (10th-90th percentile 0.45-1.20), confirming a price-level shift between the two periods rather than a model-specific failure.

By segment (final model): rows whose exact itinerary is in E's training data (43,075): MAE 5,231, median APE 21.7%; rows with a new itinerary (256,062): MAE 4,351, median APE 38.1%; flight code never seen in E (57,750 rows): median APE 54.6%. Percentage errors are driven by the Economy level shift in all segments; absolute errors are not smaller for known itineraries.

## Interpretation

1. **The models are calibrated to the 2023 price regime and do not transfer to 2022 Economy fares.** This is a finding about the data (a one-year market shift), and any fare model trained on one season will behave this way. The application should state the training period (Jan-Mar 2023 journeys) and not present predictions as valid for other periods.
2. **The check barely discriminates between candidates.** MAE differs by 4% across the non-Ridge models; the route lookup has the best median APE and the worst RMSE. It cannot be used to claim that one model generalises better across time; it only shows none of them does.
3. **No recalibration was done.** A level correction fitted on A's labels would be tuning on A and would not be a valid performance estimate.

## Limits

Same platform and overlapping schedules; no independent labelled source outside EaseMyTrip was available. The `days_left` anchor for A is assumed from the Phase 2 matched-row check. Dataset A was never used for training or tuning (a test in `tests/test_phase6.py` confirms none of the training modules reference its files).
