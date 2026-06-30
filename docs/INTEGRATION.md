# Integration Guide

This guide explains how TraceRight's existing services (warehouse scanners, dealer portals, consumer apps) should integrate with the Scan Intelligence Service.

## Base URL
http://<host>:3000/v1

Replace `<host>` with the deployed server address. During development this is `localhost`.

## Authentication

Every request (except `/health`) must include an API key in the request headers:
X-API-Key: <your-assigned-key>
Content-Type: application/json

Requests without a valid key receive a `401 Unauthorized` response. Keys are issued by the project owner and configured server-side via the `API_KEYS` environment variable.

## Rate Limits

Each client IP is limited to **100 requests per minute**. Exceeding this returns a `429 Too Many Requests` response. Response headers include:
RateLimit-Limit: 100
RateLimit-Remaining: <count>

Integrating systems should respect these headers and implement backoff if approaching the limit.

---

## Core Workflow: Ingest then Assess

To track counterfeit risk without introducing blocking delays into physical scanning terminals, integrating systems should use a two-step pattern:
[ Scan Event Occurs ]
|
v

POST /v1/ingest/scan   --> Returns 201 Created immediately
|
v
POST /v1/assess/qr     --> Runs the scoring engine
|
+--> If LOW/MEDIUM: returns risk assessment payload to client
+--> If HIGH/CRITICAL: stores assessment + queues an alert


---

## Endpoint: Record a Scan

Call this every time a QR code is scanned anywhere in the supply chain (bundling, dispatch, audits, consumer validation).

**Request**
POST /v1/ingest/scan
Content-Type: application/json
X-API-Key: <your-key>

```json
{
  "eventId": "a50c82fb-728b-4b2a-89a3-5cde78a2e123",
  "occurredAt": "2026-06-25T10:00:00.000Z",
  "qrCode": "123456789012345",
  "eventType": "DISPATCH",
  "latitude": 19.0760,
  "longitude": 72.8777,
  "locationLabel": "Mumbai Warehouse",
  "actorId": "USR-9981",
  "sourceDistributorId": 1002,
  "sourceDealerId": 501,
  "metadata": { "device_os": "Android 13" }
}
```

| Field | Required | Notes |
|---|---|---|
| `eventId` | Yes | Must be a unique UUID. Used for duplicate detection. |
| `occurredAt` | Yes | ISO 8601 timestamp of when the scan happened |
| `qrCode` | Yes | Exactly 15 digits |
| `eventType` | Yes | One of: `AUDIT`, `DISPATCH`, `STOCK_AUDIT`, `CONSUMER_VALIDATE`, `RETURN`, `OTHER` |
| `latitude` / `longitude` | No | GPS coordinates of the scan, if available |
| `actorId` | No | ID of the person/device scanning |

**Success Response (201)**
```json
{ "status": "created", "eventId": "a50c82fb-728b-4b2a-89a3-5cde78a2e123" }
```

**Duplicate Response (200)** — if `eventId` was already received:
```json
{ "status": "duplicate", "eventId": "a50c82fb-728b-4b2a-89a3-5cde78a2e123" }
```

**Validation Error (400)**
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

> **Integration tip:** Always generate a fresh UUID per physical scan event. If your system retries a failed network call, reuse the *same* `eventId` so the API can safely deduplicate.

---

## Endpoint: Assess Fraud Risk

Call this when you need to know how suspicious a QR code's behavior looks — for example, before a consumer validation message is shown, or during a periodic audit sweep.

**Request**
POST /v1/assess/qr
Content-Type: application/json
X-API-Key: <your-key>

```json
{
  "qrCode": "123456789012345",
  "asOf": "2026-06-25T10:05:00.000Z",
  "lookbackHours": 168
}
```

| Field | Required | Notes |
|---|---|---|
| `qrCode` | Yes | Exactly 15 digits |
| `asOf` | No | Point in time to assess from. Defaults to current time. |
| `lookbackHours` | No | How far back to look for scan history. Defaults to 168 (7 days). Max 720 (30 days). |

**Performance note:** Core computations generally resolve in under 50ms. If the internal ML service experiences a slowdown, a timeout activates at 800ms — the call falls back to a pure rules-based score rather than blocking the client.

**Response (200)**
```json
{
  "qrCode": "123456789012345",
  "assessedAt": "2026-06-25T10:05:00.000Z",
  "riskScore": 17,
  "riskLevel": "LOW",
  "ruleScore": 0,
  "mlScore": 36.97,
  "mlModelVersion": "iforest-v1",
  "reasons": [],
  "features": { "...": "10 computed feature values" }
}
```

`riskLevel` will be one of: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

> **Integration tip:** If `riskLevel` is `HIGH` or `CRITICAL`, the system automatically queues an alert internally — your service does not need to handle alerting separately. If you want to be notified directly, subscribe to the webhook described below.

> **Resilience note:** If the internal ML scoring service is temporarily unavailable, this endpoint still returns a valid response based on rules alone (`mlScore: null`, with a reason `ML:UNAVAILABLE`). Integrating systems do not need to handle this differently — the contract stays the same.

---

## Endpoint: Batch Recompute (Admin)

For backfilling or refreshing risk scores across many recently active QR codes at once. Intended for internal/admin use, not for high-frequency calling.
POST /v1/jobs/recompute-recent
X-API-Key: <your-key>

```json
{ "sinceHours": 24, "maxQrs": 100 }
```

---

## Webhook Notifications

When a QR code is assessed as `HIGH` or `CRITICAL`, an alert payload is sent to the configured `ALERT_WEBHOOK_URL`. If your team wants to receive these:

1. Provide a webhook endpoint that accepts `POST` requests with JSON
2. Send us the URL to configure as `ALERT_WEBHOOK_URL`
3. Your endpoint should respond with a `2xx` status to acknowledge receipt

**Payload shape:**
```json
{
  "qrCode": "123456789012345",
  "riskScore": 82,
  "riskLevel": "CRITICAL",
  "reasons": ["RULE:GEO_SPEED: Implied speed > 900km/h"],
  "assessedAt": "2026-06-25T10:05:00.000Z"
}
```

---

## Error Response Format

All errors follow this shape:

```json
{
  "status": "error",
  "code": "ERROR_CODE",
  "message": "Human readable description"
}
```

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Request body failed validation |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | — | Internal server error |

---

## Testing Your Integration

Import `docs/Scan Intelligence Service.postman_collection.json` into Postman for ready-made example requests against every endpoint above.