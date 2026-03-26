const express = require('express');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const multer = require('multer');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Multer — memory storage for Excel uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── SAMPLE TEMPLATE columns (order matters for import) ───
const TEMPLATE_COLUMNS = [
  'first_name', 'last_name', 'middle_name', 'date_of_birth', 'gender', 'marital_status',
  'nationality', 'national_id', 'passport_number', 'personal_email', 'work_email',
  'phone_primary', 'phone_secondary', 'address_line1', 'address_line2', 'city', 'state',
  'country', 'postal_code', 'emergency_contact_name', 'emergency_contact_relation',
  'emergency_contact_phone', 'department_name', 'position_title', 'employment_type',
  'status', 'hire_date', 'confirmation_date', 'work_location', 'bio',
  'bank_account_number', 'bank_name', 'iban', 'account_holder_name', 'insurance_card_number',
];

// GET /api/employees/sample-template — download Excel template with sample row
router.get('/sample-template', authorize('super_admin', 'hr_admin'), (_req, res) => {
  try {
    const sampleRow = {
      first_name: 'John', last_name: 'Doe', middle_name: '', date_of_birth: '1990-01-15',
      gender: 'male', marital_status: 'single', nationality: 'American', national_id: '12345678',
      passport_number: 'P1234567', personal_email: 'john.personal@email.com',
      work_email: 'john.doe@company.com', phone_primary: '+1234567890', phone_secondary: '',
      address_line1: '123 Main St', address_line2: 'Apt 4B', city: 'New York', state: 'NY',
      country: 'USA', postal_code: '10001', emergency_contact_name: 'Jane Doe',
      emergency_contact_relation: 'Spouse', emergency_contact_phone: '+1987654321',
      department_name: 'Engineering', position_title: 'Software Engineer',
      employment_type: 'full_time', status: 'active', hire_date: '2024-03-01',
      confirmation_date: '2024-06-01', work_location: 'Head Office', bio: '',
      bank_account_number: '1234567890', bank_name: 'ABC Bank', iban: 'US12345678901234',
      account_holder_name: 'John Doe', insurance_card_number: 'INS-001',
    };
    const ws = XLSX.utils.json_to_sheet([sampleRow], { header: TEMPLATE_COLUMNS });
    // Set column widths
    ws['!cols'] = TEMPLATE_COLUMNS.map(c => ({ wch: Math.max(c.length + 2, 18) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=employee_import_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

// POST /api/employees/bulk-import — upload Excel and create employees
router.post('/bulk-import', authorize('super_admin', 'hr_admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'Excel file is empty' });

    // Validate required columns
    const first = rows[0];
    for (const col of ['first_name', 'last_name', 'hire_date']) {
      if (!(col in first)) return res.status(400).json({ error: `Missing required column: ${col}` });
    }

    // Pre-load departments & positions for name→id mapping
    const deptRows = (await db.query('SELECT id, name FROM departments')).rows;
    const posRows = (await db.query('SELECT id, title FROM positions')).rows;
    const deptMap = {};
    deptRows.forEach(d => { deptMap[d.name.toLowerCase()] = d.id; });
    const posMap = {};
    posRows.forEach(p => { posMap[p.title.toLowerCase()] = p.id; });

    // Get current employee count for ID generation
    const countRes = await db.query('SELECT COUNT(*) FROM employees');
    let empCount = parseInt(countRes.rows[0].count);

    const results = { created: 0, errors: [] };
    const leaveTypes = (await db.query('SELECT id, days_allowed FROM leave_types WHERE is_active = TRUE')).rows;
    const year = new Date().getFullYear();

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2; // Excel row (1-indexed + header)
      try {
        if (!row.first_name || !row.last_name || !row.hire_date) {
          results.errors.push({ row: rowNum, error: 'Missing first_name, last_name, or hire_date' });
          continue;
        }

        // Check duplicate work_email
        if (row.work_email) {
          const dup = await db.query('SELECT id FROM users WHERE email = $1', [row.work_email]);
          if (dup.rows.length) { results.errors.push({ row: rowNum, error: `Email ${row.work_email} already exists` }); continue; }
        }

        const email = row.work_email || row.personal_email;
        if (!email) { results.errors.push({ row: rowNum, error: 'Either work_email or personal_email is required' }); continue; }

        // Map department/position names to IDs
        const department_id = row.department_name ? (deptMap[row.department_name.toLowerCase()] || null) : null;
        const position_id = row.position_title ? (posMap[row.position_title.toLowerCase()] || null) : null;

        empCount++;
        const employee_id = `EMP${String(empCount).padStart(4, '0')}`;
        const tempPassword = 'Welcome@123';
        const hash = await bcrypt.hash(tempPassword, 10);

        // Create user
        const userRes = await db.query(
          'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
          [email, hash, 'employee']
        );

        // Format hire_date
        let hire_date = row.hire_date;
        if (typeof hire_date === 'number') {
          // Excel serial date number
          const d = XLSX.SSF.parse_date_code(hire_date);
          hire_date = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        }
        let confirmation_date = row.confirmation_date || null;
        if (typeof confirmation_date === 'number') {
          const d = XLSX.SSF.parse_date_code(confirmation_date);
          confirmation_date = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        }
        let date_of_birth = row.date_of_birth || null;
        if (typeof date_of_birth === 'number') {
          const d = XLSX.SSF.parse_date_code(date_of_birth);
          date_of_birth = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        }

        // Insert employee
        const empRes = await db.query(`
          INSERT INTO employees (
            user_id, employee_id, first_name, last_name, middle_name, date_of_birth, gender,
            marital_status, nationality, national_id, passport_number, personal_email, work_email,
            phone_primary, phone_secondary, address_line1, address_line2, city, state, country, postal_code,
            emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
            department_id, position_id, employment_type, status, hire_date, confirmation_date,
            work_location, bio,
            bank_account_number, bank_name, iban, account_holder_name, insurance_card_number,
            created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
                    $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38)
          RETURNING id
        `, [
          userRes.rows[0].id, employee_id, row.first_name, row.last_name, row.middle_name || null,
          date_of_birth, row.gender || null, row.marital_status || null, row.nationality || null,
          row.national_id || null, row.passport_number || null, row.personal_email || null,
          row.work_email || null, row.phone_primary || null, row.phone_secondary || null,
          row.address_line1 || null, row.address_line2 || null, row.city || null, row.state || null,
          row.country || null, row.postal_code || null,
          row.emergency_contact_name || null, row.emergency_contact_relation || null,
          row.emergency_contact_phone || null,
          department_id, position_id, row.employment_type || 'full_time', row.status || 'active',
          hire_date, confirmation_date, row.work_location || null, row.bio || null,
          row.bank_account_number || null, row.bank_name || null, row.iban || null,
          row.account_holder_name || null, row.insurance_card_number || null,
          req.user.id,
        ]);

        // Update department headcount
        if (department_id) {
          await db.query('UPDATE departments SET headcount = headcount + 1 WHERE id = $1', [department_id]);
        }

        // Create leave balances
        for (const lt of leaveTypes) {
          await db.query(
            'INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated_days) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
            [empRes.rows[0].id, lt.id, year, lt.days_allowed]
          );
        }

        results.created++;
      } catch (rowErr) {
        results.errors.push({ row: rowNum, error: rowErr.message });
      }
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process file: ' + err.message });
  }
});

// GET /api/employees/export — download all employees as Excel
router.get('/export', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT e.employee_id, e.first_name, e.last_name, e.middle_name,
        TO_CHAR(e.date_of_birth, 'YYYY-MM-DD') as date_of_birth, e.gender, e.marital_status,
        e.nationality, e.national_id, e.passport_number, e.personal_email, e.work_email,
        e.phone_primary, e.phone_secondary, e.address_line1, e.address_line2, e.city, e.state,
        e.country, e.postal_code, e.emergency_contact_name, e.emergency_contact_relation,
        e.emergency_contact_phone, d.name as department_name, p.title as position_title,
        CONCAT(m.first_name, ' ', m.last_name) as manager_name,
        e.employment_type, e.status, TO_CHAR(e.hire_date, 'YYYY-MM-DD') as hire_date,
        TO_CHAR(e.confirmation_date, 'YYYY-MM-DD') as confirmation_date,
        e.work_location, e.bio,
        e.bank_account_number, e.bank_name, e.iban, e.account_holder_name, e.insurance_card_number,
        TO_CHAR(e.created_at, 'YYYY-MM-DD') as created_at
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN employees m ON m.id = e.manager_id
      ORDER BY e.first_name, e.last_name
    `);

    // Mask banking for non-super-admin
    if (req.user.role !== 'super_admin') {
      result.rows.forEach(r => {
        if (r.bank_account_number) r.bank_account_number = '•••• ' + r.bank_account_number.slice(-4);
        if (r.iban) r.iban = r.iban.slice(0, 4) + ' •••• ' + r.iban.slice(-4);
      });
    }

    const ws = XLSX.utils.json_to_sheet(result.rows);
    const cols = Object.keys(result.rows[0] || {});
    ws['!cols'] = cols.map(c => ({ wch: Math.max(c.length + 2, 16) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=employees_data.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export' });
  }
});

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
    if (isBankingUpdate && !['super_admin', 'hr_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only Super Admin and HR can update banking information' });
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
