const { Pool } = require('pg');

// Prefer DATABASE_URL (set in .env or hosting platform), fall back to individual vars
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
  : {
      user:     process.env.DB_USER     || 'postgres',
      host:     process.env.DB_HOST     || 'localhost',
      database: process.env.DB_NAME     || 'hris_db',
      port:     parseInt(process.env.DB_PORT || '5432'),
      password: process.env.DB_PASSWORD || 'postgres',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

// Log initial connection
pool.query('SELECT NOW()').then(() => {
  console.log('PostgreSQL connected successfully');
}).catch(err => {
  console.error('PostgreSQL connection failed:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
