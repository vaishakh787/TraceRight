# Scan Intelligence Service

A fraud detection microservice for TraceRight's QR code traceability platform. Detects cloned/counterfeit barcodes by analyzing scan behavior patterns across time and geography.

## Architecture

<<<<<<< HEAD
##  Prerequisites
=======
- **API**: Node.js + Express (`packages/api`)
- **ML Service**: Python + FastAPI (`packages/ml`)
- **Database**: Microsoft SQL Server
>>>>>>> meghna

## Setup

### Prerequisites
- Node.js
- Python 3.11+
- SQL Server Express

### Installation

<<<<<<< HEAD
##  Setup & Installation Steps

### 1. Clone the Repository

```zsh
git clone https://github.com/YOUR_USERNAME/TraceRight.git
cd TraceRight

```

### 2. Configure Environment Variables

Copy the configuration template to create your local environment file:

```zsh
cp .env.example .env

```

Open the newly created `.env` file at the root directory and update the parameters matching your environment.

>  **Important Collaborative Network Note:** If connecting to a database hosted on a peer's machine across a shared local Wi-Fi network, replace `localhost` with their active network IPv4 address (e.g., `DB_SERVER=192.168.1.45\\SQLEXPRESS01`).

---

### 3. Database Layer Initialization & Seeding

#### A. Initialize Database Schema (Migration)

Connect to your target SQL Server instance using a management client (such as SSMS or Azure Data Studio), create a database named `ScanIntelligenceDB`, and execute the DDL structural script found at:

```path
packages/api/src/db/schema.sql

```

This builds the `scan_events`, `risk_assessments`, and `alert_outbox` structures with all required index arrays.

#### B. Generate & Load Baseline Telemetry (Seeding)

Install the data-sync utilities and run the synthetic engine profile to seed your database with normal vectors, Clone Bursts, and Teleportation attacks:

```zsh
pip install pandas pymssql python-dotenv
python scripts/generate_synthetic_data.py --load-db

```

---

### 4. Machine Learning Subsystem Setup (Python)

Navigate to the machine learning module, isolate your runtime environment, and install version-pinned analytical library packages:

```zsh
cd packages/ml
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt

```

#### A. Train Anomaly Detection Engine Matrix

Fit the baseline Isolation Forest model on the feature snapshots generated during the seeding phase:

```zsh
python train.py

```

This generates the serialized model binary mapping into `models/iforest-v1.joblib` and calibration anchors inside `reports/metrics.json`.

#### B. Launch the Inference Microservice

Expose the predictive API endpoints locally on port `8081`:

```zsh
uvicorn serve:app --port 8081 --reload

```

Keep this terminal tab open.

---

### 5. API Server Backend Core Setup (Node.js)

Open a parallel terminal tab, move into the backend folder, pull dependencies, and boot the web application framework layer on port `3000`:

```zsh
=======
```bash
# Clone and install
git clone <repo-url>
cd TraceRight

# API setup
>>>>>>> meghna
cd packages/api
npm install

# ML setup
cd ../ml
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### Database Setup
Run `packages/api/src/db/schema.sql` against your SQL Server instance.

### Environment Variables
Copy `.env.example` to `.env` and fill in your database credentials.

## Running the Service

**Terminal 1 - ML Service:**
```bash
cd packages/ml
.\venv\Scripts\activate
uvicorn serve:app --port 8081
```

**Terminal 2 - API:**
```bash
cd packages/api
node src/index.js
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/v1/health` | GET | Health check |
| `/v1/ingest/scan` | POST | Record a scan event |
| `/v1/assess/qr` | POST | Get fraud risk assessment |
| `/v1/jobs/recompute-recent` | POST | Batch recompute risk for recently active QR codes |
| `/v1/dashboard/recent` | GET | Recent risk assessments |

<<<<<<< HEAD
##  Verification & Smoke Testing
=======
All endpoints except `/health` require an `X-API-Key` header.
>>>>>>> meghna

## Fraud Detection Rules

| Rule | Condition | Points |
|---|---|---|
| R1 | 10+ scans in 1 hour | 40 |
| R2 | 5+ scans in 15 minutes | 35 |
| R3 | Speed > 900 km/h | 45 |
| R4 | Geo jump > 2000km in 2h | 50 |
| R5 | 8+ distinct actors in 24h | 25 |
| R6 | Heavy consumer validation share | 20 |

## Risk Scoring

| Score | Level    |
|---    |---       |
| 0-24  | LOW      |
| 25-49 | MEDIUM   |
| 50-74 | HIGH     |
| 75-100| CRITICAL |

## Testing

Import `docs/Scan Intelligence Service.postman_collection.json` into Postman to test all endpoints.

## Dashboard

Open `docs/dashboard.html` in a browser (with the API running) to view recent risk assessments.

## Built During

TraceRight Summer Internship - 4 Week Sprint (June 2026)