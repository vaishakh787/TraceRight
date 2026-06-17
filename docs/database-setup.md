# Database Setup

This project uses Sequelize migrations for schema management and a Python-based synthetic data generator for development data seeding.

## Prerequisites

* SQL Server (SQLEXPRESS01)
* Node.js
* Python 3.x
* Sequelize CLI

Install dependencies:

```bash
npm install
pip install pymssql python-dotenv pandas
```

## Database Migration

Run the following command to create all required database tables:

```bash
npx sequelize-cli db:migrate
```

This creates:

* `scan_events`
* `risk_assessments`
* `alert_outbox`

## Synthetic Data Seeding

Populate the database with synthetic scan telemetry:

```bash
python seeders/generate_synthetic_data.py --load-db
```

The seeder generates:

### Normal Scan Profiles

* Multiple QR codes scanned consistently from the same geographic region.
* Simulates legitimate product movement.

### Clone Burst Attack Profiles

* High-frequency scan activity from multiple geographic regions.
* Used to test burst and frequency-based detection rules.

### Teleportation Attack Profiles

* QR scans occurring thousands of kilometers apart within short time windows.
* Used to test geolocation anomaly detection rules.

The generated records are inserted into the `scan_events` table and are used for:

* Feature extraction
* Rule engine evaluation
* Machine learning model training
* Risk assessment testing

## Verification

Verify tables exist:

```sql
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES;
```

Verify seeded records:

```sql
SELECT COUNT(*) FROM scan_events;
```

Expected result after initial seeding:

```text
400
```

## Development Workflow

```bash
# Create database schema
npx sequelize-cli db:migrate

# Populate synthetic telemetry
python seeders/generate_synthetic_data.py --load-db

# Start API service
npm start

# Start ML inference service
uvicorn serve:app --port 8081
```
