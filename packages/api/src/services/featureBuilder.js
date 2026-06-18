const { poolPromise, sql } = require('../db/connection');

/**
 * Helper function implementing the Haversine formula to compute great-circle distances
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Builds the 10 feature vector for a given QR code
 * @param {string} qrCode - The QR code to analyze
 * @param {Date} asOf - The point in time to assess from
 * @param {number} lookbackHours - How far back to look
 */
async function buildFeatures(qrCode, asOf, lookbackHours = 168) {
  const pool = await poolPromise;
  const asOfDate = new Date(asOf);
  const windowStart = new Date(asOfDate.getTime() - lookbackHours * 60 * 60 * 1000);

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

  if (scans.length <= 1) {
    return {
      features: getDefaultFeatures(scans.length, scans[0]),
      rawScans: scans,
      insufficientHistory: true
    };
  }

  const time1h = new Date(asOfDate.getTime() - 1 * 60 * 60 * 1000);
  const time24h = new Date(asOfDate.getTime() - 24 * 60 * 60 * 1000);
  const time7d = new Date(asOfDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const scans_last_1h = scans.filter(s => new Date(s.occurred_at) >= time1h).length;
  const scans_last_24h = scans.filter(s => new Date(s.occurred_at) >= time24h).length;
  const scans_last_7d = scans.filter(s => new Date(s.occurred_at) >= time7d).length;

  const actors24h = scans
    .filter(s => new Date(s.occurred_at) >= time24h && s.actor_id)
    .map(s => s.actor_id);
  const distinct_actor_ids_24h = new Set(actors24h).size;

  const eventTypes24h = scans
    .filter(s => new Date(s.occurred_at) >= time24h)
    .map(s => s.event_type);
  const distinct_event_types_24h = new Set(eventTypes24h).size;

  let minutes_since_prev_scan = 9999;
  if (scans.length >= 2) {
    const last = new Date(scans[scans.length - 1].occurred_at);
    const secondLast = new Date(scans[scans.length - 2].occurred_at);
    minutes_since_prev_scan = (last - secondLast) / (1000 * 60);
  }

  let geo_jump_km = 0;
  let implied_speed_kmh = 0;

  const geoScans = scans.filter(s => s.latitude !== null && s.longitude !== null);
  if (geoScans.length >= 2) {
    const prev = geoScans[geoScans.length - 2];
    const last = geoScans[geoScans.length - 1];

    const lat1 = parseFloat(prev.latitude);
    const lon1 = parseFloat(prev.longitude);
    const lat2 = parseFloat(last.latitude);
    const lon2 = parseFloat(last.longitude);

    if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
      geo_jump_km = haversineDistance(lat1, lon1, lat2, lon2);
      const timeDiffHours = (new Date(last.occurred_at) - new Date(prev.occurred_at)) / (1000 * 60 * 60);
      if (timeDiffHours > 1 / 60) {
        implied_speed_kmh = geo_jump_km / timeDiffHours;
      }
    }
  }

  const scans7d = scans.filter(s => new Date(s.occurred_at) >= time7d);
  const nightScans = scans7d.filter(s => new Date(s.occurred_at).getUTCHours() < 5);
  const night_scan_ratio_7d = scans7d.length > 0 ? nightScans.length / scans7d.length : 0;

  const consumerScans = scans7d.filter(s => s.event_type === 'CONSUMER_VALIDATE');
  const consumer_validate_share_7d = scans7d.length > 0 ? consumerScans.length / scans7d.length : 0;

  return {
    features: {
      scans_last_1h: isNaN(scans_last_1h) ? 0 : scans_last_1h,
      scans_last_24h: isNaN(scans_last_24h) ? 0 : scans_last_24h,
      scans_last_7d: isNaN(scans_last_7d) ? 0 : scans_last_7d,
      distinct_actor_ids_24h: isNaN(distinct_actor_ids_24h) ? 0 : distinct_actor_ids_24h,
      distinct_event_types_24h: isNaN(distinct_event_types_24h) ? 0 : distinct_event_types_24h,
      minutes_since_prev_scan: isNaN(minutes_since_prev_scan) || minutes_since_prev_scan < 0 ? 9999 : parseFloat(minutes_since_prev_scan.toFixed(2)),
      geo_jump_km: isNaN(geo_jump_km) || geo_jump_km < 0 ? 0 : parseFloat(geo_jump_km.toFixed(2)),
      implied_speed_kmh: isNaN(implied_speed_kmh) || implied_speed_kmh < 0 ? 0 : parseFloat(implied_speed_kmh.toFixed(2)),
      night_scan_ratio_7d: isNaN(night_scan_ratio_7d) ? 0 : parseFloat(night_scan_ratio_7d.toFixed(4)),
      consumer_validate_share_7d: isNaN(consumer_validate_share_7d) ? 0 : parseFloat(consumer_validate_share_7d.toFixed(4))
    },
    rawScans: scans,
    insufficientHistory: false
  };
}

/**
 * Default features for cold start (0 or 1 scan total)
 */
function getDefaultFeatures(scanCount = 0, initialScan = null) {
  const isConsumer = initialScan && initialScan.event_type === 'CONSUMER_VALIDATE';
  return {
    scans_last_1h: scanCount,
    scans_last_24h: scanCount,
    scans_last_7d: scanCount,
    distinct_actor_ids_24h: initialScan && initialScan.actor_id ? 1 : 0,
    distinct_event_types_24h: scanCount,
    minutes_since_prev_scan: 9999,
    geo_jump_km: 0,
    implied_speed_kmh: 0,
    night_scan_ratio_7d: 0,
    consumer_validate_share_7d: isConsumer ? 1 : 0
  };
}

module.exports = {
  buildFeatures,
  haversineDistance
};