"""Phase 3 EDA for Dataset E. Reproduce with:  python -I -X utf8 -m ml.eda   (from backend/)

Reads the raw files (never writes to them), writes figures to docs/figures/ and
all quoted statistics to docs/03-eda-stats.json. No models are trained.
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

from ml.preprocessing import build_frame, clean, load_raw

DOCS = Path(__file__).resolve().parents[2] / "docs"
FIG = DOCS / "figures"
FIG.mkdir(parents=True, exist_ok=True)
sns.set_theme(style="whitegrid", palette=["#2563eb", "#06b6d4", "#0b1f3a", "#f59e0b", "#10b981"])
ORDER = ["Economy", "Premium Economy", "Business", "First"]
stats: dict = {}


def save(name: str) -> None:
    plt.tight_layout()
    plt.savefig(FIG / name, dpi=130)
    plt.close()


def eta2(df: pd.DataFrame, col: str, y: str = "log_fare") -> float:
    """Share of variance of y explained by group means of col (descriptive, in-sample)."""
    g = df.groupby(col)[y]
    ss_between = (g.size() * (g.mean() - df[y].mean()) ** 2).sum()
    return float(ss_between / ((df[y] - df[y].mean()) ** 2).sum())


cleaned, scraped = load_raw()
raw_df, align_log = build_frame(cleaned, scraped)
df, clean_log = clean(raw_df)
df["log_fare"] = np.log(df["fare"])
stats["alignment"] = align_log
stats["cleaning"] = clean_log

# 1. structure / quality -------------------------------------------------------
stats["raw_shape"] = list(raw_df.shape)
stats["clean_shape"] = list(df.shape)
stats["nulls_raw_cleaned_file"] = int(cleaned.isna().sum().sum())
stats["nulls_raw_scraped_file"] = int(scraped.isna().sum().sum())
dup_mask = raw_df.duplicated(keep=False)
stats["dup"] = {
    "extra_copies": int(raw_df.duplicated().sum()),
    "rows_in_dup_groups": int(dup_mask.sum()),
    "pct_extra": round(100 * raw_df.duplicated().sum() / len(raw_df), 2),
    "group_size_counts": {int(k): int(v) for k, v in
                          raw_df[dup_mask].groupby(list(raw_df.columns)).size().value_counts().sort_index().items()},
    "extra_by_class_pct": {k: round(float(v), 2) for k, v in
                           (raw_df[raw_df.duplicated()].travel_class.value_counts()
                            / raw_df.travel_class.value_counts() * 100).dropna().items()},
}
stats["dup"]["fare_same_in_all_copies"] = True  # exact duplicates share every column incl. fare by definition
fares_mean_before, fares_mean_after = raw_df.fare.mean(), df.fare.mean()
stats["dup"]["mean_fare_before_after"] = [round(fares_mean_before, 1), round(fares_mean_after, 1)]
stats["dup"]["median_fare_before_after"] = [float(raw_df.fare.median()), float(df.fare.median())]

fig, ax = plt.subplots(1, 2, figsize=(11, 4))
(raw_df[raw_df.duplicated()].travel_class.value_counts().reindex(ORDER).fillna(0)
 .plot.bar(ax=ax[0], color="#2563eb")); ax[0].set_title("Extra duplicate rows by class"); ax[0].set_xlabel("")
ax[1].bar(["raw", "after exact-dedupe"], [len(raw_df), len(df)], color=["#0b1f3a", "#06b6d4"])
ax[1].set_title("Row count"); ax[1].set_ylim(430000, 455000)
save("01_duplicates.png")

# 2. target distribution -------------------------------------------------------
y = df.fare
stats["target"] = {
    "describe": {k: float(v) for k, v in y.describe().items()},
    "skew": float(y.skew()), "excess_kurtosis": float(y.kurt()),
    "log_skew": float(df.log_fare.skew()), "log_excess_kurtosis": float(df.log_fare.kurt()),
    "quantiles": {str(q): float(y.quantile(q)) for q in [.01, .05, .25, .5, .75, .95, .99, .999]},
    "non_positive": int((y <= 0).sum()),
    "by_class": {c: {"n": int(len(g)), "min": float(g.min()), "median": float(g.median()), "mean": round(float(g.mean()), 1),
                     "max": float(g.max()), "skew": round(float(g.skew()), 2), "log_skew": round(float(np.log(g).skew()), 2)}
                 for c, g in df.groupby("travel_class").fare},
}
fig, ax = plt.subplots(1, 3, figsize=(15, 4))
sns.histplot(y, bins=80, ax=ax[0]); ax[0].set_title(f"Fare (INR), skew={y.skew():.2f}")
sns.histplot(df.log_fare, bins=80, ax=ax[1]); ax[1].set_title(f"log(Fare), skew={df.log_fare.skew():.2f}")
sns.boxplot(data=df, x="travel_class", y="fare", order=ORDER, ax=ax[2], fliersize=1); ax[2].set_title("Fare by class"); ax[2].set_xlabel("")
save("02_price_distribution.png")

fig, ax = plt.subplots(1, 2, figsize=(13, 4))
for c in ["Economy", "Premium Economy", "Business"]:
    sns.kdeplot(df[df.travel_class == c].fare, ax=ax[0], label=c, fill=True, alpha=.25, clip=(0, None))
ax[0].legend(); ax[0].set_title("Fare density by class (First omitted: n=144)")
for c in ["Economy", "Premium Economy", "Business"]:
    sns.kdeplot(np.log(df[df.travel_class == c].fare), ax=ax[1], label=c, fill=True, alpha=.25)
ax[1].legend(); ax[1].set_title("log(Fare) density by class")
save("03_price_by_class.png")

# 3. categorical structure -----------------------------------------------------
stats["categorical"] = {c: {str(k): int(v) for k, v in df[c].value_counts().items()}
                        for c in ["airline", "travel_class", "source", "destination", "stops", "dep_bucket", "arr_bucket"]}
stats["cardinality"] = {c: int(df[c].nunique()) for c in
                        ["airline", "flight_code", "travel_class", "source", "destination", "dep_bucket", "arr_bucket", "stops"]}
stats["class_by_airline"] = pd.crosstab(df.airline, df.travel_class).to_dict("index")
stats["median_fare_class_airline"] = {a: {c: float(v) for c, v in r.dropna().items()} for a, r in
                                      df.pivot_table(index="airline", columns="travel_class", values="fare", aggfunc="median").iterrows()}
fc = df.flight_code.value_counts()
stats["flight_code"] = {"n": int(len(fc)), "median_rows": float(fc.median()), "max_rows": int(fc.max()),
                        "codes_lt_50_rows": int((fc < 50).sum()),
                        "codes_in_airlines": int((df.groupby("flight_code").airline.nunique() > 1).sum())}
fig, ax = plt.subplots(1, 3, figsize=(16, 4.2))
df.airline.value_counts().plot.barh(ax=ax[0], color="#2563eb"); ax[0].invert_yaxis(); ax[0].set_title("Rows by airline")
sns.heatmap(pd.crosstab(df.airline, df.travel_class)[ORDER], annot=True, fmt="d", cmap="Blues", cbar=False, ax=ax[1])
ax[1].set_title("Airline x class rows"); ax[1].set_xlabel(""); ax[1].set_ylabel("")
ax[2].hist(fc.values, bins=60, color="#06b6d4"); ax[2].set_yscale("log"); ax[2].set_title("Rows per flight code (1,405 codes)")
save("04_categorical_structure.png")

# 4. relationships with fare ---------------------------------------------------
stats["median_fare_by"] = {
    "airline_economy": {k: float(v) for k, v in df[df.travel_class == "Economy"].groupby("airline").fare.median().items()},
    "stops_by_class": {c: {k: float(v) for k, v in g.groupby("stops").fare.median().items()} for c, g in df.groupby("travel_class")},
    "weekday_economy": {d: float(v) for d, v in df[df.travel_class == "Economy"]
                        .groupby(df.journey_date.dt.day_name()).fare.median().items()},
    "dep_bucket_economy": {k: float(v) for k, v in df[df.travel_class == "Economy"].groupby("dep_bucket").fare.median().items()},
    "days_left_class": {c: {str(k): float(v) for k, v in g.groupby(pd.cut(g.days_left, [0, 1, 3, 7, 14, 21, 30, 50]), observed=True).fare.median().items()}
                        for c, g in df[df.travel_class.isin(ORDER[:3])].groupby("travel_class")},
}
stats["pearson_with_fare_by_class"] = {c: {f: round(float(g[f].corr(g.fare)), 3) for f in ["duration_hours", "days_left", "dep_minutes"]}
                                       for c, g in df.groupby("travel_class") if c != "First"}
stats["eta_squared_log_fare"] = {c: round(eta2(df, c), 3) for c in
                                 ["travel_class", "airline", "stops", "source", "destination", "dep_bucket", "arr_bucket"]}
df["route"] = df.source + "-" + df.destination
df["weekday"] = df.journey_date.dt.day_name()
stats["eta_squared_log_fare"]["route"] = round(eta2(df, "route"), 3)
stats["eta_squared_log_fare"]["weekday"] = round(eta2(df, "weekday"), 3)
stats["eta_squared_log_fare"]["flight_code"] = round(eta2(df, "flight_code"), 3)
stats["eta_squared_log_fare"]["days_left_as_category"] = round(eta2(df, "days_left"), 3)
stats["eta_squared_log_fare_economy_only"] = {c: round(eta2(df[df.travel_class == "Economy"], c), 3)
                                              for c in ["airline", "stops", "route", "weekday", "dep_bucket", "days_left"]}
stats["duration_by_stops"] = {k: {a: round(float(b), 2) for a, b in v.items()} for k, v in
                              df.groupby("stops").duration_hours.describe()[["mean", "min", "50%", "max"]].to_dict("index").items()}

fig, ax = plt.subplots(2, 3, figsize=(16, 8))
sns.boxplot(data=df, x="airline", y="fare", hue="travel_class", hue_order=ORDER[:3], ax=ax[0, 0], fliersize=1)
ax[0, 0].set_title("Fare by airline and class"); ax[0, 0].tick_params(axis="x", rotation=45); ax[0, 0].set_xlabel(""); ax[0, 0].set_yscale("log")
sns.boxplot(data=df[df.travel_class.isin(ORDER[:3])], x="stops", y="fare", hue="travel_class", hue_order=ORDER[:3],
            order=["non-stop", "1-stop", "2+-stop"], ax=ax[0, 1], fliersize=1); ax[0, 1].set_title("Fare by stops and class"); ax[0, 1].set_yscale("log"); ax[0, 1].set_xlabel("")
ax[0, 0].legend(loc="upper left", fontsize=7, ncol=3, framealpha=.9); ax[0, 0].set_ylim(1500, 4e5)
ax[0, 1].legend(loc="upper left", fontsize=7, ncol=3, framealpha=.9); ax[0, 1].set_ylim(1000, 4e5)
s = df[df.travel_class.isin(ORDER[:3])].sample(60000, random_state=0)
sns.scatterplot(data=s, x="duration_hours", y="fare", hue="travel_class", hue_order=ORDER[:3], s=4, alpha=.4, ax=ax[0, 2]); ax[0, 2].set_yscale("log")
ax[0, 2].set_title("Fare vs duration (60k random sample)")
for c in ORDER[:3]:
    g = df[df.travel_class == c].groupby("days_left").fare.median(); ax[1, 0].plot(g.index, g.values, label=c)
ax[1, 0].set_yscale("log"); ax[1, 0].legend(); ax[1, 0].set_title("Median fare by days_left (= by journey date)"); ax[1, 0].set_xlabel("days_left")
e = df[df.travel_class == "Economy"].pivot_table(index="source", columns="destination", values="fare", aggfunc="median")
sns.heatmap(e, annot=True, fmt=".0f", cmap="Blues", cbar=False, ax=ax[1, 1]); ax[1, 1].set_title("Economy median fare by route")
wd = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
g = df[df.travel_class == "Economy"].groupby("weekday").fare.median().reindex(wd)
ax[1, 2].bar(range(7), g.values, color="#2563eb"); ax[1, 2].set_xticks(range(7)); ax[1, 2].set_xticklabels([d[:3] for d in wd])
ax[1, 2].set_title("Economy median fare by weekday"); ax[1, 2].set_ylim(0, 11000)
save("05_feature_relationships.png")

num = df[["fare", "log_fare", "duration_hours", "days_left", "dep_minutes", "arr_minutes"]]
stats["numeric_corr"] = {a: {b: round(float(v), 3) for b, v in r.items()} for a, r in num.corr().iterrows()}
plt.figure(figsize=(6, 5)); sns.heatmap(num.corr(), annot=True, fmt=".2f", cmap="coolwarm", center=0); plt.title("Pearson correlation (all classes pooled)")
save("06_numeric_correlation.png")

# 5. outliers (flagged, never removed) -----------------------------------------
g = df.groupby(["airline", "travel_class", "stops"]).log_fare
q1, q3 = g.transform(lambda s: s.quantile(.25)), g.transform(lambda s: s.quantile(.75))
iqr = q3 - q1
hi, lo = df.log_fare > q3 + 1.5 * iqr, df.log_fare < q1 - 1.5 * iqr
stats["outliers_iqr_log_airline_class_stops"] = {
    "total": int((hi | lo).sum()), "pct": round(100 * float((hi | lo).mean()), 2), "high": int(hi.sum()), "low": int(lo.sum()),
    "by_class": {k: int(v) for k, v in df[hi | lo].travel_class.value_counts().items()},
    "high_with_days_left_le_2": int((hi & (df.days_left <= 2)).sum()),
    "low_by_stops": {k: int(v) for k, v in df[lo].stops.value_counts().items()},
    "high_by_stops": {k: int(v) for k, v in df[hi].stops.value_counts().items()},
}
stats["extremes"] = {
    "top5": df.nlargest(5, "fare")[["airline", "travel_class", "source", "destination", "stops", "days_left", "fare"]].to_dict("records"),
    "bottom5": df.nsmallest(5, "fare")[["airline", "travel_class", "source", "destination", "stops", "days_left", "fare"]].to_dict("records"),
    "business_min_fare_rows_at_12000": int(((df.travel_class == "Business") & (df.fare == 12000)).sum()),
    "business_rows_le_12500": int(((df.travel_class == "Business") & (df.fare <= 12500)).sum()),
    "duration_gt_30h": int((df.duration_hours > 30).sum()),
}
fig, ax = plt.subplots(1, 2, figsize=(13, 4))
sns.scatterplot(x=df.days_left[hi | lo], y=df.fare[hi | lo], hue=df.travel_class[hi | lo], s=5, ax=ax[0], hue_order=ORDER)
ax[0].set_yscale("log"); ax[0].set_title("IQR-flagged fares (log scale), flagged only, none removed")
ax[1].bar(["high", "low"], [hi.sum(), lo.sum()], color=["#f59e0b", "#06b6d4"]); ax[1].set_title("Flag direction (within airline x class x stops, on log fare)")
save("07_outliers.png")

# 6. grain, repeated observations, leakage -------------------------------------
k = ["airline", "flight_code", "source", "destination", "travel_class", "journey_date"]
size = df.groupby(k).size()
stats["grain"] = {
    "rows_per_flight_route_class_date": {int(a): int(b) for a, b in size.value_counts().sort_index().head(8).items()},
    "series_airline_flight_route_class": int(df.groupby(["airline", "flight_code", "source", "destination", "travel_class"]).ngroups),
    "series_median_rows": float(df.groupby(["airline", "flight_code", "source", "destination", "travel_class"]).size().median()),
    "series_max_rows": int(df.groupby(["airline", "flight_code", "source", "destination", "travel_class"]).size().max()),
    "keys_with_multiple_rows_differ_in_arrival_time_share": round(float((df[size.reindex(pd.MultiIndex.from_frame(df[k])).values > 1]
                                                                      .groupby(k).arr_minutes.nunique() > 1).mean()), 3),
}
stats["leakage"] = {
    "days_left_is_function_of_date": align_log["days_left_equals_date_minus_booking"],
    "weekday_is_function_of_date": align_log["weekday_consistent"],
    "flight_code_determines_airline": stats["flight_code"]["codes_in_airlines"] == 0,
    "buckets_redundant_with_exact_times": [align_log["dep_bucket_matches_exact_time"], align_log["arr_bucket_matches_exact_time"]],
    "duration_consistent_with_clock_times": align_log["duration_consistent_with_clock_times"],
}
# date coverage and the chronological-holdout consequence
dates = sorted(df.journey_date.unique())
cut = dates[int(len(dates) * 0.8)]
stats["chronological_preview"] = {
    "n_dates": len(dates), "first": str(pd.Timestamp(dates[0]).date()), "last": str(pd.Timestamp(dates[-1]).date()),
    "last_20pct_dates_start": str(pd.Timestamp(cut).date()),
    "test_rows": int((df.journey_date >= cut).sum()), "train_rows": int((df.journey_date < cut).sum()),
    "train_days_left_range": [int(df[df.journey_date < cut].days_left.min()), int(df[df.journey_date < cut].days_left.max())],
    "test_days_left_range": [int(df[df.journey_date >= cut].days_left.min()), int(df[df.journey_date >= cut].days_left.max())],
    "median_fare_train_test": [float(df[df.journey_date < cut].fare.median()), float(df[df.journey_date >= cut].fare.median())],
    "flight_codes_in_test_not_in_train": int(len(set(df[df.journey_date >= cut].flight_code) - set(df[df.journey_date < cut].flight_code))),
    "rows_per_date_min_max": [int(df.groupby("journey_date").size().min()), int(df.groupby("journey_date").size().max())],
}
fig, ax = plt.subplots(1, 2, figsize=(13, 4))
d = df.groupby("journey_date").fare.agg(["median", "size"])
ax[0].plot(d.index, d["median"], color="#2563eb"); ax[0].set_title("Median fare by journey date (all classes)"); ax[0].tick_params(axis="x", rotation=30)
ax[1].bar(d.index, d["size"], color="#06b6d4"); ax[1].set_title("Rows per journey date"); ax[1].tick_params(axis="x", rotation=30)
save("08_date_coverage.png")

(DOCS / "03-eda-stats.json").write_text(json.dumps(stats, indent=1, default=str), encoding="utf-8")
print("done; figures:", sorted(p.name for p in FIG.glob("*.png")))
