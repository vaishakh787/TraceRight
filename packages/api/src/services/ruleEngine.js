/**
 * Rule Engine - Deterministic fraud detection rules
 * Each rule checks a specific condition and adds to the risk score
 * Total rule score is capped at 100
 */

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
 * Note: This uses raw timestamps, not the precomputed features
 */
function checkR2_Burst(recentScans) {
  if (!recentScans || recentScans.length === 0) {
    return { fired: false, contribution: 0, reason: null };
  }

  const now = new Date();
  const window15m = new Date(now.getTime() - 15 * 60 * 1000);

  const scansIn15m = recentScans.filter(scan => 
    new Date(scan.occurred_at) >= window15m
  ).length;

  if (scansIn15m >= 5) {
    return {
      fired: true,
      contribution: 35,
      reason: `RULE:BURST: 5+ scans in 15 mins`
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
      reason: `RULE:GEO_SPEED: Implied speed > 900km/h`
    };
  }
  return { fired: false, contribution: 0, reason: null };
}

/**
 * Main rule engine runner for R1, R2, R3
 * Returns the total rule score and list of fired reasons
 */
function runRules(features, recentScans) {
  const results = [
    checkR1_HighFrequency(features),
    checkR2_Burst(recentScans),
    checkR3_GeoSpeed(features),
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
  checkR1_HighFrequency,
  checkR2_Burst,
  checkR3_GeoSpeed
};