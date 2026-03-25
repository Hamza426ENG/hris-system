const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const { search, department, status, employment_type, view: viewParam, active_filter, page = 1, limit = 50 } = req.query;
    const view = viewParam || 'active';
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

    // View-based filtering: active vs archived
    if (view === 'archived') {
      where.push(`e.status IN ('terminated', 'inactive')`);
    } else if (view === 'active') {
      where.push(`e.status NOT IN ('terminated', 'inactive')`);
    }

    // Sub-filters within active view
    if (active_filter === 'probation') {
      where.push(`e.status = 'probation'`);
    } else if (active_filter === 'present') {
      where.push(`EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.employee_id = e.id AND ar.date = CURRENT_DATE AND ar.status = 'present')`);
    } else if (active_filter === 'on_leave') {
      where.push(`EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.employee_id = e.id AND lr.status = 'approved' AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date)`);
    }

    if (status) { where.push(`e.status = $${i++}`); params.push(status); }
    if (employment_type) { where.push(`e.employment_type = $${i++}`); params.push(employment_type); }

    // Role-based filtering
    // - team_lead: sees direct reports and self
    // - manager: sees full employee list (senior enough to have company-wide visibility)
    // - employee: sees only their own record
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

    const employee = result.rows[0];

    // Fetch latest performance record
    const perfResult = await db.query(`
      SELECT * FROM performance_records
      WHERE employee_id = $1
      ORDER BY period_end DESC
      LIMIT 1
    `, [req.params.id]);

    // Mask sensitive banking fields for non-super-admin viewers
    // super_admin sees full data; everyone else sees masked account/IBAN
    if (req.user.role !== 'super_admin') {
      if (employee.bank_account_number) {
        employee.bank_account_number = '•••• ' + employee.bank_account_number.slice(-4);
      }
      if (employee.iban) {
        employee.iban = employee.iban.slice(0, 4) + ' •••• •••• ' + employee.iban.slice(-4);
      }
    }

    // Add Cache-Control header to prevent StrictMode double-calls
    res.set('Cache-Control', 'private, max-age=10');

    res.json({
      ...employee,
      performance: perfResult.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/employees (admin only)
router.post('/', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const {
      first_name, last_name, middle_name, date_of_birth, gender, marital_status,
      nationality, national_id, passport_number, personal_email, work_email, phone_primary, phone_secondary,
      address_line1, address_line2, city, state, country, postal_code,
      emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
      department_id, position_id, manager_id, employment_type, status, hire_date,
      confirmation_date, work_location, bio, skills, languages,
      bank_account_number, bank_name, iban, account_holder_name, insurance_card_number,
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
        marital_status, nationality, national_id, passport_number, personal_email, work_email, phone_primary,
        phone_secondary, address_line1, address_line2, city, state, country, postal_code,
        emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
        department_id, position_id, manager_id, employment_type, status, hire_date,
        confirmation_date, work_location, bio, skills, languages,
        bank_account_number, bank_name, iban, account_holder_name, insurance_card_number, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41)
      RETURNING *
    `, [
      userResult.rows[0].id, employee_id, first_name, last_name, middle_name, date_of_birth, gender,
      marital_status, nationality, national_id, passport_number || null, personal_email, work_email, phone_primary,
      phone_secondary, address_line1, address_line2, city, state, country, postal_code,
      emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
      department_id, position_id, manager_id || null, employment_type || 'full_time',
      status || 'active', hire_date, confirmation_date || null, work_location,
      bio, skills || [], languages || [],
      bank_account_number || null, bank_name || null, iban || null, account_holder_name || null,
      insurance_card_number || null, req.user.id,
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

// PUT /api/employees/:id (admin or self)
router.put('/:id', async (req, res) => {
  try {
    // Allow admins or employees updating their own info
    if (!['super_admin', 'hr_admin'].includes(req.user.role) && req.user.employee_id !== req.params.id) {
      return res.status(403).json({ error: 'You can only update your own profile' });
    }

    const {
      first_name, last_name, middle_name, date_of_birth, gender, marital_status,
      nationality, national_id, passport_number, personal_email, work_email, phone_primary, phone_secondary,
      address_line1, address_line2, city, state, country, postal_code,
      emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
      department_id, position_id, manager_id, employment_type, status, hire_date,
      confirmation_date, termination_date, termination_reason, work_location, bio, skills, languages,
      bank_account_number, bank_name, iban, account_holder_name, insurance_card_number,
    } = req.body;

    // Only super_admin can update banking info
    const isBankingUpdate = bank_account_number !== undefined || bank_name !== undefined || iban !== undefined || account_holder_name !== undefined;
    if (isBankingUpdate && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super Admin can update banking information' });
    }

    const result = await db.query(`
      UPDATE employees SET
        first_name=$1, last_name=$2, middle_name=$3, date_of_birth=$4, gender=$5,
        marital_status=$6, nationality=$7, national_id=$8, passport_number=$9,
        personal_email=$10, work_email=$11, phone_primary=$12, phone_secondary=$13,
        address_line1=$14, address_line2=$15, city=$16, state=$17, country=$18, postal_code=$19,
        emergency_contact_name=$20, emergency_contact_relation=$21, emergency_contact_phone=$22,
        department_id=$23, position_id=$24, manager_id=$25, employment_type=$26, status=$27,
        hire_date=$28, confirmation_date=$29, termination_date=$30, termination_reason=$31,
        work_location=$32, bio=$33, skills=$34, languages=$35,
        bank_account_number=COALESCE($36, bank_account_number),
        bank_name=COALESCE($37, bank_name),
        iban=COALESCE($38, iban),
        account_holder_name=COALESCE($39, account_holder_name),
        insurance_card_number=$40, updated_at=NOW()
      WHERE id=$41 RETURNING *
    `, [
      first_name, last_name, middle_name || null, date_of_birth || null, gender || null,
      marital_status || null, nationality || null, national_id || null, passport_number || null,
      personal_email || null, work_email,
      phone_primary || null, phone_secondary || null,
      address_line1 || null, address_line2 || null, city || null, state || null, country || null, postal_code || null,
      emergency_contact_name || null, emergency_contact_relation || null, emergency_contact_phone || null,
      department_id || null, position_id || null, manager_id || null, employment_type, status, hire_date || null,
      confirmation_date || null, termination_date || null, termination_reason || null,
      work_location, bio, skills || [], languages || [],
      isBankingUpdate ? (bank_account_number || null) : null,
      isBankingUpdate ? (bank_name || null) : null,
      isBankingUpdate ? (iban || null) : null,
      isBankingUpdate ? (account_holder_name || null) : null,
      insurance_card_number || null,
      req.params.id,
    ]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id (admin only) — sets status to terminated
router.delete('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    await db.query("UPDATE employees SET status = 'terminated', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ message: 'Employee deactivated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/employees/:id/activate (admin only) — restores status to active
router.patch('/:id/activate', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    await db.query("UPDATE employees SET status = 'active', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ message: 'Employee activated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/employees/:id/avatar
router.put('/:id/avatar', async (req, res) => {
  try {
    if (!['super_admin', 'hr_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only HR and Admin can update employee photos' });
    }
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

// GET /api/employees/:id/salary  — self or admin/HR only
router.get('/:id/salary', async (req, res) => {
  try {
    const isSelfOrAdmin = ['super_admin', 'hr_admin'].includes(req.user.role) || req.user.employee_id === req.params.id;
    if (!isSelfOrAdmin) return res.status(403).json({ error: 'Access denied' });
    const result = await db.query(
      'SELECT * FROM salary_structures WHERE employee_id = $1 ORDER BY effective_date DESC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/employees/:id/payroll  — self or admin/HR only
router.get('/:id/payroll', async (req, res) => {
  try {
    const isSelfOrAdmin = ['super_admin', 'hr_admin'].includes(req.user.role) || req.user.employee_id === req.params.id;
    if (!isSelfOrAdmin) return res.status(403).json({ error: 'Access denied' });
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

// GET /api/employees/:id/resignation  — active or latest resignation for an employee
router.get('/:id/resignation', async (req, res) => {
  try {
    const isSelfOrAdmin = ['super_admin', 'hr_admin', 'hr_manager', 'manager'].includes(req.user.role)
      || req.user.employee_id === req.params.id;
    if (!isSelfOrAdmin) return res.status(403).json({ error: 'Access denied' });

    const result = await db.query(`
      SELECT r.*,
        CONCAT(ab.first_name, ' ', ab.last_name) AS approved_by_name
      FROM resignations r
      LEFT JOIN employees ab ON ab.user_id = r.approved_by
      WHERE r.employee_id = $1
      ORDER BY r.created_at DESC
      LIMIT 1
    `, [req.params.id]);

    res.json({ data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
