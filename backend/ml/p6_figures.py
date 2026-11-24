"""Phase 6 evaluation figures from stored experiment outputs. Run: python -X utf8 -m ml.p6_figures"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

B = Path(__file__).resolve().parents[1]
P6, FIG = B / "experiments" / "phase6", B.parent / "docs" / "figures"
R = json.loads((P6 / "multiseed" / "results.json").read_text())["records"]
A = json.loads((P6 / "multiseed" / "aggregate.json").read_text())["recipes"]["TV"]["candidates"]
order = ["route_lookup", "ridge", "rf_phase5cfg", "xgb_phase5cfg", "xgb_tuned", "rf_tuned", "blend_rf_xgb", "blend_xgb_lookup", "blend_rf_lookup"]
rows = [r for r in R if r["recipe"] == "TV"]
fig, ax = plt.subplots(1, 2, figsize=(15, 5))
for i, n in enumerate(order):
    v = [r["candidates"][n]["metrics"]["mae"] for r in rows]
    ax[0].errorbar(A[n]["mae"]["mean"], i, xerr=A[n]["mae"]["std"], fmt="o", color="#0b1f3a", capsize=4)
    ax[0].scatter(v, np.full(len(v), i) + np.random.default_rng(i).uniform(-.15, .15, len(v)), s=10, color="#06b6d4", alpha=.7)
ax[0].set_yticks(range(len(order))); ax[0].set_yticklabels(order); ax[0].set_xlabel("unseen-flight test MAE (INR); dot = one seed, bar = mean +/- SD (10 seeds)")
ax[0].set_title("Multi-seed unseen-flight MAE (recipe train+validation)")
for i, n in enumerate(order):
    ax[1].errorbar(A[n]["mdape_pct"]["mean"], i, xerr=A[n]["mdape_pct"]["std"], fmt="o", color="#2563eb", capsize=4)
ax[1].set_yticks(range(len(order))); ax[1].set_yticklabels([]); ax[1].set_xlabel("median APE (%) mean +/- SD"); ax[1].set_title("Median absolute percentage error")
plt.tight_layout(); plt.savefig(FIG / "p6_multiseed_unseen.png", dpi=130); plt.close()
# seen vs unseen
S = json.loads((P6 / "seen_flight" / "results.json").read_text())["candidates"]
fig, ax = plt.subplots(figsize=(10, 5)); x = np.arange(len(order)); w = .38
ax.bar(x - w / 2, [S[n]["overall"]["mae"] for n in order], w, label="seen flights (date-block test)", color="#0b1f3a")
ax.bar(x + w / 2, [A[n]["mae"]["mean"] for n in order], w, label="unseen flights (10-seed mean)", color="#06b6d4")
ax.set_xticks(x); ax.set_xticklabels(order, rotation=35, ha="right"); ax.set_ylabel("MAE (INR)"); ax.legend(); ax.set_title("Seen vs unseen flights: regularised models trade seen-flight accuracy for robustness")
plt.tight_layout(); plt.savefig(FIG / "p6_seen_vs_unseen.png", dpi=130); plt.close()
# external level shift
E = json.loads((P6 / "external" / "results.json").read_text())["candidates"]
fig, ax = plt.subplots(1, 2, figsize=(11, 4.5))
for a, c in zip(ax, ["Economy", "Business"]):
    names = ["route_lookup", "ridge", "rf_tuned", "xgb_tuned", "blend_rf_lookup"]
    a.bar(names, [E[n]["level_shift"][c]["pred_median"] for n in names], color="#2563eb")
    a.axhline(E["rf_tuned"]["level_shift"][c]["actual_median"], color="r", ls="--", label="actual median in Dataset A")
    a.set_title(f"Dataset A {c}: median predicted fare"); a.tick_params(axis="x", rotation=35); a.legend()
plt.tight_layout(); plt.savefig(FIG / "p6_external_level_shift.png", dpi=130); plt.close()
print("ok")
