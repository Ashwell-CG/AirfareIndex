"""Phase 6: seen-flight date-block benchmark for every candidate (historical benchmark, comparable to Phase 5 'primary').
    python -X utf8 -m ml.p6_seen_benchmark
Models are the final-recipe candidates (train + validation date blocks, all flight codes). Scoring rows are the Dataset E test date
blocks, whose flights also occur in training on other dates. NOT used for any selection; shows the seen-vs-unseen trade-off."""
from __future__ import annotations

import json
from pathlib import Path

import joblib

from ml.evaluation import grouped, metrics
from ml.p6_common import LogBlend, load_frame, xy
from ml.p6_eval import BASE, MEMBER, TUNE

BACKEND = Path(__file__).resolve().parents[1]
SAVE = BACKEND / "saved_models" / "phase6_candidates"
OUT = BACKEND / "experiments" / "phase6" / "seen_flight"


def main():
    frozen = json.loads(TUNE.read_text())
    df = load_frame()
    X, y = xy(df[df.role == "test"])
    models = {n: joblib.load(SAVE / f"{n}.joblib") for n in BASE}
    for b, spec in frozen["blends"].items():
        models[b] = LogBlend([models[MEMBER[m]] for m in spec["members"]], spec["weights"])
    res = {"rows": int(len(X)), "note": "historical benchmark; flights seen in training on other dates", "candidates": {}}
    for n, m in models.items():
        p = m.predict(X)
        res["candidates"][n] = {"overall": metrics(y, p), "by_class": grouped(y, p, X.travel_class.to_numpy())}
        print(f"{n:18s} MAE {res['candidates'][n]['overall']['mae']:7.0f}  MdAPE {res['candidates'][n]['overall']['mdape_pct']:5.1f}%  R2 {res['candidates'][n]['overall']['r2']:.3f}", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(res, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
