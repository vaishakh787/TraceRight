const http = require('http');

const ML_TIMEOUT_MS = 800;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8081';

/**
 * Calls the Python ML service to get an anomaly score
 * Returns null if the service is unavailable or times out
 */
async function getMLScore(features) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      featureSchemaVersion: 1,
      features: features
    });

    const url = new URL('/predict', ML_SERVICE_URL);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: ML_TIMEOUT_MS
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            mlScore: parsed.mlScore,
            mlModelVersion: parsed.mlModelVersion
          });
        } catch {
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { getMLScore };