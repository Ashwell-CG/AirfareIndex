"""Phase 6 leakage, protocol and artifact tests. Tests that need trained artifacts skip if they do not exist yet."""
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from ml import inference
from ml.feature_engineering import RAW_INPUTS
from ml.p6_common import (EVAL_SEEDS, POOL_SEED, TUNE_PARTITION_SEEDS, assign_pools, eval_split, fit_candidate, load_frame,
                          tuning_partition, xy)
from ml.splits import CLEAN

BACKEND = Path(__file__).resolve().parents[1]
P6 = BACKEND / "experiments" / "phase6"
FINAL = BACKEND / "saved_models" / "final" / "airfare_model.joblib"
pytestmark = pytest.mark.skipif(not CLEAN.exists(), reason="processed data not generated")


@pytest.fixture(scope="module")
def frame():
    df = load_frame()
    return df, assign_pools(df, POOL_SEED)


def test_inputs_have_no_flight_code():
    assert "flight_code" not in RAW_INPUTS and len(RAW_INPUTS) == 8


def test_pools_partition_all_codes(frame):
    df, pool = frame
    assert set(pool) == set(df.flight_code.unique())
    assert set(pool.values()) == {"DEV", "EVAL"}
    share = sum(v == "DEV" for v in pool.values()) / len(pool)
    assert 0.45 < share < 0.6


def test_tuning_partitions_use_only_dev_flights_and_are_grouped(frame):
    df, pool = frame
    for seed in TUNE_PARTITION_SEEDS:
        tr, va, vc = tuning_partition(df, pool, seed)
        assert set(tr.flight_code).isdisjoint(set(va.flight_code))
        assert all(pool[c] == "DEV" for c in set(tr.flight_code) | set(va.flight_code))
        assert set(tr.role) == {"train"} and set(va.role) == {"val"}          # also separated by date blocks


@pytest.mark.parametrize("recipe", ["T", "TV"])
def test_eval_split_never_leaks_held_out_codes(frame, recipe):
    df, pool = frame
    for seed in EVAL_SEEDS:
        tr, te, codes = eval_split(df, pool, seed, recipe)
        assert set(tr.flight_code).isdisjoint(codes)
        assert set(te.flight_code) <= codes and all(pool[c] == "EVAL" for c in codes)
        assert set(te.role) == {"test"} and "test" not in set(tr.role)
        assert ("val" in set(tr.role)) == (recipe == "TV")
        assert "First" not in set(tr.travel_class) | set(te.travel_class)


def test_eval_seeds_are_ten_and_distinct(frame):
    df, pool = frame
    assert len(set(EVAL_SEEDS)) == 10
    sets = [frozenset(eval_split(df, pool, s, "T")[2]) for s in EVAL_SEEDS[:3]]
    assert len(set(sets)) == 3


def test_fit_rejects_flight_code_column(frame):
    df, _ = frame
    X = df.head(200).copy()
    with pytest.raises(AssertionError):
        fit_candidate("ridge", {"alpha": 1.0}, X[RAW_INPUTS + ["flight_code"]], X.fare)


def test_lookup_predicts_finite(frame):
    df, _ = frame
    X, y = xy(df.head(5000))
    p = fit_candidate("lookup", {}, X, y).predict(X)
    assert np.isfinite(p).all() and (p > 0).all()


def test_phase5_artifacts_unchanged():
    manifest = BACKEND.parent / "docs" / "phase5_artifact_manifest.sha256"
    if not manifest.exists():
        pytest.skip("manifest missing")
    bad = []
    for line in manifest.read_text().splitlines():
        h, f = line.split(" *", 1)
        p = BACKEND / f
        if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != h:
            bad.append(f)
    assert not bad, bad


def test_raw_data_unchanged():
    d = BACKEND / "data" / "raw" / "E_yashdharme"
    for line in (d / "SHA256SUMS.txt").read_text().splitlines():
        h, f = line.split(" *", 1)
        assert hashlib.sha256((d.parent.parent.parent / f).read_bytes()).hexdigest() == h


def test_dataset_a_is_not_referenced_by_training_code():
    for mod in ["p6_common.py", "p6_tune.py", "p6_eval.py", "p6_train.py", "p6_select.py", "p6_explain.py"]:
        assert "A_bathwal" not in (BACKEND / "ml" / mod).read_text(), mod


def test_frozen_before_results():
    f, r = P6 / "tuning" / "frozen_candidates.json", P6 / "multiseed" / "results.json"
    if not (f.exists() and r.exists()):
        pytest.skip("stages not run")
    assert json.loads(r.read_text())["frozen_sha256"] == hashlib.sha256(f.read_bytes()).hexdigest()
    assert f.stat().st_mtime < r.stat().st_mtime


def test_validate_rejects_unsupported_inputs():
    ok = {"airline": "Vistara", "travel_class": "Economy", "source": "Delhi", "destination": "Mumbai", "stops": "non-stop",
          "duration_hours": 2.2, "days_left": 10, "dep_minutes": 600}
    inference.validate(pd.DataFrame([ok]))
    for bad in [{**ok, "airline": "Indigo", "travel_class": "Premium Economy"}, {**ok, "travel_class": "First"}, {**ok, "days_left": 80},
                {**ok, "stops": "3-stop"}, {**ok, "duration_hours": 30}, {**ok, "source": "Delhi", "destination": "Delhi"}]:
        with pytest.raises(inference.InvalidFlightInput):
            inference.validate(pd.DataFrame([bad]))
    with pytest.raises(inference.InvalidFlightInput):
        inference.validate(pd.DataFrame([{**ok, "flight_code": "UK-1"}]))


@pytest.mark.skipif(not FINAL.exists(), reason="final model not built yet")
def test_final_model_loads_and_predicts_finite_positive(frame):
    df, _ = frame
    m = inference.load_final_model()
    X, _ = xy(df[df.role == "test"].sample(2000, random_state=1))
    p = inference.predict_fares(m, X, check=False)
    assert p.shape == (2000,) and np.isfinite(p).all() and (p > 0).all()
    assert np.array_equal(p, inference.predict_fares(m, X, check=False))      # deterministic
    meta = json.loads((FINAL.parent / "final_model_metadata.json").read_text())
    assert meta["predict_contract"]["input_columns"] == RAW_INPUTS and meta["predict_contract"]["flight_code_used_as_feature"] is False
    assert "test date blocks" in meta["training"]["excluded"] and "Dataset A" in meta["training"]["excluded"]
