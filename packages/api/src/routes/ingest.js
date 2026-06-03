const express = require('express');
const { z } = require('zod');
const router = express.Router();
const { poolPromise, sql } = require('../db/connection');

const scanSchema = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  qrCode: z.string().regex(/^\d{15}$/, "QR must be exactly 15 digits"),
  eventType: z.enum(['AUDIT', 'DISPATCH', 'STOCK_AUDIT', 'CONSUMER_VALIDATE', 'RETURN', 'OTHER']),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationLabel: z.string().max(256).optional(),
  actorId: z.string().max(128).optional(),
  sourceDistributorId: z.number().int().optional(),
  sourceDealerId: z.number().int().optional(),
  metadata: z.record(z.any()).optional()
});

router.post('/ingest/scan', async (req, res, next) => {
  try {
    const parsed = scanSchema.parse(req.body);

    const occurredTime = new Date(parsed.occurredAt).getTime();
    if (occurredTime > Date.now() + 5 * 60 * 1000) {
      return res.status(400).json({
        status: 'error',
        code: 'VALIDATION_FAILED',
        details: [{ field: 'occurredAt', message: 'Timestamp is too far in the future' }]
      });
    }

    const pool = await poolPromise;

    const dupCheck = await pool.request()
      .input('eventId', sql.UniqueIdentifier, parsed.eventId)
      .query('SELECT event_id FROM scan_events WHERE event_id = @eventId');

    if (dupCheck.recordset.length > 0) {
      return res.status(200).json({ status: 'duplicate', eventId: parsed.eventId });
    }

    await pool.request()
      .input('eventId', sql.UniqueIdentifier, parsed.eventId)
      .input('occurredAt', sql.DateTime2, new Date(parsed.occurredAt))
      .input('qrCode', sql.NVarChar, parsed.qrCode)
      .input('eventType', sql.NVarChar, parsed.eventType)
      .input('latitude', sql.Decimal(9, 6), parsed.latitude || null)
      .input('longitude', sql.Decimal(9, 6), parsed.longitude || null)
      .input('locationLabel', sql.NVarChar, parsed.locationLabel || null)
      .input('actorId', sql.NVarChar, parsed.actorId || null)
      .input('sourceDistributorId', sql.Int, parsed.sourceDistributorId || null)
      .input('sourceDealerId', sql.Int, parsed.sourceDealerId || null)
      .input('metadataJson', sql.NVarChar, parsed.metadata ? JSON.stringify(parsed.metadata) : null)
      .query(`INSERT INTO scan_events 
              (event_id, occurred_at, qr_code, event_type, latitude, longitude, 
               location_label, actor_id, source_distributor_id, source_dealer_id, metadata_json)
              VALUES 
              (@eventId, @occurredAt, @qrCode, @eventType, @latitude, @longitude,
               @locationLabel, @actorId, @sourceDistributorId, @sourceDealerId, @metadataJson)`);

    return res.status(201).json({ status: 'created', eventId: parsed.eventId });

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