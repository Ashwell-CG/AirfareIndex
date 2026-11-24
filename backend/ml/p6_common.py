"""Phase 6 shared code: flight-code pools, grouped splits, candidate models, blends.

Guards (also enforced by tests/test_phase6.py):
  * flight_code is NEVER a model input; it is used only to build leak-free group splits.
  * tuning touches DEV-pool flights only; evaluation test flights come from the EVAL pool.
  * held-out codes never appear in the rows used to fit anything that scores them.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from xgboost import XGBRegressor

from ml.feature_engineering import RAW_INPUTS, build_preprocessor, split_xy
from ml.splits import SPLITS, load_model_frame

POOL_SEED = 6001
TUNE_PARTITION_SEEDS = [6101, 6102]
SEARCH_SEED = 6201
EVAL_SEEDS = list(range(7001, 7011))        # 10 seeds
MODEL_SEED = 42
TUNE_VAL_CODE_FRAC = 0.30                   # of DEV codes per airline, per partition
EVAL_TEST_CODE_FRAC_OF_POOL = 0.40          # of EVAL codes per airline (= ~20% of all codes)
LOG_FLOOR = 1.0


# --------------------------------------------------------------------------- data and pools
def load_frame() -> pd.DataFrame:
    """Model frame (First class excluded) with Phase 4 date block and role columns attached."""
    df = load_model_frame()
    sp = pd.read_csv(SPLITS)
    assert (sp.row_id.to_numpy() == df.row_id.to_numpy()).all()
    df["block"] = sp.block.to_numpy()
    df["role"] = sp.split_primary.to_numpy()          # train / val / test date blocks (Phase 4)
    return df


def codes_by_airline(df: pd.DataFrame) -> dict[str, np.ndarray]:
    return {a: np.sort(g.flight_code.unique()) for a, g in df.groupby("airline")}


def assign_pools(df: pd.DataFrame, seed: int = POOL_SEED) -> dict[str, str]:
    """Split flight codes 50/50 into DEV and EVAL, stratified by airline (airlines with one code go to DEV)."""
    rng = np.random.default_rng(seed)
    pool = {}
    for a, codes in codes_by_airline(df).items():
        perm = rng.permutation(codes)
        n_dev = int(np.ceil(len(codes) / 2))
        for i, c in enumerate(perm):
            pool[str(c)] = "DEV" if i < n_dev else "EVAL"
    return pool


def draw_codes(codes: dict[str, np.ndarray], frac: float, seed: int) -> set[str]:
    """Per airline, draw round(frac * n) codes (at least 1 if the airline has >= 2 codes)."""
    rng = np.random.default_rng(seed)
    out: set[str] = set()
    for a in sorted(codes):
        c = np.sort(codes[a])
        k = int(round(frac * len(c)))
        if len(c) >= 2:
            k = max(1, k)
        if k:
            out |= set(rng.choice(c, size=min(k, len(c)), replace=False).tolist())
    return out


def tuning_partition(df: pd.DataFrame, pool: dict[str, str], seed: int):
    """DEV-only grouped validation: val codes are held out of tuning-train; train/val also separated by date blocks."""
    dev = df[df.flight_code.map(pool) == "DEV"]
    val_codes = draw_codes(codes_by_airline(dev), TUNE_VAL_CODE_FRAC, seed)
    tr = dev[(dev.role == "train") & ~dev.flight_code.isin(val_codes)]
    va = dev[(dev.role == "val") & dev.flight_code.isin(val_codes)]
    return tr, va, val_codes


def eval_split(df: pd.DataFrame, pool: dict[str, str], seed: int, recipe: str):
    """Unseen-flight evaluation split. Test = held-out EVAL codes in the test date blocks.
    Training = every other code in train blocks (recipe 'T') or train+val blocks (recipe 'TV'); test blocks never used."""
    ev = df[df.flight_code.map(pool) == "EVAL"]
    test_codes = draw_codes(codes_by_airline(ev), EVAL_TEST_CODE_FRAC_OF_POOL, seed)
    roles = ["train"] if recipe == "T" else ["train", "val"]
    tr = df[df.role.isin(roles) & ~df.flight_code.isin(test_codes)]
    te = df[(df.role == "test") & df.flight_code.isin(test_codes)]
    assert not (set(tr.flight_code) & set(te.flight_code)), "held-out codes leaked into training"
    return tr, te, test_codes


# --------------------------------------------------------------------------- representations and weights
class RepresentationVariant(BaseEstimator, TransformerMixin):
    """Stateless coarsening to reduce how precisely an itinerary can be re-identified."""

    def __init__(self, dep: str = "exact", duration_round: float | None = None):
        self.dep, self.duration_round = dep, duration_round

    def fit(self, X, y=None):
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        if self.dep == "drop":
            X["dep_minutes"] = 0
        elif self.dep == "window4":                     # 00-06, 06-12, 12-18, 18-24 -> window midpoint
            X["dep_minutes"] = (X["dep_minutes"] // 360) * 360 + 180
        if self.duration_round:
            X["duration_hours"] = np.round(X["duration_hours"] / self.duration_round) * self.duration_round
        return X


VARIANTS = {
    "base": {"dep": "exact", "duration_round": None},
    "no_dep_minutes": {"dep": "drop", "duration_round": None},
    "dep_window4": {"dep": "window4", "duration_round": None},
    "duration_round_0.5h": {"dep": "exact", "duration_round": 0.5},
    "no_dep_and_round": {"dep": "drop", "duration_round": 0.5},
}


def itinerary_weights(X: pd.DataFrame, power: float) -> np.ndarray | None:
    """Down-weight repeated model-visible itineraries: w = n^-power, normalised to mean 1. Uses model inputs only."""
    if not power:
        return None
    cols = ["airline", "source", "destination", "travel_class", "stops", "dep_minutes", "duration_hours"]
    n = X[cols].assign(_one=1).groupby(cols, observed=True)["_one"].transform("sum").to_numpy(float)
    w = n ** (-power)
    return w / w.mean()


def build_pre(kind: str, variant: str = "base") -> Pipeline:
    base = build_preprocessor(kind)
    return Pipeline([("variant", RepresentationVariant(**VARIANTS[variant]))] + list(base.steps))


# --------------------------------------------------------------------------- predictors (all predict INR)
class RouteLookup(BaseEstimator):
    """Reference baseline: training median fare by airline+route+class+stops, falling back to coarser keys."""

    LEVELS = [["airline", "route", "travel_class", "stops"], ["airline", "travel_class", "stops"],
              ["travel_class", "stops"], ["travel_class"]]

    def fit(self, X, y=None, **kw):
        d = X.copy()
        d["route"] = d.source + "-" + d.destination
        d["fare"] = np.asarray(y, float)
        self.tables_ = [d.groupby(c).fare.median() for c in self.LEVELS]
        self.global_ = float(d.fare.median())
        return self

    def predict(self, X):
        d = X.copy()
        d["route"] = d.source + "-" + d.destination
        pred = np.full(len(d), np.nan)
        for cols, tab in zip(self.LEVELS, self.tables_):
            idx = pd.MultiIndex.from_frame(d[cols]) if len(cols) > 1 else pd.Index(d[cols[0]])
            vals = tab.reindex(idx).to_numpy(float)
            pred = np.where(np.isnan(pred), vals, pred)
        return np.where(np.isnan(pred), self.global_, pred)


class LogBlend(BaseEstimator):
    """Weighted average of member predictions in log1p space (members already predict INR)."""

    def __init__(self, members=None, weights=None):
        self.members, self.weights = members, weights

    def predict(self, X):
        z = sum(w * np.log1p(np.clip(m.predict(X), 0, None)) for m, w in zip(self.members, self.weights))
        return np.expm1(z)


def fit_candidate(kind: str, params: dict, Xtr: pd.DataFrame, ytr: pd.Series, variant: str = "base",
                  weight_power: float = 0.0, n_jobs: int = -1):
    """Returns a fitted object whose .predict(X) gives INR. Fit once; log1p target for model-based kinds."""
    assert list(Xtr.columns) == RAW_INPUTS, "model inputs must be exactly the 8 raw inputs (no flight_code)"
    if kind == "lookup":
        return RouteLookup().fit(Xtr, ytr)
    w = itinerary_weights(Xtr, weight_power)
    if kind == "rf":
        est = RandomForestRegressor(n_estimators=params.get("n_estimators", 150), n_jobs=n_jobs, random_state=MODEL_SEED,
                                    **{k: v for k, v in params.items() if k != "n_estimators"})
        pipe = Pipeline([("pre", build_pre("tree", variant)), ("model", est)])
    elif kind == "xgb":
        est = XGBRegressor(tree_method="hist", n_jobs=n_jobs, random_state=MODEL_SEED, **params)
        pipe = Pipeline([("pre", build_pre("tree", variant)), ("model", est)])
    elif kind == "ridge":
        pipe = Pipeline([("pre", build_pre("linear", "base")), ("model", Ridge(random_state=MODEL_SEED, **params))])
    else:
        raise ValueError(kind)
    ttr = TransformedTargetRegressor(regressor=pipe, func=np.log1p, inverse_func=np.expm1, check_inverse=False)
    fit_params = {"model__sample_weight": w} if w is not None else {}
    return ttr.fit(Xtr, ytr, **fit_params)


def xy(df: pd.DataFrame):
    return split_xy(df)
