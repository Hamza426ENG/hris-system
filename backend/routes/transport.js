const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const ADMIN_ROLES = ['super_admin', 'hr_admin'];
const isAdmin = (role) => ADMIN_ROLES.includes(role);

// ─── STATS ─────────────────────────────────────────────────────────────────

// GET /api/transport/stats
router.get('/stats', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const [vehicles, routes, enrollments, usage] = await Promise.all([
      db.query('SELECT COUNT(*) FROM transport_vehicles WHERE is_active = TRUE'),
      db.query('SELECT COUNT(*) FROM transport_routes WHERE is_active = TRUE'),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'active')  AS active,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'inactive') AS inactive,
          COUNT(*) FILTER (WHERE status = 'suspended') AS suspended,
          COUNT(*) AS total
        FROM transport_enrollments
      `),
      db.query(`
        SELECT COUNT(DISTINCT employee_id) AS today_riders
        FROM transport_usage
        WHERE usage_date = CURRENT_DATE
      `),
    ]);
    res.json({
      active_vehicles: parseInt(vehicles.rows[0].count),
      active_routes:   parseInt(routes.rows[0].count),
      enrollments:     enrollments.rows[0],
      today_riders:    parseInt(usage.rows[0].today_riders),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── VEHICLES ──────────────────────────────────────────────────────────────

// GET /api/transport/vehicles
router.get('/vehicles', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT v.*,
        (SELECT COUNT(*) FROM transport_routes r WHERE r.vehicle_id = v.id AND r.is_active = TRUE) AS assigned_routes
      FROM transport_vehicles v
      ORDER BY v.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/transport/vehicles
router.post('/vehicles', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { vehicle_name, plate_number, vehicle_type, capacity, driver_name, driver_phone, notes } = req.body;
    if (!vehicle_name || !plate_number) return res.status(400).json({ error: 'vehicle_name and plate_number are required' });
    const result = await db.query(`
      INSERT INTO transport_vehicles (vehicle_name, plate_number, vehicle_type, capacity, driver_name, driver_phone, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [vehicle_name, plate_number, vehicle_type || 'bus', capacity || 20, driver_name, driver_phone, notes]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Plate number already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/vehicles/:id
router.put('/vehicles/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { vehicle_name, plate_number, vehicle_type, capacity, driver_name, driver_phone, is_active, notes } = req.body;
    const result = await db.query(`
      UPDATE transport_vehicles
      SET vehicle_name = COALESCE($1, vehicle_name),
          plate_number = COALESCE($2, plate_number),
          vehicle_type = COALESCE($3, vehicle_type),
          capacity     = COALESCE($4, capacity),
          driver_name  = COALESCE($5, driver_name),
          driver_phone = COALESCE($6, driver_phone),
          is_active    = COALESCE($7, is_active),
          notes        = COALESCE($8, notes),
          updated_at   = NOW()
      WHERE id = $9 RETURNING *
    `, [vehicle_name, plate_number, vehicle_type, capacity, driver_name, driver_phone, is_active, notes, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Vehicle not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Plate number already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/transport/vehicles/:id
router.delete('/vehicles/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM transport_vehicles WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Vehicle not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── ROUTES ────────────────────────────────────────────────────────────────

// GET /api/transport/routes
router.get('/routes', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.*,
        v.vehicle_name, v.plate_number, v.driver_name, v.driver_phone, v.capacity,
        (SELECT COUNT(*) FROM transport_enrollments e WHERE e.route_id = r.id AND e.status = 'active') AS enrolled_count,
        (SELECT JSON_AGG(s ORDER BY s.stop_order) FROM (
          SELECT * FROM transport_stops WHERE route_id = r.id ORDER BY stop_order
        ) s) AS stops
      FROM transport_routes r
      LEFT JOIN transport_vehicles v ON v.id = r.vehicle_id
      WHERE ($1::boolean IS NULL OR r.is_active = $1)
      ORDER BY r.created_at DESC
    `, [req.query.active != null ? req.query.active === 'true' : null]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transport/routes/:id
router.get('/routes/:id', async (req, res) => {
  try {
    const route = await db.query(`
      SELECT r.*,
        v.vehicle_name, v.plate_number, v.driver_name, v.driver_phone, v.capacity
      FROM transport_routes r
      LEFT JOIN transport_vehicles v ON v.id = r.vehicle_id
      WHERE r.id = $1
    `, [req.params.id]);
    if (!route.rows.length) return res.status(404).json({ error: 'Route not found' });
    const stops = await db.query('SELECT * FROM transport_stops WHERE route_id = $1 ORDER BY stop_order', [req.params.id]);
    res.json({ ...route.rows[0], stops: stops.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/transport/routes
router.post('/routes', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { route_name, area, departure_time, return_time, vehicle_id, notes } = req.body;
    if (!route_name) return res.status(400).json({ error: 'route_name is required' });
    const result = await db.query(`
      INSERT INTO transport_routes (route_name, area, departure_time, return_time, vehicle_id, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [route_name, area, departure_time || null, return_time || null, vehicle_id || null, notes, req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/routes/:id
router.put('/routes/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { route_name, area, departure_time, return_time, vehicle_id, is_active, notes } = req.body;
    const result = await db.query(`
      UPDATE transport_routes
      SET route_name     = COALESCE($1, route_name),
          area           = COALESCE($2, area),
          departure_time = COALESCE($3, departure_time),
          return_time    = COALESCE($4, return_time),
          vehicle_id     = $5,
          is_active      = COALESCE($6, is_active),
          notes          = COALESCE($7, notes),
          updated_at     = NOW()
      WHERE id = $8 RETURNING *
    `, [route_name, area, departure_time || null, return_time || null, vehicle_id || null, is_active, notes, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Route not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/transport/routes/:id
router.delete('/routes/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM transport_routes WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Route not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── STOPS ─────────────────────────────────────────────────────────────────

// POST /api/transport/routes/:id/stops
router.post('/routes/:id/stops', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { stop_name, stop_order, pickup_time, dropoff_time, area } = req.body;
    if (!stop_name) return res.status(400).json({ error: 'stop_name is required' });
    const result = await db.query(`
      INSERT INTO transport_stops (route_id, stop_name, stop_order, pickup_time, dropoff_time, area)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [req.params.id, stop_name, stop_order || 1, pickup_time || null, dropoff_time || null, area]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/stops/:id
router.put('/stops/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { stop_name, stop_order, pickup_time, dropoff_time, area } = req.body;
    const result = await db.query(`
      UPDATE transport_stops
      SET stop_name    = COALESCE($1, stop_name),
          stop_order   = COALESCE($2, stop_order),
          pickup_time  = COALESCE($3, pickup_time),
          dropoff_time = COALESCE($4, dropoff_time),
          area         = COALESCE($5, area)
      WHERE id = $6 RETURNING *
    `, [stop_name, stop_order, pickup_time || null, dropoff_time || null, area, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Stop not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/transport/stops/:id
router.delete('/stops/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query('DELETE FROM transport_stops WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Stop not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── ENROLLMENTS ───────────────────────────────────────────────────────────

// GET /api/transport/my-enrollment
router.get('/my-enrollment', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT en.*,
        r.route_name, r.area, r.departure_time, r.return_time,
        v.vehicle_name, v.plate_number, v.driver_name, v.driver_phone,
        s.stop_name, s.pickup_time, s.dropoff_time, s.area AS stop_area,
        CONCAT(a.first_name, ' ', a.last_name) AS approved_by_name
      FROM transport_enrollments en
      LEFT JOIN transport_routes r ON r.id = en.route_id
      LEFT JOIN transport_vehicles v ON v.id = r.vehicle_id
      LEFT JOIN transport_stops s ON s.id = en.stop_id
      LEFT JOIN employees a ON a.id = en.approved_by
      WHERE en.employee_id = $1
    `, [req.user.employee_id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/transport/enroll
router.post('/enroll', async (req, res) => {
  try {
    const { route_id, stop_id, notes } = req.body;
    // Check existing
    const exists = await db.query('SELECT id, status FROM transport_enrollments WHERE employee_id = $1', [req.user.employee_id]);
    if (exists.rows.length) {
      if (['pending', 'active'].includes(exists.rows[0].status)) {
        return res.status(400).json({ error: 'You already have an active or pending enrollment' });
      }
      // Re-enroll: update existing
      const result = await db.query(`
        UPDATE transport_enrollments
        SET route_id = $1, stop_id = $2, notes = $3, status = 'pending',
            enrollment_date = CURRENT_DATE, approved_by = NULL, approved_at = NULL, updated_at = NOW()
        WHERE employee_id = $4 RETURNING *
      `, [route_id || null, stop_id || null, notes, req.user.employee_id]);
      return res.json(result.rows[0]);
    }
    const result = await db.query(`
      INSERT INTO transport_enrollments (employee_id, route_id, stop_id, notes)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.user.employee_id, route_id || null, stop_id || null, notes]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/enrollment/cancel
router.put('/enrollment/cancel', async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE transport_enrollments SET status = 'inactive', updated_at = NOW()
      WHERE employee_id = $1 AND status IN ('active', 'pending') RETURNING *
    `, [req.user.employee_id]);
    if (!result.rows.length) return res.status(404).json({ error: 'No active enrollment found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transport/enrollments — all (HR/admin)
router.get('/enrollments', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { status, route_id } = req.query;
    let where = ['1=1'];
    let params = [];
    let i = 1;
    if (status) { where.push(`en.status = $${i++}`); params.push(status); }
    if (route_id) { where.push(`en.route_id = $${i++}`); params.push(route_id); }
    const result = await db.query(`
      SELECT en.*,
        CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
        e.employee_id AS emp_code, e.avatar_url,
        d.name AS department_name,
        r.route_name, r.area AS route_area,
        s.stop_name, s.pickup_time, s.dropoff_time,
        CONCAT(a.first_name, ' ', a.last_name) AS approved_by_name
      FROM transport_enrollments en
      JOIN employees e ON e.id = en.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN transport_routes r ON r.id = en.route_id
      LEFT JOIN transport_stops s ON s.id = en.stop_id
      LEFT JOIN employees a ON a.id = en.approved_by
      WHERE ${where.join(' AND ')}
      ORDER BY en.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/enrollments/:id/approve
router.put('/enrollments/:id/approve', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { route_id, stop_id } = req.body;
    const approver = await db.query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
    const approverId = approver.rows[0]?.id || null;
    const result = await db.query(`
      UPDATE transport_enrollments
      SET status = 'active', approved_by = $1, approved_at = NOW(),
          route_id = COALESCE($2, route_id),
          stop_id = COALESCE($3, stop_id),
          updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [approverId, route_id || null, stop_id || null, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/enrollments/:id/reject
router.put('/enrollments/:id/reject', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE transport_enrollments SET status = 'inactive', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/enrollments/:id/suspend
router.put('/enrollments/:id/suspend', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE transport_enrollments SET status = 'suspended', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/enrollments/:id/activate
router.put('/enrollments/:id/activate', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE transport_enrollments SET status = 'active', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/enrollments/:id/assign — assign/change route & stop for an employee
router.put('/enrollments/:id/assign', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { route_id, stop_id } = req.body;
    const result = await db.query(`
      UPDATE transport_enrollments
      SET route_id = $1, stop_id = $2, updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [route_id || null, stop_id || null, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Enrollment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── USAGE ─────────────────────────────────────────────────────────────────

// GET /api/transport/usage
router.get('/usage', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { date, route_id } = req.query;
    let where = ['1=1'];
    let params = [];
    let i = 1;
    if (date) { where.push(`u.usage_date = $${i++}`); params.push(date); }
    if (route_id) { where.push(`u.route_id = $${i++}`); params.push(route_id); }
    const result = await db.query(`
      SELECT u.*,
        CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
        e.employee_id AS emp_code,
        d.name AS department_name,
        r.route_name
      FROM transport_usage u
      JOIN employees e ON e.id = u.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN transport_routes r ON r.id = u.route_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.usage_date DESC, e.first_name
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/transport/usage — mark today's usage (HR/admin)
router.post('/usage', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const { employee_id, route_id, usage_date, used_pickup, used_dropoff, notes } = req.body;
    const result = await db.query(`
      INSERT INTO transport_usage (employee_id, route_id, usage_date, used_pickup, used_dropoff, marked_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (employee_id, usage_date)
      DO UPDATE SET used_pickup = $4, used_dropoff = $5, notes = $7, marked_by = $6
      RETURNING *
    `, [employee_id, route_id || null, usage_date || new Date().toISOString().slice(0, 10), used_pickup, used_dropoff, req.user.id, notes]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/transport/my-history — employee's own usage history
router.get('/my-history', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.*, r.route_name
      FROM transport_usage u
      LEFT JOIN transport_routes r ON r.id = u.route_id
      WHERE u.employee_id = $1
      ORDER BY u.usage_date DESC
      LIMIT 60
    `, [req.user.employee_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── ISSUES ────────────────────────────────────────────────────────────────

// GET /api/transport/issues
router.get('/issues', async (req, res) => {
  try {
    const role = req.user.role;
    let where = [];
    let params = [];
    let i = 1;
    if (!isAdmin(role)) {
      where.push(`ti.employee_id = $${i++}`);
      params.push(req.user.employee_id);
    }
    if (req.query.status) { where.push(`ti.status = $${i++}`); params.push(req.query.status); }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const result = await db.query(`
      SELECT ti.*,
        CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
        e.employee_id AS emp_code,
        r.route_name,
        CONCAT(resolver.first_name, ' ', resolver.last_name) AS resolved_by_name
      FROM transport_issues ti
      JOIN employees e ON e.id = ti.employee_id
      LEFT JOIN transport_routes r ON r.id = ti.route_id
      LEFT JOIN employees resolver ON resolver.id = ti.resolved_by
      ${whereClause}
      ORDER BY ti.created_at DESC
    `, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/transport/issues
router.post('/issues', async (req, res) => {
  try {
    const { route_id, issue_type, description } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    const result = await db.query(`
      INSERT INTO transport_issues (employee_id, route_id, issue_type, description)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.user.employee_id, route_id || null, issue_type || 'complaint', description]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/issues/:id/resolve
router.put('/issues/:id/resolve', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const approver = await db.query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
    const resolverId = approver.rows[0]?.id || null;
    const result = await db.query(`
      UPDATE transport_issues
      SET status = 'resolved', resolved_by = $1, resolved_at = NOW(), updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [resolverId, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Issue not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/transport/issues/:id/close
router.put('/issues/:id/close', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE transport_issues SET status = 'closed', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Issue not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
