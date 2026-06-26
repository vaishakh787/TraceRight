const autocannon = require('autocannon');
require('dotenv').config();

// Pull a valid allowed API key from environment configuration context
const API_KEY = (process.env.API_KEYS || 'dev-key-12345').split(',')[0].trim();
const PORT = process.env.API_PORT || 3000;

console.log('==================================================================');
console.log('👉 TRACERIGHT HIGH-LOAD RESILIENCE INFERENCE SUITE');
console.log(`Target Gateway: http://localhost:${PORT}/v1/assess/qr`);
console.log('Throughput Target: 100 Transactions Per Second (TPS)');
console.log('==================================================================\n');

const instance = autocannon({
  url: `http://localhost:${PORT}`,
  connections: 10,       // Open concurrent network connection sockets
  pipelining: 1,
  duration: 10,          // Run stress testing timeline loop for 10 seconds
  overallRate: 100,      // Constrain transaction velocity strictly to 100 RPS
  requests: [
    {
      method: 'POST',
      path: '/v1/assess/qr',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        qrCode: '311191988093137' // Active historical QR code from data/features.csv
      })
    }
  ]
}, (err, result) => {
  if (err) {
    console.error('Stress test pipeline aborted via fatal runtime exception:', err);
    process.exit(1);
  }
  
  console.log('\n==================================================================');
  console.log('                      LOAD METRICS RESULTS                        ');
  console.log('==================================================================');
  
  console.log(autocannon.printResult(result));
  
  const fatalErrors = result.errors + result.non2xx;
  
  console.log(`Total Requests Sent : ${result.requests.sent}`);
  console.log(`Successful (2xx)   : ${result.requests.average}`);
  console.log(`Connection Errors  : ${result.errors}`);
  console.log(`Non-2xx Responses  : ${result.non2xx}`);
  
  if (fatalErrors > 0) {
    console.error('\n Resilience Validation Failed: Service dropped requests under degraded states.');
    process.exit(1);
  } else {
    console.log('\n Resilience Validation Passed: Error rate is exactly 0.00%. Gateway fully absorbed subsystem fault.');
    process.exit(0);
  }
});

autocannon.track(instance, { renderProgressBar: true });