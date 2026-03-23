const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

// All attendance routes require authentication
router.use(authenticate);

/**
 * GET /attendance/today
 * Returns the current user's attendance record for today.
 * Returns null if no record exists yet (not checked in).
 */
router.get('/today', async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    const result = await db.query(
      `SELECT
         ar.id,
         ar.date,
         ar.check_in,
         ar.check_out,
         ar.work_hours,
         ar.status,
         ar.notes
       FROM attendance_records ar
       WHERE ar.employee_id = $1
         AND ar.date = CURRENT_DATE`,
      [employeeId]
    );

    const record = result.rows[0] || null;
    res.json({ record });
  } catch (err) {
    console.error('GET /attendance/today error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

/**
 * POST /attendance/checkin
 * Records check-in time for the current user today.
 * Idempotent: if already checked in today, returns existing record.
 */
router.post('/checkin', async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    // Upsert: create a new record or return existing if already checked in
    const result = await db.query(
      `INSERT INTO attendance_records (employee_id, date, check_in, status, updated_at)
       VALUES ($1, CURRENT_DATE, NOW(), 'present', NOW())
       ON CONFLICT (employee_id, date)
       DO UPDATE SET
         check_in  = CASE WHEN attendance_records.check_in IS NULL THEN NOW() ELSE attendance_records.check_in END,
         status    = COALESCE(attendance_records.status, 'present'),
         updated_at = NOW()
       RETURNING *`,
      [employeeId]
    );

    res.json({ record: result.rows[0] });
  } catch (err) {
    console.error('POST /attendance/checkin error:', err);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

/**
 * POST /attendance/checkout
 * Records check-out time for the current user today and computes work_hours.
 */
router.post('/checkout', async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    const result = await db.query(
      `UPDATE attendance_records
       SET
         check_out  = NOW(),
         work_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - check_in)) / 3600, 2),
         updated_at = NOW()
       WHERE employee_id = $1
         AND date        = CURRENT_DATE
         AND check_in IS NOT NULL
         AND check_out IS NULL
       RETURNING *`,
      [employeeId]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'No active check-in found for today' });
    }

    res.json({ record: result.rows[0] });
  } catch (err) {
    console.error('POST /attendance/checkout error:', err);
    res.status(500).json({ error: 'Failed to check out' });
  }
});

/**
 * GET /attendance/history?page=1&limit=30
 * Returns paginated attendance history for the current user.
 */
router.get('/history', async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(90, parseInt(req.query.limit) || 30);
    const offset = (page - 1) * limit;

    const [countRes, dataRes] = await Promise.all([
      db.query(
        'SELECT COUNT(*) FROM attendance_records WHERE employee_id = $1',
        [employeeId]
      ),
      db.query(
        `SELECT id, date, check_in, check_out, work_hours, status, notes
         FROM attendance_records
         WHERE employee_id = $1
         ORDER BY date DESC
         LIMIT $2 OFFSET $3`,
        [employeeId, limit, offset]
      ),
    ]);

    res.json({
      records: dataRes.rows,
      total:   parseInt(countRes.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /attendance/history error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

module.exports = router;
