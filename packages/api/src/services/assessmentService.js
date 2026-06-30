const { poolPromise, sql } = require('../db/connection');
const { buildFeatures } = require('./featureBuilder');
const { runRules } = require('./ruleEngine');
const { getMLScore } = require('./mlClient');
const { fuseScores } = require('./fusion');

/**
 * Runs a full risk assessment for one QR code and persists the result.
 * Shared by the single-QR assess endpoint and the batch recompute job.
 */
async function assessAndPersist(qrCode, asOf, lookbackHours) {
  const pool = await poolPromise;
  const asOfDate = new Date(asOf);

  const { features, rawScans, insufficientHistory } = await buildFeatures(
    qrCode,
    asOfDate,
    lookbackHours
  );

  let fusion;

  if (insufficientHistory) {
    fusion = {
      riskScore: 0,
      riskLevel: 'LOW',
      ruleScore: 0,
      mlScore: null,
      mlModelVersion: null,
      reasons: ['INFO:INSUFFICIENT_HISTORY']
    };
  } else {
    const rulesResult = runRules(features, rawScans, asOfDate);
    const mlResult = await getMLScore(features);
    fusion = fuseScores(rulesResult.ruleScore, mlResult, rulesResult.reasons);
  }

  const windowStart = new Date(asOfDate.getTime() - lookbackHours * 60 * 60 * 1000);

  await pool.request()
    .input('qrCode', sql.NVarChar, qrCode)
    .input('assessedAt', sql.DateTime2, asOfDate)
    .input('riskScore', sql.Decimal(5, 2), fusion.riskScore)
    .input('riskLevel', sql.NVarChar, fusion.riskLevel)
    .input('ruleScore', sql.Decimal(5, 2), fusion.ruleScore)
    .input('mlScore', sql.Decimal(5, 2), fusion.mlScore)
    .input('mlModelVersion', sql.NVarChar, fusion.mlModelVersion)
    .input('reasonsJson', sql.NVarChar, JSON.stringify(fusion.reasons))
    .input('featuresJson', sql.NVarChar, JSON.stringify(features))
    .input('windowFrom', sql.DateTime2, windowStart)
    .input('windowTo', sql.DateTime2, asOfDate)
    .query(`
      INSERT INTO risk_assessments
      (qr_code, assessed_at, risk_score, risk_level, rule_score, ml_score, 
       ml_model_version, reasons_json, features_json, event_window_from, event_window_to)
      VALUES
      (@qrCode, @assessedAt, @riskScore, @riskLevel, @ruleScore, @mlScore,
       @mlModelVersion, @reasonsJson, @featuresJson, @windowFrom, @windowTo)
    `);

  if (fusion.riskLevel === 'HIGH' || fusion.riskLevel === 'CRITICAL') {
    await pool.request()
      .input('qrCode', sql.NVarChar, qrCode)
      .input('riskLevel', sql.NVarChar, fusion.riskLevel)
      .input('payloadJson', sql.NVarChar, JSON.stringify({
        qrCode,
        riskScore: fusion.riskScore,
        riskLevel: fusion.riskLevel,
        reasons: fusion.reasons,
        assessedAt: asOfDate.toISOString()
      }))
      .query(`
        INSERT INTO alert_outbox (qr_code, risk_level, payload_json)
        VALUES (@qrCode, @riskLevel, @payloadJson)
      `);
  }

  return { features, fusion };
}

module.exports = { assessAndPersist };