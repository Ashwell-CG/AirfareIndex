"""Phase 5 verification of experiment outputs. Run: python -X utf8 -m ml.verify_experiments
Writes docs/05-verification.json. Re-derives test metrics from the stored predictions (independent of train.py's
metric calls), checks frozen-config checksums and ordering, and reloads every saved model artifact."""
from __future__ import annotations

import json
import re
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.evaluation import metrics
from ml.feature_engineering import RAW_INPUTS, split_xy
from ml.splits import SPLITS, load_model_frame
from ml.train import SAVED, EXP, SETUPS, sha256

DOCS = Path(__file__).resolve().parents[2] / "docs"
EXPECTED = ["mean_baseline|fare", "class_median_baseline|fare"] + [f"{m}|{t}" for m in
            ["linear_regression", "ridge", "decision_tree", "random_forest", "gradient_boosting", "xgboost"] for t in ["fare", "log1p"]]


def main() -> None:
    out: dict = {}
    df = load_model_frame()
    sp = pd.read_csv(SPLITS)
    X, y = split_xy(df)
    for s, col in SETUPS.items():
        d, v = EXP / s, {}
        files = ["frozen.json", "results.json", "test_predictions.npz", "results_long.csv", "metadata.json"]
        v["files_present"] = {f: (d / f).exists() for f in files}
        fr, rs = json.loads((d / "frozen.json").read_text()), json.loads((d / "results.json").read_text())
        meta = json.loads((d / "metadata.json").read_text())
        v["all_14_entries"] = sorted(fr["entries"]) == sorted(EXPECTED) and sorted(rs["entries"]) == sorted(EXPECTED)
        # 3. checksums
        h = sha256(d / "frozen.json")
        v["frozen_sha256"] = h
        v["frozen_checksum_matches_results_and_metadata"] = (h == rs["frozen_sha256"] == meta["frozen_sha256"])
        # 4. ordering: frozen written before results/predictions; no test data inside frozen; log order
        v["mtime_order_frozen_lt_results_lt_preds"] = (d / "frozen.json").stat().st_mtime <= (d / "results.json").stat().st_mtime \
            <= (d / "test_predictions.npz").stat().st_mtime
        v["frozen_json_has_no_test_fields"] = not re.search(r'"test', (d / "frozen.json").read_text())
        log = (EXP / f"run_{s}.log").read_text(encoding="utf-8", errors="replace").splitlines()
        i_frozen = next(i for i, l in enumerate(log) if "FROZEN" in l)
        i_test = [i for i, l in enumerate(log) if "  test " in l]
        v["log_FROZEN_line_before_every_test_line"] = bool(i_test) and min(i_test) > i_frozen
        v["log_has_done_line"] = any(" done " in l for l in log)
        v["log_error_warning_lines"] = [l for l in log if re.search(r"warn|error|traceback|exception", l, re.I)]
        # 5. metrics in INR: recompute from stored predictions
        z = np.load(d / "test_predictions.npz")
        yt = z["y"]
        m_te = (sp[col] == "test").to_numpy()
        v["test_y_matches_split_rows_and_is_inr"] = bool(np.array_equal(yt, y[m_te].to_numpy()) and 1307 <= yt.min() and yt.max() <= 143019)
        worst = 0.0
        for k in EXPECTED:
            p = z[k.replace("|", "__")].astype(float)
            m = metrics(yt, p)
            for name in ["mae", "rmse", "r2", "mape_pct", "bias_inr"]:
                ref = rs["entries"][k]["test"][name]
                worst = max(worst, abs(m[name] - ref) / (abs(ref) + 1e-9))
        v["max_relative_difference_recomputed_vs_reported_metrics"] = worst   # float32 storage tolerance
        v["no_nan_metrics"] = bool(all(np.isfinite(e["test"]["mae"]) and np.isfinite(e["val"]["mae"]) for e in rs["entries"].values()))
        v["no_flight_code_in_features"] = "flight_code" not in RAW_INPUTS
        # 10. saved artifacts load and predict
        saved = sorted((SAVED / s).glob("*.joblib")) if (SAVED / s).exists() else []
        loads, Xt = {}, X[m_te]
        for f in saved:
            key = f.stem.replace("__", "|")
            try:
                pipe = joblib.load(f)
                p = np.asarray(pipe.predict(Xt.head(2000)), float)
                ref = z[f.stem].astype(float)[:2000]
                loads[key] = {"ok": True, "max_abs_diff_vs_stored_inr": float(np.abs(p - ref).max()), "mb": round(f.stat().st_size / 1e6, 2)}
            except Exception as e:  # noqa: BLE001 - report, do not hide
                loads[key] = {"ok": False, "error": repr(e)}
        v["saved_models"] = loads
        out[s] = v
    out["learning_curves_exists"] = (EXP / "primary" / "learning_curves.json").exists()
    out["split_and_data_hashes_consistent"] = len({json.loads((EXP / s / "metadata.json").read_text())["splits_sha256"] for s in SETUPS}) == 1
    (DOCS / "05-verification.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(json.dumps(out, indent=1)[:6000])


if __name__ == "__main__":
    main()
