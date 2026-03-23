const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const { department_id } = req.query;
    let query = `
      SELECT p.*, d.name as department_name,
        (SELECT COUNT(*) FROM employees WHERE position_id = p.id AND status = 'active') as headcount
      FROM positions p LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.is_active = TRUE
    `;
    const params = [];
    if (department_id) { query += ' AND p.department_id = $1'; params.push(department_id); }
    query += ' ORDER BY p.level DESC, p.title';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { title, code, department_id, level, grade, min_salary, max_salary, description, responsibilities, requirements } = req.body;
    const result = await db.query(
      'INSERT INTO positions (title, code, department_id, level, grade, min_salary, max_salary, description, responsibilities, requirements) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [title, code, department_id || null, level || 1, grade, min_salary || 0, max_salary || 0, description, responsibilities, requirements]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { title, code, department_id, level, grade, min_salary, max_salary, description, responsibilities, requirements } = req.body;
    const result = await db.query(
      'UPDATE positions SET title=$1, code=$2, department_id=$3, level=$4, grade=$5, min_salary=$6, max_salary=$7, description=$8, responsibilities=$9, requirements=$10, updated_at=NOW() WHERE id=$11 RETURNING *',
      [title, code, department_id || null, level || 1, grade, min_salary || 0, max_salary || 0, description, responsibilities, requirements, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    await db.query('UPDATE positions SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ message: 'Position deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
