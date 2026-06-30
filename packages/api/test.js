/**
 * Basic smoke tests for the Scan Intelligence Service API
 * Run with: node test.js (server must be running on port 3000)
 */
const http = require('http');

const API_KEY = 'dev-key-12345';
const BASE = 'localhost';
const PORT = 3000;

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${name}`);
    failed++;
  }
}

async function runTests() {
  console.log('Running smoke tests...\n');

  // Test 1: Health check
  const health = await request('GET', '/v1/health');
  check('Health check returns 200', health.status === 200);

  // Test 2: Missing API key
  const noKey = await request('POST', '/v1/assess/qr', { qrCode: '123456789012345' });
  check('Missing API key returns 401', noKey.status === 401);

  // Test 3: Valid ingest
  const validIngest = await request('POST', '/v1/ingest/scan', {
    eventId: crypto_randomUUID(),
    occurredAt: new Date().toISOString(),
    qrCode: '111122223333444',
    eventType: 'DISPATCH',
    latitude: 19.0760,
    longitude: 72.8777
  }, { 'X-API-Key': API_KEY });
  check('Valid ingest returns 201', validIngest.status === 201);

  // Test 4: Invalid QR code
  const invalidIngest = await request('POST', '/v1/ingest/scan', {
    eventId: crypto_randomUUID(),
    occurredAt: new Date().toISOString(),
    qrCode: '123',
    eventType: 'DISPATCH'
  }, { 'X-API-Key': API_KEY });
  check('Invalid QR code returns 400', invalidIngest.status === 400);

  // Test 5: Assess works with valid key
  const assess = await request('POST', '/v1/assess/qr', {
    qrCode: '111122223333444'
  }, { 'X-API-Key': API_KEY });
  check('Assess with valid key returns 200', assess.status === 200);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

function crypto_randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

runTests();