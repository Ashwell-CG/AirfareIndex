"""One benchmark worker = one fresh process per model, so every model is measured under identical conditions.
    python -X utf8 -m ml.p6_bench_worker <candidate_name_or_blend> [--dir saved_models/phase6_candidates]
Prints one JSON object. Latency is measured with threads limited to 1 (API-style single request) and, for batches, also with all cores."""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import psutil
from sklearn.compose import TransformedTargetRegressor

from ml.p6_common import LogBlend, RAW_INPUTS, load_frame

BACKEND = Path(__file__).resolve().parents[1]
TUNE = BACKEND / "experiments" / "phase6" / "tuning" / "frozen_candidates.json"
MEMBER = {"rf": "rf_tuned", "xgb": "xgb_tuned", "ridge": "ridge", "lookup": "route_lookup"}


def members(obj):
    return [x for m in obj.members for x in members(m)] if isinstance(obj, LogBlend) else [obj]


def set_threads(obj, n: int) -> None:
    n = os.cpu_count() if n < 0 else n
    for m in members(obj):
        if isinstance(m, TransformedTargetRegressor):
            est = m.regressor_.named_steps["model"]
            if hasattr(est, "n_jobs"):
                est.set_params(n_jobs=n)
            if hasattr(est, "get_booster"):
                est.get_booster().set_param({"nthread": n})


def timeit(fn, reps: int) -> list[float]:
    out = []
    for _ in range(reps):
        t = time.perf_counter_ns(); fn(); out.append((time.perf_counter_ns() - t) / 1e6)
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("name"); ap.add_argument("--dir", default=str(BACKEND / "saved_models" / "phase6_candidates"))
    ap.add_argument("--file", default=None); a = ap.parse_args()
    proc = psutil.Process()
    # data is prepared BEFORE the memory baseline so that only the model's footprint is measured
    df = load_frame(); X = df[df.role == "test"][RAW_INPUTS].reset_index(drop=True)
    big = X.sample(100_000, replace=True, random_state=0).reset_index(drop=True)
    singles = [big.iloc[[i]].copy() for i in range(2000)]
    import gc; gc.collect()
    rss0 = proc.memory_info().rss
    frozen = json.loads(TUNE.read_text())
    if a.file:
        obj = joblib.load(a.file); size = Path(a.file).stat().st_size
    elif a.name in frozen["blends"]:
        parts = [MEMBER[m] for m in frozen["blends"][a.name]["members"]]
        objs = [joblib.load(Path(a.dir) / f"{p}.joblib") for p in parts]
        obj = LogBlend(objs, frozen["blends"][a.name]["weights"]); size = sum((Path(a.dir) / f"{p}.joblib").stat().st_size for p in parts)
    else:
        obj = joblib.load(Path(a.dir) / f"{a.name}.joblib"); size = (Path(a.dir) / f"{a.name}.joblib").stat().st_size
    rss1 = proc.memory_info().rss
    res = {"name": a.name, "file_bytes": int(size), "ram_after_load_mb": (rss1 - rss0) / 1e6}
    set_threads(obj, 1)
    for _ in range(100):                       # warm-up
        obj.predict(singles[0])
    lat = []
    for s in singles:
        t = time.perf_counter_ns(); obj.predict(s); lat.append((time.perf_counter_ns() - t) / 1e6)
    lat = np.array(lat)
    res["single_row_latency_ms_1thread"] = {"mean": float(lat.mean()), "median": float(np.median(lat)), "p95": float(np.percentile(lat, 95)),
                                           "p99": float(np.percentile(lat, 99)), "n": int(len(lat))}
    thr = {}
    for n in [1, 10, 100, 1000, 10000, 100000]:
        reps = 30 if n <= 100 else 7 if n <= 10000 else 3
        xb = big.iloc[:n]
        obj.predict(xb)
        t = np.array(timeit(lambda: obj.predict(xb), reps))
        thr[str(n)] = {"median_ms": float(np.median(t)), "rows_per_second": float(n / (np.median(t) / 1000))}
    res["batch_1thread"] = thr
    p = np.asarray(obj.predict(big), float)
    res["peak_ram_after_100k_batch_mb"] = (psutil.Process().memory_info().peak_wset - rss0) / 1e6 if hasattr(proc.memory_info(), "peak_wset") else None
    set_threads(obj, -1)
    thr2 = {}
    for n in [1, 1000, 10000, 100000]:
        reps = 30 if n <= 1 else 7 if n <= 10000 else 3
        xb = big.iloc[:n]; obj.predict(xb)
        t = np.array(timeit(lambda: obj.predict(xb), reps))
        thr2[str(n)] = {"median_ms": float(np.median(t)), "rows_per_second": float(n / (np.median(t) / 1000))}
    res["batch_allcores"] = thr2
    res["predictions_finite_positive_on_100k"] = bool(np.isfinite(p).all() and (p > 0).all())
    res["cpu_count"] = os.cpu_count()
    print(json.dumps(res))


if __name__ == "__main__":
    main()
