const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { poolPromise, sql } = require('../db/connection');
const { buildFeatures } = require('../services/featureBuilder');
const { runRules } = require('../services/ruleEngine');
const { getMLScore } = require('../services/mlClient');
const { fuseScores } = require('../services/fusion');

const assessSchema = z.object({
  qrCode: z.string().regex(/^\d{15}$/, 'QR Code must be exactly 15 digits'),
  asOf: z.string().datetime().optional(),
  lookbackHours: z.number().int().min(1).max(720).optional().default(168)
});

router.post('/assess/qr', async (req, res, next) => {
  try {
    const parsed = assessSchema.parse(req.body);
    const asOf = parsed.asOf ? new Date(parsed.asOf) : new Date();
    const lookbackHours = parsed.lookbackHours;
    // Idempotency check - if asOf is provided, check if we already assessed this QR code
if (parsed.asOf) {
  const pool = await poolPromise;
  const existing = await pool.request()
    .input('qrCode', sql.NVarChar, parsed.qrCode)
    .input('assessedAt', sql.DateTime2, asOf)
    .query(`
      SELECT TOP 1 
        qr_code, assessed_at, risk_score, risk_level, rule_score,
        ml_score, ml_model_version, reasons_json, features_json
      FROM risk_assessments
      WHERE qr_code = @qrCode
        AND assessed_at = @assessedAt
    `);

  if (existing.recordset.length > 0) {
    const cached = existing.recordset[0];
    return res.status(200).json({
      qrCode: cached.qr_code,
      assessedAt: cached.assessed_at,
      featureSchemaVersion: 1,
      riskScore: parseFloat(cached.risk_score),
      riskLevel: cached.risk_level,
      ruleScore: parseFloat(cached.rule_score),
      mlScore: cached.ml_score ? parseFloat(cached.ml_score) : null,
      mlModelVersion: cached.ml_model_version,
      reasons: JSON.parse(cached.reasons_json),
      features: JSON.parse(cached.features_json),
      cached: true
    });
  }
}

    // Step 1: Build features from database
    const { features, rawScans, insufficientHistory } = await buildFeatures(
      parsed.qrCode,
      asOf,
      lookbackHours
    );

    // Step 2: Handle cold start
    if (insufficientHistory) {
      return res.status(200).json({
        qrCode: parsed.qrCode,
        assessedAt: asOf.toISOString(),
        featureSchemaVersion: 1,
        riskScore: 0,
        riskLevel: 'LOW',
        ruleScore: 0,
        mlScore: null,
        mlModelVersion: null,
        reasons: ['INFO:INSUFFICIENT_HISTORY'],
        features
      });
    }

    // Step 3: Run rules engine
    const { ruleScore, reasons } = runRules(features, rawScans);

    // Step 4: Get ML score
    const mlResult = await getMLScore(features);

    // Step 5: Fuse scores
    const fusion = fuseScores(ruleScore, mlResult, reasons);

    // Step 6: Save assessment to database
    const pool = await poolPromise;
    const windowStart = new Date(asOf.getTime() - lookbackHours * 60 * 60 * 1000);

    await pool.request()
      .input('qrCode', sql.NVarChar, parsed.qrCode)
      .input('assessedAt', sql.DateTime2, asOf)
      .input('riskScore', sql.Decimal(5, 2), fusion.riskScore)
      .input('riskLevel', sql.NVarChar, fusion.riskLevel)
      .input('ruleScore', sql.Decimal(5, 2), fusion.ruleScore)
      .input('mlScore', sql.Decimal(5, 2), fusion.mlScore)
      .input('mlModelVersion', sql.NVarChar, fusion.mlModelVersion)
      .input('reasonsJson', sql.NVarChar, JSON.stringify(fusion.reasons))
      .input('featuresJson', sql.NVarChar, JSON.stringify(features))
      .input('windowFrom', sql.DateTime2, windowStart)
      .input('windowTo', sql.DateTime2, asOf)
      .query(`
        INSERT INTO risk_assessments
        (qr_code, assessed_at, risk_score, risk_level, rule_score, ml_score, 
         ml_model_version, reasons_json, features_json, event_window_from, event_window_to)
        VALUES
        (@qrCode, @assessedAt, @riskScore, @riskLevel, @ruleScore, @mlScore,
         @mlModelVersion, @reasonsJson, @featuresJson, @windowFrom, @windowTo)
      `);

    // Step 7: Queue alert if HIGH or CRITICAL
    if (fusion.riskLevel === 'HIGH' || fusion.riskLevel === 'CRITICAL') {
      await pool.request()
        .input('qrCode', sql.NVarChar, parsed.qrCode)
        .input('riskLevel', sql.NVarChar, fusion.riskLevel)
        .input('payloadJson', sql.NVarChar, JSON.stringify({
          qrCode: parsed.qrCode,
          riskScore: fusion.riskScore,
          riskLevel: fusion.riskLevel,
          reasons: fusion.reasons,
          assessedAt: asOf.toISOString()
        }))
        .query(`
          INSERT INTO alert_outbox (qr_code, risk_level, payload_json)
          VALUES (@qrCode, @riskLevel, @payloadJson)
        `);
    }

    // Step 8: Return response
    return res.status(200).json({
      qrCode: parsed.qrCode,
      assessedAt: asOf.toISOString(),
      featureSchemaVersion: 1,
      riskScore: fusion.riskScore,
      riskLevel: fusion.riskLevel,
      ruleScore: fusion.ruleScore,
      mlScore: fusion.mlScore,
      mlModelVersion: fusion.mlModelVersion,
      reasons: fusion.reasons,
      features
    });

  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_FAILED',
        details: err.errors.map(e => ({ field: e.path[0], message: e.message }))
      });
    }
    next(err);
  }
});

module.exports = router;