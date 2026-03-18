const db = require('./db');

async function migrateWidgets() {
  try {
    // Create widget_settings if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS widget_settings (
        id SERIAL PRIMARY KEY,
        widget_key VARCHAR(50) NOT NULL,
        role VARCHAR(20) NOT NULL,
        is_visible BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(widget_key, role)
      )
    `);

    // Insert defaults
    const defaults = [
      ['profile_summary','employee',true],['profile_summary','team_lead',true],['profile_summary','hr_admin',true],['profile_summary','super_admin',true],
      ['attendance','employee',true],['attendance','team_lead',true],['attendance','hr_admin',true],['attendance','super_admin',true],
      ['leave_summary','employee',true],['leave_summary','team_lead',true],['leave_summary','hr_admin',true],['leave_summary','super_admin',true],
      ['team_members','employee',true],['team_members','team_lead',true],['team_members','hr_admin',true],['team_members','super_admin',true],
      ['org_structure','employee',true],['org_structure','team_lead',true],['org_structure','hr_admin',true],['org_structure','super_admin',true],
      ['announcements','employee',true],['announcements','team_lead',true],['announcements','hr_admin',true],['announcements','super_admin',true],
      ['payroll_summary','employee',false],['payroll_summary','team_lead',true],['payroll_summary','hr_admin',true],['payroll_summary','super_admin',true],
      ['headcount_chart','employee',false],['headcount_chart','team_lead',false],['headcount_chart','hr_admin',true],['headcount_chart','super_admin',true],
      ['recent_activity','employee',false],['recent_activity','team_lead',false],['recent_activity','hr_admin',true],['recent_activity','super_admin',true],
    ];

    for (const [key, role, visible] of defaults) {
      await db.query(
        `INSERT INTO widget_settings (widget_key, role, is_visible) VALUES ($1,$2,$3) ON CONFLICT (widget_key, role) DO NOTHING`,
        [key, role, visible]
      );
    }
    console.log('Widget settings migration complete.');
  } catch (err) {
    console.error('Widget migration error:', err.message);
  }
}

module.exports = migrateWidgets;
