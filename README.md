# Scan Intelligence Service

A real-time fraud detection microservice for TraceRight's QR code traceability platform. It detects cloned/counterfeit barcodes by analyzing scan behavior patterns across space and time.

##   Architecture

* **API Gateway Layer**: Node.js + Express (`packages/api`)
* **Machine Learning Inference Subsystem**: Python + FastAPI (`packages/ml`)
* **Persistent Storage Engine**: Microsoft SQL Server / Azure SQL Edge

---

##   Setup & System Initialization

### Prerequisites

* Node.js (v20+)
* Python 3.11+
* Docker (for localized database engine containerization)

### 1. Clone the Repository & Environment Profile Setup

```bash
git clone https://github.com/vaishakh787/TraceRight.git
cd TraceRight

# Instantiate local configuration profiles
cp .env.example .env
```

>   **Network Mapping Note**: The Core Express API uses the **`API_PORT`** environment configuration variable (defaults to port `3000`). If your database is hosted on a peer's workstation across a shared local network, update your loopback endpoint array to match their IPv4 address block (e.g., `DB_SERVER=192.168.1.45`).

### 2. Database Schema Management & Telemetry Seeding

Ensure your Docker container instance (`mssql_local`) is active and accepting socket streams on port `1433`. Run the orchestration pipeline scripts from the **project root directory**:

```bash
# Apply updated database schema tables along with optimized DESC sorting lookup indexes
npx sequelize-cli db:migrate

# Seed transaction metrics dataset profiles via the synthetic data engine
python seeders/generate_synthetic_data.py --load-db
```

### 3. Machine Learning Analytics Module Setup

Navigate into the analytical model workspace, configure an isolated virtual environment shell, install your numerical parsing libraries, and fit your weights:

```bash
cd packages/ml
python -m venv venv
source venv/bin/activate  # On Windows command lines: .\venv\Scripts\activate
pip install -r requirements.txt

# Fit and generate the Isolation Forest model binary matrix mapping
python train.py

# Spin up the FastAPI real-time predictive inference routing service
uvicorn serve:app --port 8081 --reload
```

Keep this terminal window running active in the background.

### 4. API Server Core Gateway Backend Configuration

Open a parallel terminal tab, move into your gateway cluster workspace, resolve packages, and initialize the main server node listener:

```bash
cd packages/api
npm install
node src/index.js
```

---

##   Operational API Endpoint Blueprint

| Endpoint Router Path | HTTP Method | Access Perimeter Security | Description |
| --- | --- | --- | --- |
| `/v1/health` | GET | Public (Unauthenticated) | Gateway cluster and connection health diagnostic heartbeats |
| `/v1/ingest/scan` | POST | Required Secure Header (`X-API-Key`) | Ingest incoming transactional logistics log streams |
| `/v1/assess/qr` | POST | Required Secure Header (`X-API-Key`) | Trigger dynamic heuristics check rules + ML fusion scoring loops |
| `/v1/reports/latest` | GET | Required Secure Header (`X-API-Key`) | Extract compiled system summary statistics reports |

>   All protected service routes demand verification passed through the `X-API-Key` request header parameter.

---

##   Analytics Rules Engine Matrix

Heuristics engine calculations run linearly over a sliding lookback ledger matrix window and are strictly capped at an upper ceiling limit of **100**.

| Rule Identifier | Trigger Evaluation Condition Heuristic Check | Point Contribution Weight |
| --- | --- | --- |
| **R1_HIGH_FREQ** | 10 or more scans recorded within a rolling 1-hour window. | **40 Points** |
| **R2_BURST** | 5 or more scans registered inside an ultra-short 15-minute window. | **35 Points** |
| **R3_GEO_SPEED** | Calculated velocity vectors exceed **900 km/h** across a jump distance > 50 km. | **45 Points** |
| **R4_GEO_JUMP** | Absolute physical teleportation tracking jump > **2000 km** within 2 hours. | **50 Points** |
| **R5_MULTI_ACTOR** | 8 or more unique operational operator identities scanning the same asset in 24h. | **25 Points** |
| **R6_CONSUMER** | Retail customer validation traffic accounts for > 60% of total weekly records. | **20 Points** |

### Threat Signature Scoring Bands

$$\text{riskScore} = \text{round}(0.55 \times \text{ruleScore} + 0.45 \times \text{mlScore})$$

* **0.00 to 24.99**: **LOW RISK** (Standard logistical routing execution path)
* **25.00 to 49.99**: **MEDIUM RISK** (Flagged for routine asynchronous asset review schedules)
* **50.00 to 74.99**: **HIGH RISK** (Notification queued in alert outbox table for async processing handlers)
* **75.00 to 100.00**: **CRITICAL ANOMALY** (Real-time dispatch warning webhook broadcast)

---

##   Verification & Automated Core Testing

### Native Domain Logic Unit Tests

Execute the native decoupled test runner suite to assess edge logic rules and score fusion mathematical matrices:

```bash
node --test packages/api/test/unit.test.js
```

### End-to-End Core Integration Smoke Tests

Verify end-to-end integration flows (including validation catches and duplicate routing handling tokens) against your active running server instance:

```bash
node packages/api/test.js
```