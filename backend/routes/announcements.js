const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/announcements — all active (HR/admin sees all; others see ones targeting their role)
router.get('/', async (req, res) => {
  try {
    const role = req.user.role;
    const isHR = ['super_admin', 'hr_admin'].includes(role);

    const result = await db.query(`
      SELECT a.*,
        CONCAT(e.first_name, ' ', e.last_name) as posted_by_name,
        e.avatar_url as posted_by_avatar,
        (SELECT COUNT(*) FROM announcement_acknowledgements WHERE announcement_id = a.id) as ack_count
      FROM announcements a
      LEFT JOIN employees e ON e.user_id = a.posted_by
      WHERE a.is_active = TRUE
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        ${!isHR ? `AND (a.target_roles IS NULL OR $1 = ANY(a.target_roles))` : ''}
      ORDER BY
        CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        a.created_at DESC
      LIMIT 50
    `, !isHR ? [role] : []);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/announcements/unread — active announcements not yet acknowledged by current user
router.get('/unread', async (req, res) => {
  try {
    const role = req.user.role;
    const result = await db.query(`
      SELECT a.*,
        CONCAT(e.first_name, ' ', e.last_name) as posted_by_name,
        e.avatar_url as posted_by_avatar
      FROM announcements a
      LEFT JOIN employees e ON e.user_id = a.posted_by
      WHERE a.is_active = TRUE
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND (a.target_roles IS NULL OR $1 = ANY(a.target_roles))
        AND NOT EXISTS (
          SELECT 1 FROM announcement_acknowledgements aa
          WHERE aa.announcement_id = a.id AND aa.user_id = $2
        )
      ORDER BY
        CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        a.created_at DESC
    `, [role, req.user.id]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/announcements — create (HR/admin only)
router.post('/', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { title, content, priority, expires_at, target_roles } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });

    const roles = target_roles?.length
      ? target_roles
      : ['employee', 'team_lead', 'hr_admin', 'super_admin'];

    const result = await db.query(
      `INSERT INTO announcements (title, content, priority, expires_at, posted_by, target_roles)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, content, priority || 'normal', expires_at || null, req.user.id, roles]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/announcements/:id — update (HR/admin only)
router.put('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { title, content, priority, expires_at, target_roles, is_active } = req.body;
    const result = await db.query(
      `UPDATE announcements SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        priority = COALESCE($3, priority),
        expires_at = $4,
        target_roles = COALESCE($5, target_roles),
        is_active = COALESCE($6, is_active),
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title, content, priority, expires_at || null, target_roles, is_active, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/announcements/:id — soft delete (HR/admin only)
router.delete('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    await db.query('UPDATE announcements SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/announcements/:id/acknowledge — save acknowledgement + optional feedback
router.post('/:id/acknowledge', async (req, res) => {
  try {
    const { feedback } = req.body;
    await db.query(
      `INSERT INTO announcement_acknowledgements (announcement_id, user_id, feedback)
       VALUES ($1, $2, $3)
       ON CONFLICT (announcement_id, user_id) DO UPDATE SET
         feedback = EXCLUDED.feedback,
         acknowledged_at = NOW()`,
      [req.params.id, req.user.id, feedback || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/announcements/:id/acknowledgements — who acknowledged (HR/admin only)
router.get('/:id/acknowledgements', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT aa.*, aa.acknowledged_at,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name,
        e.avatar_url, u.email, u.role
      FROM announcement_acknowledgements aa
      JOIN users u ON u.id = aa.user_id
      LEFT JOIN employees e ON e.user_id = aa.user_id
      WHERE aa.announcement_id = $1
      ORDER BY aa.acknowledged_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
