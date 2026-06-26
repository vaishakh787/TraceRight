const fs = require('fs');
const path = require('path');
const { poolPromise, sql } = require('../packages/api/src/db/connection');

async function runDailyReport() {
  console.log('==================================================================');
  console.log(' TRACERIGHT DAILY PERFORMANCE & RISK SUMMARY GENERATOR');
  console.log('==================================================================');

  try {
    const pool = await poolPromise;
    
    // Set up reporting timestamps for the past 24 hours
    const now = new Date();
    const lookbackDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const reportDateString = now.toISOString().split('T')[0];

    console.log(`[*] Execution Time  : ${now.toISOString()}`);
    console.log(`[*] Lookback Window : Since ${lookbackDate.toISOString()}`);
    console.log(`[*] Target Date     : ${reportDateString}\n`);

    // Query 1: Extract total ingested telemetry scan logs count
    const scansResult = await pool.request()
      .input('lookbackDate', sql.DateTime2, lookbackDate)
      .query(`
        SELECT COUNT(*) as count 
        FROM scan_events 
        WHERE occurred_at >= @lookbackDate
      `);
    const totalScansIngested = scansResult.recordset[0].count;

    // Query 2: Extract total compiled analytical risk assessments processed count
    const assessmentsResult = await pool.request()
      .input('lookbackDate', sql.DateTime2, lookbackDate)
      .query(`
        SELECT COUNT(*) as count 
        FROM risk_assessments 
        WHERE assessed_at >= @lookbackDate
      `);
    const totalAssessmentsProcessed = assessmentsResult.recordset[0].count;

    // Query 3: Extract individual grouped risk bucket distribution counters
    const levelsResult = await pool.request()
      .input('lookbackDate', sql.DateTime2, lookbackDate)
      .query(`
        SELECT risk_level, COUNT(*) as count 
        FROM risk_assessments 
        WHERE assessed_at >= @lookbackDate
        GROUP BY risk_level
      `);

    // Standard baseline initialization matrix to preserve exact contract schema integrity
    const riskLevelCounts = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0
    };

    levelsResult.recordset.forEach(row => {
      if (riskLevelCounts[row.risk_level] !== undefined) {
        riskLevelCounts[row.risk_level] = row.count;
      }
    });

    // Query 4: Identify the top 5 most highly flagged anomalous barcode assets
    const topFlaggedResult = await pool.request()
      .input('lookbackDate', sql.DateTime2, lookbackDate)
      .query(`
        SELECT TOP 5
          qr_code as qrCode,
          MAX(risk_score) as riskScore,
          COUNT(*) as flaggedCount
        FROM risk_assessments
        WHERE assessed_at >= @lookbackDate
          AND risk_level IN ('HIGH', 'CRITICAL')
        GROUP BY qr_code
        ORDER BY riskScore DESC, flaggedCount DESC
      `);

    const topFlaggedQrs = topFlaggedResult.recordset.map(row => {
      // Inline helper mapping back to standard enterprise operational risk tags
      let computedLevel = 'HIGH';
      const score = parseFloat(row.riskScore);
      if (score >= 75) computedLevel = 'CRITICAL';

      return {
        qrCode: row.qrCode,
        riskScore: parseFloat(score.toFixed(1)),
        riskLevel: computedLevel,
        flaggedCount: row.flaggedCount
      };
    });

    // Compile variables structurally into the final JSON output payload layout
    const reportPayload = {
      reportDate: reportDateString,
      summaryStats: {
        totalScansIngested,
        totalAssessmentsProcessed,
        riskLevelCounts
      },
      topFlaggedQrs
    };

    // Ensure target report storage container workspace directory path exists
    const reportsDir = path.resolve(__dirname, '../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const targetFileName = `daily-summary-${reportDateString}.json`;
    const targetFilePath = path.join(reportsDir, targetFileName);

    fs.writeFileSync(targetFilePath, JSON.stringify(reportPayload, null, 2), 'utf-8');

    console.log('==================================================================');
    console.log(' SUMMARY REPORT COMPILED SUCCESSFULLY');
    console.log(`Saved Destination: reports/${targetFileName}`);
    console.log('==================================================================');
    console.log(JSON.stringify(reportPayload, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('\n Critical Exception Triggered During Reporting Compilation Loop:', error);
    process.exit(1);
  }
}

runDailyReport();