const express = require('express');
const db = require('../db');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ── SSE client registry ───────────────────────────────────────────────────────
const sseClients = new Set();

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
}

// SSE stream — EventSource cannot send custom headers, so token is passed as query param
router.get('/stream', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await db.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = TRUE',
      [decoded.userId]
    );
    if (!result.rows.length) return res.status(401).end();
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('data: connected\n\n');

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  sseClients.add(res);
  req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
});

// All remaining routes require JWT auth via Authorization header
router.use(authenticate);

const ADMIN_ROLES = ['super_admin', 'hr_admin', 'hr_manager', 'manager'];

// Helper: fetch a single announcement with poster name + computed status
async function fetchFull(id) {
  const r = await db.query(`
    SELECT a.*,
      CONCAT(e.first_name, ' ', e.last_name) AS posted_by_name,
      CASE
        WHEN a.is_active = FALSE THEN 'archived'
        WHEN a.expires_at IS NOT NULL AND a.expires_at::date < CURRENT_DATE THEN 'expired'
        ELSE 'active'
      END AS computed_status
    FROM announcements a
    LEFT JOIN employees e ON e.user_id = a.posted_by
    WHERE a.id = $1
  `, [id]);
  return r.rows[0] || null;
}

// GET /  — public: active only. GET /?manage=true — admin: all announcements.
router.get('/', async (req, res) => {
  try {
    const isAdmin = ADMIN_ROLES.includes(req.user.role);
    const manage  = req.query.manage === 'true' && isAdmin;

    let result;
    if (manage) {
      result = await db.query(`
        SELECT a.*,
          CONCAT(e.first_name, ' ', e.last_name) AS posted_by_name,
          CASE
            WHEN a.is_active = FALSE THEN 'archived'
            WHEN a.expires_at IS NOT NULL AND a.expires_at::date < CURRENT_DATE THEN 'expired'
            ELSE 'active'
          END AS computed_status
        FROM announcements a
        LEFT JOIN employees e ON e.user_id = a.posted_by
        ORDER BY a.created_at DESC
        LIMIT 200
      `);
    } else {
      // BUG FIX: use expires_at::date >= CURRENT_DATE so a date-only input for
      // "today" remains visible for the entire day (not just until midnight).
      result = await db.query(`
        SELECT a.*,
          CONCAT(e.first_name, ' ', e.last_name) AS posted_by_name,
          'active' AS computed_status
        FROM announcements a
        LEFT JOIN employees e ON e.user_id = a.posted_by
        WHERE a.is_active = TRUE
          AND (a.expires_at IS NULL OR a.expires_at::date >= CURRENT_DATE)
        ORDER BY
          CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
          a.created_at DESC
        LIMIT 50
      `);
    }

    res.set('Cache-Control', 'no-store');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST / — create a new announcement
router.post('/', async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });

    const { title, content, priority, expires_at } = req.body;
    if (!title?.trim() || !content?.trim())
      return res.status(400).json({ error: 'Title and content are required' });

    const inserted = await db.query(
      `INSERT INTO announcements (title, content, priority, expires_at, posted_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [title.trim(), content.trim(), priority || 'normal', expires_at || null, req.user.id]
    );

    const announcement = await fetchFull(inserted.rows[0].id);
    broadcast({ __type: 'created', announcement });
    res.status(201).json(announcement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id — edit an existing announcement
router.patch('/:id', async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });

    const { title, content, priority, expires_at, is_active } = req.body;

    const existing = await db.query('SELECT id FROM announcements WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    await db.query(`
      UPDATE announcements SET
        title      = COALESCE($1, title),
        content    = COALESCE($2, content),
        priority   = COALESCE($3, priority),
        expires_at = $4,
        is_active  = COALESCE($5, is_active)
      WHERE id = $6
    `, [
      title?.trim() || null,
      content?.trim() || null,
      priority || null,
      expires_at !== undefined ? (expires_at || null) : undefined,
      is_active !== undefined ? is_active : null,
      req.params.id,
    ]);

    const announcement = await fetchFull(req.params.id);
    broadcast({ __type: 'updated', announcement });
    res.json(announcement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — soft delete (set is_active = false)
router.delete('/:id', async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });

    await db.query('UPDATE announcements SET is_active = FALSE WHERE id = $1', [req.params.id]);
    broadcast({ __type: 'deleted', id: req.params.id });
    res.json({ message: 'Archived' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
