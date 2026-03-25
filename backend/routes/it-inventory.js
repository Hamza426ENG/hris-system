const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

// All routes require authentication
router.use(authenticate);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function generateAssetId() {
  const year = new Date().getFullYear();
  const result = await db.query("SELECT nextval('asset_id_seq')");
  return `AST-${year}-${String(result.rows[0].nextval).padStart(4, '0')}`;
}

async function logAssetAudit(assetId, action, performedBy, affectedEmployee, oldValue, newValue, details) {
  try {
    await db.query(
      `INSERT INTO it_asset_audit_log (asset_id, action, performed_by, affected_employee, old_value, new_value, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        assetId,
        action,
        performedBy,
        affectedEmployee || null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        details || null,
      ]
    );
  } catch (err) {
    console.error('IT asset audit log failed:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ASSET REGISTRY (CRUD) ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/it-inventory/assets — List all assets (with filters)
router.get('/assets', async (req, res) => {
  try {
    const { status, category, department_id, location, search, page = 1, limit = 50 } = req.query;
    const role = req.user.role;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['1=1'];
    let params = [];
    let idx = 1;

    if (status) { where.push(`a.status = $${idx}::asset_status`); params.push(status); idx++; }
    if (category) { where.push(`a.category = $${idx}::asset_category`); params.push(category); idx++; }
    if (department_id) { where.push(`a.department_id = $${idx}`); params.push(department_id); idx++; }
    if (location) { where.push(`a.location ILIKE $${idx}`); params.push(`%${location}%`); idx++; }
    if (search) {
      where.push(`(a.name ILIKE $${idx} OR a.asset_id ILIKE $${idx} OR a.serial_number ILIKE $${idx} OR a.brand ILIKE $${idx} OR a.model ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    // Employees can only see their own assigned assets
    if (role === 'employee') {
      where.push(`a.assigned_to = $${idx}`);
      params.push(req.user.employee_id);
      idx++;
    }

    const whereClause = where.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) FROM it_assets a WHERE ${whereClause}`, params
    );

    const result = await db.query(
      `SELECT a.*,
              d.name as department_name,
              e.first_name || ' ' || e.last_name as assigned_to_name,
              e.employee_id as assigned_to_code
       FROM it_assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN employees e ON e.id = a.assigned_to
       WHERE ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      assets: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('List assets error:', err);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// GET /api/it-inventory/assets/:id — Get single asset with full details
router.get('/assets/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*,
              d.name as department_name,
              e.first_name || ' ' || e.last_name as assigned_to_name,
              e.employee_id as assigned_to_code
       FROM it_assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN employees e ON e.id = a.assigned_to
       WHERE a.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Employees can only view their own assets
    if (req.user.role === 'employee' && result.rows[0].assigned_to !== req.user.employee_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Fetch assignment history
    const history = await db.query(
      `SELECT h.*,
              e.first_name || ' ' || e.last_name as employee_name,
              u.email as performed_by_email
       FROM it_assignment_history h
       LEFT JOIN employees e ON e.id = h.employee_id
       LEFT JOIN users u ON u.id = h.performed_by
       WHERE h.asset_id = $1
       ORDER BY h.created_at DESC`,
      [req.params.id]
    );

    // Fetch maintenance history
    const maintenance = await db.query(
      `SELECT m.*, u.email as reported_by_email
       FROM it_maintenance_requests m
       LEFT JOIN users u ON u.id = m.reported_by
       WHERE m.asset_id = $1
       ORDER BY m.created_at DESC`,
      [req.params.id]
    );

    // Fetch audit trail
    const audit = await db.query(
      `SELECT l.*,
              u.email as performed_by_email,
              e.first_name || ' ' || e.last_name as affected_employee_name
       FROM it_asset_audit_log l
       LEFT JOIN users u ON u.id = l.performed_by
       LEFT JOIN employees e ON e.id = l.affected_employee
       WHERE l.asset_id = $1
       ORDER BY l.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );

    res.json({
      ...result.rows[0],
      assignment_history: history.rows,
      maintenance_history: maintenance.rows,
      audit_trail: audit.rows,
    });
  } catch (err) {
    console.error('Get asset error:', err);
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

// POST /api/it-inventory/assets — Create a new asset (IT Admin / HR Admin only)
router.post('/assets', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const {
      name, category, brand, model, serial_number,
      purchase_date, purchase_cost, vendor_name, warranty_expiry,
      condition, location, department_id, notes,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Asset name is required' });

    const asset_id = await generateAssetId();

    const result = await db.query(
      `INSERT INTO it_assets (
        asset_id, name, category, brand, model, serial_number,
        purchase_date, purchase_cost, vendor_name, warranty_expiry,
        condition, location, department_id, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        asset_id, name, category || 'other', brand, model, serial_number,
        purchase_date || null, purchase_cost || null, vendor_name, warranty_expiry || null,
        condition || 'new', location, department_id || null, notes, req.user.id,
      ]
    );

    await logAssetAudit(result.rows[0].id, 'ASSET_CREATED', req.user.id, null, null, result.rows[0], `Asset ${asset_id} created`);
    await logAction({ userId: req.user.id, action: 'CREATE', entity: 'it_asset', entityId: result.rows[0].id, newValue: result.rows[0], req });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create asset error:', err);
    res.status(500).json({ error: 'Failed to create asset' });
  }
});

// PUT /api/it-inventory/assets/:id — Update asset details (IT Admin / HR Admin)
router.put('/assets/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const existing = await db.query('SELECT * FROM it_assets WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });

    const old = existing.rows[0];
    const {
      name, category, brand, model, serial_number,
      purchase_date, purchase_cost, vendor_name, warranty_expiry,
      condition, location, department_id, notes, status,
    } = req.body;

    const result = await db.query(
      `UPDATE it_assets SET
        name = COALESCE($1, name),
        category = COALESCE($2, category),
        brand = COALESCE($3, brand),
        model = COALESCE($4, model),
        serial_number = COALESCE($5, serial_number),
        purchase_date = COALESCE($6, purchase_date),
        purchase_cost = COALESCE($7, purchase_cost),
        vendor_name = COALESCE($8, vendor_name),
        warranty_expiry = COALESCE($9, warranty_expiry),
        condition = COALESCE($10, condition),
        location = COALESCE($11, location),
        department_id = COALESCE($12, department_id),
        notes = COALESCE($13, notes),
        status = COALESCE($14, status),
        updated_at = NOW()
      WHERE id = $15 RETURNING *`,
      [
        name, category, brand, model, serial_number,
        purchase_date, purchase_cost, vendor_name, warranty_expiry,
        condition, location, department_id, notes, status,
        req.params.id,
      ]
    );

    await logAssetAudit(req.params.id, 'DETAILS_UPDATED', req.user.id, null, old, result.rows[0], `Asset ${old.asset_id} updated`);
    await logAction({ userId: req.user.id, action: 'UPDATE', entity: 'it_asset', entityId: req.params.id, oldValue: old, newValue: result.rows[0], req });

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update asset error:', err);
    res.status(500).json({ error: 'Failed to update asset' });
  }
});

