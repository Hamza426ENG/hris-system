const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(authorize('super_admin', 'hr_admin'));

const VALID_ROLES = ['super_admin', 'hr_admin', 'hr_manager', 'manager', 'team_lead', 'employee'];
// Roles that hr_admin is allowed to assign/manage (cannot touch super_admin or hr_admin or hr_manager)
const HR_ALLOWED_ROLES = ['manager', 'team_lead', 'employee'];

// GET /api/admin/users - list all users with employee info, paginated
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (page - 1) * limit;

    const params = [limit, offset];
    let whereClause = '';
    let countParams = [];
    let countWhere = '';

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE u.email ILIKE $3 OR e.first_name ILIKE $3 OR e.last_name ILIKE $3`;
      countParams = [`%${search}%`];
      countWhere = `WHERE u.email ILIKE $1 OR e.first_name ILIKE $1 OR e.last_name ILIKE $1`;
    }

    const result = await db.query(`
      SELECT u.id, u.email, u.role, u.is_active, u.created_at, u.last_login,
        e.id as employee_id, e.first_name, e.last_name, e.employee_id as emp_code,
        e.avatar_url, d.name as department_name, p.title as position_title
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      ${whereClause}
      ORDER BY e.first_name, e.last_name
      LIMIT $1 OFFSET $2
    `, params);

    const countResult = await db.query(
      `SELECT COUNT(*) FROM users u LEFT JOIN employees e ON e.user_id = u.id ${countWhere}`,
      countParams
    );

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

    // hr_admin cannot create super_admin or hr_admin accounts
    if (req.user.role === 'hr_admin' && !HR_ALLOWED_ROLES.includes(role)) {
      return res.status(403).json({ error: 'You do not have permission to create accounts with this role.' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    if (employee_id) {
      const empCheck = await db.query('SELECT user_id FROM employees WHERE id = $1', [employee_id]);
      if (empCheck.rows[0]?.user_id) {
        return res.status(409).json({ error: 'This employee already has a user account.' });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const userRes = await db.query(
      'INSERT INTO users (email, password_hash, role, is_active) VALUES ($1, $2, $3, true) RETURNING id, email, role, is_active, created_at',
      [email.toLowerCase(), hash, role]
    );
    const newUser = userRes.rows[0];

    if (employee_id) {
      await db.query('UPDATE employees SET user_id = $1 WHERE id = $2', [newUser.id, employee_id]);
    }

    res.status(201).json({ message: 'User created successfully.', user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// PUT /api/admin/users/:id/password - reset a user's password
router.put('/users/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const target = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.rows[0].role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super admin can reset super admin passwords.' });
    }
    if (req.user.role === 'hr_admin' && !HR_ALLOWED_ROLES.includes(target.rows[0].role)) {
      return res.status(403).json({ error: 'You do not have permission to manage this user.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    // Revoke all existing sessions so the user must log in with the new password
    await db.query('UPDATE user_sessions SET is_active = false, logout_at = NOW() WHERE user_id = $1 AND is_active = true', [req.params.id]);

    res.json({ message: 'Password updated successfully.' });
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
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const targetUser = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (targetUser.rows[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin role cannot be changed' });
    }

    // hr_admin cannot assign or manage super_admin/hr_admin roles
    if (req.user.role === 'hr_admin') {
      if (!HR_ALLOWED_ROLES.includes(role) || !HR_ALLOWED_ROLES.includes(targetUser.rows[0].role)) {
        return res.status(403).json({ error: 'You do not have permission to manage this role.' });
      }
    }

    const result = await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, is_active',
      [role, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id/toggle - toggle is_active
router.put('/users/:id/toggle', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot disable your own account' });
    }

    const target = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.rows[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin accounts cannot be disabled' });
    }

    // hr_admin can only toggle users within their allowed roles
    if (req.user.role === 'hr_admin' && !HR_ALLOWED_ROLES.includes(target.rows[0].role)) {
      return res.status(403).json({ error: 'You do not have permission to manage this user.' });
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

// DELETE /api/admin/users/:id - delete a user account
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const target = await db.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.rows[0].role === 'super_admin') {
      return res.status(403).json({ error: 'Super admin accounts cannot be deleted' });
    }

    // hr_admin can only delete users within their allowed roles
    if (req.user.role === 'hr_admin' && !HR_ALLOWED_ROLES.includes(target.rows[0].role)) {
      return res.status(403).json({ error: 'You do not have permission to delete this user.' });
    }

    // Unlink from employee record before deleting
    await db.query('UPDATE employees SET user_id = NULL WHERE user_id = $1', [req.params.id]);
    // Revoke all sessions
    await db.query('UPDATE user_sessions SET is_active = false WHERE user_id = $1', [req.params.id]);
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);

    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/sessions - list active user sessions
router.get('/sessions', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT s.id, s.user_id, s.jti, s.ip_address, s.user_agent,
        s.logged_in_at, s.logout_at, s.expires_at, s.is_active,
        u.email, u.role,
        e.first_name, e.last_name, e.avatar_url
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN employees e ON e.user_id = s.user_id
      ORDER BY s.logged_in_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const countResult = await db.query('SELECT COUNT(*) FROM user_sessions');

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

// DELETE /api/admin/sessions/:id - force logout / revoke a session
router.delete('/sessions/:id', async (req, res) => {
  try {
    const session = await db.query('SELECT user_id FROM user_sessions WHERE id = $1', [req.params.id]);
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await db.query(
      'UPDATE user_sessions SET is_active = false, logout_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Session revoked successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/sessions/user/:userId - revoke all sessions for a user
router.delete('/sessions/user/:userId', async (req, res) => {
  try {
    await db.query(
      'UPDATE user_sessions SET is_active = false, logout_at = NOW() WHERE user_id = $1 AND is_active = true',
      [req.params.userId]
    );
    res.json({ message: 'All sessions revoked.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
