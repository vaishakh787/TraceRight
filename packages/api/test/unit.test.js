const test = require('node:test');
const assert = require('node:assert');
const { runRules } = require('../src/services/ruleEngine');
const { fuseScores } = require('../src/services/fusion');

test('TraceRight Threat Intelligence Domain Units Suite', async (t) => {

  await t.test('Rules Engine - Returns 0 score on clean baseline supply chain signals', () => {
    const cleanFeatures = {
      scans_last_1h: 1,
      scans_last_24h: 2,
      scans_last_7d: 5,
      distinct_actor_ids_24h: 1,
      distinct_event_types_24h: 2,
      minutes_since_prev_scan: 1440,
      geo_jump_km: 0,
      implied_speed_kmh: 0,
      night_scan_ratio_7d: 0.1,
      consumer_validate_share_7d: 0.2
    };

    const results = runRules(cleanFeatures, [], new Date());
    assert.strictEqual(results.ruleScore, 0);
    assert.strictEqual(results.reasons.length, 0);
  });

  await t.test('Rules Engine - Triggers R4_GEO_JUMP teleportation boundaries correctly', () => {
    const maliciousFeatures = {
      geo_jump_km: 2500,           // Trigger boundary (> 2000 km)
      minutes_since_prev_scan: 45  // Time constraint window (<= 120 mins)
    };

    const results = runRules(maliciousFeatures, [], new Date());
    assert.strictEqual(results.ruleScore, 50); // R4 Weight is 50
    assert.ok(results.reasons.includes('RULE:GEO_JUMP: Teleport jump > 2000km'));
  });

  await t.test('Rules Engine - Forces an upper point ceiling cap of 100 points maximum', () => {
    const criticalFeatures = {
      scans_last_1h: 15,           // Fires R1 (+40)
      geo_jump_km: 3000,          
      minutes_since_prev_scan: 10, // Fires R4 (+50)
      implied_speed_kmh: 1100      // Fires R3 (+45)
    };

    const results = runRules(criticalFeatures, [], new Date());
    assert.strictEqual(results.ruleScore, 100);
  });

  await t.test('Score Fusion - Degrades gracefully and defaults to rules-only on ML dropouts', () => {
    const ruleScore = 40;
    const rulesReasons = ['RULE:HIGH_FREQUENCY: 10+ scans in 1h'];
    const mlOfflinePayload = null; // Emulates network timeout/offline state

    const outcome = fuseScores(ruleScore, mlOfflinePayload, rulesReasons);
    
    assert.strictEqual(outcome.riskScore, 40);
    assert.strictEqual(outcome.riskLevel, 'MEDIUM');
    assert.ok(outcome.reasons.includes('ML:UNAVAILABLE: Falling back to rules-only assessment'));
  });

  await t.test('Score Fusion - Computes a balanced mathematical ratio matrix outcome', () => {
    const ruleScore = 100;
    const mlResult = { mlScore: 50, mlModelVersion: 'iforest-v1' };

    // Fusion formula calculation: (0.55 * 100) + (0.45 * 50) = 55 + 22.5 = 77.5 -> rounded to 78
    const outcome = fuseScores(ruleScore, mlResult, []);
    assert.strictEqual(outcome.riskScore, 78);
    assert.strictEqual(outcome.riskLevel, 'CRITICAL');
  });
});
