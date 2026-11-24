"""Phase 6 Stage E: final model selection (pre-registered rule), final training, packaging and checks.
    python -X utf8 -m ml.p6_select

Selection rule (fixed before results were read, written in docs/06-final-model-selection.md):
  eligible = trained models and trained blends (the route lookup is a reference baseline and is not eligible).
  1. Rank by mean MAE over the unseen-flight seeds (chosen recipe). Candidates statistically/materially tied with the best are kept:
     mean paired MAE difference vs the best <= max(2 * SE of the paired differences, 1% of the best mean MAE).
  2. Among the tied set choose the lowest weighted rank sum over: seed stability (std of MAE) w=6, MAE and median APE (mean rank) w=5,
     Dataset A MAE and median APE (mean rank) w=4, single-row p95 latency w=3, file size w=2, explainability w=1
     (explainability score: Ridge 3 > single tree ensemble with SHAP 2 > blend 1).
"""
from __future__ import annotations

import hashlib
import json
import platform
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost

from ml.evaluation import grouped, metrics
from ml.p6_common import LogBlend, RAW_INPUTS, fit_candidate, load_frame, xy
from ml.p6_eval import MEMBER, TUNE
from ml.inference import load_options, predict_fares

BACKEND = Path(__file__).resolve().parents[1]
P6 = BACKEND / "experiments" / "phase6"
SAVE = BACKEND / "saved_models" / "phase6_candidates"
FINAL = BACKEND / "saved_models" / "final"
EXPLAIN_SCORE = {"ridge": 3, "rf_tuned": 2, "xgb_tuned": 2}


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def rank(vals: dict[str, float]) -> dict[str, float]:
    s = pd.Series(vals).rank(method="average")
    return s.to_dict()


def select() -> dict:
    agg = json.loads((P6 / "multiseed" / "aggregate.json").read_text())
    recipe = agg["recipe_decision"]["chosen"]
    C = agg["recipes"][recipe]["candidates"]
    PD = agg["recipes"][recipe]["paired_mae_diff_vs"]
    ext = json.loads((P6 / "external" / "results.json").read_text())["candidates"]
    bench = json.loads((P6 / "benchmark" / "benchmark.json").read_text())
    elig = [n for n in C if n != "route_lookup" and not n.endswith("phase5cfg")]
    elig_all = elig                                                   # Phase 5 configs are reference rows, not eligible
    best = min(elig, key=lambda n: C[n]["mae"]["mean"])
    # paired differences vs the best, from stored per-seed records
    recs = [r for r in json.loads((P6 / "multiseed" / "results.json").read_text())["records"] if r["recipe"] == recipe]
    tied, diffs = [], {}
    for n in elig:
        d = np.array([r["candidates"][n]["metrics"]["mae"] - r["candidates"][best]["metrics"]["mae"] for r in recs])
        se = d.std(ddof=1) / np.sqrt(len(d)) if len(d) > 1 else 0.0
        thr = max(2 * se, 0.01 * C[best]["mae"]["mean"])
        diffs[n] = {"mean_diff_vs_best": float(d.mean()), "se": float(se), "tie_threshold": float(thr), "tied": bool(d.mean() <= thr)}
        if d.mean() <= thr:
            tied.append(n)
    scores = {}
    if len(tied) == 1:
        chosen = tied[0]
    else:
        r_std = rank({n: C[n]["mae"]["std"] for n in tied})
        r_acc = {n: (rank({m: C[m]["mae"]["mean"] for m in tied})[n] + rank({m: C[m]["mdape_pct"]["mean"] for m in tied})[n]) / 2 for n in tied}
        r_ext = {n: (rank({m: ext[m]["overall"]["mae"] for m in tied})[n] + rank({m: ext[m]["overall"]["mdape_pct"] for m in tied})[n]) / 2 for n in tied}
        r_lat = rank({n: bench[n]["single_row_latency_ms_1thread"]["p95"] for n in tied})
        r_size = rank({n: bench[n]["file_bytes"] for n in tied})
        expl = {n: EXPLAIN_SCORE.get(n, 1) for n in tied}
        r_exp = rank({n: -expl[n] for n in tied})
        for n in tied:
            scores[n] = {"stability": r_std[n], "mae_mdape": r_acc[n], "external": r_ext[n], "latency_p95": r_lat[n], "size": r_size[n], "explainability": r_exp[n],
                         "weighted_rank_sum": 6 * r_std[n] + 5 * r_acc[n] + 4 * r_ext[n] + 3 * r_lat[n] + 2 * r_size[n] + 1 * r_exp[n]}
        chosen = min(tied, key=lambda n: scores[n]["weighted_rank_sum"])
    ref_lookup = {"mae_mean": C["route_lookup"]["mae"]["mean"], "mdape_mean": C["route_lookup"]["mdape_pct"]["mean"]}
    return {"recipe": recipe, "eligible": elig_all, "best_by_unseen_mae": best, "tie_analysis": diffs, "tied_set": tied, "scores_on_tied_set": scores,
            "chosen": chosen, "reference_route_lookup_unseen": ref_lookup, "unseen_mean_mae": {n: C[n]["mae"]["mean"] for n in C}}


def build_final(chosen: str, recipe: str, frozen: dict):
    df = load_frame()
    tr = df[df.role.isin(["train"] if recipe == "T" else ["train", "val"])]
    assert "test" not in set(tr.role)
    Xtr, ytr = xy(tr)
    if chosen in frozen["blends"]:
        b = frozen["blends"][chosen]
        mem = []
        for m in b["members"]:
            c = frozen["candidates"][MEMBER[m]]
            mem.append(fit_candidate(c["kind"], c["params"], Xtr, ytr, c.get("variant", "base"), c.get("weight_power", 0.0)))
        model = LogBlend(mem, b["weights"]); cfg = {"blend": b, "members": {m: frozen["candidates"][MEMBER[m]] for m in b["members"]}}
    else:
        c = frozen["candidates"][chosen]
        model = fit_candidate(c["kind"], c["params"], Xtr, ytr, c.get("variant", "base"), c.get("weight_power", 0.0)); cfg = c
    return model, cfg, tr


