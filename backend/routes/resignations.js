const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const SELECT_QUERY = `
  SELECT r.*,
    CONCAT(e.first_name, ' ', e.last_name) as employee_name,
    e.employee_id as emp_code, e.avatar_url, e.work_email,
    d.name as department_name, p.title as position_title,
    CONCAT(s.first_name, ' ', s.last_name) as supervisor_name,
    s.avatar_url as supervisor_avatar,
    CONCAT(h.first_name, ' ', h.last_name) as hr_reviewer_name
  FROM resignations r
  JOIN employees e ON e.id = r.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN positions p ON p.id = e.position_id
  LEFT JOIN employees s ON s.id = r.supervisor_id
  LEFT JOIN employees h ON h.id = r.hr_reviewed_by
`;

// GET /api/resignations
router.get('/', async (req, res) => {
  try {
    const role = req.user.role;
    const empId = req.user.employee_id;

    let where = 'WHERE 1=1';
    let params = [];

    if (['super_admin', 'hr_admin'].includes(role)) {
      // HR sees all
    } else if (role === 'team_lead') {
      if (!empId) return res.json([]);
      where = 'WHERE (r.supervisor_id = $1 OR r.employee_id = $1)';
      params = [empId];
    } else {
      if (!empId) return res.json([]);
      where = 'WHERE r.employee_id = $1';
      params = [empId];
    }

    const result = await db.query(`${SELECT_QUERY} ${where} ORDER BY r.created_at DESC`, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resignations/active — for widget (pending + supervisor_approved)
router.get('/active', async (req, res) => {
  try {
    const role = req.user.role;
    const empId = req.user.employee_id;

    let where = `WHERE r.status IN ('pending','supervisor_approved')`;
    let params = [];

    if (['super_admin', 'hr_admin'].includes(role)) {
      // all active
    } else if (role === 'team_lead') {
      if (!empId) return res.json([]);
      where += ` AND (r.supervisor_id = $1 OR r.employee_id = $1)`;
      params = [empId];
    } else {
      if (!empId) return res.json([]);
      where += ` AND r.employee_id = $1`;
      params = [empId];
    }

    const result = await db.query(`${SELECT_QUERY} ${where} ORDER BY r.created_at DESC LIMIT 10`, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/resignations — submit
router.post('/', async (req, res) => {
  const empId = req.user.employee_id;
  if (!empId) return res.status(400).json({ error: 'No employee record linked.' });

  try {
    const { resignation_date, last_working_day, reason } = req.body;

    // Check for existing active resignation
    const existing = await db.query(
      `SELECT id FROM resignations WHERE employee_id = $1 AND status IN ('pending','supervisor_approved')`,
      [empId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You already have an active resignation pending review.' });
    }

    // Auto-set supervisor from manager_id
    const emp = await db.query('SELECT manager_id FROM employees WHERE id = $1', [empId]);
    const supervisorId = emp.rows[0]?.manager_id || null;

    // Calculate notice period stats
    const NOTICE_DAYS = 30;
    const resignDate = resignation_date ? new Date(resignation_date) : new Date();
    const requiredLWD = new Date(resignDate);
    requiredLWD.setDate(requiredLWD.getDate() + NOTICE_DAYS);

    let daysServing = NOTICE_DAYS;
    let daysSkipping = 0;
    if (last_working_day) {
      const lwd = new Date(last_working_day);
      const diff = Math.round((lwd - resignDate) / (1000 * 60 * 60 * 24));
      daysServing = Math.min(diff, NOTICE_DAYS);
      daysSkipping = Math.max(0, NOTICE_DAYS - daysServing);
    }

    const result = await db.query(`
      INSERT INTO resignations (employee_id, resignation_date, last_working_day, reason, supervisor_id, notice_days, days_serving, days_skipping)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [empId, resignDate, last_working_day || requiredLWD, reason || null, supervisorId, NOTICE_DAYS, daysServing, daysSkipping]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/resignations/:id/supervisor-review — supervisor accept/reject
router.put('/:id/supervisor-review', async (req, res) => {
  const { action, comment } = req.body;
  const empId = req.user.employee_id;
  if (!empId) return res.status(400).json({ error: 'No employee record linked.' });

  try {
    // Must be the assigned supervisor and resignation must be pending
    const check = await db.query(
      `SELECT * FROM resignations WHERE id = $1 AND supervisor_id = $2 AND status = 'pending'`,
      [req.params.id, empId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized or resignation not pending.' });
    }

    const status = action === 'approve' ? 'supervisor_approved' : 'supervisor_rejected';
    const result = await db.query(`
      UPDATE resignations SET
        status = $1, supervisor_comment = $2,
        supervisor_reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [status, comment || null, req.params.id]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/resignations/:id/hr-review — HR final decision
router.put('/:id/hr-review', authorize('super_admin', 'hr_admin'), async (req, res) => {
  const { action, comment } = req.body;
  const empId = req.user.employee_id;

  try {
    const status = action === 'approve' ? 'hr_approved' : 'hr_rejected';

    const result = await db.query(`
      UPDATE resignations SET
        status = $1, hr_comment = $2, hr_reviewed_by = $3,
        hr_reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [status, comment || null, empId || null, req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    // On HR approval, mark employee as terminated on last working day
    if (status === 'hr_approved') {
      const r = result.rows[0];
      await db.query(
        `UPDATE employees SET status = 'terminated', termination_date = $1,
         termination_reason = 'Voluntary Resignation', updated_at = NOW() WHERE id = $2`,
        [r.last_working_day || new Date(), r.employee_id]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/resignations/:id/withdraw — employee withdraws
router.put('/:id/withdraw', async (req, res) => {
  const empId = req.user.employee_id;
  if (!empId) return res.status(400).json({ error: 'No employee record linked.' });

  try {
    const result = await db.query(`
      UPDATE resignations SET status = 'withdrawn', updated_at = NOW()
      WHERE id = $1 AND employee_id = $2 AND status IN ('pending','supervisor_approved')
      RETURNING *
    `, [req.params.id, empId]);

    if (result.rows.length === 0) return res.status(403).json({ error: 'Cannot withdraw this resignation.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
