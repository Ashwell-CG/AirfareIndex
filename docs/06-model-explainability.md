# Phase 6: SHAP Explainability

Code: `backend/ml/p6_explain.py`; results: `backend/experiments/phase6/explain/explain_results.json`; figures in `docs/figures/` (`p6_shap_importance.png`, `p6_shap_importance_by_class.png`, `p6_shap_summary_*.png`, `p6_shap_dependence_*.png`, `p6_shap_local_*.png`, `p6_ridge_coefficients.png`).

## What was explained

The two tree members of the shortlisted candidates, the tuned **XGBoost** (3,000 rows, 1,000 per class) and the tuned **Random Forest** (1,500 rows, 500 per class), both final-recipe models trained on train+validation date blocks. Rows were sampled from the Dataset E **test** date blocks, which these models never saw in training. `TreeExplainer` was used; contributions are in **log1p(fare)** units (a value s multiplies the fare by about exp(s)) and are summed back from one-hot columns to the original input features. Additivity was checked: the largest gap between (baseline + sum of contributions) and the model output is 7.6e-6 (XGBoost) and 2.4e-12 (Random Forest) log units. The selected final model is a 75/25 blend of the Random Forest and a lookup table; its tree part is the explained Random Forest, the lookup part is a median-fare table by airline, route, class and stops.

## Global importance (mean |SHAP|, log1p-fare units)

| Input | XGBoost | Random Forest |
|---|---|---|
| travel_class | 0.589 | 0.526 |
| airline | 0.089 | 0.102 |
| duration_hours | 0.083 | 0.050 |
| days_left | 0.080 | 0.108 |
| source | 0.037 | 0.045 |
| destination | 0.033 | 0.041 |
| route_ref_duration_hours | 0.025 | 0.021 |
| stops | 0.024 | 0.037 |
| duration_ratio | 0.022 | 0.038 |
| dep_minutes | 0.024 | 0.000 (not an input of this model) |

Pooled importance is dominated by class (the three classes sit at very different fare levels). Within each class the ranking changes (XGBoost, class term excluded): **Economy**: airline 0.117, duration 0.095, days_left 0.086, source 0.044; **Premium Economy**: days_left 0.098, airline 0.090, duration 0.078; **Business**: duration 0.076, airline 0.059, days_left 0.056. The Random Forest gives the same picture with days_left more prominent (Premium Economy 0.135).

## How the XGBoost uses the main inputs (summary and dependence plots)

- **Class (summed over the three class columns):** relative to the baseline of about 16,300 (the model's average prediction on the class-balanced sample), Business adds about +1.05 log units (a factor of about 2.9), Premium Economy about -0.18 (factor 0.83) and Economy about -0.5 (factor 0.6); the local cases below show these factors. In the per-column beeswarm, the single Business column contributes about +0.85 when true and about -0.3 when false.
- **Duration:** a steep rise for short itineraries (very short durations of 1-2 hours contribute about -0.5 to -0.6), flat from about 6 to 27 hours, slightly higher beyond 28 hours.
- **Days left:** larger `days_left` lowers the prediction. In the explained rows (days 21-25 and 41-45 only, because they come from the test blocks) the contribution is about -0.02 to -0.07 at 21-25 days and about -0.07 to -0.20 at 41-45 days.
- **Stops:** non-stop contributes about -0.06 to -0.17, one stop about 0, two or more stops about +0.07 to +0.28.
- **Route reference duration:** rises with route length (about -0.1 for short routes to about +0.1 for long ones).
- **Departure minute:** lower contributions for early-morning (about 05:00-06:30) and late-evening (after about 21:30) departures, higher around 10:00-11:30; small (|SHAP| mostly under 0.1).
- **Airline and city:** Vistara raises the prediction (about +0.05 in the summary plot), Indigo (about -0.12) and AirAsia (about -0.3) lower it; Kolkata as source or destination raises it (about +0.15) and Delhi as source lowers it slightly.

## Local explanations (XGBoost; Random Forest versions are in the JSON and figure)

| Case | Actual | Predicted | Largest contributions (factors on the fare) |
|---|---|---|---|
| Economy non-stop, AirAsia Delhi-Bangalore, 25 days left | 5,235 | 5,870 | class 0.61, airline 0.82, duration 0.85, route reference 1.11, stops 0.91 |
| Economy 1-stop, Indigo Delhi-Kolkata, 21 days left | 9,089 | 8,884 | class 0.62, airline 0.87, destination 1.12, duration 0.90, days_left 0.95 |
| Premium Economy 1-stop, Vistara Hyderabad-Delhi, 22 days left | 13,235 | 15,137 | class 0.83, airline 1.10, duration 1.08, days_left 0.96 |
| Business 1-stop, Air India Mumbai-Delhi, 21 days left | 50,957 | 46,189 | class 2.86, duration 1.05, destination 0.96, airline 0.97 |

Each case is the explained row closest to the median fare of its class/stops group (a deterministic choice, not hand-picked). Factors are exp(SHAP) relative to the baseline fare of about 16,300.

## Ridge cross-check (log1p fare, standardised numerics)

Largest coefficients: Business +0.63, Economy -0.51, Vistara Business +0.37, Air India Business +0.26, non-stop -0.24, duration -0.24, log duration ratio +0.24, Vistara +0.23, 2+ stops +0.20. The linear model agrees on direction for class, stops and airline; its negative duration coefficient and positive ratio coefficient offset each other (correlated features), which is one reason SHAP or coefficients on individual duration terms should not be read in isolation.

## Interpretation and limits

1. **These describe what the fitted models use, not causes of fares.** SHAP attributes a prediction to inputs given the model and the data distribution; it cannot say what would happen to a real fare if an input were changed.
2. **Correlated and confounded inputs.** Duration, stops and route reference duration overlap; class and airline overlap (Premium Economy exists only for Vistara, Business only for Air India and Vistara), so airline effects partly reflect class mix. `days_left` equals the journey date in this data (single booking date), so its contribution mixes lead-time pricing with date-specific effects.
3. **Narrow explained range for lead time.** The explained rows only cover `days_left` 21-25 and 41-45.
4. **Baseline.** SHAP values are relative to the model's average prediction across classes (about 16,300), which is why Economy flights receive a large negative class term.
5. **Random Forest cost.** TreeExplainer on 1,500 rows took 414 s (the forest is 150 trees of depth up to 32); XGBoost took under a second.
6. **Potential biases.** One platform and one 7-week window; listed fares; predictions for rare airlines (StarAir, AllianceAir, Akasa) rest on little data; the model carries the 2023 price level (see `06-external-validation.md`).
