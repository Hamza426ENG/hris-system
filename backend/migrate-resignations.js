const db = require('./db');

async function migrateResignations() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS resignations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        resignation_date DATE NOT NULL DEFAULT CURRENT_DATE,
        last_working_day DATE,
        notice_days INTEGER DEFAULT 30,
        days_serving INTEGER,
        days_skipping INTEGER,
        reason TEXT,
        status VARCHAR(30) DEFAULT 'pending',
        supervisor_id UUID REFERENCES employees(id),
        supervisor_comment TEXT,
        supervisor_reviewed_at TIMESTAMPTZ,
        hr_comment TEXT,
        hr_reviewed_by UUID REFERENCES employees(id),
        hr_reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Add new columns to existing table if upgrading
    await db.query(`ALTER TABLE resignations ADD COLUMN IF NOT EXISTS notice_days INTEGER DEFAULT 30`);
    await db.query(`ALTER TABLE resignations ADD COLUMN IF NOT EXISTS days_serving INTEGER`);
    await db.query(`ALTER TABLE resignations ADD COLUMN IF NOT EXISTS days_skipping INTEGER`);
    console.log('Resignations migration completed.');
  } catch (err) {
    console.error('Resignations migration error:', err.message);
  }
}

module.exports = migrateResignations;
