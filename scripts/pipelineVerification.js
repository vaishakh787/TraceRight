/**
 * TraceRight Core Pipeline Integration & Anomaly Verification Suite
 * Automated E2E integration test script for validating multi-tier risk score fusion.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Load environment configuration relative to script home
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = (process.env.API_KEYS || 'dev-key-12345').split(',')[0].trim();
const PORT = process.env.API_PORT || 3000;
const BASE_URL = `http://localhost:${PORT}/v1`;

// Global suite status trackers
let passedScenarios = 0;
let failedScenarios = 0;

/**
 * Robustly parses the baseline feature dataset to locate seeded target profiles.
 * Enforces index boundary safety checks during line-by-line processing.
 */
function extractTargetVectors() {
  const csvPath = path.resolve(__dirname, '../data/features.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`[ERROR] Execution aborted: Feature baseline dataset missing at ${csvPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
  
  let cloneBurstQr = null;
  let teleportQr = null;
  let legitimateQr = null;

  // Process rows sequentially, skipping the header boundary row
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(',');
    if (columns.length < 8) continue; // Skip structurally malformed data fragments

    const qrCode = columns[2].trim();
    const locationLabel = columns[6].trim();

    if (locationLabel.includes('Burst_') && !cloneBurstQr) {
      cloneBurstQr = qrCode;
    } else if ((locationLabel === 'London_Warehouse' || locationLabel === 'Tokyo_Retail') && !teleportQr) {
      teleportQr = qrCode;
    } else if (locationLabel.includes('_Retail') && !locationLabel.includes('Burst_') && !legitimateQr) {
      legitimateQr = qrCode;
    }
  }

  return { cloneBurstQr, teleportQr, legitimateQr };
}

/**
 * Dispatches a transaction array payload to the risk assessment scoring gateway.
 * Evaluates the results against an array of expected risk levels.
 */
async function executeAssessment(qrCode, scenarioIdentifier, expectedRiskLevels = []) {
  console.log(`\n[SCENARIO] Initializing Evaluation Sequence: ${scenarioIdentifier}`);
  console.log(`[INFO] Target Barcode Serial Vector: ${qrCode}`);

  try {
    const response = await fetch(`${BASE_URL}/assess/qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ qrCode })
    });

    const payload = await response.json();
    
    if (!response.ok) {
      console.error(`❌ [FAILURE] Assessment API returned error status: ${response.status}`);
      console.error(`❌ [FAILURE] Error details: ${JSON.stringify(payload)}`);
      failedScenarios++;
      return false;
    }

    console.log(`[SUCCESS] Evaluation complete. Status: HTTP ${response.status}`);
    console.log(`│   Risk Classification Band: [${payload.riskLevel}]`);
    console.log(`│   Unified Fusion Risk Score: ${payload.riskScore}`);
    console.log(`│   Heuristic Rules Triggered: ${JSON.stringify(payload.reasons)}`);
    
    if (payload.mlScore !== null && payload.mlScore !== undefined) {
      console.log(`│   Isolation Forest Outlier : ${payload.mlScore} (Engine: ${payload.mlModelVersion})`);
    } else {
      console.log(`│   Isolation Forest Outlier : UNAVAILABLE (Degraded Mode Fallback Active)`);
    }

    // Pass/Fail Assertion Verification Block
    if (expectedRiskLevels.length > 0 && !expectedRiskLevels.includes(payload.riskLevel)) {
      console.error(`❌ [ASSERTION FAILED]: Expected risk level to be one of ${JSON.stringify(expectedRiskLevels)}, but received [${payload.riskLevel}]`);
      failedScenarios++;
      return false;
    }

    console.log(`✅ [ASSERTION PASSED]: Classification falls safely within expected boundaries.`);
    passedScenarios++;
    return true;
  } catch (error) {
    console.error(`❌ [ERROR] Network invocation exception encountered: ${error.message}`);
    failedScenarios++;
    return false;
  }
}

/**
 * Simulates a high-density Audit Flooding attack signature via rapid ingestion streams.
 * Utilizes a controlled sequential pipeline loop to avoid race conditions on cold-starts.
 */
async function executeAuditFloodScenario() {
  const floodQr = "999" + Math.floor(100000000000 + Math.random() * 900000000000);
  console.log(`\n[SCENARIO] Initializing Live System Threat Injection: Audit Flooding Anomaly`);
  console.log(`[INFO] Dispatched Ingestion Block: Cascading 12 concurrent audit transactions for asset: ${floodQr}`);

  const ingestionPayloads = Array.from({ length: 12 }, (_, index) => ({
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    qrCode: floodQr,
    eventType: "STOCK_AUDIT",
    latitude: 12.9716,
    longitude: 77.5946,
    locationLabel: "BENGALURU_Logistics_Gate_Flood",
    actorId: `terminal_operator_flood_${index}`
  }));

  let errorCount = 0;

  // Execute ingestion loop sequentially to systematically check network handling constraints
  for (const payload of ingestionPayloads) {
    try {
      const response = await fetch(`${BASE_URL}/ingest/scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        errorCount++;
      }
    } catch (e) {
      errorCount++;
    }
  }

  if (errorCount > 0) {
    console.warn(`[WARN] Ingestion sequence anomaly: ${errorCount} transaction frames dropped or rejected.`);
  } else {
    console.log(`[INFO] Telemetry block successfully processed. Commencing instantaneous real-time evaluation.`);
  }

  // Evaluate the tracking barcode asset immediately following the ingestion sweep
  await executeAssessment(floodQr, "Real-Time Ingestion Audit Flood Capture", ["HIGH", "CRITICAL"]);
}

