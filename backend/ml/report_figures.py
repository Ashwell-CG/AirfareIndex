"""Phase 5 figures and comparison tables from saved experiment outputs (no refitting, no new test access).
    python -X utf8 -m ml.report_figures
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from ml.evaluation import metrics
from ml.splits import load_model_frame

BACKEND = Path(__file__).resolve().parents[1]
EXP = BACKEND / "experiments"
DOCS = BACKEND.parent / "docs"
FIG = DOCS / "figures"
SETUPS = ["primary", "group", "stress"]
TITLE = {"primary": "Primary: date blocks", "group": "Secondary: unseen flights", "stress": "Stress: days_left 41-50"}
ORDER = ["mean_baseline", "class_median_baseline", "linear_regression", "ridge", "decision_tree",
         "random_forest", "gradient_boosting", "xgboost"]
sns.set_theme(style="whitegrid")


def save(name):
    plt.tight_layout(rect=(0, 0, 1, 0.96))
    plt.savefig(FIG / name, dpi=130)
    plt.close()


def main() -> None:
    df = load_model_frame().set_index("row_id")
    R = {s: json.loads((EXP / s / "results.json").read_text()) for s in SETUPS}

    # ---- comparison table (long CSV, one row per setup x model x target)
    rows, cls_rows = [], []
    for s, r in R.items():
        for k, e in r["entries"].items():
            rows.append({"setup": s, "model": e["model"], "target": e["target"],
                         "selected_by_val": r["selected_target_by_validation"][e["model"]] == e["target"],
                         "val_mae": e["val"]["mae"], **{f"test_{m}": e["test"][m] for m in
                                                       ["mae", "rmse", "r2", "mape_pct", "mdape_pct", "bias_inr", "non_positive_predictions"]},
                         "train_seconds": e["train_seconds"], "inference_us_per_row": e["inference_us_per_row"],
                         "hyperparameters": json.dumps(e["params"]), "features": json.dumps(e["variant"])})
            for c, m in e["test_by_class"].items():
                cls_rows.append({"setup": s, "model": e["model"], "target": e["target"], "class": c, **{k2: m[k2] for k2 in
                                 ["n", "mae", "rmse", "r2", "mape_pct", "bias_inr"]}})
    comp = pd.DataFrame(rows)
    comp.to_csv(DOCS / "05-comparison.csv", index=False)
    pd.DataFrame(cls_rows).to_csv(DOCS / "05-comparison-by-class.csv", index=False)

    # ---- Fig 1: test MAE by model x target for each setup
    fig, ax = plt.subplots(1, 3, figsize=(17, 4.6), sharey=False)
    for a, s in zip(ax, SETUPS):
        d = comp[comp.setup == s].copy(); d["model"] = pd.Categorical(d.model, ORDER, ordered=True)
        sns.barplot(data=d.sort_values("model"), y="model", x="test_mae", hue="target", ax=a, palette=["#2563eb", "#06b6d4"])
        a.set_title(TITLE[s]); a.set_xlabel("test MAE (INR)"); a.set_ylabel("")
        a.set_xscale("log")
    save("p5_01_model_comparison.png")

    # ---- per setup: diagnostics for the model chosen BY VALIDATION
    ana_rows = []
    for s in SETUPS:
        best = R[s]["best_model_by_validation"]; mk = best.replace("|", "__")
        z = np.load(EXP / s / "test_predictions.npz")
        y, p, rid = z["y"], z[mk].astype(float), z["row_id"]
        meta = df.loc[rid]
        res = p - y
        fig, ax = plt.subplots(1, 3, figsize=(17, 4.8))
        samp = np.random.default_rng(0).choice(len(y), min(len(y), 30000), replace=False)
        for c, col in zip(["Economy", "Premium Economy", "Business"], ["#2563eb", "#06b6d4", "#0b1f3a"]):
            m = samp[(meta.travel_class.to_numpy()[samp] == c)]
            ax[0].scatter(y[m], p[m], s=3, alpha=.25, label=c, color=col)
        lim = [0, max(y.max(), p.max())]; ax[0].plot(lim, lim, "r--", lw=1); ax[0].legend(markerscale=4)
        ax[0].set_xlabel("actual fare (INR)"); ax[0].set_ylabel("predicted fare (INR)"); ax[0].set_title(f"Actual vs predicted ({best})")
        ax[1].hist(np.clip(res, -20000, 20000), bins=120, color="#2563eb"); ax[1].axvline(0, color="r", lw=1)
        ax[1].set_title(f"Residuals (pred - actual); mean {res.mean():.0f}, median {np.median(res):.0f}"); ax[1].set_xlabel("INR (clipped at +/-20,000)")
        ax[2].hexbin(p[samp], res[samp], gridsize=60, cmap="Blues", bins="log", mincnt=1); ax[2].axhline(0, color="r", lw=1)
        ax[2].set_xlabel("predicted fare (INR)"); ax[2].set_ylabel("residual (INR)"); ax[2].set_title("Residual vs predicted")
        fig.suptitle(TITLE[s] + " (test set)", y=0.995)
        save(f"p5_02_diagnostics_{s}.png")

        # error analysis tables for this model
        t = pd.DataFrame({"y": y, "p": p, "class": meta.travel_class.to_numpy(), "airline": meta.airline.to_numpy(),
                          "route": meta.route.to_numpy(), "days_left": meta.days_left.to_numpy(), "stops": meta.stops.to_numpy()})
        t["days_left_bin"] = pd.cut(t.days_left, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50])
        fig, ax = plt.subplots(2, 2, figsize=(15, 9))
        for a, (g, title) in zip(ax.ravel(), [("class", "class"), ("airline", "airline"), ("days_left_bin", "days_left"), ("stops", "stops")]):
            agg = t.groupby(g, observed=True).apply(lambda d: pd.Series(metrics(d.y, d.p))[["mae", "mape_pct", "n"]], include_groups=False)
            agg["mae"].plot.bar(ax=a, color="#2563eb"); a.set_title(f"Test MAE by {title}"); a.set_xlabel(""); a.set_ylabel("MAE (INR)")
            for g_name, r_ in agg.iterrows():
                ana_rows.append({"setup": s, "model": best, "dimension": g, "group": str(g_name), "n": int(r_.n), "mae": r_.mae, "mape_pct": r_.mape_pct})
        fig.suptitle(f"{TITLE[s]}: error analysis of {best} (chosen by validation)", y=1.0)
        save(f"p5_03_error_analysis_{s}.png")
        agg = t.groupby("route").apply(lambda d: pd.Series(metrics(d.y, d.p))[["mae", "mape_pct", "n"]], include_groups=False)
        for g_name, r_ in agg.iterrows():
            ana_rows.append({"setup": s, "model": best, "dimension": "route", "group": g_name, "n": int(r_.n), "mae": r_.mae, "mape_pct": r_.mape_pct})
        for c in ["Economy", "Premium Economy", "Business"]:
            for ex in [1, 2]:   # ignore; kept simple
                pass
    pd.DataFrame(ana_rows).to_csv(DOCS / "05-error-analysis.csv", index=False)

    # ---- route heatmap (relative error) for the primary best model
    s = "primary"; best = R[s]["best_model_by_validation"]; z = np.load(EXP / s / "test_predictions.npz")
    meta = df.loc[z["row_id"]]; p, y = z[best.replace("|", "__")].astype(float), z["y"]
    t = pd.DataFrame({"mape": np.abs(p - y) / y * 100, "src": meta.source.to_numpy(), "dst": meta.destination.to_numpy()})
    plt.figure(figsize=(7, 5.5)); sns.heatmap(t.pivot_table(index="src", columns="dst", values="mape"), annot=True, fmt=".1f", cmap="Blues")
    plt.title(f"Primary test MAPE (%) by route, {best}"); save("p5_04_route_mape_primary.png")

    # ---- feature ablation (validation, subsample fits): delta MAE vs full features
    ab = []
    for s in SETUPS:
        fr = json.loads((EXP / s / "frozen.json").read_text())
        for k, e in fr["entries"].items():
            if not e["ablation"]:
                continue
            base = next(a for a in e["ablation"] if a["route_ref"] and a["linear_extras"])["val_mae_subsample_fit"]
            for a in e["ablation"]:
                ab.append({"setup": s, "key": k, "route_ref": a["route_ref"], "linear_extras": a["linear_extras"],
                           "val_mae": a["val_mae_subsample_fit"], "delta_vs_full_pct": (a["val_mae_subsample_fit"] / base - 1) * 100,
                           "chosen": a["route_ref"] == e["variant"]["route_ref"] and a["linear_extras"] == e["variant"]["linear_extras"]})
    ab = pd.DataFrame(ab); ab.to_csv(DOCS / "05-feature-ablation.csv", index=False)
    d = ab[(ab.route_ref == False) & (ab.linear_extras == True)].copy()
    plt.figure(figsize=(11, 5)); d["label"] = d.key.str.replace("|", " ")
    sns.barplot(data=d, y="label", x="delta_vs_full_pct", hue="setup", palette=["#2563eb", "#06b6d4", "#0b1f3a"])
    plt.axvline(0, color="k", lw=1); plt.xlabel("validation MAE change when route_ref features are REMOVED (%, positive = they help)")
    plt.ylabel(""); plt.title("Controlled ablation: route reference duration + duration ratio"); save("p5_05_feature_ablation.png")

    # ---- learning curves
    lc_path = EXP / "primary" / "learning_curves.json"
    if lc_path.exists():
        lc = json.loads(lc_path.read_text())
        fig, ax = plt.subplots(1, len(lc), figsize=(5.2 * len(lc), 4.2))
        for a, (k, pts) in zip(np.atleast_1d(ax), lc.items()):
            a.plot([q["n_train"] for q in pts], [q["train_mae"] for q in pts], "o-", label="train MAE", color="#0b1f3a")
            a.plot([q["n_train"] for q in pts], [q["val_mae"] for q in pts], "o-", label="validation MAE", color="#06b6d4")
            a.set_xscale("log"); a.set_title(k.replace("|", " ")); a.set_xlabel("training rows"); a.set_ylabel("MAE (INR)"); a.legend()
        save("p5_06_learning_curves.png")
    print("figures:", sorted(p.name for p in FIG.glob("p5_*.png")))


if __name__ == "__main__":
    main()
