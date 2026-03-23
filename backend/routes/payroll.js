const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET all payroll runs (admin only)
router.get('/', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT pr.*,
        CONCAT(u.first_name, ' ', u.last_name) as processed_by_name
      FROM payroll_runs pr
      LEFT JOIN employees u ON u.user_id = pr.processed_by
      ORDER BY pr.period_start DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET single payroll run with items (admin or employee viewing own)
router.get('/:id', async (req, res) => {
  try {
    const [run, items] = await Promise.all([
      db.query('SELECT * FROM payroll_runs WHERE id = $1', [req.params.id]),
      db.query(`
        SELECT pi.*,
          CONCAT(e.first_name, ' ', e.last_name) as employee_name,
          e.employee_id as emp_code, e.avatar_url,
          d.name as department_name,
          p.title as position_title
        FROM payroll_items pi
        JOIN employees e ON e.id = pi.employee_id
        LEFT JOIN departments d ON d.id = e.department_id
        LEFT JOIN positions p ON p.id = e.position_id
        WHERE pi.payroll_run_id = $1
        ORDER BY e.first_name
      `, [req.params.id]),
    ]);
    if (run.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    
    // If user is not admin, ensure they can only view their own payroll
    if (!['super_admin', 'hr_admin'].includes(req.user.role)) {
      const ownItem = items.rows.find(item => item.employee_id === req.user.employee_id);
      if (!ownItem) {
        return res.status(403).json({ error: 'You can only view your own payroll' });
      }
      res.json({ ...run.rows[0], items: [ownItem] });
    } else {
      res.json({ ...run.rows[0], items: items.rows });
    }
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create payroll run (admin only)
router.post('/', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { period_start, period_end, pay_date, description } = req.body;
    const month = new Date(period_start).getMonth() + 1;
    const year = new Date(period_start).getFullYear();

    const result = await db.query(
      'INSERT INTO payroll_runs (period_start, period_end, pay_date, month, year, description, processed_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [period_start, period_end, pay_date, month, year, description, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payroll/:id/generate - generate payroll items from salary structures (admin only)
router.post('/:id/generate', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const run = await db.query('SELECT * FROM payroll_runs WHERE id = $1', [req.params.id]);
    if (run.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (run.rows[0].status !== 'draft') return res.status(400).json({ error: 'Can only generate for draft payroll' });

    // Get active employees with current salary
    const employees = await db.query(`
      SELECT e.id,
        ss.basic_salary, ss.housing_allowance, ss.transport_allowance, ss.meal_allowance,
        ss.medical_allowance, ss.mobile_allowance, ss.other_allowances, ss.gross_salary,
        ss.tax_deduction, ss.pension_deduction, ss.health_insurance, ss.other_deductions, ss.net_salary
      FROM employees e
      JOIN salary_structures ss ON ss.employee_id = e.id AND ss.end_date IS NULL
      WHERE e.status = 'active'
    `);

    // Delete existing items
    await db.query('DELETE FROM payroll_items WHERE payroll_run_id = $1', [req.params.id]);

    let totalGross = 0, totalDeductions = 0, totalNet = 0;

    for (const emp of employees.rows) {
      // Count approved leaves in period
      const leaveResult = await db.query(`
        SELECT COALESCE(SUM(total_days), 0) as leave_days
        FROM leave_requests
        WHERE employee_id = $1 AND status = 'approved'
          AND start_date >= $2 AND end_date <= $3
      `, [emp.id, run.rows[0].period_start, run.rows[0].period_end]);

      const leaveDays = parseInt(leaveResult.rows[0].leave_days) || 0;
      const gross = parseFloat(emp.gross_salary) || 0;
      const deductions = (parseFloat(emp.tax_deduction) || 0) + (parseFloat(emp.pension_deduction) || 0) +
                         (parseFloat(emp.health_insurance) || 0) + (parseFloat(emp.other_deductions) || 0);
      const net = parseFloat(emp.net_salary) || 0;

      await db.query(`
        INSERT INTO payroll_items (
          payroll_run_id, employee_id, basic_salary, housing_allowance, transport_allowance,
          meal_allowance, medical_allowance, mobile_allowance, other_allowances, gross_salary,
          tax_deduction, pension_deduction, health_insurance, other_deductions, total_deductions,
          net_salary, leave_days_taken
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      `, [
        req.params.id, emp.id, emp.basic_salary, emp.housing_allowance, emp.transport_allowance,
        emp.meal_allowance, emp.medical_allowance, emp.mobile_allowance, emp.other_allowances, gross,
        emp.tax_deduction, emp.pension_deduction, emp.health_insurance, emp.other_deductions, deductions,
        net, leaveDays,
      ]);

      totalGross += gross;
      totalDeductions += deductions;
      totalNet += net;
    }

    // Update run totals
    const updated = await db.query(
      "UPDATE payroll_runs SET total_employees=$1, total_gross=$2, total_deductions=$3, total_net=$4, status='processing', processed_at=NOW() WHERE id=$5 RETURNING *",
      [employees.rows.length, totalGross, totalDeductions, totalNet, req.params.id]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/payroll/:id/complete (admin only)
router.put('/:id/complete', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE payroll_runs SET status='completed', approved_by=$1, approved_at=NOW() WHERE id=$2 RETURNING *",
      [req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/payroll/:id/cancel (admin only)
router.put('/:id/cancel', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(
      "UPDATE payroll_runs SET status='cancelled' WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT update payroll item (admin only)
router.put('/items/:item_id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { bonus, overtime_pay, other_deductions, notes } = req.body;
    const result = await db.query(`
      UPDATE payroll_items SET bonus=$1, overtime_pay=$2, other_deductions=$3, notes=$4,
        gross_salary = basic_salary + housing_allowance + transport_allowance + meal_allowance + medical_allowance + mobile_allowance + other_allowances + $1 + $2,
        total_deductions = tax_deduction + pension_deduction + health_insurance + $3,
        net_salary = basic_salary + housing_allowance + transport_allowance + meal_allowance + medical_allowance + mobile_allowance + other_allowances + $1 + $2 - tax_deduction - pension_deduction - health_insurance - $3
      WHERE id=$5 RETURNING *
    `, [bonus || 0, overtime_pay || 0, other_deductions || 0, notes, req.params.item_id]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
