const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate() {
  try {
    // Check if tables already exist
    const check = await db.query(`
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'employees'
    `);

    if (parseInt(check.rows[0].count) > 0) {
      console.log('Database already initialized, skipping migration.');
      return;
    }

    console.log('Running database migration...');

    // Try to read init.sql from parent directory (for local dev) or same dir
    const paths = [
      path.join(__dirname, '..', 'database', 'init.sql'),
      path.join(__dirname, 'init.sql'),
    ];

    let sql = null;
    for (const p of paths) {
      if (fs.existsSync(p)) {
        sql = fs.readFileSync(p, 'utf8');
        break;
      }
    }

    if (!sql) {
      console.warn('init.sql not found, skipping migration.');
      return;
    }

    // Split and run statements (handle dollar-quoted strings)
    await db.query(sql);
    console.log('Database migration completed successfully.');
  } catch (err) {
    console.error('Migration error:', err.message);
    // Don't exit — let the app start anyway
  }
}

module.exports = migrate;
