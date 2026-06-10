const { poolPromise, sql } = require('../db/connection');

/**
 * Haversine formula - calculates distance between two GPS coordinates in km
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Builds the 10 feature vector for a given QR code
 * @param {string} qrCode - The QR code to analyze
 * @param {Date} asOf - The point in time to assess from
 * @param {number} lookbackHours - How far back to look (default 168 = 7 days)
 */
async function buildFeatures(qrCode, asOf, lookbackHours = 168) {
  const pool = await poolPromise;
  const asOfDate = new Date(asOf);
  const windowStart = new Date(asOfDate.getTime() - lookbackHours * 60 * 60 * 1000);

  // Fetch all scans within the lookback window
  const result = await pool.request()
    .input('qrCode', sql.NVarChar, qrCode)
    .input('windowStart', sql.DateTime2, windowStart)
    .input('asOf', sql.DateTime2, asOfDate)
    .query(`
      SELECT 
        occurred_at,
        event_type,
        actor_id,
        latitude,
        longitude
      FROM scan_events
      WHERE qr_code = @qrCode
        AND occurred_at >= @windowStart
        AND occurred_at <= @asOf
      ORDER BY occurred_at ASC
    `);

  const scans = result.recordset;

  // Cold start - no scans found
  if (scans.length === 0) {
    return {
      features: getDefaultFeatures(),
      rawScans: [],
      insufficientHistory: true
    };
  }

  // Time windows
  const time1h = new Date(asOfDate.getTime() - 1 * 60 * 60 * 1000);
  const time24h = new Date(asOfDate.getTime() - 24 * 60 * 60 * 1000);
  const time7d = new Date(asOfDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Feature 1, 2, 3: Scan counts
  const scans_last_1h = scans.filter(s => new Date(s.occurred_at) >= time1h).length;
  const scans_last_24h = scans.filter(s => new Date(s.occurred_at) >= time24h).length;
  const scans_last_7d = scans.filter(s => new Date(s.occurred_at) >= time7d).length;

  // Feature 4: Distinct actors in 24h
  const actors24h = scans
    .filter(s => new Date(s.occurred_at) >= time24h && s.actor_id)
    .map(s => s.actor_id);
  const distinct_actor_ids_24h = new Set(actors24h).size;

  // Feature 5: Distinct event types in 24h
  const eventTypes24h = scans
    .filter(s => new Date(s.occurred_at) >= time24h)
    .map(s => s.event_type);
  const distinct_event_types_24h = new Set(eventTypes24h).size;

  // Feature 6: Minutes since previous scan
  let minutes_since_prev_scan = 9999;
  if (scans.length >= 2) {
    const last = new Date(scans[scans.length - 1].occurred_at);
    const secondLast = new Date(scans[scans.length - 2].occurred_at);
    minutes_since_prev_scan = (last - secondLast) / (1000 * 60);
  }

  // Feature 7 & 8: Geo jump and implied speed
  let geo_jump_km = 0;
  let implied_speed_kmh = 0;

  const geoScans = scans.filter(s => s.latitude && s.longitude);
  if (geoScans.length >= 2) {
    const prev = geoScans[geoScans.length - 2];
    const last = geoScans[geoScans.length - 1];

    geo_jump_km = haversineDistance(
      parseFloat(prev.latitude), parseFloat(prev.longitude),
      parseFloat(last.latitude), parseFloat(last.longitude)
    );

    const timeDiffHours = (new Date(last.occurred_at) - new Date(prev.occurred_at)) / (1000 * 60 * 60);
    if (timeDiffHours > 1/60) {
      implied_speed_kmh = geo_jump_km / timeDiffHours;
    }
  }

  // Feature 9: Night scan ratio (00:00 - 05:00 UTC)
  const scans7d = scans.filter(s => new Date(s.occurred_at) >= time7d);
  const nightScans = scans7d.filter(s => new Date(s.occurred_at).getUTCHours() < 5);
  const night_scan_ratio_7d = scans7d.length > 0 ? nightScans.length / scans7d.length : 0;

  // Feature 10: Consumer validate share in 7d
  const consumerScans = scans7d.filter(s => s.event_type === 'CONSUMER_VALIDATE');
  const consumer_validate_share_7d = scans7d.length > 0 ? consumerScans.length / scans7d.length : 0;

  return {
    features: {
      scans_last_1h,
      scans_last_24h,
      scans_last_7d,
      distinct_actor_ids_24h,
      distinct_event_types_24h,
      minutes_since_prev_scan,
      geo_jump_km: parseFloat(geo_jump_km.toFixed(2)),
      implied_speed_kmh: parseFloat(implied_speed_kmh.toFixed(2)),
      night_scan_ratio_7d: parseFloat(night_scan_ratio_7d.toFixed(4)),
      consumer_validate_share_7d: parseFloat(consumer_validate_share_7d.toFixed(4))
    },
    rawScans: scans,
    insufficientHistory: false
  };
}

/**
 * Default features for cold start (brand new QR code)
 */
function getDefaultFeatures() {
  return {
    scans_last_1h: 0,
    scans_last_24h: 0,
    scans_last_7d: 0,
    distinct_actor_ids_24h: 0,
    distinct_event_types_24h: 0,
    minutes_since_prev_scan: 9999,
    geo_jump_km: 0,
    implied_speed_kmh: 0,
    night_scan_ratio_7d: 0,
    consumer_validate_share_7d: 0
  };
}

module.exports = {
  buildFeatures,
  haversineDistance
};