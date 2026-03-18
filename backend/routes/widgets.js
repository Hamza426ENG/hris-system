const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const WIDGET_DEFINITIONS = [
  { key: 'profile_summary', label: 'Profile Summary', description: 'Employee profile card with personal details' },
  { key: 'attendance',      label: 'Attendance',       description: 'Daily check-in/check-out and attendance history' },
  { key: 'leave_summary',   label: 'Leave Summary',    description: 'Leave balances and recent leave requests' },
  { key: 'team_members',    label: 'Team Members',     description: 'Co-workers and direct reports' },
  { key: 'org_structure',   label: 'Org Structure',    description: 'Manager, supervisor and department head' },
  { key: 'announcements',   label: 'Announcements',    description: 'Company announcements' },
  { key: 'payroll_summary', label: 'Payroll Summary',  description: 'Salary and payroll information' },
  { key: 'headcount_chart', label: 'Headcount Chart',  description: 'Department headcount bar chart (HR view)' },
  { key: 'recent_activity', label: 'Recent Activity',  description: 'Recent hires, leaves, and HR events' },
];

const ROLES = ['employee', 'team_lead', 'hr_admin', 'super_admin'];

// Ensure widget defaults exist in DB
async function ensureDefaults() {
  const defaults = {
    profile_summary:  { employee: true,  team_lead: true,  hr_admin: true,  super_admin: true  },
    attendance:       { employee: true,  team_lead: true,  hr_admin: true,  super_admin: true  },
    leave_summary:    { employee: true,  team_lead: true,  hr_admin: true,  super_admin: true  },
    team_members:     { employee: true,  team_lead: true,  hr_admin: true,  super_admin: true  },
    org_structure:    { employee: true,  team_lead: true,  hr_admin: true,  super_admin: true  },
    announcements:    { employee: true,  team_lead: true,  hr_admin: true,  super_admin: true  },
    payroll_summary:  { employee: false, team_lead: true,  hr_admin: true,  super_admin: true  },
    headcount_chart:  { employee: false, team_lead: false, hr_admin: true,  super_admin: true  },
    recent_activity:  { employee: false, team_lead: false, hr_admin: true,  super_admin: true  },
  };
  const values = [];
  for (const [key, roles] of Object.entries(defaults)) {
    for (const [role, visible] of Object.entries(roles)) {
      values.push(`('${key}', '${role}', ${visible})`);
    }
  }
  await db.query(`
    INSERT INTO widget_settings (widget_key, role, is_visible)
    VALUES ${values.join(',')}
    ON CONFLICT (widget_key, role) DO NOTHING
  `);
}

// GET /api/widgets — all settings (HR/admin) or just current user's visible set
router.get('/', async (req, res) => {
  try {
    await ensureDefaults();
    const result = await db.query('SELECT widget_key, role, is_visible FROM widget_settings ORDER BY widget_key, role');
    const role = req.user.role;

    if (['super_admin', 'hr_admin'].includes(role)) {
      // Return full matrix for admin panel
      const matrix = {};
      for (const { widget_key, role: r, is_visible } of result.rows) {
        if (!matrix[widget_key]) matrix[widget_key] = {};
        matrix[widget_key][r] = is_visible;
      }
      return res.json({ definitions: WIDGET_DEFINITIONS, matrix, roles: ROLES });
    }

    // Return just the visible widgets for this role
    const visible = result.rows
      .filter(r => r.role === role && r.is_visible)
      .map(r => r.widget_key);
    res.json({ visible });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/widgets — update settings (hr_admin + super_admin only)
router.put('/', async (req, res) => {
  try {
    const { role: reqRole } = req.user;
    if (!['super_admin', 'hr_admin'].includes(reqRole)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { changes } = req.body; // [{ widget_key, role, is_visible }]
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: 'changes array required' });
    }

    for (const { widget_key, role, is_visible } of changes) {
      await db.query(
        `INSERT INTO widget_settings (widget_key, role, is_visible)
         VALUES ($1, $2, $3)
         ON CONFLICT (widget_key, role) DO UPDATE SET is_visible = $3, updated_at = NOW()`,
        [widget_key, role, is_visible]
      );
    }

    res.json({ message: 'Widget settings updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
