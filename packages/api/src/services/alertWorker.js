const { poolPromise, sql } = require('../db/connection');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });

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

    // 1. Atomically fetch a distinct block of PENDING alert records
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

    console.log(`[* Worker]: Found ${alerts.length} PENDING outbox alerts to process.`);

    for (const alert of alerts) {
      try {
        // 2. Post payload data downstream to external target endpoint
        const response = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: alert.payload_json,
          // Implement standard HTTP connection timeout limits (5 seconds)
          signal: AbortSignal.timeout(5000) 
        });

        if (!response.ok) {
          throw new Error(`Remote webhook returned error code response: ${response.status} ${response.statusText}`);
        }

        // 3. Complete transaction state transition updates upon successful delivery execution loops
        await pool.request()
          .input('id', sql.BigInt, alert.id)
          .query(`
            UPDATE alert_outbox
            SET status = 'SENT',
                sent_at = SYSUTCDATETIME(),
                last_error = NULL
            WHERE id = @id
          `);

        console.log(`[+ Worker]: Successfully dispatched event alert record entry ID: ${alert.id} for QR: ${alert.qr_code}`);

      } catch (error) {
        // 4. Capture full serialization error context bounds neatly on fallback pipelines
        console.error(`[-] Worker Failure: Webhook dispatch execution failed for alert record identifier ID: ${alert.id}`);
        
        const errorString = error.stack || error.message || 'Unknown network invocation error';
        const truncatedError = errorString.substring(0, 512); // Bound tightly against NVARCHAR(512) constraint schemas

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
    console.error('[Worker Critical Error]: Exception thrown during master polling pipeline sequence query: ', globalError);
  }
}

/**
 * Start execution polling dispatcher loop lifecycle hooks
 */
function startWorker() {
  console.log('==================================================================');
  console.log(`🚀 TraceRight Outbox Processing Daemon Engaged`);
  console.log(`Polling Target Hook  : ${WEBHOOK_URL || 'NOT CONFIGURED'}`);
  console.log(`Polling Frequency Timing: Every ${POLL_INTERVAL_MS / 1000}s`);
  console.log('==================================================================\n');

  // Initial immediate execution sweep pass boundary check
  processAlertOutbox();

  // Schedule continuous rolling background event intervals loops
  setInterval(processAlertOutbox, POLL_INTERVAL_MS);
}

// Enable standalone executable capabilities via direct CLI invocation threads execution flags
if (require.main === module) {
  startWorker();
}

module.exports = { startWorker };