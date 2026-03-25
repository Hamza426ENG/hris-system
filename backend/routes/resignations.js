/**
 * Resignation / Offboarding Module
 *
 * GET    /resignations                     – list all resignations (admin) or own (employee)
 * GET    /resignations/:id                 – single resignation detail
 * POST   /resignations                     – create resignation (HR/admin on behalf of employee)
 * PUT    /resignations/:id                 – update details / clearance flags
 * PUT    /resignations/:id/approve         – HR approves resignation
 * PUT    /resignations/:id/reject          – HR rejects resignation
 * PUT    /resignations/:id/complete        – mark offboarding complete
 * PUT    /resignations/:id/withdraw        – withdraw resignation (before approval)
 * DELETE /resignations/:id                 – delete draft resignation (admin only)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

router.use(authenticate);

const ADMIN_ROLES = ['super_admin', 'hr_admin'];
const LEAD_ROLES  = ['super_admin', 'hr_admin', 'hr_manager', 'manager'];

function isAdmin(role) { return ADMIN_ROLES.includes(role); }
function isLead(role)  { return LEAD_ROLES.includes(role); }

/**
 * Calculate last working day = resignation_date + notice_period_days (skipping nothing for now).
 */
function calcLastWorkingDay(resignationDate, noticeDays) {
  const d = new Date(resignationDate);
  d.setDate(d.getDate() + parseInt(noticeDays || 30));
  return d.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /resignations
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { role, employee_id } = req.user;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['1=1'];
    const params = [];
    let i = 1;

    if (!isLead(role)) {
      // Employees see only their own
      where.push(`r.employee_id = $${i++}`);
      params.push(employee_id);
    }

    if (status) { where.push(`r.status = $${i++}`); params.push(status); }

    const query = `
      SELECT r.*,
        e.first_name, e.last_name, e.employee_id AS emp_code, e.avatar_url,
        d.name AS department_name,
        p.title AS position_title,
        CONCAT(ab.first_name, ' ', ab.last_name) AS approved_by_name
      FROM resignations r
      JOIN employees e ON e.id = r.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN positions p ON p.id = e.position_id
      LEFT JOIN employees ab ON ab.user_id = r.approved_by
      WHERE ${where.join(' AND ')}
      ORDER BY r.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    params.push(parseInt(limit), offset);

    const countQuery = `SELECT COUNT(*) FROM resignations r WHERE ${where.join(' AND ')}`;
    const [data, count] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, params.slice(0, -2)),
    ]);

    res.json({ data: data.rows, total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('GET /resignations error:', err);
    res.status(500).json({ error: 'Failed to fetch resignations' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /resignations/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*,
         e.first_name, e.last_name, e.employee_id AS emp_code, e.avatar_url,
         e.hire_date, e.work_email, e.phone_primary,
         d.name AS department_name,
         p.title AS position_title,
         CONCAT(ab.first_name, ' ', ab.last_name) AS approved_by_name,
         CONCAT(cb.first_name, ' ', cb.last_name) AS created_by_name
       FROM resignations r
       JOIN employees e ON e.id = r.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN positions p ON p.id = e.position_id
       LEFT JOIN employees ab ON ab.user_id = r.approved_by
       LEFT JOIN employees cb ON cb.user_id = r.created_by
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Resignation not found' });
    const resignation = result.rows[0];

    // Access control: employee can only see their own
    if (!isLead(req.user.role) && req.user.employee_id !== resignation.employee_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Compute employment duration
    if (resignation.hire_date) {
      const start = new Date(resignation.hire_date);
      const end   = resignation.last_working_day ? new Date(resignation.last_working_day) : new Date();
      const diffMs = end - start;
      const years  = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));
      const months = Math.floor((diffMs % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
      resignation.employment_duration = `${years}y ${months}m`;
    }

    res.json({ data: resignation });
  } catch (err) {
    console.error('GET /resignations/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch resignation' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /resignations
// Create a resignation record (HR/admin creates on behalf of employee)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authorize('super_admin', 'hr_admin', 'hr_manager'), async (req, res) => {
  try {
    const {
      employee_id,
      resignation_date,
      notice_period_days = 30,
      reason,
      reason_details,
      final_settlement_amount,
      exit_interview_scheduled,
      exit_interview_date,
    } = req.body;

    if (!employee_id || !resignation_date) {
      return res.status(400).json({ error: 'employee_id and resignation_date are required' });
    }

    // Verify employee exists and is active
    const empRes = await db.query(
      `SELECT id, status, first_name, last_name FROM employees WHERE id = $1`,
      [employee_id]
    );
    if (!empRes.rows.length) return res.status(404).json({ error: 'Employee not found' });
    if (!['active', 'probation', 'on_leave'].includes(empRes.rows[0].status)) {
      return res.status(400).json({ error: 'Employee is not in an active status' });
    }

    // Check no pending resignation already exists
    const existing = await db.query(
      `SELECT id FROM resignations WHERE employee_id = $1 AND status IN ('pending', 'approved')`,
      [employee_id]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'A pending or approved resignation already exists for this employee' });
    }

    const lastWorkingDay = calcLastWorkingDay(resignation_date, notice_period_days);

    const result = await db.query(
      `INSERT INTO resignations (
         employee_id, resignation_date, last_working_day, notice_period_days,
         reason, reason_details, final_settlement_amount,
         exit_interview_scheduled, exit_interview_date, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        employee_id, resignation_date, lastWorkingDay, notice_period_days,
        reason || null, reason_details || null,
        final_settlement_amount || null,
        exit_interview_scheduled || false,
        exit_interview_date || null,
        req.user.id,
      ]
    );

    await logAction({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'resignation',
      entityId: result.rows[0].id,
      newValue: result.rows[0],
      req,
    });

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('POST /resignations error:', err);
    res.status(500).json({ error: err.message || 'Failed to create resignation' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /resignations/:id
// Update resignation details / clearance flags
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const resRes = await db.query('SELECT * FROM resignations WHERE id = $1', [req.params.id]);
    if (!resRes.rows.length) return res.status(404).json({ error: 'Resignation not found' });
    const current = resRes.rows[0];

    if (!isLead(req.user.role)) {
      return res.status(403).json({ error: 'Only HR/Managers can update resignations' });
    }

    const {
      resignation_date, notice_period_days, reason, reason_details,
      final_settlement_amount, exit_interview_scheduled, exit_interview_date, exit_interview_notes,
      equipment_returned, clearance_finance, clearance_it, clearance_hr, clearance_operations, clearance_admin,
    } = req.body;

    const newResignationDate   = resignation_date   || current.resignation_date;
    const newNoticePeriodDays  = notice_period_days !== undefined ? notice_period_days : current.notice_period_days;
    const newLastWorkingDay    = calcLastWorkingDay(newResignationDate, newNoticePeriodDays);

    const result = await db.query(
      `UPDATE resignations SET
         resignation_date        = $1,
         last_working_day        = $2,
         notice_period_days      = $3,
         reason                  = COALESCE($4, reason),
         reason_details          = COALESCE($5, reason_details),
         final_settlement_amount = COALESCE($6, final_settlement_amount),
         exit_interview_scheduled = COALESCE($7, exit_interview_scheduled),
         exit_interview_date     = COALESCE($8, exit_interview_date),
         exit_interview_notes    = COALESCE($9, exit_interview_notes),
         equipment_returned      = COALESCE($10, equipment_returned),
         clearance_finance       = COALESCE($11, clearance_finance),
         clearance_it            = COALESCE($12, clearance_it),
         clearance_hr            = COALESCE($13, clearance_hr),
         clearance_operations    = COALESCE($14, clearance_operations),
         clearance_admin         = COALESCE($15, clearance_admin),
         updated_at              = NOW()
       WHERE id = $16
       RETURNING *`,
      [
        newResignationDate, newLastWorkingDay, newNoticePeriodDays,
        reason || null, reason_details || null, final_settlement_amount || null,
        exit_interview_scheduled ?? null, exit_interview_date || null, exit_interview_notes || null,
        equipment_returned ?? null,
        clearance_finance ?? null, clearance_it ?? null, clearance_hr ?? null,
        clearance_operations ?? null, clearance_admin ?? null,
        req.params.id,
      ]
    );

    await logAction({
      userId: req.user.id, action: 'UPDATE', entity: 'resignation',
      entityId: req.params.id, oldValue: current, newValue: result.rows[0], req,
    });

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('PUT /resignations/:id error:', err);
    res.status(500).json({ error: 'Failed to update resignation' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /resignations/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/approve', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const resRes = await db.query('SELECT * FROM resignations WHERE id = $1', [req.params.id]);
    if (!resRes.rows.length) return res.status(404).json({ error: 'Resignation not found' });
    if (resRes.rows[0].status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve a resignation with status: ${resRes.rows[0].status}` });
    }

    const result = await db.query(
      `UPDATE resignations
       SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [req.user.id, req.params.id]
    );

    // Mark employee status as inactive after last working day (set termination_date)
    await db.query(
      `UPDATE employees SET termination_date = $1, updated_at = NOW() WHERE id = $2`,
      [result.rows[0].last_working_day, result.rows[0].employee_id]
    );

    await logAction({
      userId: req.user.id, action: 'APPROVE', entity: 'resignation',
      entityId: req.params.id, newValue: { status: 'approved' }, req,
    });

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('PUT /resignations/:id/approve error:', err);
    res.status(500).json({ error: 'Failed to approve resignation' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /resignations/:id/reject
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/reject', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const resRes = await db.query('SELECT * FROM resignations WHERE id = $1', [req.params.id]);
    if (!resRes.rows.length) return res.status(404).json({ error: 'Resignation not found' });
    if (!['pending', 'approved'].includes(resRes.rows[0].status)) {
      return res.status(400).json({ error: `Cannot reject a resignation with status: ${resRes.rows[0].status}` });
    }

    const { rejection_reason } = req.body;
    const result = await db.query(
      `UPDATE resignations
       SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [rejection_reason || null, req.params.id]
    );

    // Clear termination date if it was set during approval
    await db.query(
      `UPDATE employees SET termination_date = NULL, updated_at = NOW() WHERE id = $1`,
      [result.rows[0].employee_id]
    );

    await logAction({
      userId: req.user.id, action: 'REJECT', entity: 'resignation',
      entityId: req.params.id, newValue: { status: 'rejected', rejection_reason }, req,
    });

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('PUT /resignations/:id/reject error:', err);
    res.status(500).json({ error: 'Failed to reject resignation' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /resignations/:id/complete
// Mark offboarding as fully complete — sets employee status to 'terminated'
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/complete', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const resRes = await db.query('SELECT * FROM resignations WHERE id = $1', [req.params.id]);
    if (!resRes.rows.length) return res.status(404).json({ error: 'Resignation not found' });
    if (resRes.rows[0].status !== 'approved') {
      return res.status(400).json({ error: 'Only approved resignations can be completed' });
    }

    const result = await db.query(
      `UPDATE resignations
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    // Mark employee as terminated
    await db.query(
      `UPDATE employees
       SET status = 'terminated', termination_date = $1, termination_reason = $2, updated_at = NOW()
       WHERE id = $3`,
      [
        result.rows[0].last_working_day,
        result.rows[0].reason || 'Resignation',
        result.rows[0].employee_id,
      ]
    );

    await logAction({
      userId: req.user.id, action: 'UPDATE', entity: 'resignation',
      entityId: req.params.id, newValue: { status: 'completed' }, req,
    });

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('PUT /resignations/:id/complete error:', err);
    res.status(500).json({ error: 'Failed to complete resignation' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /resignations/:id/withdraw
// Employee or HR withdraws before approval
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/withdraw', async (req, res) => {
  try {
    const resRes = await db.query('SELECT * FROM resignations WHERE id = $1', [req.params.id]);
    if (!resRes.rows.length) return res.status(404).json({ error: 'Resignation not found' });
    const current = resRes.rows[0];

    // Only HR admin or the employee themselves can withdraw
    if (!isAdmin(req.user.role) && req.user.employee_id !== current.employee_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (current.status !== 'pending') {
      return res.status(400).json({ error: `Only pending resignations can be withdrawn` });
    }

    const result = await db.query(
      `UPDATE resignations SET status = 'withdrawn', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );

    // Clear termination date
    await db.query(
      `UPDATE employees SET termination_date = NULL, updated_at = NOW() WHERE id = $1`,
      [current.employee_id]
    );

    await logAction({
      userId: req.user.id, action: 'UPDATE', entity: 'resignation',
      entityId: req.params.id, newValue: { status: 'withdrawn' }, req,
    });

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('PUT /resignations/:id/withdraw error:', err);
    res.status(500).json({ error: 'Failed to withdraw resignation' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /resignations/:id  (super_admin only — draft/pending only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', authorize('super_admin'), async (req, res) => {
  try {
    const resRes = await db.query('SELECT * FROM resignations WHERE id = $1', [req.params.id]);
    if (!resRes.rows.length) return res.status(404).json({ error: 'Resignation not found' });
    if (!['pending', 'withdrawn', 'rejected'].includes(resRes.rows[0].status)) {
      return res.status(400).json({ error: 'Only pending/withdrawn/rejected resignations can be deleted' });
    }

    await db.query('DELETE FROM resignations WHERE id = $1', [req.params.id]);
    res.json({ message: 'Resignation deleted' });
  } catch (err) {
    console.error('DELETE /resignations/:id error:', err);
    res.status(500).json({ error: 'Failed to delete resignation' });
  }
});

module.exports = router;
