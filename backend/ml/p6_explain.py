"""Phase 6 Stage D: SHAP explanations of the tuned tree candidates (+ Ridge coefficients as a cross-check).
    python -X utf8 -m ml.p6_explain
SHAP values are in log1p(fare) units (the models' training space): a value of s multiplies the fare by about exp(s).
Explained rows are drawn from the Dataset E test date blocks, which the final-recipe models never saw in training.
These are descriptions of what the fitted models use, not causal effects."""
from __future__ import annotations

import json
import time
from pathlib import Path

import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap

from ml.p6_common import RAW_INPUTS, load_frame

BACKEND = Path(__file__).resolve().parents[1]
SAVE = BACKEND / "saved_models" / "phase6_candidates"
DOCS = BACKEND.parent / "docs"
FIG = DOCS / "figures"
OUT = BACKEND / "experiments" / "phase6" / "explain"
SEED = 6301
GROUPS = ["airline", "travel_class", "source", "destination"]


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def group_of(col: str) -> str:
    for g in GROUPS:
        if col.startswith(g + "_"):
            return g
    return col


def stratified_sample(df: pd.DataFrame, per_class: int) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    parts = [g.iloc[rng.choice(len(g), size=min(per_class, len(g)), replace=False)] for _, g in df.groupby("travel_class")]
    return pd.concat(parts).sort_index()


def explain_model(name: str, per_class: int, df: pd.DataFrame) -> dict:
    ttr = joblib.load(SAVE / f"{name}.joblib")
    pipe = ttr.regressor_
    pre, model = pipe.named_steps["pre"], pipe.named_steps["model"]
    s = stratified_sample(df, per_class)
    X = s[RAW_INPUTS]
    Z = pre.transform(X)
    t = time.time()
    ex = shap.TreeExplainer(model)
    sv = ex.shap_values(Z)
    base = float(np.ravel(ex.expected_value)[0])
    pred_log = model.predict(Z)
    add_err = float(np.abs(base + sv.sum(1) - pred_log).max())
    log(f"{name}: SHAP on {len(Z)} rows in {time.time()-t:.0f}s, max additivity error {add_err:.2e} (log units)")
    cols = list(Z.columns)
    gmap = pd.Series({c: group_of(c) for c in cols})
    G = pd.DataFrame(sv, columns=cols).T.groupby(gmap).sum().T          # SHAP summed back to the original input features
    imp = G.abs().mean().sort_values(ascending=False)
    cls = s.travel_class.to_numpy()
    imp_class = {c: G[cls == c].abs().mean().sort_values(ascending=False).round(4).to_dict() for c in ["Economy", "Premium Economy", "Business"]}
    return {"name": name, "s": s, "Z": Z, "sv": sv, "G": G, "base": base, "pred_log": pred_log, "add_err": add_err,
            "importance": imp.round(4).to_dict(), "importance_by_class": imp_class}


def local_cases(r: dict) -> list[dict]:
    s, Z, sv, G = r["s"], r["Z"], r["sv"], r["G"]
    out = []
    for cls, stops in [("Economy", "non-stop"), ("Economy", "1-stop"), ("Premium Economy", "1-stop"), ("Business", "1-stop")]:
        m = ((s.travel_class == cls) & (s.stops == stops)).to_numpy()
        idx = np.flatnonzero(m)
        med = s.fare.to_numpy()[idx].mean() if False else np.median(s.fare.to_numpy()[idx])
        i = int(idx[np.argmin(np.abs(s.fare.to_numpy()[idx] - med))])      # row closest to the median fare of that group
        contrib = G.iloc[i].sort_values(key=np.abs, ascending=False).head(6)
        out.append({"index_in_sample": i, "row_id": int(s.row_id.iloc[i]), "case": f"{cls}, {stops}",
                    "inputs": {k: (s.iloc[i][k].item() if hasattr(s.iloc[i][k], "item") else s.iloc[i][k]) for k in RAW_INPUTS},
                    "actual_fare": int(s.fare.iloc[i]), "predicted_fare": float(np.expm1(r["pred_log"][i])),
                    "baseline_fare_if_no_information": float(np.expm1(r["base"])),
                    "top_contributions_log_units": {k: round(float(v), 4) for k, v in contrib.items()},
                    "top_multiplicative_factors": {k: round(float(np.exp(v)), 3) for k, v in contrib.items()}})
    return out


