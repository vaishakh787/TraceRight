console.log('Starting server...');

const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const app = express();

app.use(cors());
app.use(express.json());

// Routes
const ingestRouter = require('./routes/ingest');
app.use('/v1', ingestRouter);

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