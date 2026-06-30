/**
 * Rule Engine - Deterministic fraud detection rules
 * Each rule checks a specific condition and adds to the risk score.
 * Total rule score is capped at 100.
 */

/**
 * Helper function implementing the Haversine formula to compute great-circle distances
 * @param {number} lat1 - Latitude of origin point
 * @param {number} lon1 - Longitude of origin point
 * @param {number} lat2 - Latitude of destination point
 * @param {number} lon2 - Longitude of destination point
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
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
 * R1: High Frequency - 10+ scans in the last 1 hour
 * Weight: 40
 */
function checkR1_HighFrequency(features) {
  if (features.scans_last_1h >= 10) {
    return {
      fired: true,
      contribution: 40,
      reason: 'RULE:HIGH_FREQUENCY: 10+ scans in 1h'
    };
  }
  return { fired: false, contribution: 0, reason: null };
}

/**
 * R2: Burst - 5+ scans in 15 minutes
 * Weight: 35
 */
function checkR2_Burst(recentScans, asOf) {
  if (!recentScans || recentScans.length === 0) {
    return { fired: false, contribution: 0, reason: null };
  }

  const referenceTime = asOf ? new Date(asOf) : new Date();
  const window15m = new Date(referenceTime.getTime() - 15 * 60 * 1000);

  const scansIn15m = recentScans.filter(scan => 
    new Date(scan.occurred_at || scan.occurredAt) >= window15m
  ).length;

  if (scansIn15m >= 5) {
    return {
      fired: true,
      contribution: 35,
      reason: 'RULE:BURST: 5+ scans in 15 mins'
    };
  }
  return { fired: false, contribution: 0, reason: null };
}

/**
 * R3: Geo Speed - Implied travel speed > 900 km/h AND geo jump > 50 km
 * Weight: 45
 */
function checkR3_GeoSpeed(features) {
  if (features.implied_speed_kmh > 900 && features.geo_jump_km > 50) {
    return {
      fired: true,
      contribution: 45,
      reason: 'RULE:GEO_SPEED: Implied speed > 900km/h'
    };
  }
  return { fired: false, contribution: 0, reason: null };
}

/**
 * R4: Geo Jump - Geo jump > 2000 km within a 2-hour window
 * Weight: 50
 */
function checkR4_GeoJump(features) {
  if (features.geo_jump_km > 2000 && features.minutes_since_prev_scan <= 120) {
    return {
      fired: true,
      contribution: 50,
      reason: 'RULE:GEO_JUMP: Teleport jump > 2000km'
    };
  }
  return { fired: false, contribution: 0, reason: null };
}

/**
 * R5: Multi Actor - Distinct actors in 24 hours >= 8
 * Weight: 25
 */
function checkR5_MultiActor(features) {
  if (features.distinct_actor_ids_24h >= 8) {
    return {
      fired: true,
      contribution: 25,
      reason: 'RULE:MULTI_ACTOR: 8+ unique actors in 24h'
    };
  }
  return { fired: false, contribution: 0, reason: null };
}

/**
 * R6: Consumer Dominance - Consumer validation share in 7 days > 60% and scans >= 5
 * Weight: 20
 */
function checkR6_ConsumerDominance(features) {
  if (features.consumer_validate_share_7d > 0.60 && features.scans_last_7d >= 5) {
    return {
      fired: true,
      contribution: 20,
      reason: 'RULE:CONSUMER_DOMINANCE: Heavy validation share'
    };
  }
  return { fired: false, contribution: 0, reason: null };
}

/**
 * Main rule engine runner for R1 through R6
 * Returns the total rule score and list of fired reasons
 */
function runRules(features, recentScans, asOf) {
  const results = [
    checkR1_HighFrequency(features),
    checkR2_Burst(recentScans, asOf),
    checkR3_GeoSpeed(features),
    checkR4_GeoJump(features),
    checkR5_MultiActor(features),
    checkR6_ConsumerDominance(features)
  ];

  const firedRules = results.filter(r => r.fired);
  const totalScore = firedRules.reduce((sum, r) => sum + r.contribution, 0);
  const reasons = firedRules.map(r => r.reason);

  return {
    ruleScore: Math.min(100, totalScore),
    reasons
  };
}

module.exports = {
  runRules,
  haversineDistance,
  checkR1_HighFrequency,
  checkR2_Burst,
  checkR3_GeoSpeed,
  checkR4_GeoJump,
  checkR5_MultiActor,
  checkR6_ConsumerDominance
};