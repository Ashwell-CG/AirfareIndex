"""Phase 6 Stage C: Dataset A as a temporal/market-shift check (NO training, NO tuning, NO recalibration on A).
    python -X utf8 -m ml.p6_external
Dataset A (EaseMyTrip, Feb-Mar 2022) is mapped to Dataset E's 8 model inputs from the raw economy/business files. The frozen
candidates (trained on E only) predict A as-is. Results are INR metrics plus level-shift diagnostics."""
from __future__ import annotations

import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.evaluation import metrics
from ml.p6_common import LogBlend, RAW_INPUTS, load_frame
from ml.p6_eval import BASE, MEMBER, TUNE

BACKEND = Path(__file__).resolve().parents[1]
RAW_A = BACKEND / "data" / "raw" / "A_bathwal"
SAVE = BACKEND / "saved_models" / "phase6_candidates"
OUT = BACKEND / "experiments" / "phase6" / "external"
A_BOOKING_ANCHOR = pd.Timestamp("2022-02-10")      # days_left = date - anchor (verified on matched rows in Phase 2)


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def load_dataset_a(E: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    eco = pd.read_csv(RAW_A / "economy.csv").assign(travel_class="Economy")
    biz = pd.read_csv(RAW_A / "business.csv").assign(travel_class="Business")
    A = pd.concat([eco, biz], ignore_index=True)
    log_ = {"raw_rows": int(len(A))}
    hm = A.time_taken.str.extract(r"^(\d+)h\s*(\d+)m$").astype(float)
    bad = hm[0].isna()
    log_["excluded_malformed_duration"] = int(bad.sum())
    A = A[~bad].copy(); hm = hm[~bad]
    A["duration_hours"] = hm[0] + hm[1] / 60
    A["airline"] = A.airline.str.strip()
    A["flight_code"] = A.ch_code.str.strip() + "-" + A.num_code.astype(str)       # only for segmentation, never a model input
    A["fare"] = A.price.str.replace(",", "").astype(int)
    A["stops"] = np.select([A.stop.str.contains("non-stop"), A.stop.str.strip().str.startswith("1-stop")], ["non-stop", "1-stop"], "2+-stop")
    d = A.dep_time.str.extract(r"^(\d+):(\d+)$").astype(int)
    A["dep_minutes"] = d[0] * 60 + d[1]
    A["days_left"] = (pd.to_datetime(A.date, format="%d-%m-%Y") - A_BOOKING_ANCHOR).dt.days
    A["source"], A["destination"] = A["from"], A["to"]
    A["route"] = A.source + "-" + A.destination
    before = len(A)
    A = A.drop_duplicates(["date", "flight_code", "route", "travel_class", "dep_minutes", "arr_time", "fare", "stop"])
    log_["excluded_exact_duplicates"] = int(before - len(A))
    combos = set(zip(E.airline, E.travel_class, E.route))
    ok_air = A.airline.isin(set(E.airline))
    ok_combo = pd.Series([(a, c, r) in combos for a, c, r in zip(A.airline, A.travel_class, A.route)], index=A.index)
    log_["excluded_airline_not_in_E"] = {k: int(v) for k, v in A[~ok_air].airline.value_counts().items()}
    log_["excluded_unsupported_airline_class_route_total"] = int((~ok_combo).sum())
    A = A[ok_combo].copy()
    log_["rows_evaluated"] = int(len(A))
    log_["days_left_range"] = [int(A.days_left.min()), int(A.days_left.max())]
    log_["duration_range"] = [float(A.duration_hours.min()), float(A.duration_hours.max())]
    log_["rows_duration_above_E_max"] = int((A.duration_hours > E.duration_hours.max()).sum())
    return A.reset_index(drop=True), log_


def main():
    frozen = json.loads(TUNE.read_text())
    E = load_frame()
    A, info = load_dataset_a(E)
    cand = json.loads((BACKEND / "experiments" / "phase6" / "candidates_training.json").read_text())
    roles = ["train"] if cand["recipe"] == "T" else ["train", "val"]
    Etr = E[E.role.isin(roles)]
    A["code_in_E_train"] = A.flight_code.isin(set(Etr.flight_code))
    itin = ["airline", "flight_code", "route", "travel_class", "dep_minutes", "duration_hours", "stops"]
    ek = pd.MultiIndex.from_frame(Etr[itin].round({"duration_hours": 4}))
    A["itinerary_in_E_train"] = pd.MultiIndex.from_frame(A[itin].round({"duration_hours": 4})).isin(ek)
    info["share_flight_code_in_E_training"] = float(A.code_in_E_train.mean())
    info["share_itinerary_in_E_training"] = float(A.itinerary_in_E_train.mean())
    X, y = A[RAW_INPUTS], A.fare
    models = {n: joblib.load(SAVE / f"{n}.joblib") for n in BASE}
    for b, spec in frozen["blends"].items():
        models[b] = LogBlend([models[MEMBER[m]] for m in spec["members"]], spec["weights"])
    res = {"dataset_a": info, "candidates": {}, "note": "no tuning, no recalibration, no training on Dataset A; same platform (EaseMyTrip), different year"}
    for n, m in models.items():
        t = time.perf_counter(); p = m.predict(X); sec = time.perf_counter() - t
        r = {"overall": metrics(y, p), "predict_seconds": sec, "by_class": {}, "by_segment": {}, "level_shift": {}}
        for c in ["Economy", "Business"]:
            mk = (A.travel_class == c).to_numpy()
            r["by_class"][c] = metrics(y[mk], p[mk])
            r["level_shift"][c] = {"median_pred_over_actual": float(np.median(p[mk] / y[mk])), "actual_median": float(y[mk].median()), "pred_median": float(np.median(p[mk]))}
        for seg, mk in {"itinerary_in_E_training": A.itinerary_in_E_train, "itinerary_not_in_E_training": ~A.itinerary_in_E_train,
                        "flight_code_in_E_training": A.code_in_E_train, "flight_code_not_in_E_training": ~A.code_in_E_train}.items():
            mk = mk.to_numpy()
            if mk.sum() > 100:
                r["by_segment"][seg] = {**metrics(y[mk], p[mk]), "rows": int(mk.sum())}
        res["candidates"][n] = r
        log(f"{n:18s} MAE {r['overall']['mae']:8.0f}  RMSE {r['overall']['rmse']:8.0f}  R2 {r['overall']['r2']:.3f}  MdAPE {r['overall']['mdape_pct']:5.1f}%  "
            f"bias {r['overall']['bias_inr']:8.0f}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
