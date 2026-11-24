"""Phase 6 initial audit. Read-only: no model is fitted. Run (from backend/):  python -X utf8 -m ml.phase6_audit
Writes docs/06-audit-stats.json. Phase 5 test results are used here ONLY as historical benchmarks for diagnosis;
nothing in this script selects a model or a hyperparameter."""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from ml.models import SPACES
from ml.splits import SPLITS, load_model_frame

BACKEND = Path(__file__).resolve().parents[1]
DOCS = BACKEND.parent / "docs"
EXP = BACKEND / "experiments"
RAW_A = BACKEND / "data" / "raw" / "A_bathwal"
out: dict = {}

# ------------------------------------------------------------------ 1. search-boundary audit
def edge(space_vals, v):
    vals = list(space_vals)
    key = lambda x: (x is None, x if x is not None else 0)       # None (= unlimited depth) sorts last
    s = sorted(vals, key=key)
    return "max" if v == s[-1] else "min" if v == s[0] else "interior"

b = {}
for setup in ["primary", "group", "stress"]:
    fr = json.loads((EXP / setup / "frozen.json").read_text())
    for m in ["ridge", "random_forest", "xgboost", "gradient_boosting", "decision_tree"]:
        k = f"{m}|{fr['selected_target_by_validation'][m]}"
        e = fr["entries"][k]
        b.setdefault(m, {})[setup] = {p: {"selected": v, "position_in_grid": edge(SPACES[m][p], v), "grid": SPACES[m][p]}
                                      for p, v in e["params"].items()}
out["boundary_audit"] = b

# marginal sensitivity (mean subsample-fit validation MAE by value; log1p target; rough: few configs per value)
marg = {}
for setup in ["primary", "group", "stress"]:
    fr = json.loads((EXP / setup / "frozen.json").read_text())
    for m in ["random_forest", "xgboost"]:
        s = pd.DataFrame([{**c["params"], "mae": c["val_mae_subsample_fit"]} for c in fr["entries"][f"{m}|log1p"]["search"]])
        marg[f"{setup}:{m}"] = {p: {str(k): round(float(v)) for k, v in s.groupby(s[p].astype(str)).mae.mean().items()}
                                for p in SPACES[m]}
        marg[f"{setup}:{m}"]["n_configs"] = int(len(s))
        marg[f"{setup}:{m}"]["val_mae_best_worst"] = [round(float(s.mae.min())), round(float(s.mae.max()))]
out["search_marginals"] = marg

# ------------------------------------------------------------------ 2. validation-protocol flaw
sp_doc = json.loads((DOCS / "04-splits.json").read_text())
out["group_validation_overlap_with_group_train"] = sp_doc["split_group"]["overlap_val_vs_train"]
fr = json.loads((EXP / "group" / "results.json").read_text())
rf = fr["entries"]["random_forest|log1p"]
out["group_rf_log1p_val_vs_test_mae"] = {"val": rf["val"]["mae"], "test": rf["test"]["mae"]}

# ------------------------------------------------------------------ 3. unseen-flight weakness diagnosis (historical benchmark)
df = load_model_frame().set_index("row_id")
sp = pd.read_csv(SPLITS).set_index("row_id")
z = np.load(EXP / "group" / "test_predictions.npz")
t = df.loc[z["row_id"]].copy()
t["pred"] = z["random_forest__log1p"].astype(float)
t["ae"] = (t.pred - t.fare).abs()
t["ape"] = t.ae / t.fare
tr = df.loc[sp.index[sp.split_group == "train"]]
diag = {"rows": int(len(t)), "mae": float(t.ae.mean()), "mdape_pct": float(t.ape.median() * 100)}
codes = t.groupby("flight_code").agg(n=("fare", "size"), mae=("ae", "mean"), ae_sum=("ae", "sum"), mdape=("ape", "median"))
codes = codes.sort_values("ae_sum", ascending=False)
top = max(1, int(round(0.1 * len(codes))))
diag["held_out_codes_in_test"] = int(len(codes))
diag["share_of_total_abs_error_from_worst_10pct_codes"] = float(codes.ae_sum.head(top).sum() / codes.ae_sum.sum())
diag["share_of_rows_in_worst_10pct_codes"] = float(codes.n.head(top).sum() / codes.n.sum())
diag["per_code_median_of_mdape_pct"] = float(codes.mdape.median() * 100)
# how many training siblings does each test row's (airline, route, class) have?
sib = tr.groupby(["airline", "route", "travel_class"]).size().rename("n_siblings")
t = t.join(sib, on=["airline", "route", "travel_class"])
t["sib_bin"] = pd.cut(t.n_siblings.fillna(0), [-1, 50, 200, 500, 1000, 10**6])
diag["by_training_siblings_of_airline_route_class"] = {str(k): {"rows": int(len(g)), "mae": float(g.ae.mean()), "mdape_pct": float(g.ape.median() * 100)}
                                                      for k, g in t.groupby("sib_bin", observed=True)}
diag["by_stops_class"] = {f"{s}|{c}": {"rows": int(len(g)), "mae": float(g.ae.mean()), "mape_pct": float(g.ape.mean() * 100)}
                          for (s, c), g in t.groupby(["stops", "travel_class"])}
