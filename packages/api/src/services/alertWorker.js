const { poolPromise, sql } = require('../db/connection');
const https = require('https');
const http = require('http');

const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const POLL_INTERVAL_MS = 5000; // check every 5 seconds
const MAX_RETRIES = 3;

/**
 * Sends a payload to the webhook URL
 */
function sendWebhook(payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(WEBHOOK_URL);
    const data = JSON.stringify(payload);

    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 5000
    };

    const req = lib.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Webhook returned status ${res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Webhook request timed out'));
    });

    req.on('error', (err) => {
  reject(new Error(`Webhook request error: ${err.code} - ${err.message}`));
});

    req.write(data);
    req.end();
  });
}

/**
 * Processes all PENDING alerts in the outbox
 */
async function processAlerts() {
  const pool = await poolPromise;

  // Fetch pending alerts
  const result = await pool.request().query(`
    SELECT TOP 10 id, qr_code, risk_level, payload_json
    FROM alert_outbox
    WHERE status = 'PENDING'
    ORDER BY created_at ASC
  `);

  const alerts = result.recordset;

  if (alerts.length === 0) {
    return;
  }

  console.log(`[AlertWorker] Found ${alerts.length} pending alert(s)`);

  for (const alert of alerts) {
    try {
      const payload = JSON.parse(alert.payload_json);
      await sendWebhook(payload);

      // Mark as SENT
      await pool.request()
        .input('id', sql.BigInt, alert.id)
        .query(`
          UPDATE alert_outbox 
          SET status = 'SENT', sent_at = SYSUTCDATETIME()
          WHERE id = @id
        `);

      console.log(`[AlertWorker] Sent alert for QR ${alert.qr_code} (${alert.risk_level})`);

    } catch (err) {
      console.error(`[AlertWorker] Failed to send alert ${alert.id}: ${err.message}`);

      // Mark as FAILED and store the error
      await pool.request()
        .input('id', sql.BigInt, alert.id)
        .input('error', sql.NVarChar, err.message.substring(0, 500))
        .query(`
          UPDATE alert_outbox 
          SET status = 'FAILED', last_error = @error
          WHERE id = @id
        `);
    }
  }
}

/**
 * Starts the background polling loop
 */
function startAlertWorker() {
  console.log(`[AlertWorker] Starting, polling every ${POLL_INTERVAL_MS / 1000}s`);
  setInterval(() => {
    processAlerts().catch(err => {
      console.error('[AlertWorker] Unexpected error:', err.message);
    });
  }, POLL_INTERVAL_MS);
}

module.exports = { startAlertWorker, processAlerts };