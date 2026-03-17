const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT a.*,
        CONCAT(e.first_name, ' ', e.last_name) as posted_by_name
      FROM announcements a
      LEFT JOIN employees e ON e.user_id = a.posted_by
      WHERE a.is_active = TRUE AND (a.expires_at IS NULL OR a.expires_at > NOW())
      ORDER BY a.created_at DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, content, priority, expires_at } = req.body;
    const result = await db.query(
      'INSERT INTO announcements (title, content, priority, expires_at, posted_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [title, content, priority || 'normal', expires_at || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.query('UPDATE announcements SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
