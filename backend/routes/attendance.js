const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/attendance/today — current user's today record
router.get('/today', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.json({ record: null });

    const today = new Date().toISOString().split('T')[0];
    const result = await db.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
      [empId, today]
    );
    res.json({ record: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/checkin
router.post('/checkin', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.status(400).json({ error: 'No employee record linked to this account.' });

    const today = new Date().toISOString().split('T')[0];
    const existing = await db.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2', [empId, today]
    );

    if (existing.rows.length > 0 && existing.rows[0].check_in) {
      return res.status(400).json({ error: 'Already checked in today.' });
    }

    let record;
    if (existing.rows.length > 0) {
      record = await db.query(
        'UPDATE attendance SET check_in = NOW(), status = $1 WHERE employee_id = $2 AND date = $3 RETURNING *',
        ['present', empId, today]
      );
    } else {
      record = await db.query(
        'INSERT INTO attendance (employee_id, date, check_in, status) VALUES ($1, $2, NOW(), $3) RETURNING *',
        [empId, today, 'present']
      );
    }
    res.json({ record: record.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/checkout
router.post('/checkout', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.status(400).json({ error: 'No employee record linked.' });

    const today = new Date().toISOString().split('T')[0];
    const existing = await db.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2', [empId, today]
    );

    if (!existing.rows[0]?.check_in) {
      return res.status(400).json({ error: 'Please check in first.' });
    }
    if (existing.rows[0]?.check_out) {
      return res.status(400).json({ error: 'Already checked out today.' });
    }

    const checkIn = new Date(existing.rows[0].check_in);
    const checkOut = new Date();
    const hoursWorked = Math.round(((checkOut - checkIn) / 3600000) * 100) / 100;
    const overtime = Math.max(0, Math.round((hoursWorked - 8) * 100) / 100);

    const record = await db.query(
      `UPDATE attendance SET check_out = NOW(), hours_worked = $1, overtime_hours = $2
       WHERE employee_id = $3 AND date = $4 RETURNING *`,
      [hoursWorked, overtime, empId, today]
    );
    res.json({ record: record.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/history?days=30 — employee's own history or HR viewing by ?employee_id=
router.get('/history', async (req, res) => {
  try {
    const { days = 30, employee_id } = req.query;
    const role = req.user.role;
    const empId = ['super_admin', 'hr_admin', 'team_lead'].includes(role) && employee_id
      ? employee_id
      : req.user.employee_id;

    if (!empId) return res.json({ records: [] });

    const result = await db.query(
      `SELECT * FROM attendance WHERE employee_id = $1 AND date >= NOW() - INTERVAL '${parseInt(days)} days'
       ORDER BY date DESC`,
      [empId]
    );
    res.json({ records: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
