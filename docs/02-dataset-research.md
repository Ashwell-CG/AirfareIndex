# Phase 2: Dataset Research and Verification

All numbers below were computed from the real files in `backend/data/raw/` (git-ignored) by the read-only scripts in `docs/phase2_audit_scripts/`. No cleaning, preprocessing, feature engineering or modelling was done. Files came from Kaggle's public download API (no login) and were extracted with a path-checked unzip.

## 1. Candidates

| ID | Dataset (Kaggle ref) | Source site | Journey dates | Licence on Kaggle |
|---|---|---|---|---|
| E | `yashdharme36/airfare-ml-predicting-flight-fares` | EaseMyTrip (Python scraper) | 2023-01-16 to 2023-03-06 | CC0 |
| A | `shubhambathwal/flight-price-prediction` | EaseMyTrip (Octoparse) | 2022-02-11 to 2022-03-31 (raw files only) | CC0 |
| C | `nikhilmittal/flight-fare-prediction-mh` (MachineHack 2019) | not stated | 2019-03-01 to 2019-06-27 | Unknown |
| B | `iamavyukt/goibibo-flight-data` | claims Goibibo | 2023-06-26 to 2023-08-13 | CC BY-NC-SA 4.0 |

Not used: Mendeley `m5mvxdx2wp` is US DOT (BTS) data, not Indian. The Kaggle listings for MakeMyTrip (5.9 KB), `karanveer59` (Indian international airports) and others were seen in search but not downloaded or inspected, so I make no claims about them. `prithvirajshukla/flight-fare-prediction` and `dopodix/indian-flight-fare-dataset` are byte-identical re-uploads of C (same SHA-256 `22ffc5c9...`) with different stated licences (MIT, GFDL), which shows the licence on re-uploads is unreliable.

## 2. Measured structure

| | E Cleaned_dataset.csv | A Clean_Dataset.csv | C Data_Train.xlsx | B goibibo_flights_data.csv |
|---|---|---|---|---|
| Rows x columns | 452,088 x 13 | 300,153 x 12 | 10,683 x 11 | 300,261 x 13 (2 all-NaN) |
| Exact duplicate rows | 6,722 (1.49%) | 0 (index column makes rows unique; 1,587 rows duplicate on every feature except price) | 220 (2.06%) | 2 |
| Missing values | 0 | 0 | 1 row (Route and Total_Stops) | 0 (besides the 2 empty columns) |
| Target | `Fare` int, 1,307 to 143,019, median 13,407 | `price` int, 1,105 to 123,071, median 7,425 | `Price` int, 1,759 to 79,512, median 8,372 | `price` string with commas |
| Dtypes | 1 float, 2 int, 10 string | 2 numeric, 4 int/float cols, rest string | 1 int, 10 string (dates and durations are text) | mostly text |

`Scraped_dataset.csv` (E, 452,088 x 8) is the raw version of E and has exact clock times and a single booking date (`15/01/2023`). `Test_set.xlsx` in C (2,671 rows) has no price column, so it is unusable for supervised evaluation.

## 3. Feature and coverage check

**E** (7 cities: Delhi 83,153 / Mumbai / Bangalore / Hyderabad / Chennai / Kolkata / Ahmedabad as source). All 42 ordered city pairs are present, none with source = destination. 9 airlines (Vistara 231,490; Air India 119,841; Indigo 65,659; AirAsia; GO FIRST; SpiceJet; AkasaAir 2,230; AllianceAir 393; StarAir 62). Classes: Economy 252,033; Business 126,834; Premium Economy 73,077; First 144. Features: journey date, weekday, airline, flight code, class, departure and arrival buckets (4), stops (3 levels), duration in hours, days_left (1 to 50).

**A** (6 cities: Delhi, Mumbai, Bangalore, Kolkata, Hyderabad, Chennai). 30 ordered pairs, all present. 6 airlines. Classes: Economy 206,666; Business 93,487. 6 time buckets, 3 stop levels, days_left 1 to 49, and no calendar date in `Clean_Dataset.csv` (the raw `economy.csv` and `business.csv` have dates). Clean has 108 fewer economy rows than raw, including all 102 StarAir/Trujet rows.

**C** (5 source cities, 6 destination labels). Only 6 source-to-destination pairs exist (for example Delhi to Cochin has 4,537 rows). It uses inconsistent spellings ("Banglore", and both "Delhi" and "New Delhi" as destinations). There is no class column (26 rows hint at business or premium via airline or info text) and no booking date, so no lead time. Jet Airways is 3,849 rows and no longer operates.

**B** has 8 airlines, 6 cities and economy/business classes. See section 4.

None of these is India-wide. E and A cover major-metro domestic routes only (no tier-2 airports), and C covers six routes.

## 4. Findings that affect the design

1. **B is not independent data.** Compared with A's raw files, row for row: flight numbers, routes and departure times match in 100% of 300,261 rows, dates are shifted by exactly 500 days in every row, and prices differ by a factor of exactly 1.010 or 1.015 (0% equal). It looks like a transformed copy of A, so I exclude it.
2. **`days_left` is not a free feature; it equals the journey date.** In E there is one booking date (15 Jan 2023) and `days_left` equals journey date minus that date in 100% of rows, so each date has exactly one `days_left` and vice versa. In A, on the 22,616 rows I could match unambiguously between raw and Clean, `days_left` equals date minus 2022-02-10 in 100%. Consequences: the "price vs booking lead time" curve is a cross-section of different journey dates seen from one booking day, not how one flight's fare changes over time, and lead-time effects cannot be separated from weekday or date effects.
3. **Near-duplicate and series leakage.** E has 1,405 flight codes and A has 5,052 flight-route-class series (median 43 rows, max 640); the same scheduled flight recurs on many dates. A random row split would put sibling rows in train and test. Group-aware or chronological splits are required (to be decided in Phase 3).
4. **Class price floors.** Business fares have a minimum of exactly 12,000 in both A and E. This looks like a floor in the source listings; I have not explained it.
5. **Distribution shift between years.** Economy median price is 5,772 in A (2022) and 9,559 in E (2023). Same platform, different period.
6. **Bias and limits.** Single booking platform; listed (not transacted) fares; one booking-date snapshot; about 7 weeks of journey dates (no annual seasonality); city-level only (no airports); "First" class has 144 rows; stops are bucketed.

## 5. Licence and academic use

E and A are CC0 on Kaggle, but both were scraped from a commercial site, and the licence label is the uploader's claim and does not override that site's terms. For an academic project with attribution this is low-risk, but cite the uploaders and the source site. C is "Unknown" and B is non-commercial share-alike. I could not verify any of these beyond the Kaggle metadata.

## 6. Recommendation

- **Primary: E (`Cleaned_dataset.csv`, with `Scraped_dataset.csv` for exact clock times).** It is the largest, newest, covers 7 cities and all 42 routes, has four classes and Akasa Air, and has real journey dates (which permits a chronological holdout). Its issues (1.49% duplicates, days_left = date) are known and manageable.
- **Secondary: A (raw `economy.csv` and `business.csv`, which have dates), used only as an out-of-period test of generalisation.** It adds real value because it is a different year, the same platform and 30 overlapping routes, supporting the distribution-shift analysis. It must not be pooled with E for training.
- **Not recommended: C** (2019, six routes, no class or lead time, defunct airline, unknown licence), **B** (derivative of A), and the BTS dataset (US).

Open decisions for Phase 3 (not acted on): split design (chronological vs grouped), duplicate handling, whether `days_left` and calendar features can both be included, and which time-of-day source to use.
