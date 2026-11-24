# Phase 4: Feature Engineering, Splits and Leakage Audit

No model was trained or tuned. Dataset A was not used. The raw files (hashes re-checked) and `airfare_e_clean.csv` (unchanged since Phase 3) were not modified. Numbers come from `docs/04-splits.json` and `docs/04-feature-spec.json`, produced by:

```powershell
cd backend
.\.venv\Scripts\python -X utf8 -m ml.splits               # splits.csv + docs/04-splits.json
.\.venv\Scripts\python -X utf8 -m ml.feature_engineering  # docs/04-feature-spec.json + supported_options.json
.\.venv\Scripts\python -m pytest                          # 8 tests pass (Phase 1 health + 7 leakage/split tests)
```

## 1. Scope decisions (approved)

- **First class is excluded from the model frame** (144 rows, one airline, four routes, four distinct fares). Its rows stay in `airfare_e_clean.csv`. **Model frame: 445,222 rows** (Economy 248,323; Business 126,535; Premium Economy 70,364). The prediction form will not offer First class.
- **Supported combinations only** (`data/processed/supported_options.json`): Air India (Economy, Business), Vistara (Economy, Premium Economy, Business), and Economy only for Indigo, AirAsia, SpiceJet, GO FIRST, AkasaAir, AllianceAir, StarAir. Routes per combination are listed there (for example Vistara Economy: 42 routes, StarAir: 3, AllianceAir: 8). The form offers only observed airline/class/route triples.
- **Target:** `fare` (INR). Phase 5 will compare fitting on fare vs log(fare); the target column itself is unchanged here.

## 2. Splits

All three use the same model frame. Journey dates run 2023-01-16 to 2023-03-06 (50 dates); `days_left` equals date minus 2023-01-15, so each date has exactly one `days_left`.

### 2.1 Primary: date blocks (`split_primary`)

Ten blocks of 5 consecutive dates. Blocks 0 and 9 (the two ends of the lead-time range) are in train, so every validation/test block has training blocks on both sides and the test `days_left` stays inside the training range.

| Block | Role | Journey dates | days_left | Rows |
|---|---|---|---|---|
| 0 | train | 2023-01-16 to 01-20 | 1-5 | 42,210 |
| 1 | train | 01-21 to 01-25 | 6-10 | 43,095 |
| 2 | **val** | 01-26 to 01-30 | 11-15 | 45,341 |
| 3 | train | 01-31 to 02-04 | 16-20 | 45,745 |
| 4 | **test** | 02-05 to 02-09 | 21-25 | 45,349 |
| 5 | train | 02-10 to 02-14 | 26-30 | 45,548 |
| 6 | **val** | 02-15 to 02-19 | 31-35 | 44,680 |
| 7 | train | 02-20 to 02-24 | 36-40 | 44,481 |
| 8 | **test** | 02-25 to 03-01 | 41-45 | 44,617 |
| 9 | train | 03-02 to 03-06 | 46-50 | 44,156 |

| Partition | Rows | days_left range | Class mix (Econ / Prem / Bus) |
|---|---|---|---|
| train | 265,235 | 1-50 | 147,832 / 42,355 / 75,048 |
| val | 90,021 | 11-35 | 50,610 / 14,067 / 25,344 |
| test | 89,966 | 21-45 | 49,881 / 13,942 / 26,143 |

### 2.2 Overlap audit (share of rows whose key also occurs in train)

| Key | val vs train | test vs train |
|---|---|---|
| flight code | 99.98% | 100% (1 of 1,318 test codes unseen) |
| airline + route + class | 100% | 100% |
| airline + flight code + route + class | 99.83% | 99.98% |
| itinerary (series + departure minute + duration + stops) | 99.10% | **99.72%** (208 of 13,446 itineraries unseen) |

**Trade-off, stated plainly.** Scheduled flights run on nearly every date, so any date-block split leaves almost every test flight and itinerary present in training (99.72% of test rows have an exact itinerary twin). Date-block and flight-group separation **cannot both be satisfied on the full data**. Flight code is excluded as a model input, but the remaining inputs (airline, route, class, departure minute, duration, stops) re-identify the itinerary, so a model could still memorise. To quantify this, I computed a memorisation reference on validation rows only (test rows untouched): fare vs the median fare of the same itinerary in train. For the 99.10% of validation rows with a twin, the median relative gap is **8.0%** (90th percentile 34.4%). This is a lookup statistic, not a trained model, and is not used for selection. It means a model with ~8% typical error on the primary split may be doing little beyond memorisation; the primary score alone should not be read as skill on unseen flights.

