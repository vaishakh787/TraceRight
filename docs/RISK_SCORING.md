# Scan Intelligence Service: Risk Scoring & Heuristics Specification

This document details the mathematical logic, structural features, and weighted fusion scoring algorithms used by the Standalone Scan Intelligence Service to classify cloned QR code threats.

---

## 1. Feature Engineering Vector Matrix

For every evaluated barcode asset, a static array of 10 numerical features is compiled relative to a sliding lookback window ($[asOf - lookbackHours, asOf]$).

| # | Feature Key | Data Type | Analytical Description | Cold-Start Fallback |
|---|---|---|---|---|
| 1 | `scans_last_1h` | Integer | Volume of scan transactions processed within the last 1 hour. | `0` |
| 2 | `scans_last_24h` | Integer | Volume of scan transactions processed within the last 24 hours. | `0` |
| 3 | `scans_last_7d` | Integer | Volume of scan transactions processed within the last 7 days. | `0` |
| 4 | `distinct_actor_ids_24h` | Integer | Unique count of non-null identity keys logging scans in 24h. | `0` |
| 5 | `distinct_event_types_24h` | Integer | Unique count of situational event type states logged in 24h. | `0` |
| 6 | `minutes_since_prev_scan` | Float | Elapsed chronological window between the last two scan events. | `9999.0` |
| 7 | `geo_jump_km` | Float | Haversine curved line-of-sight distance between the last two scans. | `0.0` |
| 8 | `implied_speed_kmh` | Float | Spatial velocity computed via `geo_jump_km / time_delta_hours`. | `0.0` |
| 9 | `night_scan_ratio_7d` | Float | Ratio of scanning traffic processed between [00:00, 05:00] UTC. | `0.0` |
| 10| `consumer_validate_share_7d`| Float | Share of retail customer activations relative to logistics events. | `0.0` |

---

## 2. Deterministic Heuristics Rules Engine

The primary validation perimeter applies a series of fixed-threshold business rules. Individual contributions are aggregated linearly and strictly capped at an upper boundary of `100`.

$$\text{ruleScore} = \min(100, \sum \text{ruleContributions})$$

### Rule Definitions
* **`R1_HIGH_FREQ` (Weight: 40):** Triggered when an asset registers 10 or more scans within a rolling 1-hour window. Indicates a barcode that has been mass-replicated at retail or customs gates.
* **`R2_BURST` (Weight: 35):** Triggered when an asset registers 5 or more scans within an ultra-short 15-minute window (evaluated directly against unaggregated database timestamps).
* **`R3_GEO_SPEED` (Weight: 45):** Triggered if an asset's implied velocity exceeds `900 km/h` across a spatial distance greater than `50 km`. Flags anomalies that violate land or standard commercial freight transit capabilities.
* **`R4_GEO_JUMP` (Weight: 50):** Triggered if a great-circle spatial jump greater than `2000 km` occurs within a tight 2-hour window. This represents absolute physical teleportation.
* **`R5_MULTI_ACTOR` (Weight: 25):** Triggered if 8 or more unique terminal operator identities try to register scans on the same serial asset within 24 hours.
* **`R6_CONSUMER_DOMINANCE` (Weight: 20):** Triggered when consumer activations account for more than 60% of total weekly records across a history of at least 5 tracking points.

---

## 3. Core Score Fusion & Graceful Degradation

The system merges the heuristic profile with a scaled, unsupervised Machine Learning outlier rating computed by an Isolation Forest model running on a separate Python FastAPI container.

### Fusion Equation
The aggregate threat signature is calculated using a fixed weight matrix allocation ($55\%$ Rules, $45\%$ Machine Learning):

$$\text{riskScore} = \text{round}(0.55 \times \text{ruleScore} + 0.45 \times \text{mlScore}_{\text{fallback}})$$

### Graceful Degradation (Circuit-Breaker Fallback)
If the internal machine learning RPC microservice experiences transit latency exceeding `800ms`, drops connection, or throws a runtime exception:
1. The system drops the machine learning dependency vector.
2. The model contribution falls back to the current rules engine output: $\text{mlScore}_{\text{fallback}} = \text{ruleScore}$.
3. The evaluation finishes cleanly by setting $\text{riskScore} = \text{ruleScore}$.
4. An entry configuration warning is attached to the payload response: `"ML:UNAVAILABLE: Falling back to rules-only assessment"`.

### Risk Classification Bands
The compiled normalized score is assigned to an operational risk mitigation bucket:

| Risk Score Range | Assigned Risk Level | Operational Response Pattern |
|---|---|---|
| **0.00 to 24.99** | **LOW** | Transparent execution path. Standard supply chain routing. |
| **25.00 to 49.99** | **MEDIUM** | Standard logging. Asset flag queued for routine terminal review. |
| **50.00 to 74.99** | **HIGH** | Outbox alert record staged as `PENDING`. Asynchronous dispatch. |
| **75.00 to 100.00**| **CRITICAL**| High-priority outbox alert. Real-time dispatcher warning broadcast. |