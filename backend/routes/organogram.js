const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/organogram - full org tree
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        e.id, e.employee_id, e.first_name, e.last_name, e.manager_id,
        e.avatar_url, e.status, e.hire_date,
        p.title as position_title, p.level as position_level,
        d.name as department_name, d.id as department_id, d.code as department_code
      FROM employees e
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status IN ('active', 'probation')
      ORDER BY p.level DESC NULLS LAST, e.first_name
    `);

    const employees = result.rows;

    // Build tree
    const buildTree = (employees, managerId = null) => {
      return employees
        .filter(e => e.manager_id === managerId)
        .map(e => ({
          ...e,
          name: `${e.first_name} ${e.last_name}`,
          children: buildTree(employees, e.id),
        }));
    };

    const tree = buildTree(employees);

    const role = req.user.role;
    if (role === 'team_lead' || role === 'employee') {
      const findSubtree = (nodes, employeeId) => {
        for (const node of nodes) {
          if (node.id === employeeId) return node;
          const found = findSubtree(node.children || [], employeeId);
          if (found) return found;
        }
        return null;
      };
      const subtreeNode = findSubtree(tree, req.user.employee_id);
      return res.json({ tree: subtreeNode ? [subtreeNode] : [], all: employees });
    }

    res.json({ tree, all: employees });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/organogram/department/:dept_id
router.get('/department/:dept_id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT e.id, e.employee_id, e.first_name, e.last_name, e.manager_id, e.avatar_url,
        p.title as position_title, d.name as department_name
      FROM employees e
      LEFT JOIN positions p ON p.id = e.position_id
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