### 2.3 Secondary: date blocks plus unseen flights (`split_group`)

Same blocks, plus 20% of flight codes per airline (280 codes, seed 42) held out entirely. Train/val exclude held-out codes; test contains only held-out codes inside the test blocks. Both separations hold, at a cost in rows.

| Partition | Rows | Flight codes | Class mix (Econ / Prem / Bus) |
|---|---|---|---|
| train | 211,532 | 1,113 | 118,350 / 33,285 / 59,897 |
| val | 71,862 | 1,101 | 40,548 / 11,058 / 20,256 |
| test | 18,235 | 264 | 9,871 / 3,055 / 5,309 |
| dropped | 143,593 (32%) | - | - |

Overlap of test with train: flight code 0%, airline+flight+route+class 0%, itinerary 0%, but **airline+route+class 99.88%**. So it tests unseen flights on known routes, not unseen routes. Its test set is small (18,235 rows) and depends on which codes were drawn, so its estimates will be noisier.

### 2.4 Stress test: strict last 20% of dates (`split_stress`)

Train 2023-01-16 to 02-19 (days_left 1-35, 311,968 rows); val 02-20 to 02-24 (36-40, 44,481); **test 02-25 to 03-06 (days_left 41-50, 88,773 rows)**. The test `days_left` range is outside training by construction, so this measures extrapolation in lead time and nothing else should be concluded from it. Itinerary overlap of test with train is 99.22%.

### 2.5 What the primary evaluation does and does not measure

It measures how well the model predicts fares for known flight services on journey dates it has not seen, within the observed window (16 Jan to 6 Mar 2023, interior lead times). It does **not** measure forecasting beyond the available data, unseen routes, unseen airlines, or other time periods. Dataset A is reserved for a later, separate external check.

### 2.6 Protocol for Phase 5 (proposed, not run)

Tune only on `split_primary` validation (and `split_group` validation to guard against memorisation); touch each test set once for the final model; report primary, group and stress results side by side.

## 3. Handling `days_left` and journey date

- **Decision:** keep `days_left` as the single lead-time/date feature. **Exclude** journey date, weekday, day of month and month.
- **Why:** in this data `days_left` and the journey date are the same information. Including both would let trees isolate individual dates (for example a holiday) and attribute that effect to "lead time", then mis-apply it to a user whose booking date differs. Weekday adds almost nothing on its own (variance share 0.003 in Economy).
- **Consequence:** the `days_left` effect learned here mixes true lead-time pricing with date-specific effects within one 7-week window. The app should state this and warn when the entered `days_left` falls outside 1-50.

## 4. Encoding investigation

| Feature | Levels | Tree pipeline | Linear pipeline | Reason |
|---|---|---|---|---|
| airline, class, source, destination | 9 / 3 / 7 / 7 | one-hot | one-hot | low cardinality; one-hot adds 26 columns; `handle_unknown="ignore"` for the app |
| stops | 3 | ordinal 0/1/2 | one-hot | Economy medians 5,737 / 10,075 / 12,925 are not evenly spaced |
| route | 42 | not used | one-hot | trees combine source and destination; linear needs it explicitly |
| airline_class | 12 observed | not used | one-hot | class exists only for some airlines |
| flight code | 1,405 | **excluded** | **excluded** | identifier; target/ordinal encodings rejected (leakage and memorisation risk, and unnecessary at this cardinality) |
| numeric | - | unscaled | `StandardScaler` | scaling matters for linear models only |

## 5. Feature dictionary

Raw inputs the user supplies (8): `airline`, `travel_class`, `source`, `destination`, `stops`, `duration_hours`, `days_left`, `dep_minutes` (departure time as minutes after midnight). Arrival time is derived by the app, not asked.

