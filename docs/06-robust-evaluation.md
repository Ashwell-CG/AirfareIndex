# Phase 6: Multi-Seed Unseen-Flight Evaluation

Code: `backend/ml/p6_eval.py`; results: `backend/experiments/phase6/multiseed/` (`results.json`, `aggregate.json`, `aggregate.csv`); figure `p6_multiseed_unseen.png`. All fares and metrics in INR.

## Protocol

- Hyperparameters frozen first (`tuning/frozen_candidates.json`, SHA-256 `8ce0e37a...`); every run stores that checksum, and the verification suite confirms the file was written before any evaluation result.
- **10 seeds** (7001-7010). For each seed, about 20% of all flight codes (280 codes: 40% of the EVAL pool per airline) are drawn from the **EVAL pool**, which tuning never touched. Test rows are those held-out flights in the test date blocks (15,247 to 18,417 rows per seed). Training rows are all other flight codes, so **held-out codes never appear in the training data** (assertion in code, re-derived independently for all 20 seed-recipe pairs by `ml/p6_verify.py`: 0 violations).
- Two recipes: **T** (train date blocks, about 220,000 rows) and **TV** (train + validation date blocks, 282,000-294,000 rows). Test date blocks are never used for training.
- Model randomness is fixed (seed 42); variability across seeds is therefore the effect of which flights are held out. Each EVAL code is in the test set in about 4 of 10 seeds, so the seeds are not independent draws; the standard deviation (n-1) describes sensitivity to the held-out set.
- Phase 5 test results are treated as historical benchmarks; none of those rows are used for a decision here (decisions come from DEV validation and this evaluation).

## Results, recipe TV (mean +/- SD over 10 seeds)

| Candidate | MAE | RMSE | R^2 | MAPE % | Median APE % | Bias |
|---|---|---|---|---|---|---|
| **Random Forest + lookup blend** | **3,154 +/- 185** | 5,742 +/- 380 | 0.918 +/- 0.006 | 17.4 +/- 1.1 | **11.4 +/- 0.7** | -101 |
| Random Forest (tuned) | 3,181 +/- 193 | 5,768 +/- 397 | 0.917 +/- 0.007 | 17.2 +/- 1.1 | 11.8 +/- 0.6 | -248 |
| Random Forest + XGBoost blend | 3,221 +/- 207 | 5,772 +/- 435 | 0.917 +/- 0.008 | 17.5 +/- 1.3 | 12.2 +/- 0.7 | -354 |
| Route lookup (reference) | 3,225 +/- 185 | 6,071 +/- 332 | 0.908 +/- 0.004 | 19.0 +/- 1.3 | 11.7 +/- 0.9 | +424 |
| XGBoost + lookup blend | 3,227 +/- 196 | 5,826 +/- 400 | 0.916 +/- 0.007 | 18.1 +/- 1.4 | 11.7 +/- 0.9 | -40 |
| Random Forest + Ridge blend | 3,228 +/- 192 | 5,737 +/- 415 | 0.918 +/- 0.006 | 17.8 +/- 1.2 | 12.3 +/- 0.7 | -414 |
| XGBoost (tuned) | 3,409 +/- 225 | 5,984 +/- 477 | 0.911 +/- 0.009 | 18.5 +/- 1.4 | 13.4 +/- 0.7 | -421 |
| Random Forest, Phase 5 config | 3,636 +/- 289 | 6,765 +/- 581 | 0.886 +/- 0.014 | 18.4 +/- 1.3 | 12.2 +/- 0.7 | -547 |
| XGBoost, Phase 5 config | 3,670 +/- 301 | 6,588 +/- 547 | 0.892 +/- 0.012 | 18.7 +/- 1.4 | 13.4 +/- 0.7 | -564 |
| Ridge | 3,843 +/- 233 | 6,397 +/- 514 | 0.898 +/- 0.009 | 22.2 +/- 1.6 | 16.6 +/- 0.8 | -772 |

MAPE is dominated by cheap fares and is unbounded for over-predictions; median APE is the more robust relative metric. Pooled R^2 mostly reflects class separation (see per-class below).

## Per-class (MAE +/- SD; mean MAPE %; mean median APE %; mean within-class R^2)

