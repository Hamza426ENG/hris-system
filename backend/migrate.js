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
      console.log('Database already initialized, skipping base migration.');
    } else {
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
        console.warn('init.sql not found, skipping base migration.');
      } else {
        await db.query(sql);
        console.log('Database base migration completed successfully.');
      }
    }

    // Always run additive migrations (safe with IF NOT EXISTS)
    await runAdditiveMigrations();
  } catch (err) {
    console.error('Migration error:', err.message);
    // Don't exit — let the app start anyway
  }
}

/**
 * Additive migrations — safe to run on every startup.
 * Creates new tables/indexes/views that did not exist in the original init.sql.
 * Uses IF NOT EXISTS so repeated runs are no-ops.
 */
async function runAdditiveMigrations() {
  try {
    // ── user_sessions ──────────────────────────────────────────────────────────
    // Tracks every JWT login for server-side revocation and developer visibility.
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        jti          UUID NOT NULL,
        ip_address   VARCHAR(45),
        user_agent   TEXT,
        logged_in_at TIMESTAMP DEFAULT NOW(),
        logout_at    TIMESTAMP,
        expires_at   TIMESTAMP NOT NULL,
        is_active    BOOLEAN DEFAULT TRUE,
        created_at   TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_jti ON user_sessions(jti)'
    );
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)'
    );
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_active)'
    );

    // ── Developer view: v_auth_sessions ────────────────────────────────────────
    // Query this view to see full session history for all users.
    // SELECT * FROM v_auth_sessions;
    // SELECT * FROM v_auth_sessions WHERE session_status = 'active';
    await db.query(`
      CREATE OR REPLACE VIEW v_auth_sessions AS
      SELECT
        s.id                                                          AS session_id,
        u.id                                                          AS user_id,
        u.email,
        u.role,
        COALESCE(e.first_name || ' ' || e.last_name, u.email)        AS full_name,
        s.ip_address,
        s.user_agent,
        s.logged_in_at,
        s.logout_at,
        s.expires_at,
        s.is_active,
        CASE
          WHEN s.logout_at IS NOT NULL      THEN 'logged_out'
          WHEN s.expires_at < NOW()         THEN 'expired'
          WHEN s.is_active = TRUE           THEN 'active'
          ELSE                                   'inactive'
        END                                                           AS session_status,
        ROUND(EXTRACT(EPOCH FROM (s.expires_at - NOW())) / 3600, 2)  AS hours_remaining
      FROM  user_sessions s
      JOIN  users          u ON u.id      = s.user_id
      LEFT JOIN employees  e ON e.user_id = s.user_id
      ORDER BY s.logged_in_at DESC
    `);

    console.log('Additive migrations completed.');
  } catch (err) {
    console.error('Additive migration error:', err.message);
  }
}

module.exports = migrate;
