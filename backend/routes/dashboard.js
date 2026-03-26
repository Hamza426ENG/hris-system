const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/stats', async (req, res) => {
  try {
    const role = req.user.role;
    const isHR = ['super_admin', 'hr_admin'].includes(role);

    // ── HR / Super-Admin: full company analytics ────────────────────
    if (isHR) {
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
            AND date_of_birth IS NOT NULL
            AND (
              (
                TO_CHAR(CURRENT_DATE + INTERVAL '30 days', 'MMDD') >= TO_CHAR(CURRENT_DATE, 'MMDD')
                AND TO_CHAR(date_of_birth, 'MMDD') >= TO_CHAR(CURRENT_DATE, 'MMDD')
                AND TO_CHAR(date_of_birth, 'MMDD') <= TO_CHAR(CURRENT_DATE + INTERVAL '30 days', 'MMDD')
              )
              OR
              (
                TO_CHAR(CURRENT_DATE + INTERVAL '30 days', 'MMDD') < TO_CHAR(CURRENT_DATE, 'MMDD')
                AND (
                  TO_CHAR(date_of_birth, 'MMDD') >= TO_CHAR(CURRENT_DATE, 'MMDD')
                  OR TO_CHAR(date_of_birth, 'MMDD') <= TO_CHAR(CURRENT_DATE + INTERVAL '30 days', 'MMDD')
                )
              )
            )
          ORDER BY
            CASE
              WHEN TO_CHAR(date_of_birth, 'MMDD') >= TO_CHAR(CURRENT_DATE, 'MMDD')
              THEN TO_CHAR(date_of_birth, 'MMDD')
              ELSE '9999'
            END,
            TO_CHAR(date_of_birth, 'MMDD')
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

      const adminResponse = {
        view: 'admin',
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
      };

      // HR users who also have an employee record get their personal stats too
      // (everyone except super_admin is an employee)
      const hrEmpId = req.user.employee_id;
      if (hrEmpId) {
        const [hrEmpInfo, hrAttMonth, hrToday, hrBalances] = await Promise.all([
          db.query(`
            SELECT e.first_name, e.last_name, e.employee_id, e.avatar_url,
              d.name as department_name, p.title as position_title
            FROM employees e
            LEFT JOIN departments d ON d.id = e.department_id
            LEFT JOIN positions p ON p.id = e.position_id
            WHERE e.id = $1
          `, [hrEmpId]),
          db.query(`
            SELECT COUNT(*) as days_present
            FROM attendance_records
            WHERE employee_id = $1
              AND date >= DATE_TRUNC('month', CURRENT_DATE)
              AND check_in IS NOT NULL
          `, [hrEmpId]),
          db.query(`
            SELECT * FROM attendance_records
            WHERE employee_id = $1 AND date = CURRENT_DATE LIMIT 1
          `, [hrEmpId]),
          db.query(`
            SELECT lb.*, lt.name as leave_type_name, lt.color
            FROM leave_balances lb
            JOIN leave_types lt ON lt.id = lb.leave_type_id
            WHERE lb.employee_id = $1 AND lb.year = EXTRACT(YEAR FROM NOW())
          `, [hrEmpId]),
        ]);

        const balances = hrBalances.rows || [];
        const totalAllocated = balances.reduce((s, b) => s + (parseFloat(b.allocated_days) || 0), 0);
        const totalUsed = balances.reduce((s, b) => s + (parseFloat(b.used_days) || 0), 0);

        adminResponse.personal = {
          employee: hrEmpInfo.rows[0] || {},
          stats: {
            leavesAllocated: totalAllocated,
            leavesUsed: totalUsed,
            leavesRemaining: totalAllocated - totalUsed,
            daysPresent: parseInt(hrAttMonth.rows[0]?.days_present || 0),
            checkedInToday: !!hrToday.rows[0]?.check_in,
            checkedOutToday: !!hrToday.rows[0]?.check_out,
          },
          leaveBalances: balances,
        };
      }

      res.set('Cache-Control', 'private, max-age=30');
      return res.json(adminResponse);
    }

    // ── Non-HR roles: personal dashboard only ───────────────────────
    const empId = req.user.employee_id;

    const [
      empInfo, myLeaves, myBalances, myAttendanceMonth, todayAttendance,
    ] = await Promise.all([
      db.query(`
        SELECT e.*, d.name as department_name, p.title as position_title,
          CONCAT(m.first_name, ' ', m.last_name) as manager_name
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        LEFT JOIN employees m ON m.id = e.manager_id
        WHERE e.id = $1
      `, [empId]),
      db.query(`
        SELECT lr.*, lt.name as leave_type_name, lt.color
        FROM leave_requests lr
        JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.employee_id = $1
        ORDER BY lr.created_at DESC LIMIT 5
      `, [empId]),
      db.query(`
        SELECT lb.*, lt.name as leave_type_name, lt.color
        FROM leave_balances lb
        JOIN leave_types lt ON lt.id = lb.leave_type_id
        WHERE lb.employee_id = $1 AND lb.year = EXTRACT(YEAR FROM NOW())
      `, [empId]),
      db.query(`
        SELECT COUNT(*) as days_present
        FROM attendance_records
        WHERE employee_id = $1
          AND date >= DATE_TRUNC('month', CURRENT_DATE)
          AND check_in IS NOT NULL
      `, [empId]),
      db.query(`
        SELECT * FROM attendance_records
        WHERE employee_id = $1 AND date = CURRENT_DATE
        LIMIT 1
      `, [empId]),
    ]);

    const emp = empInfo.rows[0] || {};
    const balances = myBalances.rows || [];
    const totalAllocated = balances.reduce((s, b) => s + (parseFloat(b.allocated_days) || 0), 0);
    const totalUsed = balances.reduce((s, b) => s + (parseFloat(b.used_days) || 0), 0);
    const pendingCount = myLeaves.rows.filter(l => l.status === 'pending').length;

    res.set('Cache-Control', 'private, max-age=30');
    return res.json({
      view: 'personal',
      employee: emp,
      stats: {
        leavesAllocated: totalAllocated,
        leavesUsed: totalUsed,
        leavesRemaining: totalAllocated - totalUsed,
        pendingRequests: pendingCount,
        daysPresent: parseInt(myAttendanceMonth.rows[0]?.days_present || 0),
        checkedInToday: !!todayAttendance.rows[0]?.check_in,
        checkedOutToday: !!todayAttendance.rows[0]?.check_out,
      },
      leaveBalances: balances,
      recentLeaves: myLeaves.rows,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;