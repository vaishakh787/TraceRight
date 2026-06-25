const express = require('express');
const router = express.Router();
const { poolPromise } = require('../db/connection');

router.get('/dashboard/recent', async (req, res, next) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT TOP 20 qr_code, risk_score, risk_level, assessed_at
      FROM risk_assessments
      ORDER BY assessed_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    next(err);
  }
});

module.exports = router;