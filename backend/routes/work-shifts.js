const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ── GET /api/work-shifts — list all work shifts ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT ws.*, u.email as created_by_email
      FROM work_shifts ws
      LEFT JOIN users u ON u.id = ws.created_by
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` WHERE ws.is_active = $1`;
    }

    query += ' ORDER BY ws.shift_name ASC';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('List work shifts error:', err);
    res.status(500).json({ error: 'Failed to fetch work shifts' });
  }
});

// ── GET /api/work-shifts/team — employees assignable by current user ─────────
// HR/super_admin see all; everyone else sees their recursive subordinates.
router.get('/team', async (req, res) => {
  try {
    const role = req.user.role;
    let query, params = [];

    if (['super_admin', 'hr_admin'].includes(role)) {
      query = `
        SELECT e.id, e.first_name, e.last_name, e.employee_id as emp_code,
          e.shift_id, e.avatar_url, e.status,
          d.name as department_name, p.title as position_title,
          ws.shift_name, ws.start_time as shift_start_time, ws.end_time as shift_end_time, ws.timezone as shift_timezone
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        LEFT JOIN work_shifts ws ON ws.id = e.shift_id
        WHERE e.status = 'active'
        ORDER BY e.first_name, e.last_name
      `;
    } else {
      // Recursive: all subordinates under the current user
      query = `
        WITH RECURSIVE subordinates AS (
          SELECT id FROM employees WHERE manager_id = $1 AND status = 'active'
          UNION ALL
          SELECT e.id FROM employees e INNER JOIN subordinates s ON e.manager_id = s.id WHERE e.status = 'active'
        )
        SELECT e.id, e.first_name, e.last_name, e.employee_id as emp_code,
          e.shift_id, e.avatar_url, e.status,
          d.name as department_name, p.title as position_title,
          ws.shift_name, ws.start_time as shift_start_time, ws.end_time as shift_end_time, ws.timezone as shift_timezone
        FROM employees e
        INNER JOIN subordinates sub ON sub.id = e.id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        LEFT JOIN work_shifts ws ON ws.id = e.shift_id
        ORDER BY e.first_name, e.last_name
      `;
      params = [req.user.employee_id];
    }

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get team for shift assignment error:', err);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// ── GET /api/work-shifts/:id — get single shift ─────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ws.*, u.email as created_by_email
       FROM work_shifts ws
       LEFT JOIN users u ON u.id = ws.created_by
       WHERE ws.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work shift not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get work shift error:', err);
    res.status(500).json({ error: 'Failed to fetch work shift' });
  }
});

// ── POST /api/work-shifts — create a new shift (HR / Super Admin only) ──────
router.post('/', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { shift_name, start_time, end_time, timezone, description, is_active } = req.body;

    if (!shift_name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Shift name, start time, and end time are required' });
    }

    // Check duplicate name
    const dup = await db.query(
      'SELECT id FROM work_shifts WHERE LOWER(shift_name) = LOWER($1)',
      [shift_name.trim()]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'A shift with this name already exists' });
    }

    const result = await db.query(
      `INSERT INTO work_shifts (shift_name, start_time, end_time, timezone, description, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        shift_name.trim(),
        start_time,
        end_time,
        timezone || 'UTC',
        description || null,
        is_active !== false,
        req.user.id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create work shift error:', err);
    res.status(500).json({ error: 'Failed to create work shift' });
  }
});

// ── PUT /api/work-shifts/:id — update a shift (HR / Super Admin only) ───────
router.put('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { shift_name, start_time, end_time, timezone, description, is_active } = req.body;

    if (!shift_name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Shift name, start time, and end time are required' });
    }

    // Check duplicate name (excluding self)
    const dup = await db.query(
      'SELECT id FROM work_shifts WHERE LOWER(shift_name) = LOWER($1) AND id != $2',
      [shift_name.trim(), req.params.id]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'A shift with this name already exists' });
    }

    const result = await db.query(
      `UPDATE work_shifts
       SET shift_name = $1, start_time = $2, end_time = $3, timezone = $4,
           description = $5, is_active = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        shift_name.trim(),
        start_time,
        end_time,
        timezone || 'UTC',
        description || null,
        is_active !== false,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work shift not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update work shift error:', err);
    res.status(500).json({ error: 'Failed to update work shift' });
  }
});

// ── DELETE /api/work-shifts/:id — delete a shift (HR / Super Admin only) ────
router.delete('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM work_shifts WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Work shift not found' });
    }
    res.json({ message: 'Work shift deleted successfully' });
  } catch (err) {
    console.error('Delete work shift error:', err);
    res.status(500).json({ error: 'Failed to delete work shift' });
  }
});

// ── PATCH /api/work-shifts/assign/:employeeId — assign shift to employee ────
// Allowed for: super_admin, hr_admin, manager (own reports only)
router.patch('/assign/:employeeId', async (req, res) => {
  try {
    const { shift_id } = req.body; // null to clear
    const { employeeId } = req.params;
    const role = req.user.role;

    // Authorization: HR/super_admin can assign anyone; others only within their hierarchy
    if (!['super_admin', 'hr_admin'].includes(role)) {
      const hierarchyCheck = await db.query(`
        WITH RECURSIVE subordinates AS (
          SELECT id FROM employees WHERE manager_id = $1
          UNION ALL
          SELECT e.id FROM employees e INNER JOIN subordinates s ON e.manager_id = s.id
        )
        SELECT id FROM subordinates WHERE id = $2
      `, [req.user.employee_id, employeeId]);
      if (hierarchyCheck.rows.length === 0) {
        return res.status(403).json({ error: 'You can only assign shifts to employees in your hierarchy' });
      }
    }

    // Validate shift exists and is active (if not clearing)
    if (shift_id) {
      const shiftCheck = await db.query(
        'SELECT id FROM work_shifts WHERE id = $1 AND is_active = true',
        [shift_id]
      );
      if (shiftCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or inactive shift' });
      }
    }

    const result = await db.query(
      `UPDATE employees SET shift_id = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, first_name, last_name, shift_id`,
      [shift_id || null, employeeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Return with shift details
    const emp = result.rows[0];
    if (emp.shift_id) {
      const shift = await db.query('SELECT shift_name, start_time, end_time, timezone FROM work_shifts WHERE id = $1', [emp.shift_id]);
      emp.shift = shift.rows[0] || null;
    } else {
      emp.shift = null;
    }

    res.json(emp);
  } catch (err) {
    console.error('Assign shift error:', err);
    res.status(500).json({ error: 'Failed to assign shift' });
  }
});

module.exports = router;
