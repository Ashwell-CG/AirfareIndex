"""Phase 6 Stage A: hyperparameter optimisation on the DEV flight pool with flight-grouped validation.
    python -X utf8 -m ml.p6_tune [--smoke]
Uses ONLY DEV-pool flights (train date blocks to fit, validation date blocks of other DEV flights to score).
EVAL-pool flights and the test date blocks are never read for any decision. Writes experiments/phase6/tuning/."""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import ParameterSampler
from xgboost import XGBRegressor

from ml.p6_common import (EVAL_SEEDS, MODEL_SEED, POOL_SEED, SEARCH_SEED, TUNE_PARTITION_SEEDS, assign_pools, build_pre,
                          fit_candidate, itinerary_weights, load_frame, tuning_partition, xy)

BACKEND = Path(__file__).resolve().parents[1]
OUT = BACKEND / "experiments" / "phase6" / "tuning"             # final (round 2) results live here
OUT_R1 = BACKEND / "experiments" / "phase6" / "tuning_round1"
SUB = 60_000
ADOPT_MIN_GAIN = 0.01          # adopt a non-default representation/weight only if >=1% better on mean AND both partitions

RF_SPACE = {"min_samples_leaf": [5, 10, 20, 40, 80], "max_depth": [12, 16, 24, None],
            "max_features": [0.2, 0.33, 0.5, 0.7, 1.0], "max_samples": [0.3, 0.5, 0.8, None]}
XGB_SPACE = {"max_depth": [3, 4, 6, 8, 10], "min_child_weight": [1, 5, 20, 50, 100], "reg_lambda": [1, 10, 50],
             "reg_alpha": [0, 1, 10], "gamma": [0, 1, 5], "learning_rate": [0.03, 0.06, 0.1],
             "subsample": [0.5, 0.7, 0.9], "colsample_bytree": [0.5, 0.7, 0.9]}
# Round 2: refined around the round-1 optimum, extending edges that round 1 hit (RF max_features at its minimum, XGB subsample near its maximum)
RF_SPACE_R2 = {"min_samples_leaf": [20, 30, 40, 60, 80, 120], "max_depth": [16, 20, 24, 32, None],
               "max_features": [0.1, 0.15, 0.2, 0.25, 0.33], "max_samples": [0.5, 0.65, 0.8, 1.0]}
XGB_SPACE_R2 = {"max_depth": [4, 5, 6, 7, 8], "min_child_weight": [20, 35, 50, 75, 100, 150], "reg_lambda": [3, 10, 30],
                "reg_alpha": [0, 0.5, 2], "gamma": [0, 0.5, 2], "learning_rate": [0.03, 0.06], "subsample": [0.8, 0.9, 1.0],
                "colsample_bytree": [0.5, 0.6, 0.7, 0.8]}
RIDGE_ALPHAS = [float(a) for a in 10 ** np.linspace(-3, 5, 17)]   # widened after the first Stage A run selected the old maximum (1000)
P5_RF = {"n_estimators": 100, "min_samples_leaf": 5, "max_features": 0.7, "max_depth": None}
P5_XGB = {"n_estimators": 600, "learning_rate": 0.06, "max_depth": 10, "min_child_weight": 20, "subsample": 0.9, "colsample_bytree": 0.8}


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def mae(y, p):
    return float(np.abs(np.asarray(p, float) - np.asarray(y, float)).mean())


def xgb_es(params, Xtr, ytr, Xva, yva, variant="base", wp=0.0):
    """XGBoost on log1p(fare) with early stopping on the TUNING validation fold. Returns (val MAE in INR, best n_estimators, val pred INR)."""
    pre = build_pre("tree", variant).fit(Xtr)
    Z, Zv = pre.transform(Xtr), pre.transform(Xva)
    m = XGBRegressor(tree_method="hist", n_jobs=-1, random_state=MODEL_SEED, n_estimators=2000, early_stopping_rounds=50,
                     eval_metric="rmse", **params)
    m.fit(Z, np.log1p(ytr), sample_weight=itinerary_weights(Xtr, wp), eval_set=[(Zv, np.log1p(yva))], verbose=False)
    best = int(m.best_iteration) + 1
    pred = np.expm1(m.predict(Zv, iteration_range=(0, best)))
    return mae(yva, pred), best, pred


