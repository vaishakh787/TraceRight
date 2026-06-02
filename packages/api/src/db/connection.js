const sql = require('mssql');
require('dotenv').config({ path: '../../.env' }); // Points to your root .env file

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL Database instance successfully.');
    return pool;
  })
  .catch(err => {
    console.error('Database connection failed: ', err);
    process.exit(1);
  });

module.exports = {
  sql,
  poolPromise
};

// Auto-run connection test verification if executed directly via node command
if (require.main === module) {
  (async () => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query('SELECT 1 AS connectionTest');
      if (result.recordset[0].connectionTest === 1) {
        console.log('Database verification successful! (SELECT 1 returned 1)');
      }
      process.exit(0);
    } catch (err) {
      console.error('Verification query failed:', err);
      process.exit(1);
    }
  })();
}