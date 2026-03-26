const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Everyone sees the full company tree. Profile access is controlled separately.
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        e.id, e.employee_id, e.first_name, e.last_name, e.manager_id,
        e.avatar_url, e.status, e.hire_date,
        p.title  AS position_title,
        p.level  AS position_level,
        d.name   AS department_name,
        d.id     AS department_id,
        d.code   AS department_code
      FROM employees e
      LEFT JOIN positions   p ON p.id = e.position_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status IN ('active', 'probation')
      ORDER BY p.level DESC NULLS LAST, e.first_name
    `);

    const employees = result.rows;

    const buildTree = (employees, managerId = null) =>
      employees
        .filter(e => e.manager_id === managerId)
        .map(e => ({ ...e, name: `${e.first_name} ${e.last_name}`, children: buildTree(employees, e.id) }));

    const tree = buildTree(employees);

    res.json({
      all: employees,
      current_employee_id: req.user.employee_id,
      tree,
      is_partial: false,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Department sub-tree (admin use)
router.get('/department/:dept_id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT e.id, e.employee_id, e.first_name, e.last_name, e.manager_id, e.avatar_url,
        p.title AS position_title, d.name AS department_name
      FROM employees e
      LEFT JOIN positions   p ON p.id = e.position_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.department_id = $1 AND e.status IN ('active', 'probation')
      ORDER BY p.level DESC NULLS LAST
    `, [req.params.dept_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
