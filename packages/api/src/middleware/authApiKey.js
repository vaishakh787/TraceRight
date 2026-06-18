/**
 * API Key Authentication Middleware
 * Checks for X-API-Key header and validates against allowed keys from .env
 */

function authApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];

  if (!providedKey) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Missing X-API-Key header'
    });
  }

  // API_KEYS in .env is comma-separated, e.g. "dev-key-12345,admin-key-67890"
  const allowedKeys = (process.env.API_KEYS || '').split(',').map(k => k.trim());

  if (!allowedKeys.includes(providedKey)) {
    return res.status(401).json({
      status: 'error',
      code: 'UNAUTHORIZED',
      message: 'Invalid API key'
    });
  }

  next();
}

module.exports = authApiKey;