def main():
    sel = select()
    log(f"selection: best by unseen MAE = {sel['best_by_unseen_mae']}; tied set = {sel['tied_set']}; chosen = {sel['chosen']}")
    frozen = json.loads(TUNE.read_text())
    t0 = time.time()
    model, cfg, tr = build_final(sel["chosen"], sel["recipe"], frozen)
    fit_s = time.time() - t0
    FINAL.mkdir(parents=True, exist_ok=True)
    path = FINAL / "airfare_model.joblib"
    joblib.dump(model, path, compress=3)
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    # reproducibility: compare with the candidate artifact trained earlier with the same frozen configuration
    df = load_frame()
    test_rows = df[df.role == "test"]
    Xt, yt = xy(test_rows)
    p_final = np.asarray(joblib.load(path).predict(Xt), float)
    cand_file = SAVE / f"{sel['chosen']}.joblib"
    repro = {}
    if cand_file.exists():
        p_c = np.asarray(joblib.load(cand_file).predict(Xt), float)
        repro["max_abs_diff_vs_candidate_artifact_inr"] = float(np.abs(p_c - p_final).max())
    # finite/positive over every supported combination (synthetic grid) and over the test blocks
    o = load_options(); grid = []
    for a, cl in o["airline_class_routes"].items():
        for c, v in cl.items():
            for r in v["routes"]:
                s_, d_ = r.split("-")
                for st in o["stops"]:
                    lo, hi = o["duration_hours_range_by_stops"][st]
                    for dur in (lo, (lo + hi) / 2, hi):
                        for dl in (1, 25, 50):
                            for dep in (0, 720, 1439):
                                grid.append({"airline": a, "travel_class": c, "source": s_, "destination": d_, "stops": st, "duration_hours": dur, "days_left": dl, "dep_minutes": dep})
    G = pd.DataFrame(grid)
    pg = predict_fares(joblib.load(path), G)
    repro["supported_grid_rows"] = int(len(G)); repro["grid_all_finite_positive"] = bool(np.isfinite(pg).all() and (pg > 0).all())
    repro["grid_pred_min_max"] = [float(pg.min()), float(pg.max())]
    repro["test_block_rows"] = int(len(Xt)); repro["test_blocks_all_finite_positive"] = bool(np.isfinite(p_final).all() and (p_final > 0).all())
    seen_bench = {"note": "Dataset E test date blocks, flights seen in training on other dates (historical benchmark, comparable to Phase 5 primary)",
                  "overall": metrics(yt, p_final), "by_class": grouped(yt, p_final, Xt.travel_class.to_numpy())}
    agg = json.loads((P6 / "multiseed" / "aggregate.json").read_text())["recipes"][sel["recipe"]]["candidates"][sel["chosen"]]
    ext = json.loads((P6 / "external" / "results.json").read_text())["candidates"][sel["chosen"]]
    meta = {
        "model_name": sel["chosen"], "file": "airfare_model.joblib", "sha256": sha, "bytes": path.stat().st_size,
        "predict_contract": {"input_columns": RAW_INPUTS, "output": "fare in INR (float, positive)", "target_transform": "log1p inside the model; predictions already back-transformed with expm1",
                             "flight_code_used_as_feature": False, "validation": "ml.inference.validate against data/processed/supported_options.json"},
        "frozen_config": cfg, "training": {"recipe": sel["recipe"], "rows": int(len(tr)), "roles": sorted(set(tr.role)), "journey_dates": [str(tr.journey_date.min().date()), str(tr.journey_date.max().date())],
                                           "days_left_range": [int(tr.days_left.min()), int(tr.days_left.max())], "classes": sorted(tr.travel_class.unique()),
                                           "excluded": ["First class", "test date blocks", "Dataset A"], "fit_seconds": fit_s},
        "selection": sel, "evaluation_summary": {"unseen_flight_multiseed_mae_mean_std": [agg["mae"]["mean"], agg["mae"]["std"]],
                                                 "unseen_flight_multiseed_mdape_mean_pct": agg["mdape_pct"]["mean"], "seen_flight_date_block_benchmark": seen_bench["overall"],
                                                 "dataset_a_shift_check": ext["overall"]},
        "reproducibility_checks": repro,
        "environment": {"python": platform.python_version(), "scikit_learn": sklearn.__version__, "xgboost": xgboost.__version__, "numpy": np.__version__, "pandas": pd.__version__},
        "limitations": ["Trained on one platform (EaseMyTrip) for Jan-Mar 2023 journeys; lead time and calendar effects are confounded.",
                        "days_left must be 1-50; fares are listed fares, not transacted.",
                        "Accuracy on flights unseen in training is much lower than on flights seen on other dates (see multi-seed results).",
                        "Dataset A (2022) shows a price-level shift; the model is not recalibrated for other periods."],
        "hashes": {"frozen_candidates_sha256": hashlib.sha256(TUNE.read_bytes()).hexdigest()},
    }
    (FINAL / "final_model_metadata.json").write_text(json.dumps(meta, indent=1, default=str), encoding="utf-8")
    (P6 / "final_selection.json").write_text(json.dumps({"selection": sel, "reproducibility": repro, "seen_flight_benchmark": seen_bench}, indent=1, default=str), encoding="utf-8")
    log(f"final model {sel['chosen']} saved ({path.stat().st_size/1e6:.1f} MB); repro {repro}")


if __name__ == "__main__":
    main()
