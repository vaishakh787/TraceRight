const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { poolPromise, sql } = require('../db/connection');
const { assessAndPersist } = require('../services/assessmentService');

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
      await assessAndPersist(qrCode, asOf, defaultLookbackHours);
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
        details: err.issues ? err.issues.map(e => ({ field: e.path[0], message: e.message })) : []
      });
    }
    next(err);
  }
});

module.exports = router;