def main():
    FIG.mkdir(exist_ok=True, parents=True); OUT.mkdir(parents=True, exist_ok=True)
    df = load_frame()
    test_rows = df[df.role == "test"]
    res, R = {}, {}
    for name, per_class in [("xgb_tuned", 1000), ("rf_tuned", 500)]:
        R[name] = explain_model(name, per_class, test_rows)
        res[name] = {"rows_explained": int(len(R[name]["s"])), "max_additivity_error_log": R[name]["add_err"],
                     "mean_abs_shap_by_input_feature": R[name]["importance"], "mean_abs_shap_by_class": R[name]["importance_by_class"],
                     "local_cases": local_cases(R[name])}
    # ---- global importance bar (grouped inputs)
    fig, ax = plt.subplots(1, 2, figsize=(14, 5))
    for a, (n, r) in zip(ax, R.items()):
        imp = pd.Series(r["importance"]).sort_values()
        a.barh(imp.index, imp.values, color="#2563eb"); a.set_title(f"{n}: mean |SHAP| by input feature\n(log1p-fare units, {len(r['s'])} test-block rows)"); a.set_xlabel("mean |SHAP|")
    plt.tight_layout(); plt.savefig(FIG / "p6_shap_importance.png", dpi=130); plt.close()
    # ---- within-class importance
    fig, ax = plt.subplots(1, 2, figsize=(14, 5))
    for a, (n, r) in zip(ax, R.items()):
        d = pd.DataFrame(r["importance_by_class"]).fillna(0)
        d = d.loc[d.mean(axis=1).sort_values().index]; d.plot.barh(ax=a); a.set_title(f"{n}: mean |SHAP| within each class"); a.set_xlabel("mean |SHAP|")
    plt.tight_layout(); plt.savefig(FIG / "p6_shap_importance_by_class.png", dpi=130); plt.close()
    # ---- beeswarm summary + dependence + local (XGBoost is the primary explained model; RF shown for comparison)
    for n, r in R.items():
        plt.figure(figsize=(9, 6)); shap.summary_plot(r["sv"], r["Z"], max_display=15, show=False); plt.title(f"{n}: SHAP summary (log1p fare)")
        plt.tight_layout(); plt.savefig(FIG / f"p6_shap_summary_{n}.png", dpi=130); plt.close()
        fig, ax = plt.subplots(2, 3, figsize=(17, 9))
        for a, f in zip(ax.ravel(), ["days_left", "duration_hours", "route_ref_duration_hours", "duration_ratio", "dep_minutes", "stops"]):
            if f in r["Z"].columns:
                shap.dependence_plot(f, r["sv"], r["Z"], interaction_index=None, ax=a, show=False)
        fig.suptitle(f"{n}: SHAP dependence (log1p fare units)"); plt.tight_layout(); plt.savefig(FIG / f"p6_shap_dependence_{n}.png", dpi=120); plt.close()
        cases = res[n]["local_cases"]
        fig, ax = plt.subplots(2, 2, figsize=(17, 9))
        for a, c in zip(ax.ravel(), cases):
            i = c["index_in_sample"]; plt.sca(a)
            e = shap.Explanation(values=r["sv"][i], base_values=r["base"], data=r["Z"].iloc[i].to_numpy(), feature_names=list(r["Z"].columns))
            shap.plots.waterfall(e, max_display=9, show=False)
            a.set_title(f"{c['case']}: actual {c['actual_fare']:,}, predicted {c['predicted_fare']:,.0f}", fontsize=9)
        plt.tight_layout(); plt.savefig(FIG / f"p6_shap_local_{n}.png", dpi=110); plt.close()
    # ---- Ridge coefficients (independent cross-check, scaled numerics, log1p fare)
    rid = joblib.load(SAVE / "ridge.joblib").regressor_
    names = rid.named_steps["pre"].transform(df[RAW_INPUTS].head(5)).columns
    coef = pd.Series(rid.named_steps["model"].coef_, index=names)
    top = coef.reindex(coef.abs().sort_values(ascending=False).index).head(15)
    res["ridge_top_coefficients_log1p_fare"] = {k: round(float(v), 4) for k, v in top.items()}
    plt.figure(figsize=(8, 5)); top.sort_values().plot.barh(color="#06b6d4"); plt.title("Ridge (log1p fare): 15 largest coefficients"); plt.tight_layout()
    plt.savefig(FIG / "p6_ridge_coefficients.png", dpi=130); plt.close()
    (OUT / "explain_results.json").write_text(json.dumps(res, indent=1, default=str), encoding="utf-8")
    log("done: " + ", ".join(sorted(p.name for p in FIG.glob("p6_shap*.png"))))


if __name__ == "__main__":
    main()
