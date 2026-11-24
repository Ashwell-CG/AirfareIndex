# Phase 6: Hyperparameter Optimisation

Code: `backend/ml/p6_tune.py`. Results: `backend/experiments/phase6/tuning/` (final), `tuning_round1/`, `tuning_round2_ridge_capped/` (earlier runs kept for the record). Logs: `experiments/phase6/stageA*.log`. All values are INR. Seeds: pools 6001, tuning partitions 6101 and 6102, search 6201 (round 2: +10), model 42.

## Protocol (fixes the Phase 5 flaw)

- Flight codes split 50/50 into a **DEV pool** and an **EVAL pool** (stratified by airline). Tuning used **DEV flights only**.
- For each of two code partitions: fit on train-date-block rows of 70% of DEV codes, validate on validation-date-block rows of the other 30% of DEV codes (partition 6101: 99,157 train / 14,092 validation rows, 213 held-out codes; partition 6102: 99,714 / 13,886, 213 codes). Validation flights are never in the corresponding training rows, so tuning finally rewards generalising to unseen flights. Score = mean validation MAE over both partitions.
- Search fits use a 60,000-row training subsample; the top three configurations are refit on the full tuning-train rows. No EVAL-pool flight and no test date block was read for any decision.
- Target: log1p(fare); MAE is always computed after `expm1` back to INR.

## Search

| | Round 1 | Round 2 (final) |
|---|---|---|
| Random Forest configurations | 30 (leaf 5-80, depth 12-None, max_features 0.2-1.0, max_samples 0.3-None) | 61 (leaf 20-120, depth 16-None, max_features 0.1-0.33, max_samples 0.5-1.0) |
| XGBoost configurations | 50 (depth 3-10, min_child_weight 1-100, lambda, alpha, gamma, learning rate 0.03-0.1, subsample, colsample; early stopping on the tuning validation fold) | 101 (depth 4-8, min_child_weight 20-150, lambda 3-30, alpha 0-2, gamma 0-2, learning rate 0.03-0.06, subsample 0.8-1.0, colsample 0.5-0.8) |
| Ridge alpha grid | 11 values, 1e-3 to 1e3 | 17 values, 1e-3 to 1e5 (widened, see below) |
| Wall time | 238 s | 345 s |

Round 2 refined around the round-1 optimum, added the round-1 winners to its candidate list (so it could not be worse), and extended edges that round 1 had hit. It also exposed that the Ridge baseline had selected the top of its grid (alpha 1000); the grid was widened to 1e5, the stage re-run, and alpha = 1000 is now interior (validation MAE: 316 -> 4,783; 1000 -> 4,777; 3,162 -> 4,863; 10,000 -> 5,540). Ridge is insensitive to alpha below 10 (4,798).

## Selected configurations (mean validation MAE over the two DEV partitions)

| Candidate | Configuration | DEV val MAE |
|---|---|---|
| Random Forest (tuned) | 150 trees, `min_samples_leaf` 20, `max_depth` 32, `max_features` 0.2, `max_samples` 0.5; no departure-minute input; itinerary sample weights (n^-1) | **4,334** |
| XGBoost (tuned) | `max_depth` 6, `min_child_weight` 50, lambda 10, alpha 0, gamma 0, learning rate 0.06, subsample 0.9, colsample 0.7; **102 trees** from early stopping (stopped at 77 and 110 trees in the two partitions, +10% for the larger final training set) | **4,358** |
| Ridge | alpha 1000 | 4,777 |
| Route lookup (reference) | median fare by airline+route+class+stops with coarser fallbacks | 4,469 |
| Phase 5 Random Forest config | 100 trees, leaf 5, no depth limit, max_features 0.7 | 4,676 |
| Phase 5 XGBoost config | 600 trees, depth 10, min_child_weight 20, lr 0.06 | 4,718 |

Tuning improved the Random Forest by 7.3% and XGBoost by 7.6% on this unseen-flight validation protocol relative to the Phase 5 configurations. Both remain only about 2.5-3% better than the route lookup here.

## What the search shows

- **Less capacity is better on unseen flights.** The winners are heavily regularised (Random Forest: bigger leaves, 20% of features per split, half-size bootstrap samples; XGBoost: min_child_weight 50, depth 6, early stopping at about 100 trees). The Phase 5 choices (leaf 5, no depth limit, depth 10) were the memorisation-friendly end of the old grid and are worse by 7-8% here.
- **Flat optimum.** The top three Random Forest configurations are within 0.4% (4,460 / 4,477 / 4,482 in search fits) and the top XGBoost configuration was found in both rounds. More search is unlikely to change the picture much.
- **Boundary audit of the final spaces.** In round 2, `min_samples_leaf` = 20 and `max_samples` = 0.5 are the lowest values of the narrowed grid, and learning rate 0.06 the highest. In each case round 1's wider grid had already tested the beyond-edge values (leaf 5-10, max_samples 0.3, learning rate 0.1) and rejected them, and the top three configurations agree within 0.4%, so I do not consider these true boundary hits. `reg_alpha` and `gamma` = 0 sit at their natural lower bounds. Everything else, including `max_features` (0.2 of [0.1, 0.33]) and Ridge alpha, is interior.

## Controlled feature-representation and weighting experiments (same configuration, DEV validation MAE)

Rule fixed in advance: adopt a variant only if it is at least 1% better on the mean and better in both partitions.

| Experiment | Random Forest | XGBoost |
|---|---|---|
| Base (exact departure minute, exact duration, no weights) | 4,470 | 4,358 |
| Drop departure minute | **4,389 (-1.8%)** adopted | 4,320 (-0.9%) **not adopted** (below the 1% rule) |
| 4 departure windows instead of exact minute | 4,514 (+1.0%) | 4,396 (+0.9%) |
| Duration rounded to 0.5 h | 4,512 (+0.9%) | 4,417 (+1.4%) |
| Drop departure minute + round duration | 4,413 | 4,345 |
| Itinerary weights n^-0.5 (on chosen representation) | 4,355 | 4,390 (on base) |
| Itinerary weights n^-1 | **4,334 (-1.3% vs no weights)** adopted | 4,365 |

Weighting uses model-visible inputs only (repeat count of identical airline/route/class/stops/departure/duration rows), never flight code. The departure minute is a weak signal and mostly helps a model recognise a specific flight, which is why removing it helps on unseen flights.

## Blends (weights chosen on DEV validation from {0.25, 0.5, 0.75})

| Blend (log-space average) | Weights | DEV val MAE |
|---|---|---|
| XGBoost + lookup | 0.5 / 0.5 | 4,199 |
| Random Forest + XGBoost | 0.5 / 0.5 | 4,256 |
| Random Forest + lookup | 0.75 / 0.25 | 4,278 |
| Random Forest + Ridge | 0.75 / 0.25 | 4,342 |

## Computation time

Search fits take 1-3 s per configuration on 60,000 rows (12 cores); whole stage 345 s. Final-recipe training on 355,256 rows: Random Forest 4.6 s, XGBoost 1.5 s, Ridge 1.1 s, lookup 0.3 s.

## Caveats

DEV validation folds are small (about 14,000 rows, 213 codes each) and two partitions give only a rough estimate; conclusions rest on the 10-seed evaluation in `06-robust-evaluation.md`. XGBoost's early stopping uses the tuning validation fold, which is permitted for tuning but means its 102-tree setting is tuned to that protocol.
