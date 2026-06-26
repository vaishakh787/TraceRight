# Developer Integration Guide: Connecting to Scan Intelligence

This guide walks TraceRight upstream engineering teams through integrating core logistical applications with the Standalone Scan Intelligence Service.

---

## Authentication Protocol

All outbound HTTP calls to this service must be authenticated via custom header key-routing. Unauthenticated requests are immediately dropped at the application edge with an HTTP `401 Unauthorized` status before running any database or memory calculations.

```http
X-API-Key: dev-key-12345
Content-Type: application/json
```

---

## Core Workflow Orchestration

To achieve comprehensive anti-counterfeiting tracking without introducing blocking delays into physical scanning terminals, teams should use a two-step pattern: **Ingest then Assess**.

```
[ Scan Event Occurs ]
         │
         ▼
 1. POST /v1/ingest/scan  ──► (Returns 201 Created immediately)
         │
         ▼
 2. POST /v1/assess/qr    ──► (Runs background evaluation engine loop)
         │
         ├───► If LOW/MEDIUM: Returns risk assessment payload to client
         └───► If HIGH/CRITICAL: Stores assessment + pushes to Alert Outbox Queue
```

### Step 1: Log Telemetry Data Immediately

As soon as a barcode checkout transaction occurs at a logistics gate, dispatch the payload to the ingestion endpoint:

* **Endpoint:** `POST /v1/ingest/scan`
* **Idempotency Safeguard:** Upstream systems are required to generate and attach a persistent, unique UUID primitive as the `eventId`. If a network retry delivery loop re-sends the same event payload, our system returns an HTTP `200 OK` status with `{"status": "duplicate"}` to prevent duplicate records from corrupting the database.

### Step 2: Trigger Threat Profiling Engine

After successfully logging the event data points, trigger the behavioral evaluation loop:

* **Endpoint:** `POST /v1/assess/qr`
* **Performance SLAs:** Core computations generally resolve in under `50ms`. However, if our downstream internal machine learning microservice experiences transient cluster slowdowns, a circuit-breaker activates at exactly **`800ms`**. The execution path drops the ML server call, switches to a pure rules-engine evaluation, and returns a valid risk score response without blocking the client.

---

## Standard Error Footprints

When validation schemas fail, the system issues an HTTP `400 Bad Request` containing a structured array designed for rapid debugging:

```json
{
  "status": "error",
  "code": "VALIDATION_FAILED",
  "details": [
    {
      "field": "qrCode",
      "message": "QR Code must be exactly 15 digits"
    }
  ]
}
```