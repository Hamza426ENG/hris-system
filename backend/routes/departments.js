const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT d.*,
        CONCAT(e.first_name, ' ', e.last_name) as head_name,
        e.avatar_url as head_avatar,
        pd.name as parent_name,
        (SELECT COUNT(*) FROM employees WHERE department_id = d.id AND status = 'active') as active_count
      FROM departments d
      LEFT JOIN employees e ON e.id = d.head_employee_id
      LEFT JOIN departments pd ON pd.id = d.parent_id
      WHERE d.is_active = TRUE
      ORDER BY d.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [dept, emps] = await Promise.all([
      db.query(`
        SELECT d.*, CONCAT(e.first_name, ' ', e.last_name) as head_name
        FROM departments d LEFT JOIN employees e ON e.id = d.head_employee_id
        WHERE d.id = $1
      `, [req.params.id]),
      db.query(`
        SELECT e.id, e.employee_id, e.first_name, e.last_name, e.avatar_url, p.title as position_title, e.status
        FROM employees e LEFT JOIN positions p ON p.id = e.position_id
        WHERE e.department_id = $1 AND e.status = 'active' ORDER BY e.first_name
      `, [req.params.id]),
    ]);
    if (dept.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ...dept.rows[0], employees: emps.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { name, code, description, parent_id, head_employee_id, budget, location } = req.body;
    const result = await db.query(
      'INSERT INTO departments (name, code, description, parent_id, head_employee_id, budget, location) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, code, description, parent_id || null, head_employee_id || null, budget || 0, location]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { name, code, description, parent_id, head_employee_id, budget, location } = req.body;
    const result = await db.query(
      'UPDATE departments SET name=$1, code=$2, description=$3, parent_id=$4, head_employee_id=$5, budget=$6, location=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
      [name, code, description, parent_id || null, head_employee_id || null, budget || 0, location, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    await db.query('UPDATE departments SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ message: 'Department deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
