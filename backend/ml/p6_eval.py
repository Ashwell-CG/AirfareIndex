"""Phase 6 Stage B: multi-seed unseen-flight evaluation on the EVAL pool.
    python -X utf8 -m ml.p6_eval [--smoke]      then aggregation is written automatically
Hyperparameters come from frozen_candidates.json (Stage A, DEV pool only). For every seed the held-out test codes are drawn
from the EVAL pool and NEVER appear in the rows used to fit that seed's models. Two training recipes are compared:
T (train date blocks) and TV (train + validation date blocks). Test date blocks are used only as the scoring rows."""
from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from ml.evaluation import grouped, metrics
from ml.p6_common import EVAL_SEEDS, LogBlend, POOL_SEED, assign_pools, eval_split, fit_candidate, load_frame, xy

BACKEND = Path(__file__).resolve().parents[1]
TUNE = BACKEND / "experiments" / "phase6" / "tuning" / "frozen_candidates.json"
OUT = BACKEND / "experiments" / "phase6" / "multiseed"
BASE = ["rf_tuned", "xgb_tuned", "ridge", "route_lookup", "rf_phase5cfg", "xgb_phase5cfg"]
MEMBER = {"rf": "rf_tuned", "xgb": "xgb_tuned", "ridge": "ridge", "lookup": "route_lookup"}


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def fit_all(frozen, Xtr, ytr):
    fitted, secs = {}, {}
    for name in BASE:
        c = frozen["candidates"][name]
        t = time.perf_counter()
        fitted[name] = fit_candidate(c["kind"], c["params"], Xtr, ytr, c.get("variant", "base"), c.get("weight_power", 0.0))
        secs[name] = time.perf_counter() - t
    for bname, b in frozen["blends"].items():
        fitted[bname] = LogBlend([fitted[MEMBER[m]] for m in b["members"]], b["weights"])
        secs[bname] = sum(secs[MEMBER[m]] for m in b["members"])
    return fitted, secs


def run(smoke=False):
    t0 = time.time()
    tune = TUNE
    frozen = json.loads(tune.read_text())
    frozen_sha = hashlib.sha256(tune.read_bytes()).hexdigest()
    out = OUT.parent / "multiseed_smoke" if smoke else OUT
    out.mkdir(parents=True, exist_ok=True)
    resf = out / "results.json"
    res = json.loads(resf.read_text()) if resf.exists() else {"frozen_sha256": frozen_sha, "records": []}
    assert res["frozen_sha256"] == frozen_sha, "frozen candidates changed since this run started"
    done = {(r["seed"], r["recipe"]) for r in res["records"]}
    df = load_frame()
    pool = assign_pools(df, POOL_SEED)
    seeds = EVAL_SEEDS[:2] if smoke else EVAL_SEEDS
    for seed in seeds:
        for recipe in ["T", "TV"]:
            if (seed, recipe) in done:
                continue
            tr, te, codes = eval_split(df, pool, seed, recipe)
            Xtr, ytr = xy(tr); Xte, yte = xy(te)
            if smoke:
                Xtr = Xtr.sample(30000, random_state=0); ytr = ytr.loc[Xtr.index]
            fitted, secs = fit_all(frozen, Xtr, ytr)
            cls = Xte["travel_class"].to_numpy()
            rec = {"seed": seed, "recipe": recipe, "train_rows": int(len(Xtr)), "test_rows": int(len(Xte)),
                   "test_codes": len(codes), "test_codes_sha": hashlib.sha256(",".join(sorted(codes)).encode()).hexdigest()[:16],
                   "train_test_code_overlap": len(set(tr.flight_code) & set(te.flight_code)), "candidates": {}}
            assert rec["train_test_code_overlap"] == 0
            for name, m in fitted.items():
                t = time.perf_counter(); p = m.predict(Xte); inf = time.perf_counter() - t
                rec["candidates"][name] = {"metrics": metrics(yte, p), "by_class": grouped(yte, p, cls), "fit_seconds": secs[name],
                                           "predict_us_per_row": inf / len(Xte) * 1e6}
            res["records"].append(rec)
            resf.write_text(json.dumps(res, indent=1, default=str), encoding="utf-8")
            log(f"seed {seed} recipe {recipe}: train {rec['train_rows']} test {rec['test_rows']} ({rec['test_codes']} held-out codes) | "
                + ", ".join(f"{k}={v['metrics']['mae']:.0f}" for k, v in rec["candidates"].items()))
    aggregate(out, res, frozen)
    log(f"Stage B done in {time.time()-t0:.0f}s")


