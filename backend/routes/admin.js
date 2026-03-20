const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(authorize('super_admin'));

const VALID_ROLES = ['super_admin', 'hr_admin', 'team_lead', 'employee'];

// GET /api/admin/users - list all users with employee info, paginated
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT u.id, u.email, u.role, u.is_active, u.created_at, u.last_login,
        e.id as employee_id, e.first_name, e.last_name, e.employee_id as emp_code,
        e.avatar_url, d.name as department_name, p.title as position_title
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      ORDER BY e.first_name, e.last_name
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query('SELECT COUNT(*) FROM users');

    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id/role - update user role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Valid roles: ' + VALID_ROLES.join(', ') });
    }

    // Prevent changing own role
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    // Prevent demoting any super_admin
    const targetRole = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (targetRole.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (targetRole.rows[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin role cannot be changed' });
    }

    const result = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, is_active',
      [role, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users - create a new user account
router.post('/users', async (req, res) => {
  try {
    const { email, password, role, employee_id } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' });
    }

    // Check email not already taken
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    // If linking to an employee, ensure they don't already have a user
    if (employee_id) {
      const empCheck = await db.query(
        'SELECT user_id FROM employees WHERE id = $1', [employee_id]
      );
      if (empCheck.rows[0]?.user_id) {
        return res.status(409).json({ error: 'This employee already has a user account.' });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const userRes = await db.query(
      'INSERT INTO users (email, password, role, is_active) VALUES ($1, $2, $3, true) RETURNING id, email, role, is_active, created_at',
      [email.toLowerCase(), hash, role]
    );
    const newUser = userRes.rows[0];

    // Link to employee record if provided
    if (employee_id) {
      await db.query('UPDATE employees SET user_id = $1 WHERE id = $2', [newUser.id, employee_id]);
    }

    res.status(201).json({ message: 'User created successfully.', user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// PUT /api/admin/users/:id/toggle - toggle is_active
router.put('/users/:id/toggle', async (req, res) => {
  try {
    // Prevent disabling the own account
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    // Prevent disabling any super_admin account
    const target = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.rows[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin accounts cannot be disabled' });
    }

    const result = await db.query(
      'UPDATE users SET is_active = NOT is_active WHERE id = $1 RETURNING id, email, role, is_active',
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
