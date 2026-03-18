const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const SELECT_QUERY = `
  SELECT w.*,
    CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
    e.employee_id AS emp_code, e.avatar_url,
    d.name AS department_name, p.title AS position_title,
    CONCAT(s.first_name, ' ', s.last_name) AS supervisor_name
  FROM wfh_requests w
  JOIN employees e ON e.id = w.employee_id
  LEFT JOIN departments d ON d.id = e.department_id
  LEFT JOIN positions p ON p.id = e.position_id
  LEFT JOIN employees s ON s.id = w.supervisor_id
`;

// GET /api/wfh/today — approved WFH for today (all roles see filtered)
router.get('/today', async (req, res) => {
  try {
    const role = req.user.role;
    const empId = req.user.employee_id;
    let where = `WHERE w.date = CURRENT_DATE AND w.status = 'approved'`;
    let params = [];

    if (!['super_admin', 'hr_admin'].includes(role)) {
      if (!empId) return res.json([]);
      where += ` AND (w.supervisor_id = $1 OR w.employee_id = $1)`;
      params = [empId];
    }

    const result = await db.query(`${SELECT_QUERY} ${where} ORDER BY e.first_name`, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wfh — role-filtered list
router.get('/', async (req, res) => {
  try {
    const role = req.user.role;
    const empId = req.user.employee_id;
    let where = 'WHERE 1=1';
    let params = [];

    if (['super_admin', 'hr_admin'].includes(role)) {
      // see all
    } else if (role === 'team_lead') {
      if (!empId) return res.json([]);
      where = 'WHERE (w.supervisor_id = $1 OR w.employee_id = $1)';
      params = [empId];
    } else {
      if (!empId) return res.json([]);
      where = 'WHERE w.employee_id = $1';
      params = [empId];
    }

    const result = await db.query(
      `${SELECT_QUERY} ${where} ORDER BY w.date DESC, w.created_at DESC LIMIT 50`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wfh — submit request
router.post('/', async (req, res) => {
  const empId = req.user.employee_id;
  if (!empId) return res.status(400).json({ error: 'No employee record linked.' });

  const { date, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'Date is required.' });

  try {
    // No duplicate active request for same date
    const existing = await db.query(
      `SELECT id FROM wfh_requests WHERE employee_id = $1 AND date = $2 AND status IN ('pending','approved')`,
      [empId, date]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You already have an active WFH request for that date.' });
    }

    // Auto-assign supervisor from manager_id
    const emp = await db.query('SELECT manager_id FROM employees WHERE id = $1', [empId]);
    const supervisorId = emp.rows[0]?.manager_id || null;

    const result = await db.query(`
      INSERT INTO wfh_requests (employee_id, supervisor_id, date, reason)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [empId, supervisorId, date, reason || null]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/wfh/:id/review — supervisor approve/reject
router.put('/:id/review', async (req, res) => {
  const empId = req.user.employee_id;
  if (!empId) return res.status(400).json({ error: 'No employee record linked.' });

  const { action, comment } = req.body;
  try {
    const check = await db.query(
      `SELECT * FROM wfh_requests WHERE id = $1 AND supervisor_id = $2 AND status = 'pending'`,
      [req.params.id, empId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized or request not pending.' });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const result = await db.query(`
      UPDATE wfh_requests SET
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

// PUT /api/wfh/:id/cancel — employee cancels pending request
router.put('/:id/cancel', async (req, res) => {
  const empId = req.user.employee_id;
  if (!empId) return res.status(400).json({ error: 'No employee record linked.' });

  try {
    const result = await db.query(`
      UPDATE wfh_requests SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND employee_id = $2 AND status = 'pending'
      RETURNING *
    `, [req.params.id, empId]);

    if (result.rows.length === 0) return res.status(403).json({ error: 'Cannot cancel this request.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