| Feature | Pipelines | Definition | Evidence for inclusion |
|---|---|---|---|
| airline, travel_class, source, destination | both | raw | variance shares 0.274 (airline) and 0.755 (class) on log fare |
| stops | both | non-stop, 1-stop, 2+-stop | Economy 0.272 |
| duration_hours | both | raw | r = 0.33 with fare in Economy |
| days_left | both | raw, 1-50 | r = -0.31 Economy, -0.48 Premium Economy |
| dep_minutes | both | raw clock time (0-1439) | weak signal; replaces 4 coarse buckets |
| route_ref_duration_hours | both | median non-stop duration of the route, **fitted on training rows** | distance proxy; all 42 routes have non-stop flights |
| duration_ratio | both | duration / route_ref_duration_hours | measures layover/detour length |
| route | linear | source + "-" + destination | Economy variance share 0.111 |
| airline_class | linear | airline + "\|" + class | class availability depends on airline |
| dep_sin, dep_cos | linear | sin/cos of 2*pi*dep_minutes/1440 | time is circular; cos has \|r\| 0.105 vs 0.042 for raw minutes (Economy, log fare) |
| log1p_days_left | linear | log(1 + days_left) | r -0.289 vs -0.274 (Economy, log fare) |
| log_duration_ratio | linear | log(duration_ratio) | r 0.443 vs 0.390 for raw duration (Economy, log fare) |

Honest caveats on these checks: they are pooled-Economy correlations and say nothing about model gain. Within 1-stop Economy flights only, the ratio is *less* correlated with log fare than raw duration (0.092 vs 0.173), so it mostly separates stop types; it is kept because both are cheap and the model can down-weight either. Output widths: **tree pipeline 32 columns, linear pipeline 91 columns.**

**Excluded columns and reasons:** `fare` (target); `row_id`; `flight_code` (memorisation); `journey_date`/weekday/month (see section 3); `arr_minutes` (exactly (dep + duration) mod 24h in 100% of rows); `dep_bucket`, `arr_bucket` (exact functions of the clock times); `block` (split bookkeeping).

## 6. Leakage audit

| Risk | Finding | Safeguard |
|---|---|---|
| Target in inputs | None; `split_xy` returns only the 8 raw input columns | test asserts excluded columns are not in `RAW_INPUTS` |
| Statistics learned from held-out data | Only `route_ref_duration_hours` (and encoders/scalers) learn anything | fitted inside the pipeline on training rows; test proves held-out data does not change fitted state and that the reference equals training non-stop medians. Fitting on all rows would change the reference for 25 of 42 routes, so the distinction is real |
| Date/lead-time duplication | `days_left` is a function of date | date features excluded |
| Identifier memorisation | flight code | excluded; residual risk measured (section 2.2) |
| Near-duplicate rows across splits | exact duplicates already removed (6,722); itinerary twins remain across dates | reported, not hidden; `split_group` provided |
| Redundant derived inputs | arrival time, buckets, weekday | excluded |
| Train/test contamination | partitions disjoint; blocks are 5 consecutive dates; stress split is strictly last 10 dates | `verify_integrity` + tests |
| First class | absent from model frame | test asserts absence and that 144 rows remain in the clean file |
| Unseen categories at inference | one-hot ignores them | test with an unseen airline |

## 7. Final model input and target specification

- **Target:** `fare` (INR), positive, 1,307 to 143,019 in the model frame.
- **Inputs:** the 8 raw inputs above, transformed by `build_preprocessor("tree")` or `build_preprocessor("linear")` in `backend/ml/feature_engineering.py`. The preprocessor is a scikit-learn `Pipeline` that is fitted inside each model's pipeline so the saved model applies identical transformations at inference.
- **Scope:** Economy, Premium Economy and Business; supported airline/class/route combinations only; `days_left` 1-50.

## 8. Generated files

`backend/ml/splits.py`, `backend/ml/feature_engineering.py`, `backend/tests/test_phase4.py`; `backend/data/processed/splits.csv` (row_id plus the three split labels, git-ignored), `backend/data/processed/supported_options.json`; `docs/04-splits.json`, `docs/04-feature-spec.json`.

## 9. Remaining limitations

- The primary split cannot prevent itinerary memorisation (99.72% twin overlap); evaluations must be read together with `split_group`.
- `split_group` loses 32% of rows and has a small test set, and its held-out codes depend on the seed.
- Lead-time and calendar effects stay confounded; one 7-week window; listed fares from a single platform.
- Feature gains are untested until Phase 5; the correlations above are only supporting evidence.