def run(smoke: bool = False, round_: int = 2):
    t0 = time.time()
    out = OUT.parent / "tuning_smoke" if smoke else (OUT if round_ == 2 else OUT_R1)
    rf_space, xgb_space = (RF_SPACE_R2, XGB_SPACE_R2) if round_ == 2 else (RF_SPACE, XGB_SPACE)
    out.mkdir(parents=True, exist_ok=True)
    df = load_frame()
    pool = assign_pools(df, POOL_SEED)
    parts = []
    rng = np.random.default_rng(SEARCH_SEED)
    for seed in TUNE_PARTITION_SEEDS:
        tr, va, vc = tuning_partition(df, pool, seed)
        assert set(tr.flight_code).isdisjoint(set(va.flight_code))
        assert set(tr.flight_code) | set(va.flight_code) <= {c for c, p in pool.items() if p == "DEV"}
        Xtr, ytr = xy(tr)
        Xva, yva = xy(va)
        sub = rng.choice(len(Xtr), size=min(SUB if not smoke else 8000, len(Xtr)), replace=False)
        parts.append({"seed": seed, "Xtr": Xtr, "ytr": ytr, "Xva": Xva, "yva": yva, "Xs": Xtr.iloc[sub], "ys": ytr.iloc[sub],
                      "n_train": len(Xtr), "n_val": len(Xva), "val_codes": len(vc)})
        log(f"partition {seed}: tuning-train {len(Xtr)} rows, tuning-val {len(Xva)} rows ({len(vc)} held-out DEV codes); search subsample {len(sub)}")
    n_rf, n_xgb = (3, 4) if smoke else ((30, 50) if round_ == 1 else (60, 100))
    rows, meta = [], {}

    # ---------------- 1. random search (subsample fits) ----------------
    log("stage 1: Random Forest random search")
    rf_cands = list(ParameterSampler(rf_space, n_iter=n_rf, random_state=SEARCH_SEED + (10 if round_ == 2 else 0)))
    if round_ == 2:        # carry the round-1 winners forward so round 2 cannot be worse than round 1 on the search criterion
        r1 = json.loads((OUT_R1 / "frozen_candidates.json").read_text())["candidates"]
        rf_cands.append({k: v for k, v in r1["rf_tuned"]["params"].items() if k != "n_estimators"})
    rf_res = []
    for i, c in enumerate(rf_cands):
        t = time.time()
        maes = [mae(p["yva"], fit_candidate("rf", c, p["Xs"], p["ys"]).predict(p["Xva"])) for p in parts]
        rf_res.append({"params": c, "val_mae": maes, "mean": float(np.mean(maes)), "seconds": time.time() - t})
        rows.append({"model": "rf", "stage": "search", "config": json.dumps(c), "mean_val_mae": float(np.mean(maes)), "p1": maes[0], "p2": maes[1]})
    log("stage 1: XGBoost random search (early stopping on tuning validation)")
    xgb_cands = list(ParameterSampler(xgb_space, n_iter=n_xgb, random_state=SEARCH_SEED + 1 + (10 if round_ == 2 else 0)))
    if round_ == 2:
        xgb_cands.append({k: v for k, v in r1["xgb_tuned"]["params"].items() if k != "n_estimators"})
    xgb_res = []
    for i, c in enumerate(xgb_cands):
        t = time.time()
        r = [xgb_es(c, p["Xs"], p["ys"], p["Xva"], p["yva"]) for p in parts]
        maes, bests = [x[0] for x in r], [x[1] for x in r]
        xgb_res.append({"params": c, "val_mae": maes, "best_iters": bests, "mean": float(np.mean(maes)), "seconds": time.time() - t})
        rows.append({"model": "xgb", "stage": "search", "config": json.dumps(c), "mean_val_mae": float(np.mean(maes)), "p1": maes[0], "p2": maes[1]})
    rf_res.sort(key=lambda r: r["mean"]); xgb_res.sort(key=lambda r: r["mean"])
    log(f"  RF best {rf_res[0]['mean']:.0f} worst {rf_res[-1]['mean']:.0f} | XGB best {xgb_res[0]['mean']:.0f} worst {xgb_res[-1]['mean']:.0f}")

    # ---------------- 2. finalists refit on the full tuning-train ----------------
    log("stage 2: top-3 refits on full tuning-train")
    def full_rf(c, variant="base", wp=0.0):
        preds = [fit_candidate("rf", c, p["Xtr"], p["ytr"], variant, wp).predict(p["Xva"]) for p in parts]
        return [mae(p["yva"], pr) for p, pr in zip(parts, preds)], preds
    def full_xgb(c, variant="base", wp=0.0):
        r = [xgb_es(c, p["Xtr"], p["ytr"], p["Xva"], p["yva"], variant, wp) for p in parts]
        return [x[0] for x in r], [x[1] for x in r], [x[2] for x in r]
    fin_rf = []
    for r in rf_res[:3]:
        m, _ = full_rf(r["params"]); fin_rf.append({"params": r["params"], "val_mae": m, "mean": float(np.mean(m))})
    fin_xgb = []
    for r in xgb_res[:3]:
        m, b, _ = full_xgb(r["params"]); fin_xgb.append({"params": r["params"], "val_mae": m, "best_iters": b, "mean": float(np.mean(m))})
    best_rf = min(fin_rf, key=lambda r: r["mean"]); best_xgb = min(fin_xgb, key=lambda r: r["mean"])
    log(f"  RF finalists {[round(r['mean']) for r in fin_rf]} -> {best_rf['params']}")
    log(f"  XGB finalists {[round(r['mean']) for r in fin_xgb]} -> {best_xgb['params']}")

    # ---------------- 3. controlled representation / weighting experiments ----------------
    log("stage 3: representation variants and sample weights")
    ablation = {"rf": [], "xgb": []}
    chosen = {}
    for kind, best in (("rf", best_rf), ("xgb", best_xgb)):
        def evalf(variant, wp):
            if kind == "rf":
                m, _ = full_rf(best["params"], variant, wp); return m
            m, _, _ = full_xgb(best["params"], variant, wp); return m
        base_m = best["val_mae"]
        ablation[kind].append({"variant": "base", "weight_power": 0.0, "val_mae": base_m, "mean": float(np.mean(base_m))})
        cur_variant, cur_m = "base", base_m
        for v in ["no_dep_minutes", "dep_window4", "duration_round_0.5h", "no_dep_and_round"]:
            m = evalf(v, 0.0); ablation[kind].append({"variant": v, "weight_power": 0.0, "val_mae": m, "mean": float(np.mean(m))})
            if np.mean(m) <= np.mean(cur_m) * (1 - ADOPT_MIN_GAIN) and all(a < b for a, b in zip(m, base_m)) and np.mean(m) < np.mean(cur_m):
                cur_variant, cur_m = v, m
        cur_wp = 0.0
        for wp in [0.5, 1.0]:
            m = evalf(cur_variant, wp); ablation[kind].append({"variant": cur_variant, "weight_power": wp, "val_mae": m, "mean": float(np.mean(m))})
            if np.mean(m) <= np.mean(cur_m) * (1 - ADOPT_MIN_GAIN) and all(a < b for a, b in zip(m, cur_m)) and np.mean(m) < np.mean(cur_m):
                cur_wp, cur_m = wp, m
        chosen[kind] = {"variant": cur_variant, "weight_power": cur_wp}
        log(f"  {kind}: adopted variant={cur_variant} weight_power={cur_wp} (base {np.mean(base_m):.0f} -> {np.mean(cur_m):.0f})")

    # ---------------- 4. final finalist fits (stored validation predictions) ----------------
    log("stage 4: finalist predictions for blends")
    m_rf, pr_rf = full_rf(best_rf["params"], chosen["rf"]["variant"], chosen["rf"]["weight_power"])
    m_xgb, b_xgb, pr_xgb = full_xgb(best_xgb["params"], chosen["xgb"]["variant"], chosen["xgb"]["weight_power"])
    xgb_n = int(round(np.mean(b_xgb) * 1.10))        # +10% trees because final fits use more data
    ridge_res = []
    for a in RIDGE_ALPHAS:
        preds = [fit_candidate("ridge", {"alpha": a}, p["Xtr"], p["ytr"]).predict(p["Xva"]) for p in parts]
        ridge_res.append({"alpha": a, "val_mae": [mae(p["yva"], pr) for p, pr in zip(parts, preds)], "preds": preds})
    best_ridge = min(ridge_res, key=lambda r: np.mean(r["val_mae"]))
    from ml.p6_common import RouteLookup
    pr_lk = [RouteLookup().fit(p["Xtr"], p["ytr"]).predict(p["Xva"]) for p in parts]
    m_lk = [mae(p["yva"], pr) for p, pr in zip(parts, pr_lk)]
    P = {"rf": pr_rf, "xgb": pr_xgb, "ridge": best_ridge["preds"], "lookup": pr_lk}
    blends = {}
    for a, b in [("rf", "ridge"), ("rf", "xgb"), ("rf", "lookup"), ("xgb", "lookup")]:
        best = None
        for w in [0.25, 0.5, 0.75]:
            m = [mae(p["yva"], np.expm1(w * np.log1p(np.clip(P[a][i], 0, None)) + (1 - w) * np.log1p(np.clip(P[b][i], 0, None)))) for i, p in enumerate(parts)]
            if best is None or np.mean(m) < best["mean"]:
                best = {"members": [a, b], "weights": [w, 1 - w], "val_mae": m, "mean": float(np.mean(m))}
        blends[f"blend_{a}_{b}"] = best

    # ---------------- 5. Phase 5 configurations as references under the new protocol ----------------
    log("stage 5: Phase 5 configurations as references")
    m5_rf, _ = full_rf(P5_RF)
    # Phase 5 XGBoost reference is fitted exactly as in Phase 5: fixed 600 trees, no early stopping
    m5_xgb = [mae(p["yva"], fit_candidate("xgb", P5_XGB, p["Xtr"], p["ytr"]).predict(p["Xva"])) for p in parts]

    frozen = {
        "created_utc": datetime.now(timezone.utc).isoformat(), "smoke": smoke,
        "seeds": {"pool": POOL_SEED, "tuning_partitions": TUNE_PARTITION_SEEDS, "search": SEARCH_SEED, "model": MODEL_SEED, "eval_seeds": EVAL_SEEDS},
        "protocol": {"round": round_, "rf_space": rf_space, "xgb_space": xgb_space, "n_rf_configs": len(rf_cands), "n_xgb_configs": len(xgb_cands), "pool_fraction_dev": 0.5, "tuning_val_code_fraction_of_dev": 0.30, "search_subsample_rows": SUB, "adopt_min_gain": ADOPT_MIN_GAIN,
                     "partitions": [{k: p[k] for k in ("seed", "n_train", "n_val", "val_codes")} for p in parts]},
        "candidates": {
            "rf_tuned": {"kind": "rf", "params": {**best_rf["params"], "n_estimators": 150}, **chosen["rf"], "dev_val_mae": m_rf, "dev_val_mae_mean": float(np.mean(m_rf))},
            "xgb_tuned": {"kind": "xgb", "params": {**best_xgb["params"], "n_estimators": xgb_n}, **chosen["xgb"], "dev_val_mae": m_xgb,
                          "dev_val_mae_mean": float(np.mean(m_xgb)), "early_stopping_best_iters": b_xgb},
            "ridge": {"kind": "ridge", "params": {"alpha": best_ridge["alpha"]}, "variant": "base", "weight_power": 0.0,
                      "dev_val_mae": best_ridge["val_mae"], "dev_val_mae_mean": float(np.mean(best_ridge["val_mae"]))},
            "route_lookup": {"kind": "lookup", "params": {}, "variant": "base", "weight_power": 0.0, "dev_val_mae": m_lk, "dev_val_mae_mean": float(np.mean(m_lk))},
            "rf_phase5cfg": {"kind": "rf", "params": P5_RF, "variant": "base", "weight_power": 0.0, "dev_val_mae": m5_rf, "dev_val_mae_mean": float(np.mean(m5_rf))},
            "xgb_phase5cfg": {"kind": "xgb", "params": dict(P5_XGB), "variant": "base", "weight_power": 0.0, "dev_val_mae": m5_xgb, "dev_val_mae_mean": float(np.mean(m5_xgb))},
        },
        "blends": blends,
        "search": {"rf": rf_res, "xgb": xgb_res, "rf_finalists": fin_rf, "xgb_finalists": fin_xgb,
                   "ridge": [{k: v for k, v in r.items() if k != "preds"} for r in ridge_res], "ablation": ablation},
        "wall_seconds": time.time() - t0,
    }
    (out / "frozen_candidates.json").write_text(json.dumps(frozen, indent=1, default=str), encoding="utf-8")
    pd.DataFrame(rows).to_csv(out / "tuning_log.csv", index=False)
    log("DEV validation MAE (mean of 2 partitions, INR): " + ", ".join(f"{k}={v['dev_val_mae_mean']:.0f}" for k, v in frozen["candidates"].items())
        + " | blends " + ", ".join(f"{k}={v['mean']:.0f}" for k, v in blends.items()))
    log(f"Stage A done in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--smoke", action="store_true"); ap.add_argument("--round", type=int, default=2)
    a = ap.parse_args(); run(a.smoke, a.round)
