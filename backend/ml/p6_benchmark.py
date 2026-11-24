"""Phase 6 Stage F: benchmark all candidates in identical, separate processes.
    python -X utf8 -m ml.p6_benchmark [--include-final]
Run sequentially so no two workers compete for CPU."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
OUT = BACKEND / "experiments" / "phase6" / "benchmark"
NAMES = ["route_lookup", "ridge", "rf_tuned", "xgb_tuned", "rf_phase5cfg", "xgb_phase5cfg",
         "blend_rf_ridge", "blend_rf_xgb", "blend_rf_lookup", "blend_xgb_lookup"]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--final", default=None, help="path to the final model file to include")
    ap.add_argument("--reps", type=int, default=1, help="repeat every worker this many times (separate processes) and report median and range")
    ap.add_argument("--only", default=None, help="comma-separated subset of candidate names"); a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    out = {}
    names = a.only.split(",") if a.only else NAMES
    jobs = [(n, []) for n in names] + ([("final_model", ["--file", a.final])] if a.final else [])
    if a.reps > 1:
        return repeat(jobs, a.reps)
    for n, extra in jobs:
        t = time.time()
        r = subprocess.run([sys.executable, "-X", "utf8", "-m", "ml.p6_bench_worker", n, *extra], capture_output=True, text=True, cwd=str(BACKEND))
        if r.returncode != 0:
            out[n] = {"error": r.stderr[-2000:]}
            print(f"{n}: FAILED\n{r.stderr[-800:]}", flush=True)
            continue
        out[n] = json.loads(r.stdout.strip().splitlines()[-1])
        s = out[n]
        print(f"{n:18s} {s['file_bytes']/1e6:7.1f} MB  load RAM {s['ram_after_load_mb']:7.1f} MB  1-row median {s['single_row_latency_ms_1thread']['median']:.2f} ms "
              f"p95 {s['single_row_latency_ms_1thread']['p95']:.2f} ms  100k rows/s (1 thread) {s['batch_1thread']['100000']['rows_per_second']:,.0f}  ({time.time()-t:.0f}s)", flush=True)
    (OUT / ("benchmark_with_final.json" if a.final else "benchmark.json")).write_text(json.dumps(out, indent=1), encoding="utf-8")


def repeat(jobs, reps):
    import numpy as np
    runs = {n: [] for n, _ in jobs}
    for rep in range(reps):
        for n, extra in jobs:             # interleave models across repetitions so slow drifts affect all models alike
            r = subprocess.run([sys.executable, "-X", "utf8", "-m", "ml.p6_bench_worker", n, *extra], capture_output=True, text=True, cwd=str(BACKEND))
            if r.returncode != 0:
                print(f"{n} rep {rep}: FAILED {r.stderr[-300:]}", flush=True); continue
            runs[n].append(json.loads(r.stdout.strip().splitlines()[-1]))
        print(f"rep {rep+1}/{reps} done", flush=True)
    def agg(vals):
        return {"median": float(np.median(vals)), "min": float(np.min(vals)), "max": float(np.max(vals))}
    out = {}
    for n, rs in runs.items():
        if not rs:
            continue
        out[n] = {"reps": len(rs), "file_bytes": rs[0]["file_bytes"], "ram_after_load_mb": agg([r["ram_after_load_mb"] for r in rs]),
                  "peak_ram_after_100k_batch_mb": agg([r["peak_ram_after_100k_batch_mb"] for r in rs if r["peak_ram_after_100k_batch_mb"] is not None] or [float("nan")]),
                  "single_row_1thread_ms": {k: agg([r["single_row_latency_ms_1thread"][k] for r in rs]) for k in ["mean", "median", "p95", "p99"]},
                  "batch_1thread_rows_per_second": {b: agg([r["batch_1thread"][b]["rows_per_second"] for r in rs]) for b in rs[0]["batch_1thread"]},
                  "batch_allcores_rows_per_second": {b: agg([r["batch_allcores"][b]["rows_per_second"] for r in rs]) for b in rs[0]["batch_allcores"]},
                  "predictions_finite_positive": all(r["predictions_finite_positive_on_100k"] for r in rs), "cpu_count": rs[0]["cpu_count"]}
        o = out[n]; print(f"{n:18s} {o['file_bytes']/1e6:7.2f} MB  1-row median {o['single_row_1thread_ms']['median']['median']:.2f} ms (range {o['single_row_1thread_ms']['median']['min']:.2f}-{o['single_row_1thread_ms']['median']['max']:.2f})  p95 {o['single_row_1thread_ms']['p95']['median']:.2f} ms  100k rows/s {o['batch_1thread_rows_per_second']['100000']['median']:,.0f}", flush=True)
    (OUT / "benchmark_repeated.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
