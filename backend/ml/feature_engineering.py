"""Phase 4: feature specification and leakage-safe transformation pipelines.

Everything that learns a statistic (route reference duration, category lists, scaling constants) is
a scikit-learn estimator that is fitted on TRAINING rows only. Fare is never an input.

Run (from backend/):  python -X utf8 -m ml.feature_engineering
  -> fits both preprocessors on split_primary train, checks every split, writes
     docs/04-feature-spec.json and data/processed/supported_options.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, OrdinalEncoder, StandardScaler

BACKEND = Path(__file__).resolve().parents[1]
DOCS = BACKEND.parent / "docs"

TARGET = "fare"
# The only columns the app/user supplies. Everything else is derived from these.
RAW_INPUTS = ["airline", "travel_class", "source", "destination", "stops",
              "duration_hours", "days_left", "dep_minutes"]
STOPS_ORDER = ["non-stop", "1-stop", "2+-stop"]

# Columns that must never reach a model, with the reason (also checked by tests).
EXCLUDED = {
    "fare": "target",
    "row_id": "row identifier",
    "flight_code": "identifier of a recurring flight (1,405 levels, determines airline): memorisation risk (Decision)",
    "journey_date": "days_left is a one-to-one function of it (single booking date); keeping both lets a model memorise dates",
    "weekday": "function of journey_date; Economy variance share 0.003 (Phase 3)",
    "arr_minutes": "exactly (dep_minutes + duration) mod 24h in 100% of rows: redundant",
    "dep_bucket": "exact function of dep_minutes",
    "arr_bucket": "exact function of arr_minutes",
    "block": "split bookkeeping",
}


class RouteReference(BaseEstimator, TransformerMixin):
    """Adds route, route_ref_duration_hours and duration_ratio.

    route_ref_duration_hours = median non-stop duration of the source-destination route, learned from
    the rows passed to fit() (a distance proxy built from a feature, never from fare). duration_ratio =
    duration / reference, i.e. how much longer than direct the itinerary is.
    """

    def fit(self, X: pd.DataFrame, y=None):
        route = X["source"] + "-" + X["destination"]
        ns = X["stops"] == "non-stop"
        self.ref_ = X.loc[ns].groupby(route[ns])["duration_hours"].median().to_dict()
        self.fallback_ = float(X.loc[ns, "duration_hours"].median())
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        X["route"] = X["source"] + "-" + X["destination"]
        X["route_ref_duration_hours"] = X["route"].map(self.ref_).fillna(self.fallback_).astype(float)
        X["duration_ratio"] = X["duration_hours"] / X["route_ref_duration_hours"]
        return X


class LinearExtras(BaseEstimator, TransformerMixin):
    """Stateless transforms that help a linear model (trees do not need them)."""

    def fit(self, X, y=None):
        return self

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        X = X.copy()
        ang = 2 * np.pi * X["dep_minutes"] / 1440.0
        X["dep_sin"], X["dep_cos"] = np.sin(ang), np.cos(ang)
        X["log1p_days_left"] = np.log1p(X["days_left"])
        X["log_duration_ratio"] = np.log(X["duration_ratio"])
        X["airline_class"] = X["airline"] + "|" + X["travel_class"]
        return X


def build_preprocessor(kind: str = "tree", route_ref: bool = True, linear_extras: bool = True) -> Pipeline:
    """kind='tree'   : one-hot nominal, ordinal stops, raw numerics (no scaling).
       kind='linear' : one-hot incl. stops/route/airline_class, cyclic time, log lead time, scaled numerics.

    Phase 5 ablation switches (defaults reproduce the Phase 4 pipelines exactly):
      route_ref=False      drops route_ref_duration_hours, duration_ratio (and log_duration_ratio for linear)
      linear_extras=False  (linear only) drops route, airline_class, dep_sin/cos, log1p_days_left;
                           raw dep_minutes is then used instead."""
    rr = ["route_ref_duration_hours", "duration_ratio"] if route_ref else []
    if kind == "tree":
        cols = ColumnTransformer([
            ("nominal", OneHotEncoder(handle_unknown="ignore", sparse_output=False),
             ["airline", "travel_class", "source", "destination"]),
            ("stops", OrdinalEncoder(categories=[STOPS_ORDER], handle_unknown="use_encoded_value", unknown_value=-1), ["stops"]),
            ("numeric", "passthrough", ["duration_hours", "days_left", "dep_minutes"] + rr),
        ], verbose_feature_names_out=False)
        steps = [("route_ref", RouteReference()), ("columns", cols)]
    elif kind == "linear":
        if linear_extras:
            nominal = ["airline", "travel_class", "source", "destination", "stops", "route", "airline_class"]
            numeric = ["duration_hours", "days_left", "log1p_days_left", "dep_sin", "dep_cos"] + \
                      (rr + ["log_duration_ratio"] if route_ref else [])
        else:
            nominal = ["airline", "travel_class", "source", "destination", "stops"]
            numeric = ["duration_hours", "days_left", "dep_minutes"] + rr
        cols = ColumnTransformer([
            ("nominal", OneHotEncoder(handle_unknown="ignore", sparse_output=False), nominal),
            ("numeric", StandardScaler(), numeric),
        ], verbose_feature_names_out=False)
        steps = [("route_ref", RouteReference()), ("extras", LinearExtras()), ("columns", cols)]
    else:
        raise ValueError(kind)
    steps[-1][1].set_output(transform="pandas")  # custom steps already return DataFrames
    return Pipeline(steps)


def split_xy(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """The only way model code should build inputs: raw input columns, nothing else."""
    return df[RAW_INPUTS].copy(), df[TARGET].copy()


# --------------------------------------------------------------------------- documentation
FEATURE_SPEC = [
    # name, kind, pipelines, derivation, rationale (all numbers from docs/03-eda-report.md or this phase)
    ("airline", "categorical (9)", "tree, linear", "raw", "eta^2 0.274 pooled / 0.235 Economy"),
    ("travel_class", "categorical (3: Economy, Premium Economy, Business)", "tree, linear", "raw", "eta^2 0.755: dominant driver; First excluded (n=144)"),
    ("source", "categorical (7)", "tree, linear", "raw", "route/market effect"),
    ("destination", "categorical (7)", "tree, linear", "raw", "route/market effect"),
    ("stops", "ordinal (non-stop<1-stop<2+-stop)", "tree: ordinal 0/1/2; linear: one-hot", "raw",
     "Economy medians 5,737 / 10,075 / 12,925 are not evenly spaced, so the linear model uses one-hot"),
    ("duration_hours", "numeric", "tree, linear", "raw", "r=0.33 with fare in Economy"),
    ("days_left", "numeric 1-50", "tree, linear", "raw", "the only lead-time signal; equals journey date minus 2023-01-15 in training"),
    ("dep_minutes", "numeric 0-1439", "tree, linear", "raw (exact clock time)", "replaces the 4 coarse buckets; weak signal (|r|<0.05)"),
    ("route_ref_duration_hours", "numeric", "tree, linear", "median non-stop duration of the route, fitted on training rows",
     "distance proxy that generalises beyond the source/destination pair"),
    ("duration_ratio", "numeric", "tree, linear", "duration_hours / route_ref_duration_hours", "measures detour/layover length relative to direct"),
    ("route", "categorical (42)", "linear only", "source + '-' + destination", "lets a linear model fit route effects (Economy eta^2 0.111)"),
    ("airline_class", "categorical (12 observed)", "linear only", "airline + '|' + class", "class exists only for some airlines; linear model needs the interaction"),
    ("dep_sin, dep_cos", "numeric", "linear only", "sin/cos of 2*pi*dep_minutes/1440", "time of day is circular; cos has |r| 0.105 vs 0.042 for raw minutes (Economy, log fare)"),
    ("log1p_days_left", "numeric", "linear only", "log(1 + days_left)", "fare falls steeply then flattens: r -0.289 vs -0.274 (Economy, log fare)"),
    ("log_duration_ratio", "numeric", "linear only", "log(duration_ratio)", "r 0.443 vs 0.390 for raw duration (Economy, log fare); weaker inside 1-stop only (0.092 vs 0.173)"),
]


def supported_options(df: pd.DataFrame) -> dict:
    """What the prediction form may offer: only combinations present in the modelling frame."""
    df = df.assign(route=df.source + "-" + df.destination)
    combos = {}
    for (a, c), g in df.groupby(["airline", "travel_class"]):
        combos.setdefault(a, {})[c] = {"rows": int(len(g)), "routes": sorted(g.route.unique().tolist())}
    return {
        "note": "Derived from the modelling frame (First class excluded). The form must offer only these.",
        "airline_class_routes": combos,
        "cities": sorted(set(df.source) | set(df.destination)),
        "stops": STOPS_ORDER,
        "days_left_range": [int(df.days_left.min()), int(df.days_left.max())],
        "dep_minutes_range": [0, 1439],
        "duration_hours_range_by_stops": {s: [float(g.duration_hours.min()), float(g.duration_hours.max())]
                                          for s, g in df.groupby("stops")},
        "excluded_classes": ["First"],
    }


def main() -> None:
    from ml.splits import SPLITS, load_model_frame
    df = load_model_frame()
    sp = pd.read_csv(SPLITS)
    assert (sp.row_id.to_numpy() == df.row_id.to_numpy()).all()
    report: dict = {"target": TARGET, "raw_inputs": RAW_INPUTS, "excluded": EXCLUDED,
                    "features": [dict(zip(["name", "type", "pipelines", "derivation", "rationale"], f)) for f in FEATURE_SPEC]}
    X, y = split_xy(df)
    checks = {}
    for kind in ["tree", "linear"]:
        pre = build_preprocessor(kind).fit(X[sp.split_primary == "train"])
        checks[kind] = {}
        for sname in ["split_primary", "split_group", "split_stress"]:
            for part in ["train", "val", "test"]:
                m = sp[sname] == part
                Z = pre.transform(X[m])
                checks[kind][f"{sname}:{part}"] = {"rows": int(len(Z)), "n_features": int(Z.shape[1]),
                                                   "nan": int(Z.isna().sum().sum()), "inf": int(np.isinf(Z.to_numpy()).sum())}
        report[f"output_columns_{kind}"] = list(pre.transform(X.iloc[:5]).columns)
        ref = pre.named_steps["route_ref"].ref_
        report["route_ref_fit_on_primary_train"] = {k: round(v, 3) for k, v in sorted(ref.items())}
    full_ref = RouteReference().fit(X).ref_
    report["route_ref_routes_differing_train_vs_all_rows"] = int(sum(
        abs(full_ref[k] - v) > 1e-9 for k, v in report["route_ref_fit_on_primary_train"].items()))
    report["transform_checks"] = checks
    (DOCS / "04-feature-spec.json").write_text(json.dumps(report, indent=1), encoding="utf-8")
    opts = supported_options(df)
    (BACKEND / "data" / "processed" / "supported_options.json").write_text(json.dumps(opts, indent=1), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ["route_ref_routes_differing_train_vs_all_rows", "transform_checks"]}, indent=1)[:2500])
    print("tree features:", len(report["output_columns_tree"]), "| linear features:", len(report["output_columns_linear"]))


if __name__ == "__main__":
    main()
