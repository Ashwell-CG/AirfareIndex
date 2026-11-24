"""Builds the small read-only JSON resources the API serves. Reads (never writes) the cleaned dataset and experiment outputs.
    python -X utf8 scripts/build_app_resources.py     (from backend/)
Outputs: app/resources/duration_hints.json, app/resources/insights.json"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

B = Path(__file__).resolve().parents[1]
OUT = B / "app" / "resources"
OUT.mkdir(parents=True, exist_ok=True)
P6 = B / "experiments" / "phase6"

# ---- typical durations per route and stops (from the cleaned training data, model frame: First class excluded)
df = pd.read_csv(B / "data" / "processed" / "airfare_e_clean.csv")
df = df[df.travel_class != "First"]
df["route"] = df.source + "-" + df.destination
hints = {}
for (route, stops), g in df.groupby(["route", "stops"]):
    q = g.duration_hours.quantile([0.1, 0.5, 0.9])
    hints.setdefault(route, {})[stops] = {"typical": round(float(q[0.5]), 2), "p10": round(float(q[0.1]), 2), "p90": round(float(q[0.9]), 2), "n": int(len(g))}
(OUT / "duration_hints.json").write_text(json.dumps(hints, indent=1), encoding="utf-8")

# ---- model insights (numbers read from Phase 6 outputs)
agg = json.loads((P6 / "multiseed" / "aggregate.json").read_text())["recipes"]["TV"]["candidates"]["blend_rf_lookup"]
seen = json.loads((P6 / "seen_flight" / "results.json").read_text())["candidates"]["blend_rf_lookup"]["overall"]
ext = json.loads((P6 / "external" / "results.json").read_text())["candidates"]["blend_rf_lookup"]
shap = json.loads((P6 / "explain" / "explain_results.json").read_text())["rf_tuned"]
imp = shap["mean_abs_shap_by_input_feature"]
tot = sum(imp.values())
labels = {"travel_class": "Travel class", "airline": "Airline", "days_left": "Days before departure", "duration_hours": "Flight duration",
          "source": "Origin city", "destination": "Destination city", "stops": "Number of stops", "duration_ratio": "Duration vs direct flight",
          "route_ref_duration_hours": "Route length", "dep_minutes": "Departure time"}
factors = [{"key": k, "label": labels[k], "share_pct": round(100 * v / tot, 1)} for k, v in sorted(imp.items(), key=lambda kv: -kv[1])]
cmp_ = json.loads((P6 / "multiseed" / "aggregate.json").read_text())["recipes"]["TV"]["candidates"]
insights = {
    "factors": factors,
    "factor_note": "Share of the Random Forest component's total mean absolute SHAP contribution on 1,500 held-out rows. Departure time is not used by this model version.",
    "evaluation": {
        "unseen_flights": {"draws": 10, "mae_inr": round(agg["mae"]["mean"]), "mae_sd_inr": round(agg["mae"]["std"]), "median_ape_pct": round(agg["mdape_pct"]["mean"], 1),
                          "median_ape_sd_pct": round(agg["mdape_pct"]["std"], 1), "r2": round(agg["r2"]["mean"], 3),
                          "by_class_mae_inr": {c: round(v["mae"]["mean"]) for c, v in agg["by_class"].items()}},
        "seen_flights": {"mae_inr": round(seen["mae"]), "median_ape_pct": round(seen["mdape_pct"], 1), "r2": round(seen["r2"], 3)},
        "other_period_2022": {"median_ape_pct": round(ext["overall"]["mdape_pct"], 1), "economy_median_pred_over_actual": round(ext["level_shift"]["Economy"]["median_pred_over_actual"], 2)},
        "comparison_unseen_mae_inr": [{"model": n, "mae_inr": round(cmp_[n]["mae"]["mean"]), "median_ape_pct": round(cmp_[n]["mdape_pct"]["mean"], 1)}
                                      for n in ["blend_rf_lookup", "rf_tuned", "route_lookup", "xgb_tuned", "ridge"]],
    },
    "directions": [
        {"factor": "Travel class", "text": "Class is the strongest factor: in the training data Business fares are several times higher than Economy, with Premium Economy in between."},
        {"factor": "Airline", "text": "Airlines sit at different typical price levels (for example low-cost carriers lower, full-service carriers higher), partly because class availability differs by airline."},
        {"factor": "Flight duration", "text": "Very short itineraries are estimated lower; beyond a few hours the estimate changes little."},
        {"factor": "Days before departure", "text": "In the training data, bookings made further ahead tend to have lower listed fares, with most of the difference within the last 2 to 3 weeks."},
        {"factor": "Number of stops", "text": "Non-stop itineraries tend to be estimated lower than itineraries with stops."},
    ],
}
(OUT / "insights.json").write_text(json.dumps(insights, indent=1), encoding="utf-8")
print("routes with hints:", len(hints), "| factors:", [(f["label"], f["share_pct"]) for f in factors][:6])
print(json.dumps(insights["evaluation"], indent=0)[:700])
