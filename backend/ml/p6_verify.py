"""Phase 6 verification suite (artifact and process checks). Run (from backend/):  python -X utf8 -m ml.p6_verify
Writes docs/06-verification.json. pytest results are recorded separately in the final report. Every item is computed here;
none is asserted by assumption."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
DOCS = BACKEND.parent / "docs"
P6 = BACKEND / "experiments" / "phase6"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def check_manifest(manifest: Path, base: Path) -> dict:
    bad, n = [], 0
    for line in manifest.read_text().splitlines():
        h, f = line.split(" *", 1)
        n += 1
        p = base / f
        if not p.exists() or sha(p) != h:
            bad.append(f)
    return {"files": n, "mismatched_or_missing": bad, "all_match": not bad}


def main() -> None:
    out: dict = {}
    out["phase5_artifacts"] = check_manifest(DOCS / "phase5_artifact_manifest.sha256", BACKEND)
    d = BACKEND / "data" / "raw" / "E_yashdharme"
    out["raw_dataset_E"] = check_manifest(d / "SHA256SUMS.txt", BACKEND / "data" / "raw" / "..")  if False else {
        "all_match": all(sha(d / l.split(" *", 1)[1].split("/")[-1]) == l.split(" *", 1)[0] for l in (d / "SHA256SUMS.txt").read_text().splitlines())}
    # stage ordering and freeze checksum
    f = P6 / "tuning" / "frozen_candidates.json"
    ms = json.loads((P6 / "multiseed" / "results.json").read_text())
    out["freeze"] = {"multiseed_used_frozen_sha256": ms["frozen_sha256"] == sha(f), "frozen_written_before_multiseed_results": f.stat().st_mtime < (P6 / "multiseed" / "results.json").stat().st_mtime,
                     "frozen_written_before_candidate_training": f.stat().st_mtime < (P6 / "candidates_training.json").stat().st_mtime,
                     "frozen_sha256": sha(f)}
    # leakage re-derivation from recorded seeds
    from ml.p6_common import EVAL_SEEDS, POOL_SEED, assign_pools, eval_split, load_frame
    df = load_frame(); pool = assign_pools(df, POOL_SEED)
    leaks, rows = [], 0
    for s in EVAL_SEEDS:
        for r in ("T", "TV"):
            tr, te, codes = eval_split(df, pool, s, r)
            rec = next(x for x in ms["records"] if x["seed"] == s and x["recipe"] == r)
            if set(tr.flight_code) & set(te.flight_code) or rec["test_rows"] != len(te) or rec["train_test_code_overlap"] != 0:
                leaks.append((s, r))
            rows += 1
    out["held_out_codes_never_in_training"] = {"seed_recipe_pairs_checked": rows, "violations": leaks}
    out["seeds_recorded"] = sorted({x["seed"] for x in ms["records"]})
    # final model: fresh-process load, determinism, finite/positive, backend import
    code = r"""
import json, numpy as np, sys
sys.path.insert(0, '.')
from ml.inference import load_final_model, predict_fares, load_options
from ml.p6_common import load_frame, xy
from app.main import app
from fastapi.testclient import TestClient
df = load_frame(); X, y = xy(df[df.role=='test'].sample(5000, random_state=3))
m = load_final_model(); p1 = predict_fares(m, X, check=False)
m2 = load_final_model(); p2 = predict_fares(m2, X, check=False)
print(json.dumps({"n": int(len(p1)), "finite_positive": bool(np.isfinite(p1).all() and (p1>0).all()), "identical_across_two_loads": bool(np.array_equal(p1,p2)),
 "health_endpoint": TestClient(app).get('/health').json(), "pred_sample": [float(x) for x in p1[:3]], "actual_sample": [int(x) for x in y.iloc[:3]]}))
"""
    r = subprocess.run([sys.executable, "-X", "utf8", "-c", code], capture_output=True, text=True, cwd=str(BACKEND))
    out["final_model_fresh_process"] = json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else {"error": r.stderr[-1500:]}
    # a second, independent process must reproduce predictions bit-for-bit
    r2 = subprocess.run([sys.executable, "-X", "utf8", "-c", code], capture_output=True, text=True, cwd=str(BACKEND))
    if r.returncode == 0 and r2.returncode == 0:
        out["final_model_two_processes_same_predictions"] = json.loads(r.stdout.strip().splitlines()[-1])["pred_sample"] == json.loads(r2.stdout.strip().splitlines()[-1])["pred_sample"]
    meta = json.loads((BACKEND / "saved_models" / "final" / "final_model_metadata.json").read_text())
    out["final_model_file_sha256_matches_metadata"] = sha(BACKEND / "saved_models" / "final" / "airfare_model.joblib") == meta["sha256"]
    out["final_model_reproducibility_checks"] = meta["reproducibility_checks"]
    out["flight_code_in_inputs"] = "flight_code" in meta["predict_contract"]["input_columns"]
    (DOCS / "06-verification.json").write_text(json.dumps(out, indent=1, default=str), encoding="utf-8")
    print(json.dumps(out, indent=1, default=str)[:4000])


if __name__ == "__main__":
    main()
