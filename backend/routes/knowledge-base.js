const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ──────────────────────────────────────────────
// GET /api/knowledge-base — List all articles
// All authenticated users can read
// ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    let sql = 'SELECT id, title, category, content, tags, is_active, created_at, updated_at FROM knowledge_base WHERE is_active = true';
    const params = [];

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    if (search) {
      params.push(search);
      sql += ` AND (title ILIKE '%' || $${params.length} || '%' OR content ILIKE '%' || $${params.length} || '%')`;
    }

    sql += ' ORDER BY updated_at DESC';

    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/knowledge-base/categories — List distinct categories
// ──────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT DISTINCT category, COUNT(*) as count FROM knowledge_base WHERE is_active = true GROUP BY category ORDER BY category'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/knowledge-base/:id — Get single article
// ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM knowledge_base WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Article not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// POST /api/knowledge-base — Create article (HR/Admin only)
// ──────────────────────────────────────────────
router.post('/', authorize('super_admin', 'hr_admin', 'hr_manager'), async (req, res) => {
  try {
    const { title, category, content, tags } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const result = await db.query(
      `INSERT INTO knowledge_base (title, category, content, tags, created_by)
       VALUES ($1, $2, $3, $4::text[], $5) RETURNING *`,
      [title, category || 'general', content, tags || [], req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// PUT /api/knowledge-base/:id — Update article (HR/Admin only)
// ──────────────────────────────────────────────
router.put('/:id', authorize('super_admin', 'hr_admin', 'hr_manager'), async (req, res) => {
  try {
    const { title, category, content, tags } = req.body;
    const result = await db.query(
      `UPDATE knowledge_base
       SET title = COALESCE($1, title),
           category = COALESCE($2, category),
           content = COALESCE($3, content),
           tags = COALESCE($4::text[], tags),
           updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [title, category, content, tags, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Article not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/knowledge-base/:id — Soft-delete article (HR/Admin only)
// ──────────────────────────────────────────────
router.delete('/:id', authorize('super_admin', 'hr_admin', 'hr_manager'), async (req, res) => {
  try {
    await db.query('UPDATE knowledge_base SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
