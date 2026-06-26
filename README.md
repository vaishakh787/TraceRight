# Scan Intelligence Service

A fraud detection microservice for TraceRight's QR code traceability platform. Detects cloned/counterfeit barcodes by analyzing scan behavior patterns across time and geography.

## Architecture

- **API**: Node.js + Express (`packages/api`)
- **ML Service**: Python + FastAPI (`packages/ml`)
- **Database**: Microsoft SQL Server

## Setup

### Prerequisites
- Node.js
- Python 3.11+
- SQL Server Express

### Installation

```bash
# Clone and install
git clone <repo-url>
cd TraceRight

# API setup
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

All endpoints except `/health` require an `X-API-Key` header.

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