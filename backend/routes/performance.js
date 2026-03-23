const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/performance/employee/:id - Get latest performance record for employee
router.get('/employee/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM performance_records
      WHERE employee_id = $1
      ORDER BY period_end DESC
      LIMIT 1
    `, [req.params.id]);

    res.set('Cache-Control', 'private, max-age=30');
    res.json(result.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/performance/employee/:id - Create or update performance record
router.post('/employee/:id', authorize('super_admin', 'hr_admin', 'team_lead', 'manager'), async (req, res) => {
  try {
    const {
      period_start,
      period_end,
      productivity,
      knowledge,
      attitude,
      discipline,
      productivity_pct,
      knowledge_pct,
      attitude_pct,
      discipline_pct,
      total_pct,
      notes,
    } = req.body;

    const result = await db.query(`
      INSERT INTO performance_records (
        employee_id, period_start, period_end, productivity, knowledge, attitude, discipline,
        productivity_pct, knowledge_pct, attitude_pct, discipline_pct, total_pct, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (employee_id, period_start, period_end)
      DO UPDATE SET
        productivity = $4, knowledge = $5, attitude = $6, discipline = $7,
        productivity_pct = $8, knowledge_pct = $9, attitude_pct = $10, discipline_pct = $11,
        total_pct = $12, notes = $13, updated_at = NOW()
      RETURNING *
    `, [
      req.params.id, period_start, period_end, productivity, knowledge, attitude, discipline,
      productivity_pct, knowledge_pct, attitude_pct, discipline_pct, total_pct, notes,
    ]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/performance/history/:id - Get all performance records for employee
router.get('/history/:id', async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const offset = (page - 1) * limit;

    const result = await db.query(`
      SELECT * FROM performance_records
      WHERE employee_id = $1
      ORDER BY period_end DESC
      LIMIT $2 OFFSET $3
    `, [req.params.id, limit, offset]);

    const countResult = await db.query(`
      SELECT COUNT(*) FROM performance_records WHERE employee_id = $1
    `, [req.params.id]);

    res.set('Cache-Control', 'private, max-age=30');
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

module.exports = router;
