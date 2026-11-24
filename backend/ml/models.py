"""Phase 5 model factory, search spaces and fixed seeds."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, RegressorMixin
from sklearn.compose import TransformedTargetRegressor
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeRegressor
from xgboost import XGBRegressor

from ml.feature_engineering import build_preprocessor

SEED = 42

MODELS = ["mean_baseline", "class_median_baseline", "linear_regression", "ridge", "decision_tree",
          "random_forest", "gradient_boosting", "xgboost"]
BASELINES = {"mean_baseline", "class_median_baseline"}
KIND = {"linear_regression": "linear", "ridge": "linear", "decision_tree": "tree",
        "random_forest": "tree", "gradient_boosting": "tree", "xgboost": "tree"}

# Random-search spaces (sampled with ParameterSampler, seed=SEED). Sizes are capped so that saved
# random forests stay a manageable size (min_samples_leaf >= 5, 100 trees).
SPACES = {
    "linear_regression": {},
    "ridge": {"alpha": [0.01, 0.1, 1.0, 10.0, 100.0, 1000.0]},
    "decision_tree": {"max_depth": [8, 12, 16, 20, 28, None], "min_samples_leaf": [1, 3, 10, 30]},
    "random_forest": {"max_depth": [16, 24, None], "min_samples_leaf": [5, 10, 20],
                      "max_features": [0.4, 0.7, 1.0]},
    "gradient_boosting": {"n_estimators": [150, 300], "learning_rate": [0.05, 0.1], "max_depth": [4, 5, 6],
                          "subsample": [0.7, 1.0], "min_samples_leaf": [10, 30]},
    "xgboost": {"n_estimators": [300, 600, 1000], "learning_rate": [0.03, 0.06, 0.1], "max_depth": [4, 6, 8, 10],
                "subsample": [0.7, 0.9, 1.0], "colsample_bytree": [0.6, 0.8, 1.0], "min_child_weight": [1, 5, 20]},
}
N_ITER = {"linear_regression": 1, "ridge": 6, "decision_tree": 10, "random_forest": 8,
          "gradient_boosting": 6, "xgboost": 12}


class ClassMedianBaseline(BaseEstimator, RegressorMixin):
    """Predicts the training median fare of the row's travel class. Needs only travel_class."""

    def fit(self, X, y):
        self.med_ = pd.Series(np.asarray(y, float)).groupby(X["travel_class"].to_numpy()).median().to_dict()
        self.glob_ = float(np.median(y))
        return self

    def predict(self, X):
        return X["travel_class"].map(self.med_).fillna(self.glob_).to_numpy(float)


def make_estimator(model: str, params: dict):
    if model == "mean_baseline":
        return DummyRegressor(strategy="mean")
    if model == "class_median_baseline":
        return ClassMedianBaseline()
    if model == "linear_regression":
        return LinearRegression()
    if model == "ridge":
        return Ridge(random_state=SEED, **params)
    if model == "decision_tree":
        return DecisionTreeRegressor(random_state=SEED, **params)
    if model == "random_forest":
        return RandomForestRegressor(n_estimators=100, n_jobs=-1, random_state=SEED, **params)
    if model == "gradient_boosting":
        return GradientBoostingRegressor(random_state=SEED, **params)   # single-threaded in scikit-learn
    if model == "xgboost":
        return XGBRegressor(tree_method="hist", n_jobs=-1, random_state=SEED, **params)
    raise ValueError(model)


def build(model: str, params: dict, target: str, route_ref: bool = True, linear_extras: bool = True):
    """Full pipeline: preprocessing (fitted on training rows only) + estimator [+ log1p target wrapper]."""
    est = make_estimator(model, params)
    pipe = est if model in BASELINES else Pipeline(
        [("pre", build_preprocessor(KIND[model], route_ref=route_ref, linear_extras=linear_extras)), ("model", est)])
    if target == "log1p":
        pipe = TransformedTargetRegressor(regressor=pipe, func=np.log1p, inverse_func=np.expm1, check_inverse=False)
    return pipe


def feature_variants(model: str) -> list[dict]:
    """Controlled ablation grid: only the feature switches change, hyperparameters stay frozen."""
    if model in BASELINES:
        return [{"route_ref": True, "linear_extras": True}]
    if KIND[model] == "tree":
        return [{"route_ref": True, "linear_extras": True}, {"route_ref": False, "linear_extras": True}]
    return [{"route_ref": rr, "linear_extras": ex} for rr in (True, False) for ex in (True, False)]
