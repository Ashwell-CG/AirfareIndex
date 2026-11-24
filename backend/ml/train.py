"""Phase 5 training and evaluation.

    python -X utf8 -m ml.train run --setup primary|group|stress [--smoke]
    python -X utf8 -m ml.train curves                       # learning curves (primary setup, validation only)

For each approved split the run has two strictly separated stages:
  stage 1 (tune_and_freeze)  sees ONLY that split's train and validation rows. It random-searches
        hyperparameters on a training subsample, runs the controlled feature ablation, refits the frozen
        configuration on the full training set, scores validation, and writes frozen.json.
  stage 2 (evaluate_test)    runs after frozen.json has been written (its SHA-256 is recorded) and scores the
        untouched test rows once. Nothing in stage 2 can change a choice made in stage 1.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
from datetime import datetime, timezone
from math import prod
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost
from joblib import Parallel, delayed
from sklearn.model_selection import ParameterSampler

from ml.evaluation import grouped, metrics
from ml.feature_engineering import RAW_INPUTS, split_xy
from ml.models import BASELINES, MODELS, N_ITER, SEED, SPACES, build, feature_variants
from ml.splits import CLEAN, SPLITS, load_model_frame

BACKEND = Path(__file__).resolve().parents[1]
EXP = BACKEND / "experiments"
SAVED = BACKEND / "saved_models"
SETUPS = {"primary": "split_primary", "group": "split_group", "stress": "split_stress"}
TUNE_SUBSAMPLE = 60_000


def targets_for(model: str) -> list[str]:
    return ["fare"] if model in BASELINES else ["fare", "log1p"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def _fit_score(model, params, target, variant, Xs, ys, Xva, yva) -> float:
    pipe = build(model, params, target, **variant).fit(Xs, ys)
    return float(np.abs(pipe.predict(Xva) - yva).mean())


def _smear_factor(y_val, pred_val_inr) -> float:
    """Duan smearing factor estimated on VALIDATION residuals (log1p scale); frozen before test."""
    f = np.log1p(np.clip(pred_val_inr, 0, None))
    return float(np.mean(np.exp(np.log1p(y_val) - f)))


def apply_smear(pred_inr, phi: float):
    return phi * (np.clip(pred_inr, 0, None) + 1.0) - 1.0


# ------------------------------------------------------------------------------------ stage 1
def tune_and_freeze(setup, Xtr, ytr, Xva, yva, n_iter_scale=1.0, sub=TUNE_SUBSAMPLE):
    rng = np.random.default_rng(SEED)
    sub_idx = rng.choice(len(Xtr), size=min(sub, len(Xtr)), replace=False)
    Xs, ys = Xtr.iloc[sub_idx], ytr.iloc[sub_idx]
    frozen, fitted = {}, {}
    cls_val = Xva["travel_class"].to_numpy()
    for model in MODELS:
        for target in targets_for(model):
            key = f"{model}|{target}"
            t0 = time.time()
            full_variant = {"route_ref": True, "linear_extras": True}
            space = SPACES.get(model, {})
            n_iter = max(1, int(round(N_ITER.get(model, 1) * n_iter_scale)))
            if space:
                n_iter = min(n_iter, prod(len(v) for v in space.values()))
                cands = list(ParameterSampler(space, n_iter=n_iter, random_state=SEED))
            else:
                cands = [{}]
            if model in BASELINES:
                scores = [0.0]
            else:
                par = 6 if model == "gradient_boosting" else 1       # GB is single-threaded: parallelise configs
                scores = Parallel(n_jobs=par)(delayed(_fit_score)(model, c, target, full_variant, Xs, ys, Xva, yva)
                                              for c in cands)
            best = int(np.argmin(scores))
            params = cands[best]
            search = [{"params": c, "val_mae_subsample_fit": s} for c, s in zip(cands, scores)]
            # controlled feature ablation: identical hyperparameters, only the feature switches change
            abl = []
            if model not in BASELINES:
                for v in feature_variants(model):
                    abl.append({**v, "val_mae_subsample_fit": scores[best] if v == full_variant
                                else _fit_score(model, params, target, v, Xs, ys, Xva, yva)})
                variant = min(abl, key=lambda a: (a["val_mae_subsample_fit"]))
                variant = {k: variant[k] for k in ("route_ref", "linear_extras")}
            else:
                variant = full_variant
            # frozen configuration refitted on the FULL training set
            pipe = build(model, params, target, **variant)
            t1 = time.perf_counter()
            pipe.fit(Xtr, ytr)
            train_s = time.perf_counter() - t1
            pv = pipe.predict(Xva)
            entry = {"params": params, "variant": variant, "train_seconds": train_s,
                     "val": metrics(yva, pv), "val_by_class": grouped(yva, pv, cls_val),
                     "search": search, "ablation": abl}
            if target == "log1p":
                phi = _smear_factor(yva.to_numpy(), pv)
                entry["smear_phi_from_val"] = phi
                entry["val_smeared"] = metrics(yva, apply_smear(pv, phi))
            frozen[key], fitted[key] = entry, pipe
            log(f"{setup} {key:34s} val MAE {entry['val']['mae']:9.1f}  RMSE {entry['val']['rmse']:9.1f}  "
                f"R2 {entry['val']['r2']:.4f}  fit {train_s:6.1f}s  (stage {time.time()-t0:.0f}s) {params} {variant}")
    sel = {}
    for model in MODELS:
        ts = targets_for(model)
        sel[model] = min(ts, key=lambda t: frozen[f"{model}|{t}"]["val"]["mae"])
    non_base = [m for m in MODELS if m not in BASELINES]
    best_model = min(non_base, key=lambda m: frozen[f"{m}|{sel[m]}"]["val"]["mae"])
    return frozen, fitted, sel, best_model


# ------------------------------------------------------------------------------------ stage 2
def evaluate_test(frozen, fitted, Xte, yte):
    res, preds = {}, {}
    cls = Xte["travel_class"].to_numpy()
    for key, pipe in fitted.items():
        times = []
        for _ in range(3):
            t = time.perf_counter()
            p = pipe.predict(Xte)
            times.append(time.perf_counter() - t)
        inf = float(np.median(times))
        r = {"test": metrics(yte, p), "test_by_class": grouped(yte, p, cls),
             "inference_seconds_test_set": inf, "inference_us_per_row": inf / len(Xte) * 1e6}
        if "smear_phi_from_val" in frozen[key]:
            ps = apply_smear(p, frozen[key]["smear_phi_from_val"])
            r["test_smeared"] = metrics(yte, ps)
        res[key] = r
        preds[key] = p.astype(np.float32)
        log(f"  test {key:34s} MAE {r['test']['mae']:9.1f}  RMSE {r['test']['rmse']:9.1f}  R2 {r['test']['r2']:.4f}  "
            f"infer {r['inference_us_per_row']:.1f} us/row")
    return res, preds


def run(setup: str, smoke: bool = False) -> None:
    t_start = time.time()
    out = (EXP / ("_smoke_" + setup)) if smoke else (EXP / setup)
    out.mkdir(parents=True, exist_ok=True)
    df = load_model_frame()
    sp = pd.read_csv(SPLITS)
    assert (sp.row_id.to_numpy() == df.row_id.to_numpy()).all()
    X, y = split_xy(df)
    assert list(X.columns) == RAW_INPUTS and "flight_code" not in X.columns
    col = SETUPS[setup]
    m_tr, m_va, m_te = (sp[col] == "train").to_numpy(), (sp[col] == "val").to_numpy(), (sp[col] == "test").to_numpy()
    if smoke:
        rng = np.random.default_rng(0)
        keep = lambda m, n: np.isin(np.arange(len(m)), rng.choice(np.flatnonzero(m), size=min(n, int(m.sum())), replace=False))
        m_tr, m_va, m_te = keep(m_tr, 30000), keep(m_va, 8000), keep(m_te, 8000)
    Xtr, ytr, Xva, yva, Xte, yte = X[m_tr], y[m_tr], X[m_va], y[m_va], X[m_te], y[m_te]
    log(f"setup={setup} train={len(Xtr)} val={len(Xva)} test={len(Xte)} (test not touched until stage 2)")

    frozen, fitted, sel, best_model = tune_and_freeze(setup, Xtr, ytr, Xva, yva,
                                                      n_iter_scale=0.25 if smoke else 1.0,
                                                      sub=8000 if smoke else TUNE_SUBSAMPLE)
    doc = {"setup": setup, "split_column": col, "created_utc": datetime.now(timezone.utc).isoformat(),
           "seed": SEED, "tune_subsample_rows": min(TUNE_SUBSAMPLE, len(Xtr)),
           "selection_metric": "validation MAE in INR",
           "selected_target_by_validation": sel, "best_model_by_validation": f"{best_model}|{sel[best_model]}",
           "rows": {"train": int(len(Xtr)), "val": int(len(Xva))}, "entries": frozen}
    fpath = out / "frozen.json"
    fpath.write_text(json.dumps(doc, indent=1, default=str), encoding="utf-8")
    frozen_sha = sha256(fpath)
    log(f"FROZEN {fpath.name} sha256={frozen_sha[:16]}  best by validation: {doc['best_model_by_validation']}")

    res, preds = evaluate_test(frozen, fitted, Xte, yte)
    results = {"setup": setup, "frozen_sha256": frozen_sha, "rows": {"train": int(len(Xtr)), "val": int(len(Xva)), "test": int(len(Xte))},
               "selected_target_by_validation": sel, "best_model_by_validation": doc["best_model_by_validation"],
               "entries": {k: {"model": k.split("|")[0], "target": k.split("|")[1], **frozen[k], **res[k]} for k in frozen}}
    (out / "results.json").write_text(json.dumps(results, indent=1, default=str), encoding="utf-8")
    np.savez_compressed(out / "test_predictions.npz", row_id=df.row_id.to_numpy()[m_te], y=yte.to_numpy(),
                        **{k.replace("|", "__"): v for k, v in preds.items()})
    rows = []
    for k, e in results["entries"].items():
        for part, mm in (("val", e["val"]), ("test", e["test"])):
            rows.append({"setup": setup, "model": e["model"], "target": e["target"], "partition": part, **mm,
                         "train_seconds": e["train_seconds"], "inference_us_per_row": e["inference_us_per_row"],
                         "selected_target": sel[e["model"]] == e["target"]})
        for c, mm in e["test_by_class"].items():
            rows.append({"setup": setup, "model": e["model"], "target": e["target"], "partition": f"test:{c}", **mm})
    pd.DataFrame(rows).to_csv(out / "results_long.csv", index=False)

    if not smoke:                                    # save policy (random forests are large)
        d = SAVED / setup
        d.mkdir(parents=True, exist_ok=True)
        keys = list(fitted) if setup == "primary" else [f"{best_model}|{t}" for t in targets_for(best_model)]
        for k in keys:
            joblib.dump(fitted[k], d / f"{k.replace('|', '__')}.joblib", compress=3)
        log(f"saved {len(keys)} model artifacts to {d}")
    meta = {"python": platform.python_version(), "platform": platform.platform(), "cpus": __import__("os").cpu_count(),
            "scikit_learn": sklearn.__version__, "xgboost": xgboost.__version__, "numpy": np.__version__,
            "pandas": pd.__version__, "seed": SEED, "smoke": smoke, "wall_seconds": time.time() - t_start,
            "clean_data_sha256": sha256(CLEAN), "splits_sha256": sha256(SPLITS), "frozen_sha256": frozen_sha,
            "timing_note": "train/inference seconds measured on this machine with RF/XGBoost using all cores and "
                           "scikit-learn GB, trees and linear models single-threaded; not comparable across machines."}
    (out / "metadata.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    log(f"done {setup} in {time.time()-t_start:.0f}s")


# ------------------------------------------------------------------------------------ learning curves
def curves() -> None:
    df = load_model_frame()
    sp = pd.read_csv(SPLITS)
    X, y = split_xy(df)
    frozen = json.loads((EXP / "primary" / "frozen.json").read_text())
    tr, va = (sp.split_primary == "train").to_numpy(), (sp.split_primary == "val").to_numpy()
    Xtr, ytr, Xva, yva = X[tr], y[tr], X[va], y[va]
    rng = np.random.default_rng(SEED)
    order = rng.permutation(len(Xtr))
    out = {}
    for model in ["ridge", "random_forest", "xgboost"]:
        key = f"{model}|{frozen['selected_target_by_validation'][model]}"
        e = frozen["entries"][key]
        out[key] = []
        for frac in [0.05, 0.1, 0.25, 0.5, 1.0]:
            idx = order[: int(frac * len(Xtr))]
            pipe = build(model, e["params"], key.split("|")[1], **e["variant"]).fit(Xtr.iloc[idx], ytr.iloc[idx])
            ev = idx[:30000]
            out[key].append({"fraction": frac, "n_train": int(len(idx)),
                             "train_mae": float(np.abs(pipe.predict(Xtr.iloc[ev]) - ytr.iloc[ev]).mean()),
                             "val_mae": float(np.abs(pipe.predict(Xva) - yva).mean())})
            log(f"curve {key} {out[key][-1]}")
    (EXP / "primary" / "learning_curves.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "curves"])
    ap.add_argument("--setup", choices=list(SETUPS), default="primary")
    ap.add_argument("--smoke", action="store_true")
    a = ap.parse_args()
    run(a.setup, a.smoke) if a.cmd == "run" else curves()
