const db = require('./db');

async function migrateAnnouncements() {
  try {
    // Add target_roles column if missing
    await db.query(`
      ALTER TABLE announcements
        ADD COLUMN IF NOT EXISTS target_roles TEXT[]
          DEFAULT ARRAY['employee','team_lead','hr_admin','super_admin']
    `);

    // Acknowledgements table
    await db.query(`
      CREATE TABLE IF NOT EXISTS announcement_acknowledgements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        feedback TEXT,
        acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(announcement_id, user_id)
      )
    `);

    console.log('Announcements migration completed.');
  } catch (err) {
    console.error('Announcements migration error:', err.message);
  }
}

module.exports = migrateAnnouncements;
