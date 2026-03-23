const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await db.query(
      'SELECT u.*, e.id as employee_id, e.first_name, e.last_name, e.avatar_url FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE u.email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Generate a unique JWT ID for this session (enables server-side revocation)
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours

    const token = jwt.sign(
      { userId: user.id, role: user.role, jti },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Record session for developer visibility and server-side revocation
    const ipAddress = (
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
    ).split(',')[0].trim();
    const userAgent = req.headers['user-agent'] || '';

    // Best-effort session record — don't fail login if this errors
    db.query(
      'INSERT INTO user_sessions (user_id, jti, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [user.id, jti, ipAddress, userAgent, expiresAt]
    ).catch(err => console.error('Session record error:', err.message));

    res.json({
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employeeId: user.employee_id,
        firstName: user.first_name,
        lastName: user.last_name,
        avatarUrl: user.avatar_url,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout — revokes the current session in the database
// Custom middleware that validates JWT but allows revoked sessions to logout
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(200).json({ message: 'Logged out' });
    }

    const token = authHeader.split(' ')[1];

    // Try full verification first; if token is expired, still decode to get jti
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        decoded = jwt.decode(token); // decode without verification to retrieve jti
      } else {
        return res.status(200).json({ message: 'Logged out' }); // malformed token — nothing to revoke
      }
    }

    if (!decoded?.userId) {
      return res.status(200).json({ message: 'Logged out' });
    }

    // Revoke the session if jti exists (best-effort — don't fail logout on DB error)
    if (decoded.jti) {
      await db.query(
        'UPDATE user_sessions SET is_active = FALSE, logout_at = NOW() WHERE jti = $1',
        [decoded.jti]
      ).catch(err => console.error('Session revoke error:', err.message));
    }

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error(err);
    // Always return success on logout — client clears token regardless
    res.status(200).json({ message: 'Logged out' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT u.id, u.email, u.role, u.last_login, e.id as employee_id, e.first_name, e.last_name, e.avatar_url, e.department_id, e.position_id FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE u.id = $1',
      [req.user.id]
    );
    res.set('Cache-Control', 'private, max-age=10');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
