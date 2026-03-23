const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/stats', async (req, res) => {
  try {
    const [
      totalEmp, activeEmp, newHires, onLeave,
      pendingLeaves, depts, payrollStats, upcomingBirthdays,
      recentLeaves, recentHires, leaveSummary, deptHeadcount,
    ] = await Promise.all([
      db.query("SELECT COUNT(*) FROM employees"),
      db.query("SELECT COUNT(*) FROM employees WHERE status = 'active'"),
      db.query("SELECT COUNT(*) FROM employees WHERE hire_date >= NOW() - INTERVAL '30 days'"),
      db.query("SELECT COUNT(*) FROM employees WHERE status = 'on_leave'"),
      db.query("SELECT COUNT(*) FROM leave_requests WHERE status = 'pending'"),
      db.query("SELECT COUNT(*) FROM departments WHERE is_active = TRUE"),
      db.query(`
        SELECT COALESCE(SUM(total_gross), 0) as total_gross, COALESCE(SUM(total_net), 0) as total_net
        FROM payroll_runs WHERE status = 'completed' AND year = EXTRACT(YEAR FROM NOW())
      `),
      db.query(`
        SELECT id, first_name, last_name, date_of_birth, avatar_url
        FROM employees
        WHERE status = 'active'
          AND TO_CHAR(date_of_birth, 'MM-DD') BETWEEN TO_CHAR(NOW(), 'MM-DD')
          AND TO_CHAR(NOW() + INTERVAL '30 days', 'MM-DD')
        ORDER BY TO_CHAR(date_of_birth, 'MM-DD')
        LIMIT 5
      `),
      db.query(`
        SELECT lr.*, lt.name as leave_type_name, lt.color,
          CONCAT(e.first_name, ' ', e.last_name) as employee_name, e.avatar_url
        FROM leave_requests lr
        JOIN leave_types lt ON lt.id = lr.leave_type_id
        JOIN employees e ON e.id = lr.employee_id
        ORDER BY lr.created_at DESC LIMIT 8
      `),
      db.query(`
        SELECT e.id, e.employee_id, e.first_name, e.last_name, e.hire_date, e.avatar_url,
          d.name as department_name, p.title as position_title
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        ORDER BY e.hire_date DESC LIMIT 5
      `),
      db.query(`
        SELECT lt.name, lt.color,
          COUNT(lr.id) FILTER (WHERE lr.status = 'approved') as approved,
          COUNT(lr.id) FILTER (WHERE lr.status = 'pending') as pending,
          COUNT(lr.id) FILTER (WHERE lr.status = 'rejected') as rejected
        FROM leave_types lt
        LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id
          AND EXTRACT(YEAR FROM lr.start_date) = EXTRACT(YEAR FROM NOW())
        GROUP BY lt.id, lt.name, lt.color
      `),
      db.query(`
        SELECT d.name, d.code, d.headcount, d.id,
          COUNT(e.id) as actual_count
        FROM departments d
        LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'active'
        WHERE d.is_active = TRUE
        GROUP BY d.id, d.name, d.code, d.headcount
        ORDER BY actual_count DESC
      `),
    ]);

    res.set('Cache-Control', 'private, max-age=30');
    res.json({
      stats: {
        totalEmployees: parseInt(totalEmp.rows[0].count),
        activeEmployees: parseInt(activeEmp.rows[0].count),
        newHires: parseInt(newHires.rows[0].count),
        onLeave: parseInt(onLeave.rows[0].count),
        pendingLeaves: parseInt(pendingLeaves.rows[0].count),
        departments: parseInt(depts.rows[0].count),
        ytdPayroll: parseFloat(payrollStats.rows[0].total_gross) || 0,
        ytdNetPayroll: parseFloat(payrollStats.rows[0].total_net) || 0,
      },
      upcomingBirthdays: upcomingBirthdays.rows,
      recentLeaves: recentLeaves.rows,
      recentHires: recentHires.rows,
      leaveSummary: leaveSummary.rows,
      deptHeadcount: deptHeadcount.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
