# Phase 6: Why Tree Models Do Worse on Unseen Flights, and What Helped

All fares in INR. Evidence comes from `06-phase6-initial-audit.md`, `06-hyperparameter-optimisation.md`, `06-robust-evaluation.md` and `backend/experiments/phase6/`. Phase 5 numbers are historical benchmarks.

## 1. What the evidence says about the cause

1. **Tree models partly recognise flights instead of pricing them.** Phase 5, same 18,235 rows scored by models that had and had not seen those flights on other dates: Random Forest 1,923 vs 3,579 MAE (x1.86), Decision Tree x2.13, XGBoost x1.70, Ridge x1.02. Smaller training sets do not explain it (the Random Forest learning curve moves only about 4% when training rows double).
2. **The Phase 5 tuning rewarded that behaviour.** The unseen-flight split's validation set shared 99.98% of its flight codes with training, so the chosen settings (leaf 5, no depth limit, depth 10) were the memorisation-friendly end of the grid.
3. **Little flight-level signal exists beyond route level.** A lookup of the training median fare for the same airline + route + class + stops scored MAE 3,290 and median APE 12.2% on the Phase 5 unseen-flight test rows, against 3,579 and 12.4% for the Random Forest. Over the 10 new seeds the lookup is 3,225 +/- 185 against 3,181 +/- 193 for the tuned Random Forest. The eight inputs (airline, class, route, stops, departure minute, duration, lead time) mostly pin down a route-level price; the rest of a flight's price is not in the data.

## 2. What was tried (all tuned or compared on DEV flights only)

| Idea | Result | Verdict |
|---|---|---|
| Fix the tuning protocol (flight-grouped validation) | Changes which settings win: much stronger regularisation | essential |
| Random Forest regularisation (leaf 20, 20% of features per split, half-size bootstrap samples, depth cap 32) | 10-seed unseen MAE 3,636 +/- 289 (Phase 5 config) -> 3,181 +/- 193 (**-12.5%**, better in 10/10 seeds, mean paired difference -455, SE 44) | helps |
| XGBoost regularisation (depth 6, min_child_weight 50, lambda 10, early stopping at about 100 trees) | 3,670 +/- 301 -> 3,409 +/- 225 (**-7.1%**, 10/10 seeds) | helps, but stays worse than Random Forest |
| Drop the departure minute (re-identifies a specific flight, weak signal) | Random Forest -1.8% on DEV validation; XGBoost -0.9% | adopted for Random Forest only (pre-set rule: at least 1%) |
| Coarser time window or rounded duration | +0.9% to +1.4% worse | rejected |
| Itinerary weights (down-weight repeated identical itineraries) | Random Forest -1.3% more (n^-1 best); XGBoost no gain | adopted for Random Forest |
| Route reference duration and duration ratio (Phase 5 features) | still kept; gains about 1% in ensembles | kept |
| Blend with the route lookup (75/25 for Random Forest) | 3,181 -> 3,154 (-0.9%, better in 10/10 seeds, SE 4.9 on the paired difference) | small, consistent gain |
| Blend with Ridge or XGBoost | no gain over the Random Forest alone (3,228 / 3,221) | rejected |
| Ridge strength | alpha 1000 optimum, flat below 10 | baseline only |

Not tried, and not claimed: out-of-fold target encoding of route/airline (leakage risk, little expected gain), other model families, monotone constraints, extra input features (none exist in the data), generalisation to unseen airlines or unseen routes (all 42 routes and every airline occur in every training set; only flight codes are held out).

## 3. The price of robustness: seen flights get worse

The final-recipe models were also scored on Dataset E's test date blocks, where every flight occurs in training on other dates (historical benchmark, `experiments/phase6/seen_flight/`):

| Model (same training data) | Seen-flight MAE | Median APE | Unseen-flight MAE (10 seeds) |
|---|---|---|---|
| Random Forest, Phase 5 config | **1,839** | **4.9%** | 3,636 +/- 289 |
| XGBoost, Phase 5 config | 2,095 | 6.8% | 3,670 +/- 301 |
| Random Forest, tuned | 2,822 | 10.2% | 3,181 +/- 193 |
| **Random Forest + lookup blend (final)** | 2,849 | 9.9% | **3,154 +/- 185** |
| Route lookup | 3,079 | 10.3% | 3,225 +/- 185 |
| Ridge | 3,947 | 16.5% | 3,843 +/- 233 |

(See `p6_seen_vs_unseen.png`.) Regularisation lowers the unseen-flight error by about 13% and raises the seen-flight error by about 55% (1,839 to 2,849). The high-capacity configuration is much better when the exact itinerary occurred in training. Which side matters depends on how the application is used: users entering arbitrary itineraries (the Predict form) need the robust model; looking up a real historical flight would benefit from the high-capacity one. A two-mode design (high-capacity model or lookup when the exact itinerary exists in training, robust model otherwise) is a Phase 7 option I did not build or test.

## 4. Remaining weakness

Even the best model leaves large errors on unseen flights: MAE about 1,560 (Economy), 2,150 (Premium Economy) and 6,760 (Business); within-class R^2 only 0.38 to 0.56. Business flights dominate absolute error. Median APE of about 11.4% is the realistic typical error for unseen itineraries.

## 5. Conclusion

Tuning under the right protocol recovered a solid, repeatable improvement (about 12.5% over the Phase 5 Random Forest on unseen flights) but the ceiling is close to the route-level lookup. The honest statement is: **on unseen flights the trained models are about 1-2% better in MAE than a route-level lookup (paired, 8-9 of 10 seeds), clearly better in RMSE and R^2, and equal in median APE.**
