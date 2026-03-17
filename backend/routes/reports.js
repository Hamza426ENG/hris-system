const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Headcount report
router.get('/headcount', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const [byDept, byStatus, byType, trend, byGender] = await Promise.all([
      db.query(`
        SELECT d.name as department, d.code, COUNT(e.id) as count
        FROM departments d
        LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'active'
        WHERE d.is_active = TRUE
        GROUP BY d.id, d.name, d.code ORDER BY count DESC
      `),
      db.query(`
        SELECT status, COUNT(*) as count FROM employees GROUP BY status
      `),
      db.query(`
        SELECT employment_type, COUNT(*) as count FROM employees WHERE status = 'active' GROUP BY employment_type
      `),
      db.query(`
        SELECT TO_CHAR(hire_date, 'Mon YYYY') as month, COUNT(*) as hires
        FROM employees
        WHERE EXTRACT(YEAR FROM hire_date) = $1
        GROUP BY TO_CHAR(hire_date, 'Mon YYYY'), EXTRACT(MONTH FROM hire_date)
        ORDER BY EXTRACT(MONTH FROM hire_date)
      `, [year]),
      db.query(`
        SELECT COALESCE(gender::text, 'Not Specified') as gender, COUNT(*) as count
        FROM employees WHERE status = 'active' GROUP BY gender
      `),
    ]);
    res.json({ byDept: byDept.rows, byStatus: byStatus.rows, byType: byType.rows, trend: trend.rows, byGender: byGender.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Leave report
router.get('/leaves', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const [summary, byType, byDept, monthly, employees] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='approved') as approved,
          COUNT(*) FILTER (WHERE status='pending') as pending,
          COUNT(*) FILTER (WHERE status='rejected') as rejected,
          COALESCE(SUM(total_days) FILTER (WHERE status='approved'), 0) as total_days_taken
        FROM leave_requests
        WHERE EXTRACT(YEAR FROM start_date) = $1
      `, [year]),
      db.query(`
        SELECT lt.name, lt.color,
          COUNT(lr.id) as requests,
          COALESCE(SUM(lr.total_days) FILTER (WHERE lr.status='approved'), 0) as days_taken
        FROM leave_types lt
        LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id AND EXTRACT(YEAR FROM lr.start_date) = $1
        GROUP BY lt.id, lt.name, lt.color ORDER BY days_taken DESC
      `, [year]),
      db.query(`
        SELECT d.name as department,
          COUNT(lr.id) as requests,
          COALESCE(SUM(lr.total_days) FILTER (WHERE lr.status='approved'), 0) as days_taken
        FROM departments d
        LEFT JOIN employees e ON e.department_id = d.id
        LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND EXTRACT(YEAR FROM lr.start_date) = $1
        WHERE d.is_active = TRUE
        GROUP BY d.id, d.name ORDER BY requests DESC
      `, [year]),
      db.query(`
        SELECT EXTRACT(MONTH FROM start_date) as month_num,
          TO_CHAR(start_date, 'Mon') as month,
          COUNT(*) as requests,
          COALESCE(SUM(total_days) FILTER (WHERE status='approved'), 0) as days
        FROM leave_requests
        WHERE EXTRACT(YEAR FROM start_date) = $1
        GROUP BY month_num, month ORDER BY month_num
      `, [year]),
      db.query(`
        SELECT
          CONCAT(e.first_name, ' ', e.last_name) as name,
          e.employee_id as emp_code,
          d.name as department,
          COUNT(lr.id) as total_requests,
          COALESCE(SUM(lr.total_days) FILTER (WHERE lr.status='approved'), 0) as days_taken
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND EXTRACT(YEAR FROM lr.start_date) = $1
        WHERE e.status = 'active'
        GROUP BY e.id, e.first_name, e.last_name, e.employee_id, d.name
        ORDER BY days_taken DESC LIMIT 20
      `, [year]),
    ]);
    res.json({ summary: summary.rows[0], byType: byType.rows, byDept: byDept.rows, monthly: monthly.rows, employees: employees.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Payroll report
router.get('/payroll', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const [runs, byDept, monthly] = await Promise.all([
      db.query(`
        SELECT pr.*, COUNT(pi.id) as items
        FROM payroll_runs pr
        LEFT JOIN payroll_items pi ON pi.payroll_run_id = pr.id
        WHERE pr.year = $1
        GROUP BY pr.id ORDER BY pr.period_start DESC
      `, [year]),
      db.query(`
        SELECT d.name as department,
          COUNT(DISTINCT pi.employee_id) as employees,
          COALESCE(SUM(pi.gross_salary), 0) as gross,
          COALESCE(SUM(pi.total_deductions), 0) as deductions,
          COALESCE(SUM(pi.net_salary), 0) as net
        FROM departments d
        LEFT JOIN employees e ON e.department_id = d.id
        LEFT JOIN payroll_items pi ON pi.employee_id = e.id
        LEFT JOIN payroll_runs pr ON pr.id = pi.payroll_run_id AND pr.year = $1 AND pr.status='completed'
        WHERE d.is_active = TRUE
        GROUP BY d.id, d.name ORDER BY gross DESC
      `, [year]),
      db.query(`
        SELECT pr.month,
          TO_CHAR(pr.period_start, 'Mon') as month_name,
          pr.total_gross, pr.total_net, pr.total_deductions
        FROM payroll_runs pr
        WHERE pr.year = $1 AND pr.status = 'completed'
        ORDER BY pr.month
      `, [year]),
    ]);
    res.json({ runs: runs.rows, byDept: byDept.rows, monthly: monthly.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Salary report
router.get('/salary', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        e.employee_id as emp_code,
        CONCAT(e.first_name, ' ', e.last_name) as name,
        d.name as department,
        p.title as position, p.grade,
        ss.basic_salary, ss.gross_salary, ss.net_salary, ss.currency,
        ss.effective_date
      FROM employees e
      JOIN salary_structures ss ON ss.employee_id = e.id AND ss.end_date IS NULL
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      WHERE e.status = 'active'
      ORDER BY ss.gross_salary DESC
    `);

    const summary = await db.query(`
      SELECT
        d.name as department,
        COUNT(ss.id) as employees,
        ROUND(AVG(ss.gross_salary), 2) as avg_gross,
        MIN(ss.gross_salary) as min_gross,
        MAX(ss.gross_salary) as max_gross,
        SUM(ss.gross_salary) as total_gross
      FROM salary_structures ss
      JOIN employees e ON e.id = ss.employee_id AND e.status = 'active' AND ss.end_date IS NULL
      LEFT JOIN departments d ON d.id = e.department_id
      GROUP BY d.id, d.name ORDER BY avg_gross DESC
    `);

    res.json({ employees: result.rows, summary: summary.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
