"""Regression metrics (all in INR unless stated). Pure numpy; no model code."""
from __future__ import annotations

import numpy as np
import pandas as pd


def metrics(y, p) -> dict:
    y = np.asarray(y, float)
    p = np.asarray(p, float)
    e = p - y
    ss_res, ss_tot = float((e ** 2).sum()), float(((y - y.mean()) ** 2).sum())
    ape = np.abs(e) / y          # fares are >= 1,307 so no division by zero
    return {
        "n": int(len(y)),
        "mae": float(np.abs(e).mean()),
        "mse": float((e ** 2).mean()),
        "rmse": float(np.sqrt((e ** 2).mean())),
        "r2": 1.0 - ss_res / ss_tot if ss_tot > 0 else float("nan"),
        "mape_pct": float(ape.mean() * 100),     # dominated by cheap fares; over-prediction unbounded
        "mdape_pct": float(np.median(ape) * 100),
        "bias_inr": float(e.mean()),              # mean(pred - actual); retransformation bias shows up here
        "non_positive_predictions": int((p <= 0).sum()),
    }


def grouped(y, p, groups) -> dict:
    y, p, g = np.asarray(y, float), np.asarray(p, float), np.asarray(groups)
    return {str(k): metrics(y[g == k], p[g == k]) for k in pd.unique(g)}
