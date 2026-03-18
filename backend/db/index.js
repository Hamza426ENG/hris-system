const { Pool } = require('pg');

const poolConfig = {
  user: 'postgres',
  host: 'localhost',
  database: 'hris_db',
  port: 5432,
  password: 'postgres', // Password for postgres user
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(poolConfig);

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('Connected to PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