def aggregate(out: Path, res: dict, frozen: dict) -> None:
    recs = res["records"]
    names = sorted({n for r in recs for n in r["candidates"]})
    agg = {"frozen_sha256": res["frozen_sha256"], "seeds": sorted({r["seed"] for r in recs}), "recipes": {}}
    rows = []
    for recipe in ["T", "TV"]:
        rr = [r for r in recs if r["recipe"] == recipe]
        if not rr:
            continue
        A = {}
        for n in names:
            d = {}
            for k in ["mae", "rmse", "r2", "mape_pct", "mdape_pct", "bias_inr"]:
                v = np.array([r["candidates"][n]["metrics"][k] for r in rr])
                d[k] = {"mean": float(v.mean()), "std": float(v.std(ddof=1)) if len(v) > 1 else 0.0, "min": float(v.min()), "max": float(v.max())}
            d["by_class"] = {}
            for c in ["Economy", "Premium Economy", "Business"]:
                d["by_class"][c] = {k: {"mean": float(np.mean([r["candidates"][n]["by_class"][c][k] for r in rr])),
                                        "std": float(np.std([r["candidates"][n]["by_class"][c][k] for r in rr], ddof=1)) if len(rr) > 1 else 0.0}
                                    for k in ["mae", "mape_pct", "r2"]}
                d["by_class"][c]["mdape_pct"] = {"mean": float(np.mean([_mdape(r["candidates"][n]["by_class"][c]) for r in rr]))}
            d["fit_seconds_mean"] = float(np.mean([r["candidates"][n]["fit_seconds"] for r in rr]))
            d["predict_us_per_row_mean"] = float(np.mean([r["candidates"][n]["predict_us_per_row"] for r in rr]))
            A[n] = d
            rows.append({"recipe": recipe, "candidate": n, "n_seeds": len(rr), **{f"{k}_{s}": d[k][s] for k in ["mae", "rmse", "r2", "mape_pct", "mdape_pct", "bias_inr"] for s in ["mean", "std"]}})
        # paired differences in MAE across seeds
        P = {}
        for ref in ["route_lookup", "ridge", "rf_phase5cfg"]:
            P[ref] = {}
            for n in names:
                diff = np.array([r["candidates"][n]["metrics"]["mae"] - r["candidates"][ref]["metrics"]["mae"] for r in rr])
                P[ref][n] = {"mean_diff": float(diff.mean()), "std_diff": float(diff.std(ddof=1)) if len(diff) > 1 else 0.0,
                             "se": float(diff.std(ddof=1) / np.sqrt(len(diff))) if len(diff) > 1 else 0.0, "seeds_better": int((diff < 0).sum()), "n": len(diff)}
        agg["recipes"][recipe] = {"candidates": A, "paired_mae_diff_vs": P, "n_seeds": len(rr)}
    # recipe decision (rule fixed before looking: TV adopted if it is not worse than T by >0.5% MAE for a majority of the tuned finalists)
    if {"T", "TV"} <= set(agg["recipes"]):
        fin = ["rf_tuned", "xgb_tuned", "ridge"] + [b for b in frozen["blends"]]
        ok = [agg["recipes"]["TV"]["candidates"][n]["mae"]["mean"] <= 1.005 * agg["recipes"]["T"]["candidates"][n]["mae"]["mean"] for n in fin]
        agg["recipe_decision"] = {"rule": "TV if mean MAE(TV) <= 1.005 * mean MAE(T) for a majority of finalists", "candidates_checked": fin,
                                  "tv_ok": dict(zip(fin, map(bool, ok))), "chosen": "TV" if sum(ok) > len(ok) / 2 else "T",
                                  "relative_change_TV_vs_T_pct": {n: float((agg["recipes"]["TV"]["candidates"][n]["mae"]["mean"] / agg["recipes"]["T"]["candidates"][n]["mae"]["mean"] - 1) * 100) for n in fin}}
    (out / "aggregate.json").write_text(json.dumps(agg, indent=1), encoding="utf-8")
    pd.DataFrame(rows).to_csv(out / "aggregate.csv", index=False)


def _mdape(cm: dict) -> float:
    return cm.get("mdape_pct", float("nan"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--smoke", action="store_true"); run(ap.parse_args().smoke)
