console.log('Starting server...');

const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

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

app.use(limiter);

// Health check stays public (no API key needed)
app.get('/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Apply API key auth to all other /v1 routes
app.use('/v1', authApiKey);

// Routes
const ingestRouter = require('./routes/ingest');
app.use('/v1', ingestRouter);
const assessRouter = require('./routes/assess');
app.use('/v1', assessRouter);
const jobsRouter = require('./routes/jobs');
app.use('/v1', jobsRouter);

// Health check
app.get('/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});