// DELETE /api/it-inventory/assets/:id — Delete asset (Super Admin only)
router.delete('/assets/:id', authorize('super_admin'), async (req, res) => {
  try {
    const existing = await db.query('SELECT * FROM it_assets WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });

    await db.query('DELETE FROM it_assets WHERE id = $1', [req.params.id]);

    await logAction({ userId: req.user.id, action: 'DELETE', entity: 'it_asset', entityId: req.params.id, oldValue: existing.rows[0], req, details: `Asset ${existing.rows[0].asset_id} deleted` });

    res.json({ message: 'Asset deleted' });
  } catch (err) {
    console.error('Delete asset error:', err);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── ASSIGNMENT & RETURN ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/it-inventory/assets/:id/assign — Assign asset to employee
router.post('/assets/:id/assign', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { employee_id, expected_return, notes } = req.body;
    if (!employee_id) return res.status(400).json({ error: 'Employee ID is required' });

    const asset = await db.query('SELECT * FROM it_assets WHERE id = $1', [req.params.id]);
    if (asset.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });

    const a = asset.rows[0];
    if (a.status !== 'available' && a.status !== 'reserved') {
      return res.status(400).json({ error: `Cannot assign asset with status "${a.status}". Only available or reserved assets can be assigned.` });
    }

    // Verify employee exists
    const emp = await db.query('SELECT id, first_name, last_name FROM employees WHERE id = $1', [employee_id]);
    if (emp.rows.length === 0) return res.status(400).json({ error: 'Employee not found' });

    const now = new Date().toISOString().split('T')[0];

    // Update asset
    const result = await db.query(
      `UPDATE it_assets SET
        status = 'assigned', assigned_to = $1, assigned_date = $2,
        expected_return = $3, updated_at = NOW()
      WHERE id = $4 RETURNING *`,
      [employee_id, now, expected_return || null, req.params.id]
    );

    // Write assignment history
    await db.query(
      `INSERT INTO it_assignment_history (asset_id, employee_id, action, assigned_date, performed_by, notes)
       VALUES ($1, $2, 'assigned', $3, $4, $5)`,
      [req.params.id, employee_id, now, req.user.id, notes || null]
    );

    await logAssetAudit(req.params.id, 'ASSIGNED', req.user.id, employee_id, { status: a.status }, { status: 'assigned', assigned_to: employee_id }, `Assigned to ${emp.rows[0].first_name} ${emp.rows[0].last_name}`);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Assign asset error:', err);
    res.status(500).json({ error: 'Failed to assign asset' });
  }
});

// POST /api/it-inventory/assets/:id/return — Return asset from employee
router.post('/assets/:id/return', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { condition_on_return, notes } = req.body;

    const asset = await db.query('SELECT * FROM it_assets WHERE id = $1', [req.params.id]);
    if (asset.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });

    const a = asset.rows[0];
    if (a.status !== 'assigned') {
      return res.status(400).json({ error: 'Asset is not currently assigned' });
    }
    if (!a.assigned_to) {
      return res.status(400).json({ error: 'Asset has no current assignee' });
    }

    if (!condition_on_return) {
      return res.status(400).json({ error: 'Condition on return is required' });
    }

    const now = new Date().toISOString().split('T')[0];
    const prevEmployee = a.assigned_to;

    // Update asset
    const result = await db.query(
      `UPDATE it_assets SET
        status = 'available', assigned_to = NULL, assigned_date = NULL,
        expected_return = NULL, condition = $1::asset_condition, updated_at = NOW()
      WHERE id = $2 RETURNING *`,
      [condition_on_return, req.params.id]
    );

    // Write assignment history
    await db.query(
      `INSERT INTO it_assignment_history (asset_id, employee_id, action, returned_date, condition_on_return, performed_by, notes)
       VALUES ($1, $2, 'returned', $3, $4::asset_condition, $5, $6)`,
      [req.params.id, prevEmployee, now, condition_on_return, req.user.id, notes || null]
    );

    await logAssetAudit(req.params.id, 'RETURNED', req.user.id, prevEmployee, { status: 'assigned' }, { status: 'available', condition: condition_on_return }, `Returned by employee`);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Return asset error:', err);
    res.status(500).json({ error: 'Failed to return asset' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── EMPLOYEE ASSET VIEW ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/it-inventory/my-assets — Employee self-service: view own assets
router.get('/my-assets', async (req, res) => {
  try {
    if (!req.user.employee_id) {
      return res.json({ current: [], history: [] });
    }

    const current = await db.query(
      `SELECT a.*, d.name as department_name
       FROM it_assets a
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.assigned_to = $1
       ORDER BY a.assigned_date DESC`,
      [req.user.employee_id]
    );

    const history = await db.query(
      `SELECT h.*, a.asset_id, a.name as asset_name, a.category, a.brand, a.model
       FROM it_assignment_history h
       JOIN it_assets a ON a.id = h.asset_id
       WHERE h.employee_id = $1
       ORDER BY h.created_at DESC`,
      [req.user.employee_id]
    );

    res.json({ current: current.rows, history: history.rows });
  } catch (err) {
    console.error('My assets error:', err);
    res.status(500).json({ error: 'Failed to fetch your assets' });
  }
});

// GET /api/it-inventory/employee/:id/assets — View assets for a specific employee
router.get('/employee/:id/assets', async (req, res) => {
  try {
    const role = req.user.role;

    // Employees can only see their own
    if (role === 'employee' && req.user.employee_id !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const current = await db.query(
      `SELECT a.*, d.name as department_name
       FROM it_assets a
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.assigned_to = $1
       ORDER BY a.assigned_date DESC`,
      [req.params.id]
    );

    const history = await db.query(
      `SELECT h.*, a.asset_id, a.name as asset_name, a.category, a.brand, a.model
       FROM it_assignment_history h
       JOIN it_assets a ON a.id = h.asset_id
       WHERE h.employee_id = $1
       ORDER BY h.created_at DESC`,
      [req.params.id]
    );

    res.json({ current: current.rows, history: history.rows });
  } catch (err) {
    console.error('Employee assets error:', err);
    res.status(500).json({ error: 'Failed to fetch employee assets' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── MAINTENANCE & REPAIR ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/it-inventory/maintenance — List maintenance requests
router.get('/maintenance', async (req, res) => {
  try {
    const { status, type, asset_id } = req.query;

    let where = ['1=1'];
    let params = [];
    let idx = 1;

    if (status) { where.push(`m.status = $${idx}::repair_status`); params.push(status); idx++; }
    if (type) { where.push(`m.type = $${idx}::maintenance_type`); params.push(type); idx++; }
    if (asset_id) { where.push(`m.asset_id = $${idx}`); params.push(asset_id); idx++; }

    // Employees can only see maintenance for their assigned assets
    if (req.user.role === 'employee') {
      where.push(`a.assigned_to = $${idx}`);
      params.push(req.user.employee_id);
      idx++;
    }

    const result = await db.query(
      `SELECT m.*, a.asset_id as asset_code, a.name as asset_name, a.category,
              u.email as reported_by_email
       FROM it_maintenance_requests m
       JOIN it_assets a ON a.id = m.asset_id
       LEFT JOIN users u ON u.id = m.reported_by
       WHERE ${where.join(' AND ')}
       ORDER BY m.created_at DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error('List maintenance error:', err);
    res.status(500).json({ error: 'Failed to fetch maintenance requests' });
  }
});

// POST /api/it-inventory/maintenance — Create maintenance request
router.post('/maintenance', async (req, res) => {
  try {
    const { asset_id, type, description, vendor_name, vendor_contact, vendor_reference, technician_name, notes } = req.body;

    if (!asset_id || !description) {
      return res.status(400).json({ error: 'Asset and description are required' });
    }

    const asset = await db.query('SELECT * FROM it_assets WHERE id = $1', [asset_id]);
    if (asset.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });

    // Employees can only report issues for their own assets
    if (req.user.role === 'employee' && asset.rows[0].assigned_to !== req.user.employee_id) {
      return res.status(403).json({ error: 'You can only report issues for your own assigned assets' });
    }

    const result = await db.query(
      `INSERT INTO it_maintenance_requests (
        asset_id, reported_by, type, description,
        vendor_name, vendor_contact, vendor_reference, technician_name, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [asset_id, req.user.id, type || 'repair', description, vendor_name, vendor_contact, vendor_reference, technician_name, notes]
    );

    // Update asset status to in_repair
    await db.query(`UPDATE it_assets SET status = 'in_repair', updated_at = NOW() WHERE id = $1`, [asset_id]);

    await logAssetAudit(asset_id, 'SENT_FOR_REPAIR', req.user.id, asset.rows[0].assigned_to, { status: asset.rows[0].status }, { status: 'in_repair' }, `Maintenance request: ${type || 'repair'}`);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create maintenance error:', err);
    res.status(500).json({ error: 'Failed to create maintenance request' });
  }
});

// PUT /api/it-inventory/maintenance/:id — Update maintenance request (IT Admin only)
router.put('/maintenance/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const existing = await db.query('SELECT * FROM it_maintenance_requests WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Maintenance request not found' });

    const {
      status, type, description, vendor_name, vendor_contact, vendor_reference,
      technician_name, repair_cost, condition_after, notes,
    } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx}::repair_status`); params.push(status); idx++; }
    if (type) { updates.push(`type = $${idx}::maintenance_type`); params.push(type); idx++; }
    if (description) { updates.push(`description = $${idx}`); params.push(description); idx++; }
    if (vendor_name !== undefined) { updates.push(`vendor_name = $${idx}`); params.push(vendor_name); idx++; }
    if (vendor_contact !== undefined) { updates.push(`vendor_contact = $${idx}`); params.push(vendor_contact); idx++; }
    if (vendor_reference !== undefined) { updates.push(`vendor_reference = $${idx}`); params.push(vendor_reference); idx++; }
    if (technician_name !== undefined) { updates.push(`technician_name = $${idx}`); params.push(technician_name); idx++; }
    if (repair_cost !== undefined) { updates.push(`repair_cost = $${idx}`); params.push(repair_cost); idx++; }
    if (condition_after) { updates.push(`condition_after = $${idx}::asset_condition`); params.push(condition_after); idx++; }
    if (notes !== undefined) { updates.push(`notes = $${idx}`); params.push(notes); idx++; }

    // Auto-set timestamps
    if (status === 'in_progress') updates.push(`started_at = NOW()`);
    if (status === 'completed' || status === 'cancelled') updates.push(`completed_at = NOW()`);

    updates.push('updated_at = NOW()');

    params.push(req.params.id);

    const result = await db.query(
      `UPDATE it_maintenance_requests SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    // If completed, return asset to available and update condition
    if (status === 'completed') {
      const maint = result.rows[0];
      const condAfter = condition_after || 'good';
      await db.query(
        `UPDATE it_assets SET status = 'available', condition = $1::asset_condition, updated_at = NOW() WHERE id = $2`,
        [condAfter, maint.asset_id]
      );
      await logAssetAudit(maint.asset_id, 'REPAIRED_RETURNED', req.user.id, null, { status: 'in_repair' }, { status: 'available', condition: condAfter }, `Repair completed`);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update maintenance error:', err);
    res.status(500).json({ error: 'Failed to update maintenance request' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── AUDIT LOG ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/it-inventory/audit-log — View audit log (admin only)
router.get('/audit-log', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { asset_id, action, performed_by, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = ['1=1'];
    let params = [];
    let idx = 1;

    if (asset_id) { where.push(`l.asset_id = $${idx}`); params.push(asset_id); idx++; }
    if (action) { where.push(`l.action = $${idx}`); params.push(action); idx++; }
    if (performed_by) { where.push(`l.performed_by = $${idx}`); params.push(performed_by); idx++; }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM it_asset_audit_log l WHERE ${where.join(' AND ')}`, params
    );

    const result = await db.query(
      `SELECT l.*,
              a.asset_id as asset_code, a.name as asset_name,
              u.email as performed_by_email,
              e.first_name || ' ' || e.last_name as affected_employee_name
       FROM it_asset_audit_log l
       LEFT JOIN it_assets a ON a.id = l.asset_id
       LEFT JOIN users u ON u.id = l.performed_by
       LEFT JOIN employees e ON e.id = l.affected_employee
       WHERE ${where.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── DASHBOARD & REPORTS ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/it-inventory/dashboard — Summary stats
router.get('/dashboard', async (req, res) => {
  try {
    // Status breakdown
    const statusResult = await db.query(
      `SELECT status, COUNT(*)::int as count FROM it_assets GROUP BY status`
    );

    // Category breakdown
    const categoryResult = await db.query(
      `SELECT category, COUNT(*)::int as count FROM it_assets GROUP BY category ORDER BY count DESC`
    );

    // Total value
    const valueResult = await db.query(
      `SELECT COALESCE(SUM(purchase_cost), 0)::numeric as total_value,
              COUNT(*)::int as total_assets
       FROM it_assets`
    );

    // Warranty expiring within 90 days
    const warrantyResult = await db.query(
      `SELECT COUNT(*)::int as expiring_soon
       FROM it_assets
       WHERE warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`
    );

    // Active repairs
    const repairResult = await db.query(
      `SELECT COUNT(*)::int as active_repairs
       FROM it_maintenance_requests
       WHERE status IN ('pending', 'in_progress')`
    );

    // Total repair costs
    const repairCostResult = await db.query(
      `SELECT COALESCE(SUM(repair_cost), 0)::numeric as total_repair_cost
       FROM it_maintenance_requests
       WHERE status = 'completed'`
    );

    const statusMap = {};
    statusResult.rows.forEach(r => { statusMap[r.status] = r.count; });

    res.json({
      total_assets: parseInt(valueResult.rows[0].total_assets),
      total_value: parseFloat(valueResult.rows[0].total_value),
      status_breakdown: statusMap,
      category_breakdown: categoryResult.rows,
      warranty_expiring_soon: warrantyResult.rows[0].expiring_soon,
      active_repairs: repairResult.rows[0].active_repairs,
      total_repair_cost: parseFloat(repairCostResult.rows[0].total_repair_cost),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// GET /api/it-inventory/reports/warranty — Assets with warranty expiring soon
router.get('/reports/warranty', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { days = 90 } = req.query;

    const result = await db.query(
      `SELECT a.*, d.name as department_name,
              e.first_name || ' ' || e.last_name as assigned_to_name
       FROM it_assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN employees e ON e.id = a.assigned_to
       WHERE a.warranty_expiry BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1 || ' days')::interval
       ORDER BY a.warranty_expiry ASC`,
      [parseInt(days)]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Warranty report error:', err);
    res.status(500).json({ error: 'Failed to fetch warranty report' });
  }
});

// GET /api/it-inventory/reports/unassigned — All available/unassigned assets
router.get('/reports/unassigned', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, d.name as department_name
       FROM it_assets a
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.status = 'available'
       ORDER BY a.category, a.location`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Unassigned report error:', err);
    res.status(500).json({ error: 'Failed to fetch unassigned report' });
  }
});

// GET /api/it-inventory/reports/repair-costs — Repair cost summary
router.get('/reports/repair-costs', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    // By asset
    const byAsset = await db.query(
      `SELECT a.asset_id, a.name, a.category,
              COUNT(m.id)::int as repair_count,
              COALESCE(SUM(m.repair_cost), 0)::numeric as total_cost
       FROM it_maintenance_requests m
       JOIN it_assets a ON a.id = m.asset_id
       WHERE m.status = 'completed'
       GROUP BY a.id, a.asset_id, a.name, a.category
       ORDER BY total_cost DESC`
    );

    // By category
    const byCategory = await db.query(
      `SELECT a.category,
              COUNT(m.id)::int as repair_count,
              COALESCE(SUM(m.repair_cost), 0)::numeric as total_cost
       FROM it_maintenance_requests m
       JOIN it_assets a ON a.id = m.asset_id
       WHERE m.status = 'completed'
       GROUP BY a.category
       ORDER BY total_cost DESC`
    );

    res.json({ by_asset: byAsset.rows, by_category: byCategory.rows });
  } catch (err) {
    console.error('Repair costs report error:', err);
    res.status(500).json({ error: 'Failed to fetch repair costs report' });
  }
});

// GET /api/it-inventory/reports/employee-assets — Assets per employee
router.get('/reports/employee-assets', authorize('super_admin', 'hr_admin', 'manager'), async (req, res) => {
  try {
    const { employee_id } = req.query;

    let where = ['1=1'];
    let params = [];
    let idx = 1;

    if (employee_id) { where.push(`a.assigned_to = $${idx}`); params.push(employee_id); idx++; }

    // Managers can only see their direct reports
    if (req.user.role === 'manager' || req.user.role === 'team_lead') {
      where.push(`e.reporting_manager_id = $${idx}`);
      params.push(req.user.employee_id);
      idx++;
    }

    const result = await db.query(
      `SELECT a.*, d.name as department_name,
              e.first_name || ' ' || e.last_name as assigned_to_name,
              e.employee_id
       FROM it_assets a
       JOIN employees e ON e.id = a.assigned_to
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.status = 'assigned' AND ${where.join(' AND ')}
       ORDER BY e.first_name, a.category`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Employee assets report error:', err);
    res.status(500).json({ error: 'Failed to fetch employee assets report' });
  }
});

// GET /api/it-inventory/employees — Get employees for assignment dropdown
router.get('/employees', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, first_name, last_name, employee_code, department_id
       FROM employees
       WHERE status IN ('active', 'probation')
       ORDER BY first_name, last_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List employees error:', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

module.exports = router;
