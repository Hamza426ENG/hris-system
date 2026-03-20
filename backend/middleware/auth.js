const jwt = require('jsonwebtoken');
const db = require('../db');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // If token carries a jti, verify this session has not been revoked
    if (decoded.jti) {
      const session = await db.query(
        'SELECT is_active FROM user_sessions WHERE jti = $1',
        [decoded.jti]
      );
      if (session.rows.length > 0 && !session.rows[0].is_active) {
        return res.status(401).json({ error: 'Session has been revoked' });
      }
    }

    const result = await db.query(
      'SELECT u.id, u.email, u.role, u.is_active, e.id as employee_id FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE u.id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    // Attach jti so logout endpoint can revoke the session
    req.user = { ...result.rows[0], jti: decoded.jti };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