# lookups that need no flight identity (computed from group TRAIN only)
for name, cols in {"lookup_airline_route_class_stops": ["airline", "route", "travel_class", "stops"],
                   "lookup_airline_class_stops": ["airline", "travel_class", "stops"]}.items():
    med = tr.groupby(cols).fare.median().rename("lk")
    j = t.join(med, on=cols)
    j["lk"] = j.lk.fillna(tr.fare.median())
    diag[name] = {"mae": float((j.lk - j.fare).abs().mean()), "mdape_pct": float(((j.lk - j.fare).abs() / j.fare).median() * 100)}
# do identity-like inputs matter? error vs how unusual the itinerary's departure/duration is is not tested here (no refits)
out["unseen_flight_diagnosis_phase5_group_test_RF_log1p"] = diag

# ------------------------------------------------------------------ 4. Dataset A compatibility (read-only)
eco = pd.read_csv(RAW_A / "economy.csv").assign(travel_class="Economy")
biz = pd.read_csv(RAW_A / "business.csv").assign(travel_class="Business")
A = pd.concat([eco, biz], ignore_index=True)
raw_n = len(A)
A["airline"] = A.airline.str.strip()
A["flight_code"] = A.ch_code.str.strip() + "-" + A.num_code.astype(str)
A["fare"] = A.price.str.replace(",", "").astype(int)
A["stops"] = np.select([A.stop.str.contains("non-stop"), A.stop.str.strip().str.startswith("1-stop")], ["non-stop", "1-stop"], "2+-stop")
hm = A.time_taken.str.extract(r"^(\d+)h\s*(\d+)m$").astype(float)
malformed_duration = int(hm[0].isna().sum())          # e.g. "1.03h m": excluded, not guessed
A["duration_hours"] = hm[0] + hm[1] / 60
A = A[hm[0].notna()].copy()
d = A.dep_time.str.extract(r"(\d+):(\d+)").astype(int)
A["dep_minutes"] = d[0] * 60 + d[1]
A["days_left"] = (pd.to_datetime(A.date, format="%d-%m-%Y") - pd.Timestamp("2022-02-10")).dt.days
A["source"], A["destination"] = A["from"], A["to"]
A["route"] = A.source + "-" + A.destination
dupA = int(A.duplicated(["date", "flight_code", "route", "travel_class", "dep_minutes", "arr_time", "fare", "stop"]).sum())
E = df
eair = set(E.airline)
combos = set(zip(E.airline, E.travel_class, E.route))
A["supported_airline"] = A.airline.isin(eair)
A["supported_combo"] = [(a, c, r) in combos for a, c, r in zip(A.airline, A.travel_class, A.route)]
itin = ["airline", "flight_code", "route", "travel_class", "dep_minutes", "duration_hours", "stops"]
Ek = pd.MultiIndex.from_frame(E[itin].round({"duration_hours": 4}))
Ak = pd.MultiIndex.from_frame(A[itin].round({"duration_hours": 4}))
A["itinerary_in_E"] = Ak.isin(Ek)
A["code_in_E"] = A.flight_code.isin(set(E.flight_code))
common = A[A.supported_combo]
m = pd.merge(common[itin + ["days_left", "fare"]].round({"duration_hours": 4}), E[itin + ["days_left", "fare"]].round({"duration_hours": 4}),
             on=itin + ["days_left"], suffixes=("_A", "_E"))
ratio = (m.fare_A / m.fare_E)
out["dataset_A"] = {
    "raw_rows": int(raw_n), "excluded_malformed_duration_rows": malformed_duration, "exact_duplicates_estimate": dupA,
    "date_range": [str(pd.to_datetime(A.date, format="%d-%m-%Y").min().date()), str(pd.to_datetime(A.date, format="%d-%m-%Y").max().date())],
    "days_left_range": [int(A.days_left.min()), int(A.days_left.max())],
    "airlines_not_in_E": {k: int(v) for k, v in A[~A.supported_airline].airline.value_counts().items()},
    "rows_with_supported_airline_class_route": int(A.supported_combo.sum()),
    "rows_unsupported": int((~A.supported_combo).sum()),
    "classes": {k: int(v) for k, v in A.travel_class.value_counts().items()},
    "cities": sorted(set(A.source) | set(A.destination)),
    "share_rows_flight_code_also_in_E": float(A.code_in_E.mean()),
    "share_rows_exact_itinerary_also_in_E": float(A.itinerary_in_E.mean()),
    "median_fare_A_by_class": {k: float(v) for k, v in A.groupby("travel_class").fare.median().items()},
    "median_fare_E_by_class": {k: float(v) for k, v in E[E.travel_class.isin(["Economy", "Business"])].groupby("travel_class").fare.median().items()},
    "matched_itinerary_and_days_left_pairs": int(len(m)),
    "fare_ratio_A_over_E_on_matched_pairs": {q: float(ratio.quantile(q)) for q in [0.1, 0.25, 0.5, 0.75, 0.9]},
    "duration_range_A": [float(A.duration_hours.min()), float(A.duration_hours.max())],
    "stops_A": {k: int(v) for k, v in A.stops.value_counts().items()},
}
(DOCS / "06-audit-stats.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
print(json.dumps({k: out[k] for k in ["group_rf_log1p_val_vs_test_mae", "unseen_flight_diagnosis_phase5_group_test_RF_log1p", "dataset_A"]}, indent=1, default=str)[:7000])
