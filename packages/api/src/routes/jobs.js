const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { poolPromise, sql } = require('../db/connection');
const { buildFeatures } = require('../services/featureBuilder');
const { runRules } = require('../services/ruleEngine');
const { getMLScore } = require('../services/mlClient');
const { fuseScores } = require('../services/fusion');

const jobSchema = z.object({
  sinceHours: z.number().int().min(1).optional().default(24),
  maxQrs: z.number().int().min(1).max(500).optional().default(500)
});

router.post('/jobs/recompute-recent', async (req, res, next) => {
  try {
    const parsed = jobSchema.parse(req.body);
    const sinceHours = parsed.sinceHours;
    const maxQrs = parsed.maxQrs;

    const pool = await poolPromise;
    const lookbackDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

    const activeQrsResult = await pool.request()
      .input('lookbackDate', sql.DateTime2, lookbackDate)
      .query(`
        SELECT DISTINCT qr_code 
        FROM scan_events 
        WHERE occurred_at >= @lookbackDate
      `);

    const rawQrList = activeQrsResult.recordset.map(row => row.qr_code);
    const targetQrs = rawQrList.slice(0, maxQrs);

    const processedQrs = [];
    const asOf = new Date();
    const defaultLookbackHours = 168;

    for (const qrCode of targetQrs) {
      const { features, rawScans, insufficientHistory } = await buildFeatures(
        qrCode,
        asOf,
        defaultLookbackHours
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
        const rulesResult = runRules(features, rawScans);
        const mlResult = await getMLScore(features);
        fusion = fuseScores(rulesResult.ruleScore, mlResult, rulesResult.reasons);
      }

      const windowStart = new Date(asOf.getTime() - defaultLookbackHours * 60 * 60 * 1000);

      await pool.request()
        .input('qrCode', sql.NVarChar, qrCode)
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

      if (fusion.riskLevel === 'HIGH' || fusion.riskLevel === 'CRITICAL') {
        await pool.request()
          .input('qrCode', sql.NVarChar, qrCode)
          .input('riskLevel', sql.NVarChar, fusion.riskLevel)
          .input('payloadJson', sql.NVarChar, JSON.stringify({
            qrCode,
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

      processedQrs.push(qrCode);
    }

    return res.status(200).json({
      status: 'success',
      recomputedCount: processedQrs.length,
      processedQrs
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