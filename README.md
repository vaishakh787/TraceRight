# TraceRight: Standalone Scan Intelligence Service

TraceRight is a high-security traceability platform that detects cloned QR codes and counterfeit products by analyzing spatial-temporal and behavioral tracking anomalies across the supply chain. This service leverages a decoupled monorepo architecture combining a deterministic Rules Engine (Node.js Express) and an unsupervised Machine Learning Anomaly Detection service (Python FastAPI + Isolation Forest).

---

## 🛠️ Prerequisites

Before getting started, ensure the following runtimes are installed on your host machine:

* **Node.js** (v18.x or higher)
* **Python** (v3.11.x)
* **Microsoft SQL Server** (Instance initialized with Mixed Mode Authentication enabled)

---

## 🚀 Setup & Installation Steps

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

> ⚠️ **Important Collaborative Network Note:** If connecting to a database hosted on a peer's machine across a shared local Wi-Fi network, replace `localhost` with their active network IPv4 address (e.g., `DB_SERVER=192.168.1.45\\SQLEXPRESS01`).

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
cd packages/api
npm install
node src/index.js

```

Upon startup, the server console will log a successful connection verification block matching your active SQL Server data target.

---

## 🧪 Verification & Smoke Testing

To verify the end-to-end telemetry evaluation loop is working perfectly across your systems, launch an isolated verification probe from your terminal window:

### Test Case A: Cold Start Evaluation (Day 12 Gate)

Send a request evaluating a brand-new, unseen QR token asset to confirm the short-circuit fallback logic runs cleanly:

```zsh
curl -X POST http://localhost:3000/v1/assess/qr \
  -H "Content-Type: application/json" \
  -d '{
    "qrCode": "999999999999999"
  }'

```

*Expected Output:* Status `200 OK` containing `"riskLevel": "LOW"` accompanied by the reason string `"INFO:INSUFFICIENT_HISTORY"`.

### Test Case B: Admin Bulk Recomputation Job (Day 13 Gate)

Trigger the administrative cron interface parameters to force a back-testing evaluation sweep across active historical records:

```zsh
curl -X POST http://localhost:3000/v1/jobs/recompute-recent \
  -H "Content-Type: application/json" \
  -d '{
    "sinceHours": 24,
    "maxQrs": 5
  }'

```

*Expected Output:* Status `200 OK` detailing exact success computation boundaries along with a collection array of the reprocessed tracking barcodes.