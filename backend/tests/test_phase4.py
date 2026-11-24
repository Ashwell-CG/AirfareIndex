"""Phase 4 leakage and split checks. Skipped if the processed data has not been generated."""
import numpy as np
import pandas as pd
import pytest

from ml import feature_engineering as fe
from ml import splits as sp_mod

pytestmark = pytest.mark.skipif(not sp_mod.CLEAN.exists() or not sp_mod.SPLITS.exists(),
                                reason="run ml.preprocessing and ml.splits first")


@pytest.fixture(scope="module")
def data():
    df = sp_mod.load_model_frame()
    sp = pd.read_csv(sp_mod.SPLITS)
    return df, sp


def test_inputs_exclude_target_and_identifiers():
    forbidden = set(fe.EXCLUDED)
    assert not forbidden & set(fe.RAW_INPUTS)
    assert fe.TARGET not in fe.RAW_INPUTS


def test_first_class_removed_from_model_frame_but_kept_in_clean_file(data):
    df, _ = data
    assert "First" not in set(df.travel_class)
    assert (pd.read_csv(sp_mod.CLEAN).travel_class == "First").sum() == 144


def test_split_integrity(data):
    df, sp = data
    chk = sp_mod.verify_integrity(df, sp)
    for s in ["split_primary", "split_group"]:
        assert chk[s]["disjoint"] and chk[s]["val_days_left_inside_train_range"] and chk[s]["test_days_left_inside_train_range"]
    assert chk["split_stress"]["disjoint"]
    assert not chk["split_stress"]["test_days_left_inside_train_range"]  # by design
    assert chk["blocks_are_5_consecutive_dates"] and chk["block_date_sets_disjoint"]
    assert chk["group_split_zero_code_overlap"]["test"]


def test_stress_test_is_last_ten_dates(data):
    df, sp = data
    t = df[sp.split_stress == "test"]
    assert t.days_left.min() == 41 and t.days_left.max() == 50 and t.journey_date.nunique() == 10


def test_fit_uses_training_rows_only(data):
    df, sp = data
    X, _ = fe.split_xy(df)
    tr = X[sp.split_primary == "train"]
    pre = fe.build_preprocessor("tree").fit(tr)
    before = dict(pre.named_steps["route_ref"].ref_)
    # transforming wildly different held-out data must not change learned state
    te = X[sp.split_primary == "test"].copy()
    te["duration_hours"] *= 10
    pre.transform(te)
    assert pre.named_steps["route_ref"].ref_ == before
    # reference equals the training non-stop medians
    ns = tr[tr.stops == "non-stop"]
    exp = ns.groupby(ns.source + "-" + ns.destination).duration_hours.median().to_dict()
    assert before == exp


@pytest.mark.parametrize("kind", ["tree", "linear"])
def test_transform_is_finite_and_handles_unseen_category(data, kind):
    df, sp = data
    X, _ = fe.split_xy(df)
    pre = fe.build_preprocessor(kind).fit(X[sp.split_primary == "train"])
    Z = pre.transform(X[sp.split_primary == "test"].head(1000))
    assert np.isfinite(Z.to_numpy()).all()
    odd = X.head(3).copy()
    odd["airline"] = "BrandNewAir"
    assert np.isfinite(pre.transform(odd).to_numpy()).all()
