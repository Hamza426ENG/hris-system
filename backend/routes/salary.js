const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET all salary structures
router.get('/', async (req, res) => {
  try {
    const role = req.user.role;
    let whereClause = "WHERE e.status = 'active'";
    let params = [];

    if (role === 'team_lead' || role === 'employee') {
      whereClause = "WHERE e.status = 'active' AND ss.employee_id = $1";
      params = [req.user.employee_id];
    }

    const result = await db.query(`
      SELECT ss.*,
        CONCAT(e.first_name, ' ', e.last_name) as employee_name,
        e.employee_id as emp_code, e.avatar_url,
        d.name as department_name,
        p.title as position_title
      FROM salary_structures ss
      JOIN employees e ON e.id = ss.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      ${whereClause}
      ORDER BY ss.effective_date DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET salary for employee
router.get('/employee/:employee_id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM salary_structures WHERE employee_id = $1 ORDER BY effective_date DESC',
      [req.params.employee_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST create/update salary
router.post('/', async (req, res) => {
  if (!['super_admin', 'hr_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  try {
    const {
      employee_id, basic_salary, currency, pay_frequency, effective_date, end_date,
      housing_allowance, transport_allowance, meal_allowance, medical_allowance,
      mobile_allowance, other_allowances, tax_deduction, pension_deduction,
      health_insurance, other_deductions, notes,
    } = req.body;

    // End previous salary structure
    await db.query(
      'UPDATE salary_structures SET end_date = $1 WHERE employee_id = $2 AND end_date IS NULL',
      [new Date(effective_date).toISOString().split('T')[0], employee_id]
    );

    const result = await db.query(`
      INSERT INTO salary_structures (
        employee_id, basic_salary, currency, pay_frequency, effective_date, end_date,
        housing_allowance, transport_allowance, meal_allowance, medical_allowance,
        mobile_allowance, other_allowances, tax_deduction, pension_deduction,
        health_insurance, other_deductions, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *
    `, [
      employee_id, basic_salary, currency || 'USD', pay_frequency || 'monthly',
      effective_date, end_date || null,
      housing_allowance || 0, transport_allowance || 0, meal_allowance || 0,
      medical_allowance || 0, mobile_allowance || 0, other_allowances || 0,
      tax_deduction || 0, pension_deduction || 0, health_insurance || 0,
      other_deductions || 0, notes, req.user.id,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update salary (admin only)
router.put('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const {
      basic_salary, housing_allowance, transport_allowance, meal_allowance,
      medical_allowance, mobile_allowance, other_allowances,
      tax_deduction, pension_deduction, health_insurance, other_deductions, notes,
    } = req.body;

    const result = await db.query(`
      UPDATE salary_structures SET
        basic_salary=$1, housing_allowance=$2, transport_allowance=$3, meal_allowance=$4,
        medical_allowance=$5, mobile_allowance=$6, other_allowances=$7,
        tax_deduction=$8, pension_deduction=$9, health_insurance=$10, other_deductions=$11,
        notes=$12, updated_at=NOW()
      WHERE id=$13 RETURNING *
    `, [
      basic_salary, housing_allowance || 0, transport_allowance || 0, meal_allowance || 0,
      medical_allowance || 0, mobile_allowance || 0, other_allowances || 0,
      tax_deduction || 0, pension_deduction || 0, health_insurance || 0,
      other_deductions || 0, notes, req.params.id,
    ]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
