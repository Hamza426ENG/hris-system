const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const { search, department, status, employment_type, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (search) {
      where.push(`(e.first_name ILIKE $${i} OR e.last_name ILIKE $${i} OR e.employee_id ILIKE $${i} OR e.work_email ILIKE $${i})`);
      params.push(`%${search}%`);
      i++;
    }
    if (department) { where.push(`e.department_id = $${i++}`); params.push(department); }
    if (status) { where.push(`e.status = $${i++}`); params.push(status); }
    if (employment_type) { where.push(`e.employment_type = $${i++}`); params.push(employment_type); }

    // Role-based filtering
    const role = req.user.role;
    if (role === 'team_lead') {
      where.push(`(e.manager_id = $${i} OR e.id = $${i})`);
      params.push(req.user.employee_id);
      i++;
    } else if (role === 'employee') {
      where.push(`e.id = $${i++}`);
      params.push(req.user.employee_id);
    }

    const query = `
      SELECT e.*,
        d.name as department_name, d.code as department_code,
        p.title as position_title, p.grade,
        CONCAT(m.first_name, ' ', m.last_name) as manager_name,
        m.id as manager_id
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN employees m ON m.id = e.manager_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.first_name, e.last_name
      LIMIT $${i} OFFSET $${i + 1}
    `;
    params.push(limit, offset);

    const countQuery = `SELECT COUNT(*) FROM employees e WHERE ${where.join(' AND ')}`;
    const [result, count] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, -2)),
    ]);

    res.json({
      data: result.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT e.*,
        d.name as department_name, d.code as department_code,
        p.title as position_title, p.grade, p.level,
        CONCAT(m.first_name, ' ', m.last_name) as manager_name,
        m.employee_id as manager_employee_id
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN employees m ON m.id = e.manager_id
      WHERE e.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/employees
router.post('/', async (req, res) => {
  try {
    const {
      first_name, last_name, middle_name, date_of_birth, gender, marital_status,
      nationality, national_id, personal_email, work_email, phone_primary, phone_secondary,
      address_line1, address_line2, city, state, country, postal_code,
      emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
      department_id, position_id, manager_id, employment_type, status, hire_date,
      confirmation_date, work_location, bio, skills, languages,
    } = req.body;

    // Generate employee ID
    const countResult = await db.query('SELECT COUNT(*) FROM employees');
    const empNum = String(parseInt(countResult.rows[0].count) + 1).padStart(4, '0');
    const employee_id = `EMP${empNum}`;

    // Create user account
    const tempPassword = 'Welcome@123';
    const hash = await bcrypt.hash(tempPassword, 10);
    const userResult = await db.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [work_email || personal_email, hash, 'employee']
    );

    const empResult = await db.query(`
      INSERT INTO employees (
        user_id, employee_id, first_name, last_name, middle_name, date_of_birth, gender,
        marital_status, nationality, national_id, personal_email, work_email, phone_primary,
        phone_secondary, address_line1, address_line2, city, state, country, postal_code,
        emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
        department_id, position_id, manager_id, employment_type, status, hire_date,
        confirmation_date, work_location, bio, skills, languages, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
      RETURNING *
    `, [
      userResult.rows[0].id, employee_id, first_name, last_name, middle_name, date_of_birth, gender,
      marital_status, nationality, national_id, personal_email, work_email, phone_primary,
      phone_secondary, address_line1, address_line2, city, state, country, postal_code,
      emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
      department_id, position_id, manager_id || null, employment_type || 'full_time',
      status || 'active', hire_date, confirmation_date || null, work_location,
      bio, skills || [], languages || [], req.user.id,
    ]);

    // Update department headcount
    if (department_id) {
      await db.query('UPDATE departments SET headcount = headcount + 1 WHERE id = $1', [department_id]);
    }

    // Create leave balances for current year
    const year = new Date().getFullYear();
    const leaveTypes = await db.query('SELECT id, days_allowed FROM leave_types WHERE is_active = TRUE');
    for (const lt of leaveTypes.rows) {
      await db.query(
        'INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated_days) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [empResult.rows[0].id, lt.id, year, lt.days_allowed]
      );
    }

    res.status(201).json({ ...empResult.rows[0], tempPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employees/:id
router.put('/:id', async (req, res) => {
  try {
    const {
      first_name, last_name, middle_name, date_of_birth, gender, marital_status,
      nationality, national_id, personal_email, work_email, phone_primary, phone_secondary,
      address_line1, address_line2, city, state, country, postal_code,
      emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
      department_id, position_id, manager_id, employment_type, status, hire_date,
      confirmation_date, termination_date, termination_reason, work_location, bio, skills, languages,
    } = req.body;

    const result = await db.query(`
      UPDATE employees SET
        first_name=$1, last_name=$2, middle_name=$3, date_of_birth=$4, gender=$5,
        marital_status=$6, nationality=$7, national_id=$8, personal_email=$9, work_email=$10,
        phone_primary=$11, phone_secondary=$12, address_line1=$13, address_line2=$14,
        city=$15, state=$16, country=$17, postal_code=$18,
        emergency_contact_name=$19, emergency_contact_relation=$20, emergency_contact_phone=$21,
        department_id=$22, position_id=$23, manager_id=$24, employment_type=$25, status=$26,
        hire_date=$27, confirmation_date=$28, termination_date=$29, termination_reason=$30,
        work_location=$31, bio=$32, skills=$33, languages=$34, updated_at=NOW()
      WHERE id=$35 RETURNING *
    `, [
      first_name, last_name, middle_name, date_of_birth, gender, marital_status,
      nationality, national_id, personal_email, work_email, phone_primary, phone_secondary,
      address_line1, address_line2, city, state, country, postal_code,
      emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
      department_id, position_id, manager_id || null, employment_type, status, hire_date,
      confirmation_date || null, termination_date || null, termination_reason,
      work_location, bio, skills || [], languages || [], req.params.id,
    ]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query("UPDATE employees SET status = 'terminated', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ message: 'Employee deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/employees/:id/avatar
router.put('/:id/avatar', async (req, res) => {
  try {
    const { avatar_url } = req.body;
    if (!avatar_url) return res.status(400).json({ error: 'avatar_url required' });
    const result = await db.query(
      'UPDATE employees SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id, avatar_url',
      [avatar_url, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/employees/:id/leaves
router.get('/:id/leaves', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT lr.*, lt.name as leave_type_name, lt.color, lt.is_paid,
        CONCAT(e.first_name, ' ', e.last_name) as reviewer_name
      FROM leave_requests lr
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      LEFT JOIN employees e ON e.id = lr.reviewed_by
      WHERE lr.employee_id = $1
      ORDER BY lr.created_at DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/employees/:id/salary
router.get('/:id/salary', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM salary_structures WHERE employee_id = $1 ORDER BY effective_date DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/employees/:id/payroll
router.get('/:id/payroll', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT pi.*, pr.period_start, pr.period_end, pr.pay_date, pr.month, pr.year, pr.status as run_status
      FROM payroll_items pi
      JOIN payroll_runs pr ON pr.id = pi.payroll_run_id
      WHERE pi.employee_id = $1
      ORDER BY pr.pay_date DESC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
