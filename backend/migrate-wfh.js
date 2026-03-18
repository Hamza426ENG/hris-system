const db = require('./db');

async function migrateWFH() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS wfh_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        supervisor_id UUID REFERENCES employees(id),
        date DATE NOT NULL,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        supervisor_comment TEXT,
        supervisor_reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('WFH migration completed.');
  } catch (err) {
    console.error('WFH migration error:', err.message);
  }
}

module.exports = migrateWFH;
