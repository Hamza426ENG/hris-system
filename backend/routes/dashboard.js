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

// GET /api/dashboard/team-stats — team lead's team data only
router.get('/team-stats', async (req, res) => {
  try {
    const empId = req.user.employee_id;
    if (!empId) return res.status(400).json({ error: 'No employee record linked.' });

    const [
      selfInfo, teamMembers, pendingLeaves, leaveBalanceSummary,
      todayAttendance, upcomingBirthdays, recentHires, leaveSummary
    ] = await Promise.all([

      // Team lead's own info + department
      db.query(`
        SELECT e.*, d.name as department_name, d.code as department_code,
          d.id as dept_id, p.title as position_title,
          CONCAT(m.first_name,' ',m.last_name) as manager_name,
          m.avatar_url as manager_avatar, m.id as manager_id,
          (SELECT COUNT(*) FROM employees WHERE manager_id = e.id AND status='active') as direct_reports,
          (SELECT CONCAT(h.first_name,' ',h.last_name) FROM employees h WHERE h.id = d.head_employee_id) as dept_head_name,
          (SELECT h.avatar_url FROM employees h WHERE h.id = d.head_employee_id) as dept_head_avatar,
          (SELECT COUNT(*) FROM employees WHERE department_id = e.department_id AND status='active') as dept_headcount
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        LEFT JOIN employees m ON m.id = e.manager_id
        WHERE e.id = $1
      `, [empId]),

      // Direct reports
      db.query(`
        SELECT e.id, e.employee_id, e.first_name, e.last_name, e.avatar_url,
          e.status, e.hire_date, e.employment_type,
          d.name as department_name, p.title as position_title,
          p.grade,
          (SELECT COUNT(*) FROM leave_requests WHERE employee_id=e.id AND status='pending') as pending_leaves,
          (SELECT check_in FROM attendance WHERE employee_id=e.id AND date=CURRENT_DATE) as checkin_today,
          (SELECT check_out FROM attendance WHERE employee_id=e.id AND date=CURRENT_DATE) as checkout_today
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        WHERE e.manager_id = $1
        ORDER BY e.first_name, e.last_name
      `, [empId]),

      // Pending leave requests from team
      db.query(`
        SELECT lr.*, lt.name as leave_type_name,
          CONCAT(e.first_name,' ',e.last_name) as employee_name,
          e.avatar_url, e.employee_id as emp_code
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE e.manager_id = $1 AND lr.status = 'pending'
        ORDER BY lr.created_at ASC
      `, [empId]),

      // Leave balance summary for team
      db.query(`
        SELECT lt.name as leave_type,
          ROUND(AVG(lb.available_days),1) as avg_remaining,
          SUM(lb.used_days) as total_used,
          COUNT(lb.id) as member_count
        FROM leave_balances lb
        JOIN leave_types lt ON lt.id = lb.leave_type_id
        JOIN employees e ON e.id = lb.employee_id
        WHERE e.manager_id = $1 AND lb.year = EXTRACT(YEAR FROM NOW())
        GROUP BY lt.id, lt.name ORDER BY total_used DESC LIMIT 5
      `, [empId]),

      // Today's attendance for team
      db.query(`
        SELECT e.id, e.first_name, e.last_name, e.avatar_url,
          a.check_in, a.check_out, a.hours_worked, a.status as att_status
        FROM employees e
        LEFT JOIN attendance a ON a.employee_id=e.id AND a.date=CURRENT_DATE
        WHERE e.manager_id = $1 AND e.status='active'
        ORDER BY e.first_name
      `, [empId]),

      // Upcoming birthdays in team
      db.query(`
        SELECT id, first_name, last_name, avatar_url, date_of_birth
        FROM employees
        WHERE manager_id = $1 AND status='active'
          AND date_of_birth IS NOT NULL
          AND TO_CHAR(date_of_birth,'MM-DD') BETWEEN TO_CHAR(NOW(),'MM-DD')
          AND TO_CHAR(NOW() + INTERVAL '30 days','MM-DD')
        ORDER BY TO_CHAR(date_of_birth,'MM-DD') LIMIT 5
      `, [empId]),

      // Recent hires in team (last 60 days)
      db.query(`
        SELECT e.id, e.first_name, e.last_name, e.avatar_url, e.hire_date,
          p.title as position_title
        FROM employees e
        LEFT JOIN positions p ON p.id = e.position_id
        WHERE e.manager_id = $1 AND e.hire_date >= NOW() - INTERVAL '60 days'
        ORDER BY e.hire_date DESC LIMIT 5
      `, [empId]),

      // Leave requests history for team (recent)
      db.query(`
        SELECT lr.id, lr.status, lr.start_date, lr.end_date, lr.total_days,
          lt.name as leave_type_name,
          CONCAT(e.first_name,' ',e.last_name) as employee_name,
          e.avatar_url
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE e.manager_id = $1
        ORDER BY lr.created_at DESC LIMIT 10
      `, [empId]),
    ]);

    const self = selfInfo.rows[0];
    const members = teamMembers.rows;

    res.json({
      self,
      team: {
        total: members.length,
        active: members.filter(m => m.status === 'active').length,
        onLeave: members.filter(m => m.status === 'on_leave').length,
        checkedInToday: members.filter(m => m.checkin_today).length,
        pendingLeaveCount: pendingLeaves.rows.length,
      },
      members,
      pendingLeaves: pendingLeaves.rows,
      leaveBalanceSummary: leaveBalanceSummary.rows,
      todayAttendance: todayAttendance.rows,
      upcomingBirthdays: upcomingBirthdays.rows,
      recentHires: recentHires.rows,
      leaveSummary: leaveSummary.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
