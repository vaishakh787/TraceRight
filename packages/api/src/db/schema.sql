-- 1. Scan Events Table: Stores every ingested event. event_id is the unique idempotency key.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='scan_events' and xtype='U')
BEGIN
  CREATE TABLE scan_events (
    id                    BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    event_id              UNIQUEIDENTIFIER NOT NULL,
    occurred_at           DATETIME2(3) NOT NULL,
    qr_code               NVARCHAR(32) NOT NULL,
    event_type            NVARCHAR(32) NOT NULL,
    latitude              DECIMAL(9,6) NULL,
    longitude             DECIMAL(9,6) NULL,
    location_label        NVARCHAR(256) NULL,
    actor_id              NVARCHAR(128) NULL,
    source_distributor_id INT NULL,
    source_dealer_id      INT NULL,
    metadata_json         NVARCHAR(MAX) NULL,
    created_at            DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_scan_events_event_id UNIQUE (event_id)
  );

  CREATE INDEX IX_scan_events_qr_occurred ON scan_events (qr_code, occurred_at DESC);
  CREATE INDEX IX_scan_events_occurred ON scan_events (occurred_at DESC);
END

-- 2. Risk Assessments Table: Stores every computed threat evaluation run for a QR code.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='risk_assessments' and xtype='U')
BEGIN
  CREATE TABLE risk_assessments (
    id                BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    qr_code           NVARCHAR(32) NOT NULL,
    assessed_at       DATETIME2(3) NOT NULL,
    risk_score        DECIMAL(5,2) NOT NULL,
    risk_level        NVARCHAR(16) NOT NULL,
    rule_score        DECIMAL(5,2) NOT NULL,
    ml_score          DECIMAL(5,2) NULL,
    ml_model_version  NVARCHAR(64) NULL,
    reasons_json      NVARCHAR(MAX) NOT NULL, -- JSON array of string explanations
    features_json     NVARCHAR(MAX) NOT NULL, -- JSON string of feature keys/values
    event_window_from DATETIME2(3) NULL,
    event_window_to   DATETIME2(3) NULL,
    created_at        DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_risk_assessments_qr ON risk_assessments (qr_code, assessed_at DESC);
END

-- 3. Alert Outbox Table: Stores suspicious threat events queue for notification dispatch.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='alert_outbox' and xtype='U')
BEGIN
  CREATE TABLE alert_outbox (
    id            BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    qr_code       NVARCHAR(32) NOT NULL,
    risk_level    NVARCHAR(16) NOT NULL,
    payload_json  NVARCHAR(MAX) NOT NULL, -- Complete alert object context
    status        NVARCHAR(16) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED'
    created_at    DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    sent_at       DATETIME2(3) NULL,
    last_error    NVARCHAR(512) NULL
  );

  CREATE INDEX IX_alert_outbox_pending ON alert_outbox (status, created_at);
END