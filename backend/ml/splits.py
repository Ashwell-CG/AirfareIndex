"""Phase 4: approved data splits for Dataset E.   Run (from backend/):  python -X utf8 -m ml.splits

Scope: the cleaned file keeps every class; the *model frame* excludes First class (Decision 2).
Three partitions are written to data/processed/splits.csv (one row per model-frame row):

  split_primary  date-block holdout (primary evaluation). 10 blocks of 5 consecutive journey dates.
  split_group    primary date blocks PLUS held-out flight codes (zero flight-code overlap, fewer rows).
  split_stress   strict chronological holdout: last 10 of 50 dates (days_left 41-50) as test.

Nothing here looks at fare. Audits use only identifiers, dates and counts, plus one clearly
labelled validation-only memorisation reference (see audit_twin_reference).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
CLEAN = BACKEND / "data" / "processed" / "airfare_e_clean.csv"
SPLITS = BACKEND / "data" / "processed" / "splits.csv"
DOCS = BACKEND.parent / "docs"

EXCLUDED_CLASSES = ["First"]
BLOCK_LEN = 5                      # consecutive journey dates per block
# Block index -> role. Blocks 0 and 9 (days_left 1-5 and 46-50) stay in train so that every
# validation/test block has training blocks on both sides: no days_left extrapolation.
BLOCK_ROLE = {0: "train", 1: "train", 2: "val", 3: "train", 4: "test",
              5: "train", 6: "val", 7: "train", 8: "test", 9: "train"}
HELD_OUT_CODE_FRACTION = 0.20      # per airline, for split_group
SEED = 42
STRESS_TEST_DATES = 10             # strict last 20% of the 50 dates
STRESS_VAL_DATES = 5               # the 5 dates before that, for validation

KEYS = {
    "flight_code": ["flight_code"],
    "airline+route+class": ["airline", "route", "travel_class"],
    "airline+flight+route+class": ["airline", "flight_code", "route", "travel_class"],
    "itinerary (series + dep time + duration + stops)":
        ["airline", "flight_code", "route", "travel_class", "dep_minutes", "duration_hours", "stops"],
}


def load_model_frame() -> pd.DataFrame:
    """Cleaned data minus excluded classes. row_id = row position in airfare_e_clean.csv (never reset)."""
    df = pd.read_csv(CLEAN, parse_dates=["journey_date"])
    df.insert(0, "row_id", np.arange(len(df)))
    df = df[~df.travel_class.isin(EXCLUDED_CLASSES)].copy()
    df["route"] = df.source + "-" + df.destination
    return df.reset_index(drop=True)


def make_splits(df: pd.DataFrame) -> pd.DataFrame:
    dates = np.sort(df.journey_date.unique())
    assert len(dates) == 50, "design assumes the 50 journey dates of Dataset E"
    date_pos = pd.Series(range(len(dates)), index=dates)
    pos = df.journey_date.map(date_pos).to_numpy()
    out = pd.DataFrame({"row_id": df.row_id.to_numpy()})

    # primary: date blocks
    out["block"] = pos // BLOCK_LEN
    out["split_primary"] = out.block.map(BLOCK_ROLE)

    # group variant: hold out ~20% of flight codes per airline (seeded), keep date blocks
    rng = np.random.default_rng(SEED)
    held = []
    for airline, codes in df.groupby("airline").flight_code.unique().items():
        codes = np.sort(codes)
        k = max(1, int(round(HELD_OUT_CODE_FRACTION * len(codes)))) if len(codes) >= 3 else 0
        if k:
            held.extend(rng.choice(codes, size=k, replace=False).tolist())
    held = set(held)
    is_held = df.flight_code.isin(held).to_numpy()
    g = out.split_primary.copy()
    g[(out.split_primary == "train") & is_held] = "dropped"   # held-out flights may not appear in training
    g[(out.split_primary == "val") & is_held] = "dropped"
    g[(out.split_primary == "test") & ~is_held] = "dropped"   # test = unseen flights only
    out["split_group"] = g
    out["held_out_code"] = is_held

    # stress: strict chronological
    s = np.where(pos >= 50 - STRESS_TEST_DATES, "test",
                 np.where(pos >= 50 - STRESS_TEST_DATES - STRESS_VAL_DATES, "val", "train"))
    out["split_stress"] = s
    return out


# ---------------------------------------------------------------- audits (no fare, no models)
def describe(df: pd.DataFrame, labels: pd.Series) -> dict:
    res = {}
    for name in ["train", "val", "test", "dropped"]:
        sub = df[labels.to_numpy() == name]
        if sub.empty:
            continue
        res[name] = {
            "rows": int(len(sub)),
            "journey_dates": [str(sub.journey_date.min().date()), str(sub.journey_date.max().date())],
            "n_dates": int(sub.journey_date.nunique()),
            "days_left_range": [int(sub.days_left.min()), int(sub.days_left.max())],
            "classes": {k: int(v) for k, v in sub.travel_class.value_counts().items()},
            "airlines": {k: int(v) for k, v in sub.airline.value_counts().items()},
            "flight_codes": int(sub.flight_code.nunique()),
        }
    return res


def audit_overlap(df: pd.DataFrame, labels: pd.Series, target: str) -> dict:
    """Share of `target` rows whose key also occurs in train, for each identity key."""
    tr = df[labels.to_numpy() == "train"]
    te = df[labels.to_numpy() == target]
    out = {}
    for name, cols in KEYS.items():
        trk = pd.MultiIndex.from_frame(tr[cols]).unique()
        mask = pd.MultiIndex.from_frame(te[cols]).isin(trk)
        out[name] = {"rows_with_key_in_train": int(mask.sum()), "share": round(float(mask.mean()), 4),
                     "distinct_keys_in_target": int(te[cols].drop_duplicates().shape[0]),
                     "distinct_keys_unseen_in_train": int(te[cols].drop_duplicates().shape[0]
                                                         - pd.MultiIndex.from_frame(te[cols].drop_duplicates()).isin(trk).sum())}
    return out


def audit_twin_reference(df: pd.DataFrame, labels: pd.Series) -> dict:
    """Memorisation reference, computed on VALIDATION rows only (the test sets stay untouched).
    For each validation row with an itinerary twin in train, compare its fare with the median fare of
    its twins. This is a group-median lookup, not a trained model; it shows how much of the fare is
    already recoverable from repeated identities, which is how a flight-code-free model could still
    memorise. It is NOT used for model selection."""
    cols = KEYS["itinerary (series + dep time + duration + stops)"]
    tr = df[labels.to_numpy() == "train"]
    va = df[labels.to_numpy() == "val"]
    med = tr.groupby(cols).fare.median().rename("twin_median")
    j = va.join(med, on=cols)
    has = j.twin_median.notna()
    rel = ((j.fare - j.twin_median).abs() / j.fare)[has]
    return {"val_rows": int(len(va)), "val_rows_with_itinerary_twin_in_train": int(has.sum()),
            "share": round(float(has.mean()), 4),
            "median_abs_relative_gap_to_twin_median": round(float(rel.median()), 4),
            "p90_abs_relative_gap": round(float(rel.quantile(.9)), 4)}


def verify_integrity(df: pd.DataFrame, sp: pd.DataFrame) -> dict:
    d = df.set_index("row_id")
    chk = {}
    for col in ["split_primary", "split_group", "split_stress"]:
        lab = sp.set_index("row_id")[col]
        parts = {k: set(lab.index[lab == k]) for k in ["train", "val", "test"]}
        chk[col] = {"disjoint": all(not (parts[a] & parts[b]) for a in parts for b in parts if a < b),
                    "no_first_class": not (d.loc[sorted(set().union(*parts.values()))].travel_class == "First").any()}
        tr_rng = d.loc[list(parts["train"])].days_left.agg(["min", "max"]).tolist()
        for t in ["val", "test"]:
            r = d.loc[list(parts[t])].days_left.agg(["min", "max"]).tolist()
            chk[col][f"{t}_days_left_inside_train_range"] = bool(r[0] >= tr_rng[0] and r[1] <= tr_rng[1])
    # date blocks are contiguous
    b = df.assign(block=sp.block.to_numpy()).groupby("block").journey_date.agg(["min", "max", "nunique"])
    chk["blocks_are_5_consecutive_dates"] = bool(((b["max"] - b["min"]).dt.days == (b["nunique"] - 1)).all()
                                                 and (b["nunique"] == BLOCK_LEN).all())
    chk["block_date_sets_disjoint"] = bool(df.assign(block=sp.block.to_numpy()).groupby("journey_date").block.nunique().max() == 1)
    gl = df.assign(lab=sp.split_group.to_numpy())
    tr_codes = set(gl[gl.lab == "train"].flight_code);
    chk["group_split_zero_code_overlap"] = {t: len(set(gl[gl.lab == t].flight_code) & tr_codes) == 0 for t in ["test"]}
    chk["group_val_zero_code_overlap_with_held_out_test"] = len(set(gl[gl.lab == "val"].flight_code) & set(gl[gl.lab == "test"].flight_code)) == 0
    return chk


def main() -> None:
    df = load_model_frame()
    sp = make_splits(df)
    SPLITS.parent.mkdir(parents=True, exist_ok=True)
    sp.to_csv(SPLITS, index=False)
    report = {
        "config": {"block_len": BLOCK_LEN, "block_role": BLOCK_ROLE, "seed": SEED,
                   "held_out_code_fraction": HELD_OUT_CODE_FRACTION, "excluded_classes": EXCLUDED_CLASSES,
                   "stress_test_dates": STRESS_TEST_DATES, "stress_val_dates": STRESS_VAL_DATES},
        "model_frame_rows": int(len(df)),
        "held_out_flight_codes": int(sp.held_out_code.groupby(df.flight_code.to_numpy()).first().sum()),
        "integrity": verify_integrity(df, sp),
    }
    for name in ["split_primary", "split_group", "split_stress"]:
        lab = sp[name]
        report[name] = {"partitions": describe(df, lab),
                        "overlap_val_vs_train": audit_overlap(df, lab, "val"),
                        "overlap_test_vs_train": audit_overlap(df, lab, "test")}
    report["split_primary"]["twin_reference_validation_only"] = audit_twin_reference(df, sp.split_primary)
    report["split_stress"]["twin_reference_validation_only"] = audit_twin_reference(df, sp.split_stress)
    # block table
    bt = df.assign(block=sp.block.to_numpy(), role=sp.split_primary.to_numpy()).groupby("block").agg(
        role=("role", "first"), first=("journey_date", "min"), last=("journey_date", "max"),
        days_left_min=("days_left", "min"), days_left_max=("days_left", "max"), rows=("row_id", "size"))
    report["block_table"] = [{"block": int(i), "role": r.role, "dates": f"{r['first'].date()} to {r['last'].date()}",
                              "days_left": f"{r.days_left_min}-{r.days_left_max}", "rows": int(r.rows)} for i, r in bt.iterrows()]
    (DOCS / "04-splits.json").write_text(json.dumps(report, indent=1, default=str), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ["model_frame_rows", "held_out_flight_codes", "integrity"]}, indent=1))


if __name__ == "__main__":
    main()
