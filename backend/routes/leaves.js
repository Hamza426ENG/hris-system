const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/leaves - list
router.get('/', async (req, res) => {
  try {
    const { status, employee_id, leave_type_id, year } = req.query;
    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (status) { where.push(`lr.status = $${i++}`); params.push(status); }
    if (employee_id) { where.push(`lr.employee_id = $${i++}`); params.push(employee_id); }
    if (leave_type_id) { where.push(`lr.leave_type_id = $${i++}`); params.push(leave_type_id); }
    if (year) { where.push(`EXTRACT(YEAR FROM lr.start_date) = $${i++}`); params.push(year); }

    // Role-based filtering
    const role = req.user.role;
    if (role === 'team_lead' || role === 'manager') {
      where.push(`(e.manager_id = $${i} OR lr.employee_id = $${i})`);
      params.push(req.user.employee_id);
      i++;
    } else if (role === 'employee') {
      where.push(`lr.employee_id = $${i++}`);
      params.push(req.user.employee_id);
    }

    const result = await db.query(`
      SELECT lr.*,
        lt.name as leave_type_name, lt.color, lt.is_paid,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name,
        e.employee_id as emp_code, e.avatar_url,
        d.name as department_name,
        CONCAT(r.first_name, ' ', r.last_name) as reviewer_name
      FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN employees r ON r.id = lr.reviewed_by
      WHERE ${where.join(' AND ')}
      ORDER BY lr.created_at DESC
    `, params);
    res.set('Cache-Control', 'private, max-age=20');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaves/types
router.get('/types', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM leave_types WHERE is_active = TRUE ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaves/balances/:employee_id
router.get('/balances/:employee_id', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const result = await db.query(`
      SELECT lb.*, lt.name as leave_type_name, lt.color, lt.code
      FROM leave_balances lb
      JOIN leave_types lt ON lt.id = lb.leave_type_id
      WHERE lb.employee_id = $1 AND lb.year = $2
      ORDER BY lt.name
    `, [req.params.employee_id, year]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leaves/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT lr.*,
        lt.name as leave_type_name, lt.color, lt.is_paid, lt.requires_document,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name,
        e.employee_id as emp_code, e.avatar_url, e.work_email,
        d.name as department_name,
        p.title as position_title,
        CONCAT(r.first_name, ' ', r.last_name) as reviewer_name
      FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN employees r ON r.id = lr.reviewed_by
      WHERE lr.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/leaves
router.post('/', async (req, res) => {
  try {
    const { employee_id, leave_type_id, start_date, end_date, reason, half_day, half_day_period } = req.body;

    // Calculate working days
    const start = new Date(start_date);
    const end = new Date(end_date);
    let days = 0;
    let cur = new Date(start);
    while (cur <= end) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) days++;
      cur.setDate(cur.getDate() + 1);
    }
    if (half_day) days = 0.5;

    // Check balance — reject if employee has insufficient available days
    const year = start.getFullYear();
    const balance = await db.query(
      'SELECT * FROM leave_balances WHERE employee_id = $1 AND leave_type_id = $2 AND year = $3',
      [employee_id, leave_type_id, year]
    );

    if (balance.rows.length > 0) {
      const avail = parseFloat(balance.rows[0].available_days) || 0;
      if (avail < days) {
        return res.status(400).json({
          error: `Insufficient leave balance. Available: ${avail} day(s), requested: ${days} day(s).`,
        });
      }
    }

    const result = await db.query(`
      INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, half_day, half_day_period, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *
    `, [employee_id, leave_type_id, start_date, end_date, days, reason, half_day || false, half_day_period]);

    // Update pending days
    if (balance.rows.length > 0) {
      await db.query(
        'UPDATE leave_balances SET pending_days = pending_days + $1 WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4',
        [days, employee_id, leave_type_id, year]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/leaves/:id/approve
router.put('/:id/approve', async (req, res) => {
  try {
    const { review_comments } = req.body;
    const leave = await db.query('SELECT * FROM leave_requests WHERE id = $1', [req.params.id]);
    if (leave.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const lr = leave.rows[0];

    if (lr.status !== 'pending') return res.status(400).json({ error: 'Leave is not pending' });

    // Team lead / manager can only approve leaves of their team members or own leaves
    if (req.user.role === 'team_lead' || req.user.role === 'manager') {
      const empCheck = await db.query(
        'SELECT id FROM employees WHERE id = $1 AND (manager_id = $2 OR id = $2)',
        [lr.employee_id, req.user.employee_id]
      );
      if (empCheck.rows.length === 0) {
        return res.status(403).json({ error: 'You can only approve leaves for your team members' });
      }
    }

    // Find reviewer employee
    const reviewer = await db.query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
    const reviewerId = reviewer.rows.length > 0 ? reviewer.rows[0].id : null;

    const result = await db.query(
      "UPDATE leave_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_comments=$2 WHERE id=$3 RETURNING *",
      [reviewerId, review_comments, req.params.id]
    );

    // Update balance: move pending to used
    const year = new Date(lr.start_date).getFullYear();
    await db.query(
      'UPDATE leave_balances SET used_days = used_days + $1, pending_days = pending_days - $1 WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4',
      [lr.total_days, lr.employee_id, lr.leave_type_id, year]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/leaves/:id/reject
router.put('/:id/reject', async (req, res) => {
  try {
    const { review_comments } = req.body;
    const leave = await db.query('SELECT * FROM leave_requests WHERE id = $1', [req.params.id]);
    if (leave.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const lr = leave.rows[0];

    if (lr.status !== 'pending') return res.status(400).json({ error: 'Leave is not pending' });

    // Team lead / manager can only reject leaves of their team members or own leaves
    if (req.user.role === 'team_lead' || req.user.role === 'manager') {
      const empCheck = await db.query(
        'SELECT id FROM employees WHERE id = $1 AND (manager_id = $2 OR id = $2)',
        [lr.employee_id, req.user.employee_id]
      );
      if (empCheck.rows.length === 0) {
        return res.status(403).json({ error: 'You can only reject leaves for your team members' });
      }
    }

    const reviewer = await db.query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
    const reviewerId = reviewer.rows.length > 0 ? reviewer.rows[0].id : null;

    const result = await db.query(
      "UPDATE leave_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_comments=$2 WHERE id=$3 RETURNING *",
      [reviewerId, review_comments, req.params.id]
    );

    // Remove from pending
    const year = new Date(lr.start_date).getFullYear();
    await db.query(
      'UPDATE leave_balances SET pending_days = pending_days - $1 WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4',
      [lr.total_days, lr.employee_id, lr.leave_type_id, year]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/leaves/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  try {
    const leave = await db.query('SELECT * FROM leave_requests WHERE id = $1', [req.params.id]);
    if (leave.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const lr = leave.rows[0];

    const result = await db.query(
      "UPDATE leave_requests SET status='cancelled' WHERE id=$1 RETURNING *",
      [req.params.id]
    );

    if (lr.status === 'pending') {
      const year = new Date(lr.start_date).getFullYear();
      await db.query(
        'UPDATE leave_balances SET pending_days = pending_days - $1 WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4',
        [lr.total_days, lr.employee_id, lr.leave_type_id, year]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave type CRUD (admin only)
router.post('/types', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { name, code, description, days_allowed, carry_forward, max_carry_forward_days, is_paid, requires_document, notice_days, color } = req.body;
    const result = await db.query(
      'INSERT INTO leave_types (name, code, description, days_allowed, carry_forward, max_carry_forward_days, is_paid, requires_document, notice_days, color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [name, code, description, days_allowed, carry_forward || false, max_carry_forward_days || 0, is_paid !== false, requires_document || false, notice_days || 0, color || '#3B82F6']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/types/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { name, description, days_allowed, carry_forward, max_carry_forward_days, is_paid, color } = req.body;
    const result = await db.query(
      'UPDATE leave_types SET name=$1, description=$2, days_allowed=$3, carry_forward=$4, max_carry_forward_days=$5, is_paid=$6, color=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
      [name, description, days_allowed, carry_forward, max_carry_forward_days, is_paid, color, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
