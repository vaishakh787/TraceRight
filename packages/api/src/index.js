console.log('Starting server...');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();

app.use(cors());
app.use(express.json());

const rateLimit = require('express-rate-limit');
const authApiKey = require('./middleware/authApiKey');

// Rate limiting: max 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later'
  }
});

// Only apply rate limiting in production to avoid blocking high-throughput stress tests in development
if (process.env.NODE_ENV === 'production') {
  app.use(limiter);
}

// [Day 19 Feature]: Serve static frontend dashboard mock interface view
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check stays public (no API key needed)
app.get('/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

// [Day 19 Feature]: Extract and parse the absolute latest programmatic JSON report context 
app.get('/v1/reports/latest', (req, res) => {
  const reportsDir = path.resolve(__dirname, '../../../reports');
  try {
    if (!fs.existsSync(reportsDir)) {
      return res.status(404).json({ status: 'error', message: 'Reports directory registry tier missing.' });
    }
    
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('daily-summary-') && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a)); // Sort dynamically descending to ensure latest file is selected first

    if (files.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No reporting telemetry metrics logs found.' });
    }

    const latestReportPath = path.join(reportsDir, files[0]);
    const fileContent = fs.readFileSync(latestReportPath, 'utf-8');
    return res.status(200).send(JSON.parse(fileContent));
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Internal exception reading performance metrics summaries.' });
  }
});

// Apply API key auth to all remaining /v1 routes
app.use('/v1', authApiKey);

// Routes
const ingestRouter = require('./routes/ingest');
app.use('/v1', ingestRouter);
const assessRouter = require('./routes/assess');
app.use('/v1', assessRouter);
const jobsRouter = require('./routes/jobs');
app.use('/v1', jobsRouter);
const dashboardRouter = require('./routes/dashboard');
app.use('/v1', dashboardRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const { startAlertWorker } = require('./services/alertWorker');

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

startAlertWorker();