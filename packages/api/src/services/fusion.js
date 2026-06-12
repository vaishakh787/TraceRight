/**
 * Fusion Engine
 * Combines rule score and ML score into a final risk score
 * Weights: Rules = 0.55, ML = 0.45
 */

const WEIGHT_RULES = 0.55;
const WEIGHT_ML = 0.45;

function getRiskLevel(riskScore) {
  if (riskScore >= 75) return 'CRITICAL';
  if (riskScore >= 50) return 'HIGH';
  if (riskScore >= 25) return 'MEDIUM';
  return 'LOW';
}

/**
 * Fuses rule score and ML score into final risk score
 * If ML is unavailable, falls back to rules only
 */
function fuseScores(ruleScore, mlResult, reasons) {
  let mlScore = null;
  let mlModelVersion = null;
  let mlScoreFallback = ruleScore; // fallback = rule score
  const fusionReasons = [...reasons];

  if (mlResult && mlResult.mlScore !== undefined) {
    mlScore = mlResult.mlScore;
    mlModelVersion = mlResult.mlModelVersion;
    mlScoreFallback = mlScore;

    // Add ML reason if score is high
    if (mlScore >= 50) {
      fusionReasons.push('ML:ANOMALY: High outlier vector score detected');
    }
  } else {
    // ML unavailable - fallback to rules only
    fusionReasons.push('ML:UNAVAILABLE: Falling back to rules-only assessment');
  }

  const riskScore = Math.round(WEIGHT_RULES * ruleScore + WEIGHT_ML * mlScoreFallback);
  const riskLevel = getRiskLevel(riskScore);

  return {
    riskScore,
    riskLevel,
    ruleScore,
    mlScore,
    mlModelVersion,
    reasons: fusionReasons
  };
}

module.exports = { fuseScores, getRiskLevel };