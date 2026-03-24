const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Only super_admin and hr_admin see the full company-wide tree.
// Everyone else sees their own subtree (rooted at their own employee record).
const FULL_ACCESS_ROLES = ['super_admin', 'hr_admin'];

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

    const payload = {
      all: employees,
      current_employee_id: req.user.employee_id,
    };

    if (!FULL_ACCESS_ROLES.includes(req.user.role)) {
      const findSubtree = (nodes, empId) => {
        for (const node of nodes) {
          if (node.id === empId) return node;
          const found = findSubtree(node.children || [], empId);
          if (found) return found;
        }
        return null;
      };
      const subtree = findSubtree(tree, req.user.employee_id);
      return res.json({ ...payload, tree: subtree ? [subtree] : [], is_partial: true });
    }

    res.json({ ...payload, tree, is_partial: false });
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
