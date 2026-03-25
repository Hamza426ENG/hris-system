const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ── GET /api/profile-requests — list requests ─────────────────────────────
// HR sees all; employees see only their own.
router.get('/', async (req, res) => {
  try {
    const { status, employee_id } = req.query;
    const isHR = ['super_admin', 'hr_admin'].includes(req.user.role);

    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (!isHR) {
      where.push(`pcr.employee_id = $${i++}`);
      params.push(req.user.employee_id);
    } else if (employee_id) {
      where.push(`pcr.employee_id = $${i++}`);
      params.push(employee_id);
    }

    if (status) {
      where.push(`pcr.status = $${i++}`);
      params.push(status);
    }

    const result = await db.query(`
      SELECT pcr.*,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name,
        e.employee_id as employee_code,
        e.avatar_url,
        CONCAT(r.first_name, ' ', r.last_name) as reviewer_name
      FROM profile_change_requests pcr
      JOIN employees e ON e.id = pcr.employee_id
      LEFT JOIN employees r ON r.user_id = pcr.reviewed_by
      WHERE ${where.join(' AND ')}
      ORDER BY pcr.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/profile-requests — employee submits a change request ────────
router.post('/', async (req, res) => {
  try {
    const { employee_id, changes } = req.body;

    // Employees can only request changes for themselves
    if (!['super_admin', 'hr_admin'].includes(req.user.role) && req.user.employee_id !== employee_id) {
      return res.status(403).json({ error: 'You can only request changes for your own profile' });
    }

    if (!changes || Object.keys(changes).length === 0) {
      return res.status(400).json({ error: 'No changes provided' });
    }

    const result = await db.query(`
      INSERT INTO profile_change_requests (employee_id, requested_by, changes)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [employee_id, req.user.id, JSON.stringify(changes)]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/profile-requests/:id/approve — HR approves ──────────────────
router.put('/:id/approve', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { review_notes } = req.body;

    // Fetch the request
    const reqResult = await db.query(
      'SELECT * FROM profile_change_requests WHERE id = $1 AND status = $2',
      [req.params.id, 'pending']
    );
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    const changeReq = reqResult.rows[0];
    const changes = changeReq.changes;

    // Build dynamic UPDATE for the employee record
    const fields = Object.keys(changes);
    const orNull = (v) => (v === '' || v === undefined) ? null : v;
    const setClauses = fields.map((f, idx) => `${f} = $${idx + 1}`);
    setClauses.push('updated_at = NOW()');
    const values = fields.map(f => orNull(changes[f]));
    values.push(changeReq.employee_id);

    await db.query(
      `UPDATE employees SET ${setClauses.join(', ')} WHERE id = $${fields.length + 1}`,
      values
    );

    // Mark request as approved
    const updated = await db.query(`
      UPDATE profile_change_requests
      SET status = 'approved', reviewed_by = $1, review_notes = $2, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [req.user.id, review_notes || null, req.params.id]);

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/profile-requests/:id/reject — HR rejects ───────────────────
router.put('/:id/reject', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { review_notes } = req.body;

    const result = await db.query(`
      UPDATE profile_change_requests
      SET status = 'rejected', reviewed_by = $1, review_notes = $2, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $3 AND status = 'pending' RETURNING *
    `, [req.user.id, review_notes || null, req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found or already processed' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/profile-requests/pending/count — badge count for HR ─────────
router.get('/pending/count', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query("SELECT COUNT(*) FROM profile_change_requests WHERE status = 'pending'");
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