| Candidate | Economy | Premium Economy | Business |
|---|---|---|---|
| RF + lookup blend | 1,563 +/- 63; 19.5; 12.5; 0.56 | 2,161 +/- 214; 17.3; 11.1; 0.38 | 6,759 +/- 479; 13.3; 9.3; 0.45 |
| Random Forest (tuned) | 1,562 +/- 58; 19.2; 13.1; 0.57 | 2,147 +/- 204; 17.2; 11.5; 0.40 | 6,864 +/- 494; 13.4; 9.6; 0.44 |
| Route lookup | 1,690 +/- 89; 21.8; 13.0; 0.46 | 2,372 +/- 306; 19.2; 9.6; 0.18 | 6,646 +/- 486; 13.4; 9.3; 0.39 |
| XGBoost (tuned) | 1,689 +/- 52; 20.9; 15.0; 0.55 | 2,291 +/- 206; 18.1; 12.7; 0.36 | 7,332 +/- 644; 14.3; 10.7; 0.40 |
| Random Forest, Phase 5 config | 1,661 +/- 84; 19.7; 13.1; 0.50 | 2,369 +/- 225; 18.7; 11.4; 0.23 | 8,127 +/- 822; 15.8; 11.1; 0.21 |
| Ridge | 1,924 +/- 56; 25.4; 18.7; 0.47 | 2,751 +/- 281; 23.0; 18.0; 0.22 | 8,134 +/- 740; 15.6; 13.1; 0.31 |

Within a class the models explain only 38-57% of the variance (Business 0.44-0.45); the route lookup is slightly better than the models for Business MAE (6,646 vs 6,759-6,864) and for Premium Economy median APE (9.6% vs 11.1-11.5%), and worse for Economy.

## Paired comparisons (MAE difference per seed, negative = better than the reference)

| Candidate | vs route lookup (mean, SE, seeds better) | vs Phase 5 RF config | vs Ridge |
|---|---|---|---|
| RF + lookup blend | -71, SE 16, 9/10 | -482, SE 46, 10/10 | -689, SE 44, 10/10 |
| Random Forest (tuned) | -44, SE 20, 8/10 | -455, SE 44, 10/10 | -662, SE 45, 10/10 |
| XGBoost (tuned) | +184, SE 35, 0/10 | -227, SE 39, 10/10 | -434, SE 59, 10/10 |

The blend beats the tuned Random Forest by 27 (SE 4.9) with a lower MAE in all 10 seeds, a consistent but small (0.9%) advantage. The tuned Random Forest and blend beat the route lookup in MAE by 1.4% and 2.2%, but the lookup is level on median APE (11.7% vs 11.4-11.8%). The tuned XGBoost is worse than the lookup in every seed.

## Training recipe: T vs TV

| Candidate | Mean MAE change TV vs T |
|---|---|
| Random Forest (tuned) | -0.12% |
| XGBoost (tuned) | +0.09% |
| Ridge | +0.05% |
| RF + Ridge blend | -0.32% |
| RF + XGBoost blend | -0.28% |
| RF + lookup blend | +0.08% |
| XGBoost + lookup blend | +0.36% |

All changes are within +/-0.4%, so adding the validation date blocks neither helps nor hurts on unseen flights. The pre-set rule (adopt TV if it is not worse than T by more than 0.5% for a majority of the finalists) selected **TV**. The practical argument for TV is lead-time coverage: it adds days_left 11-15 and 31-35 to the training data. Evidence that it improves accuracy was not found.

## Per-seed MAE (recipe TV)

| Seed | Test rows | RF + lookup | Random Forest | Route lookup | XGBoost |
|---|---|---|---|---|---|
| 7001 | 15,247 | 2,800 | 2,816 | 2,884 | 2,946 |
| 7002 | 17,450 | 3,241 | 3,249 | 3,401 | 3,534 |
| 7003 | 17,955 | 3,364 | 3,398 | 3,429 | 3,581 |
| 7004 | 16,536 | 2,972 | 2,994 | 3,017 | 3,391 |
| 7005 | 17,432 | 3,048 | 3,087 | 3,078 | 3,244 |
| 7006 | 18,417 | 3,336 | 3,383 | 3,387 | 3,624 |
| 7007 | 17,625 | 3,354 | 3,404 | 3,354 | 3,705 |
| 7008 | 17,002 | 3,053 | 3,061 | 3,161 | 3,229 |
| 7009 | 17,414 | 3,201 | 3,235 | 3,236 | 3,450 |
| 7010 | 18,146 | 3,169 | 3,185 | 3,302 | 3,384 |

The spread between seeds (2,800 to 3,364 for the same model) is larger than the gaps between the top four candidates, so a single unseen-flight split cannot rank them; only the paired comparison above can.

## Limits

- Each seed's test set holds 280 flight codes; the standard deviations describe held-out-set sensitivity, not a confidence interval for future data.
- Only flight codes are held out. All airlines, routes and classes occur in training; unseen airlines/routes were not tested.
- One platform, one 7-week window.
