const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { poolPromise, sql } = require('../db/connection');
const { assessAndPersist } = require('../services/assessmentService');

const assessSchema = z.object({
  qrCode: z.string().regex(/^\d{15}$/, 'QR Code must be exactly 15 digits'),
  asOf: z.string().datetime().optional(),
  lookbackHours: z.number().int().min(1).max(720).optional().default(168)
});

router.post('/assess/qr', async (req, res, next) => {
  try {
    const parsed = assessSchema.parse(req.body);
    let asOf;
if (parsed.asOf) {
  asOf = new Date(parsed.asOf);
} else {
  const now = new Date();
  now.setSeconds(0, 0); // round down to the start of the current minute
  asOf = now;
}
    const lookbackHours = parsed.lookbackHours;

    // Idempotency check - applies whether or not asOf was explicitly provided,
    // since two requests in the same instant should still be deduplicated.
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

    const { features, fusion } = await assessAndPersist(parsed.qrCode, asOf, lookbackHours);

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
        details: err.issues ? err.issues.map(e => ({ field: e.path[0], message: e.message })) : []
      });
    }
    next(err);
  }
});

module.exports = router;