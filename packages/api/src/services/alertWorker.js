const { poolPromise, sql } = require('../db/connection');

const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const POLL_INTERVAL_MS = 10000; // Polling loop interval (10 seconds)
const BATCH_SIZE = 10; // Process alerts in clean blocks to minimize memory utilization

async function processAlertOutbox() {
  if (!WEBHOOK_URL) {
    console.error('[Worker Error]: ALERT_WEBHOOK_URL configuration is missing in the environment.');
    return;
  }

  try {
    const pool = await poolPromise;

    // Fetch a batch of PENDING alert records
    const result = await pool.request()
      .input('batchSize', sql.Int, BATCH_SIZE)
      .query(`
        SELECT TOP (@batchSize) id, qr_code, risk_level, payload_json
        FROM alert_outbox
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
      `);

    const alerts = result.recordset;
    if (alerts.length === 0) return;

    console.log(`[AlertWorker] Found ${alerts.length} pending alert(s)`);

    for (const alert of alerts) {
      try {
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: alert.payload_json,
          signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
          throw new Error(`Webhook returned status ${response.status} ${response.statusText}`);
        }

        await pool.request()
          .input('id', sql.BigInt, alert.id)
          .query(`
            UPDATE alert_outbox
            SET status = 'SENT',
                sent_at = SYSUTCDATETIME(),
                last_error = NULL
            WHERE id = @id
          `);

        console.log(`[AlertWorker] Sent alert for QR ${alert.qr_code} (${alert.risk_level})`);

      } catch (error) {
        console.error(`[AlertWorker] Failed to send alert ${alert.id}: ${error.message}`);

        const errorString = error.stack || error.message || 'Unknown network invocation error';
        const truncatedError = errorString.substring(0, 500);

        await pool.request()
          .input('id', sql.BigInt, alert.id)
          .input('lastError', sql.NVarChar(512), truncatedError)
          .query(`
            UPDATE alert_outbox
            SET status = 'FAILED',
                last_error = @lastError
            WHERE id = @id
          `);
      }
    }
  } catch (globalError) {
    console.error('[AlertWorker] Critical error during polling cycle:', globalError);
  }
}

/**
 * Starts the background polling loop
 */
function startAlertWorker() {
  console.log(`[AlertWorker] Starting, polling every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`[AlertWorker] Webhook target: ${WEBHOOK_URL || 'NOT CONFIGURED'}`);

  // Run an immediate sweep, then continue on the polling interval
  processAlertOutbox();
  setInterval(processAlertOutbox, POLL_INTERVAL_MS);
}

module.exports = { startAlertWorker, processAlertOutbox };