/**
 * Master controller orchestrating the automation testing suite.
 */
async function runSystemVerificationSuite() {
  console.log('==================================================================');
  console.log('TRACERIGHT SCAN INTELLIGENCE CORE SYSTEM VERIFICATION SUITE');
  console.log('==================================================================');
  console.log(`[INFO] Targeted Microservice Interface Boundary: ${BASE_URL}`);

  const vectors = extractTargetVectors();

  // Scenario 1: Legitimate Supply Chain Log -> Expect LOW risk footprint
  if (vectors.legitimateQr) {
    await executeAssessment(vectors.legitimateQr, "Standard Supply Chain Movement", ["LOW"]);
  } else {
    console.warn('[WARN] Skipping Scenario 1: No legitimate baseline samples resolved in CSV registry.');
  }

  // Scenario 2: Active Real-Time Audit Flooding -> Expect high frequency anomalies
  await executeAuditFloodScenario();

  // Scenario 3: Geolocation Anomaly (Impossible Velocity) -> Expect HIGH or CRITICAL
  if (vectors.teleportQr) {
    await executeAssessment(vectors.teleportQr, "Impossible Velocity Teleportation Anomaly", ["HIGH", "CRITICAL"]);
  } else {
    console.warn('[WARN] Skipping Scenario 3: No teleportation attack samples resolved in CSV registry.');
  }

  // Scenario 4: High-Frequency Clone Bursting -> Expect definitive CRITICAL breach status
  if (vectors.cloneBurstQr) {
    await executeAssessment(vectors.cloneBurstQr, "High-Frequency Clone Burst Anomaly", ["CRITICAL"]);
  } else {
    console.warn('[WARN] Skipping Scenario 4: No clone burst attack samples resolved in CSV registry.');
  }

  console.log('\n==================================================================');
  console.log('TRACERIGHT PIPELINE AUTOMATION TEST CYCLE SUMMARY');
  console.log('==================================================================');
  console.log(`[PASSED] Scenarios: ${passedScenarios}`);
  console.log(`[FAILED] Scenarios: ${failedScenarios}`);
  console.log('==================================================================');

  if (failedScenarios > 0) {
    console.error(`❌ [FAILURE] Integration suite exited with ${failedScenarios} broken assertion checkpoints.`);
    process.exit(1);
  } else {
    console.log(`✅ [SUCCESS] All E2E data processing pipelines functional and fully verified.`);
    process.exit(0);
  }
}

// Invoke master test controller execution block
runSystemVerificationSuite().catch(globalError => {
  console.error(`[CRITICAL] Master suite orchestration exception thrown: ${globalError.stack}`);
  process.exit(1);
});