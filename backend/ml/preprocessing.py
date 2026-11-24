"""Phase 3 cleaning for Dataset E (Airfare ML, EaseMyTrip, Jan-Mar 2023).

Raw files are only ever read. Every decision is returned in a log dict so the EDA
report can quote real numbers. No derived/engineered features are created here
(that is Phase 4); this module only parses, validates and de-duplicates.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
RAW_DIR = BACKEND / "data" / "raw" / "E_yashdharme"
PROCESSED = BACKEND / "data" / "processed" / "airfare_e_clean.csv"

BUCKETS = {"Before 6 AM": (0, 360), "6 AM - 12 PM": (360, 720),
           "12 PM - 6 PM": (720, 1080), "After 6 PM": (1080, 1440)}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _minutes(hhmm: pd.Series) -> pd.Series:
    t = hhmm.str.extract(r"^(\d{2}):(\d{2})").astype(int)
    return t[0] * 60 + t[1]


def load_raw() -> tuple[pd.DataFrame, pd.DataFrame]:
    cleaned = pd.read_csv(RAW_DIR / "Cleaned_dataset.csv")
    scraped = pd.read_csv(RAW_DIR / "Scraped_dataset.csv")
    return cleaned, scraped


def build_frame(cleaned: pd.DataFrame, scraped: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Row-align the two raw files, assert they describe the same records, add exact clock times."""
    log: dict = {}
    assert len(cleaned) == len(scraped)
    price = scraped["Price"].str.replace(",", "").astype(int)
    parts = scraped["Airline-Class"].str.split("\n", expand=True)
    checks = {
        "price_equal": bool((price.values == cleaned["Fare"].values).all()),
        "date_equal": bool((pd.to_datetime(scraped["Date of Journey"], format="%d/%m/%Y").values
                            == pd.to_datetime(cleaned["Date_of_journey"]).values).all()),
        "source_equal": bool((scraped["Departure Time"].str.split("\n").str[1].str.strip().values
                              == cleaned["Source"].values).all()),
        "destination_equal": bool((scraped["Arrival Time"].str.split("\n").str[1].str.strip().values
                                   == cleaned["Destination"].values).all()),
        "flight_code_equal": bool((parts[1].str.replace(r"\s+", "", regex=True).values
                                   == cleaned["Flight_code"].str.replace(r"\s+", "", regex=True).values).all()),
        "class_equal": bool((parts[2].str.strip().str.upper().values
                             == cleaned["Class"].str.replace(" ", "").str.upper().values).all()),
    }
    log["alignment_checks"] = checks
    assert all(checks.values()), f"raw files are not row-aligned: {checks}"

    df = pd.DataFrame({
        "journey_date": pd.to_datetime(cleaned["Date_of_journey"]),
        "airline": cleaned["Airline"].str.strip(),
        "flight_code": cleaned["Flight_code"].str.replace(r"\s+", "", regex=True),
        "travel_class": cleaned["Class"],
        "source": cleaned["Source"],
        "destination": cleaned["Destination"],
        "dep_minutes": _minutes(scraped["Departure Time"]),
        "arr_minutes": _minutes(scraped["Arrival Time"]),
        "dep_bucket": cleaned["Departure"],
        "arr_bucket": cleaned["Arrival"],
        "stops": cleaned["Total_stops"],
        "duration_hours": cleaned["Duration_in_hours"],
        "days_left": cleaned["Days_left"],
        "fare": cleaned["Fare"],
    })

    # integrity checks on parsed values (counted, not silently fixed)
    lo = df["dep_bucket"].map(lambda b: BUCKETS[b][0]); hi = df["dep_bucket"].map(lambda b: BUCKETS[b][1])
    log["dep_bucket_matches_exact_time"] = int(((df["dep_minutes"] >= lo) & (df["dep_minutes"] < hi)).sum())
    lo = df["arr_bucket"].map(lambda b: BUCKETS[b][0]); hi = df["arr_bucket"].map(lambda b: BUCKETS[b][1])
    log["arr_bucket_matches_exact_time"] = int(((df["arr_minutes"] >= lo) & (df["arr_minutes"] < hi)).sum())
    # duration should equal (arrival - departure) modulo 24h (all-India, single timezone)
    diff = (df["arr_minutes"] - df["dep_minutes"]) % 1440
    dur = (df["duration_hours"] * 60).round() % 1440
    log["duration_consistent_with_clock_times"] = int(((diff - dur).abs() <= 1).sum())
    log["weekday_consistent"] = bool((df["journey_date"].dt.day_name()
                                      == cleaned["Journey_day"]).all())
    log["days_left_equals_date_minus_booking"] = bool(
        ((df["journey_date"] - pd.Timestamp("2023-01-15")).dt.days == df["days_left"]).all())
    log["n_rows_raw"] = len(df)
    return df, log


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Decision 1 only: drop exact duplicate listings. Nothing else is removed."""
    log = {}
    before = len(df)
    out = df.drop_duplicates().reset_index(drop=True)
    log["exact_duplicates_removed"] = before - len(out)
    log["rows_after_cleaning"] = len(out)
    log["rows_dropped_for_price_outliers"] = 0  # by design: see docs/03-eda-report.md
    log["nulls_after_cleaning"] = int(out.isna().sum().sum())
    return out, log


def run(write: bool = True) -> tuple[pd.DataFrame, dict]:
    cleaned, scraped = load_raw()
    df, log = build_frame(cleaned, scraped)
    out, log2 = clean(df)
    log.update(log2)
    log["raw_sha256"] = {p.name: sha256(p) for p in sorted(RAW_DIR.glob("*.csv"))}
    if write:
        PROCESSED.parent.mkdir(parents=True, exist_ok=True)
        out.to_csv(PROCESSED, index=False)
    return out, log


if __name__ == "__main__":
    import json
    _, lg = run()
    print(json.dumps(lg, indent=2, default=str))
