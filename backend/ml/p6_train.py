"""Phase 6: train every frozen candidate on ALL permitted Dataset E data with the chosen recipe and save them.
    python -X utf8 -m ml.p6_train
Permitted data = train date blocks (+ validation date blocks if recipe TV), all flight codes, never the test date blocks,
never Dataset A. Models are saved to saved_models/phase6_candidates/ (Phase 5 artifacts are untouched)."""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import joblib
import pandas as pd

from ml.p6_common import load_frame, xy
from ml.p6_eval import BASE, TUNE, fit_all

BACKEND = Path(__file__).resolve().parents[1]
AGG = BACKEND / "experiments" / "phase6" / "multiseed" / "aggregate.json"
SAVE = BACKEND / "saved_models" / "phase6_candidates"
META = BACKEND / "experiments" / "phase6" / "candidates_training.json"


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main():
    frozen = json.loads(TUNE.read_text())
    recipe = json.loads(AGG.read_text())["recipe_decision"]["chosen"]
    df = load_frame()
    roles = ["train"] if recipe == "T" else ["train", "val"]
    tr = df[df.role.isin(roles)]
    assert "test" not in set(tr.role)
    Xtr, ytr = xy(tr)
    log(f"recipe {recipe}: training on {len(tr)} rows, journey dates {tr.journey_date.min().date()}..{tr.journey_date.max().date()}, "
        f"days_left {tr.days_left.min()}..{tr.days_left.max()}, {tr.flight_code.nunique()} flight codes (flight_code is not a feature)")
    fitted, secs = fit_all(frozen, Xtr, ytr)
    SAVE.mkdir(parents=True, exist_ok=True)
    files = {}
    for n in BASE:
        p = SAVE / f"{n}.joblib"
        joblib.dump(fitted[n], p, compress=3)
        files[n] = {"file": p.name, "bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "fit_seconds": secs[n]}
        log(f"saved {n}: {p.stat().st_size/1e6:.2f} MB, fit {secs[n]:.1f}s")
    META.write_text(json.dumps({"recipe": recipe, "train_rows": int(len(tr)), "roles": roles,
                                "journey_dates": [str(tr.journey_date.min().date()), str(tr.journey_date.max().date())],
                                "days_left_range": [int(tr.days_left.min()), int(tr.days_left.max())],
                                "frozen_candidates_sha256": hashlib.sha256(TUNE.read_bytes()).hexdigest(), "files": files}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
