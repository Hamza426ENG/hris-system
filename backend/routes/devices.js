/**
 * Device Management & Attendance Sync Routes
 *
 * CRUD for ZKTeco device connections + sync / test / status operations.
 * All routes require super_admin or hr_admin.
 *
 * Routes:
 *   GET    /devices                – list all devices
 *   GET    /devices/:id            – single device details
 *   POST   /devices                – register new device
 *   PUT    /devices/:id            – update device config
 *   DELETE /devices/:id            – remove device
 *   POST   /devices/:id/test       – test connectivity
 *   POST   /devices/:id/sync       – pull logs & sync to attendance
 *   GET    /devices/:id/users      – get enrolled users from device
 *   POST   /devices/:id/map-user   – map a device user to an employee
 *   GET    /devices/:id/mappings   – view all user→employee mappings
 *   GET    /devices/:id/raw-logs   – view raw punch logs
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');
const zkService = require('../services/zktecoService');
const { pairPunchesToAttendance } = require('../services/attendanceSyncScheduler');

const ADMIN_ROLES = ['super_admin', 'hr_admin'];

router.use(authenticate);
router.use(authorize(...ADMIN_ROLES));

// ═════════════════════════════════════════════════════════════════════════════
// DEVICE CRUD
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /devices — list all registered devices.
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT dc.*, u.email AS created_by_email
       FROM device_connections dc
       LEFT JOIN users u ON u.id = dc.created_by
       ORDER BY dc.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /devices error:', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

/**
 * GET /devices/:id — single device.
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT dc.*, u.email AS created_by_email
       FROM device_connections dc
       LEFT JOIN users u ON u.id = dc.created_by
       WHERE dc.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('GET /devices/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch device' });
  }
});

/**
 * POST /devices — register a new device.
 * Body: { name, ip_address, port?, connection_timeout?, device_password?, timezone?, auto_sync?, sync_interval? }
 */
router.post('/', async (req, res) => {
  try {
    const { name, ip_address, port, connection_timeout, device_password, timezone, auto_sync, sync_interval } = req.body;

    if (!name || !ip_address) {
      return res.status(400).json({ error: 'name and ip_address are required' });
    }

    // Check for duplicate IP+port
    const dup = await db.query(
      'SELECT id FROM device_connections WHERE ip_address = $1 AND port = $2',
      [ip_address, port || 4370]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'A device with this IP and port already exists', existing_id: dup.rows[0].id });
    }

    const result = await db.query(
      `INSERT INTO device_connections
         (name, ip_address, port, connection_timeout, device_password, timezone, auto_sync, sync_interval, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        name,
        ip_address,
        port || 4370,
        connection_timeout || 5000,
        device_password || null,
        timezone || 'Asia/Karachi',
        auto_sync !== false,
        sync_interval || 30,
        req.user.id,
      ]
    );

    await logAction({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'device',
      entityId: result.rows[0].id,
      newValue: result.rows[0],
      req,
      details: `Registered device "${name}" at ${ip_address}:${port || 4370}`,
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /devices error:', err);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

/**
 * PUT /devices/:id — update device configuration.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, ip_address, port, connection_timeout, device_password, timezone, auto_sync, sync_interval, is_active } = req.body;

    const old = await db.query('SELECT * FROM device_connections WHERE id = $1', [id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

    const result = await db.query(
      `UPDATE device_connections SET
         name               = COALESCE($1, name),
         ip_address         = COALESCE($2, ip_address),
         port               = COALESCE($3, port),
         connection_timeout = COALESCE($4, connection_timeout),
         device_password    = COALESCE($5, device_password),
         timezone           = COALESCE($6, timezone),
         auto_sync          = COALESCE($7, auto_sync),
         sync_interval      = COALESCE($8, sync_interval),
         is_active          = COALESCE($9, is_active),
         updated_at         = NOW()
       WHERE id = $10
       RETURNING *`,
      [name, ip_address, port, connection_timeout, device_password, timezone, auto_sync, sync_interval, is_active, id]
    );

    // Disconnect cached connection so next operation uses new config
    await zkService.disconnect(old.rows[0]);

    await logAction({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'device',
      entityId: id,
      oldValue: old.rows[0],
      newValue: result.rows[0],
      req,
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /devices/:id error:', err);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

/**
 * DELETE /devices/:id — remove a device.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const old = await db.query('SELECT * FROM device_connections WHERE id = $1', [id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

    await zkService.disconnect(old.rows[0]);
    await db.query('DELETE FROM device_connections WHERE id = $1', [id]);

    await logAction({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'device',
      entityId: id,
      oldValue: old.rows[0],
      req,
    });

    res.json({ message: 'Device removed', deleted: old.rows[0] });
  } catch (err) {
    console.error('DELETE /devices/:id error:', err);
    res.status(500).json({ error: 'Failed to remove device' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DEVICE OPERATIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /devices/:id/test — test connectivity to the device.
 */
router.post('/:id/test', async (req, res) => {
  try {
    const device = await db.query('SELECT * FROM device_connections WHERE id = $1', [req.params.id]);
    if (device.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

    const result = await zkService.testConnection(device.rows[0]);
    res.json(result);
  } catch (err) {
    console.error('POST /devices/:id/test error:', err);
    res.status(500).json({ error: 'Connection test failed', details: err.message });
  }
});

/**
 * GET /devices/:id/users — fetch enrolled users from the device.
 * Also auto-updates the device_user_mapping table.
 */
router.get('/:id/users', async (req, res) => {
  try {
    const device = await db.query('SELECT * FROM device_connections WHERE id = $1', [req.params.id]);
    if (device.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

    const users = await zkService.getUsers(device.rows[0]);

    // Upsert each user into the mapping table (keeps device_user_name up to date)
    for (const u of users) {
      await db.query(
        `INSERT INTO device_user_mapping (device_id, device_user_id, device_user_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (device_id, device_user_id)
         DO UPDATE SET device_user_name = EXCLUDED.device_user_name, updated_at = NOW()`,
        [req.params.id, u.deviceUserId, u.name]
      );
    }

    // Return mappings enriched with employee info
    const mappings = await db.query(
      `SELECT
         m.id, m.device_user_id, m.device_user_name, m.employee_id,
         e.first_name, e.last_name, e.employee_id AS emp_code
       FROM device_user_mapping m
       LEFT JOIN employees e ON e.id = m.employee_id
       WHERE m.device_id = $1
       ORDER BY m.device_user_id::int`,
      [req.params.id]
    );

    res.json({ device_users: users, mappings: mappings.rows });
  } catch (err) {
    console.error('GET /devices/:id/users error:', err);
    res.status(500).json({ error: 'Failed to fetch device users', details: err.message });
  }
});

/**
 * POST /devices/:id/map-user — map a device user to an employee.
 * Body: { device_user_id, employee_id }
 */
router.post('/:id/map-user', async (req, res) => {
  try {
    const { device_user_id, employee_id } = req.body;
    if (!device_user_id) return res.status(400).json({ error: 'device_user_id is required' });

    // Verify employee exists if provided
    if (employee_id) {
      const emp = await db.query('SELECT id FROM employees WHERE id = $1', [employee_id]);
      if (emp.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    }

    const result = await db.query(
      `INSERT INTO device_user_mapping (device_id, device_user_id, employee_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_id, device_user_id)
       DO UPDATE SET employee_id = EXCLUDED.employee_id, updated_at = NOW()
       RETURNING *`,
      [req.params.id, device_user_id, employee_id || null]
    );

    // Also backfill employee_id on any existing raw logs for this device user
    if (employee_id) {
      await db.query(
        `UPDATE device_attendance_raw
         SET employee_id = $1
         WHERE device_id = $2 AND device_user_id = $3 AND employee_id IS NULL`,
        [employee_id, req.params.id, device_user_id]
      );
    }

    await logAction({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'device_mapping',
      entityId: result.rows[0].id,
      newValue: result.rows[0],
      req,
      details: `Mapped device user ${device_user_id} → employee ${employee_id || 'unmapped'}`,
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error('POST /devices/:id/map-user error:', err);
    res.status(500).json({ error: 'Failed to map user' });
  }
});

/**
 * GET /devices/:id/mappings — view all user→employee mappings for a device.
 */
router.get('/:id/mappings', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         m.id, m.device_user_id, m.device_user_name, m.employee_id,
         e.first_name, e.last_name, e.employee_id AS emp_code, e.avatar_url,
         d.name AS department_name
       FROM device_user_mapping m
       LEFT JOIN employees  e ON e.id = m.employee_id
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE m.device_id = $1
       ORDER BY m.device_user_id::int`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET /devices/:id/mappings error:', err);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

/**
 * GET /devices/:id/raw-logs?page=&limit=&start_date=&end_date=&employee_id=
 * View raw punch logs from the device.
 */
router.get('/:id/raw-logs', async (req, res) => {
  try {
    const { start_date, end_date, employee_id } = req.query;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions = ['r.device_id = $1'];
    const params = [req.params.id];
    let idx = 2;

    if (start_date) { conditions.push(`r.punch_time >= $${idx}`); params.push(start_date); idx++; }
    if (end_date)   { conditions.push(`r.punch_time <= ($${idx}::date + INTERVAL '1 day')`); params.push(end_date); idx++; }
    if (employee_id){ conditions.push(`r.employee_id = $${idx}`); params.push(employee_id); idx++; }

    const where = 'WHERE ' + conditions.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM device_attendance_raw r ${where}`, params),
      db.query(
        `SELECT r.*, e.first_name, e.last_name, e.employee_id AS emp_code
         FROM device_attendance_raw r
         LEFT JOIN employees e ON e.id = r.employee_id
         ${where}
         ORDER BY r.punch_time DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
    ]);

    res.json({ logs: dataRes.rows, total: parseInt(countRes.rows[0].count), page, limit });
  } catch (err) {
    console.error('GET /devices/:id/raw-logs error:', err);
    res.status(500).json({ error: 'Failed to fetch raw logs' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SYNC — THE CORE OPERATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /devices/:id/sync
 *
 * Pulls all attendance logs from the device, stores raw punches,
 * then pairs them into check-in/check-out and upserts into attendance_records.
 *
 * Query params:
 *   ?start_date=YYYY-MM-DD  – only process punches on or after this date
 *   ?clear_after=true       – clear device logs after successful sync (careful!)
 */
router.post('/:id/sync', async (req, res) => {
  const syncStart = Date.now();
  let device;

  try {
    const devResult = await db.query('SELECT * FROM device_connections WHERE id = $1', [req.params.id]);
    if (devResult.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    device = devResult.rows[0];

    // 1. Pull attendance logs from device
    const logs = await zkService.getAttendanceLogs(device);
    if (!logs || logs.length === 0) {
      await updateSyncStatus(device.id, 'success', 'No new logs on device', 0);
      return res.json({ message: 'No logs found on device', synced: 0, raw_inserted: 0 });
    }

    // 2. Optional date filter (for raw log filtering only)
    const startFilter = req.query.start_date ? new Date(req.query.start_date) : null;

    // 3. Load user→employee mappings for this device
    const mappingRes = await db.query(
      'SELECT device_user_id, employee_id FROM device_user_mapping WHERE device_id = $1 AND employee_id IS NOT NULL',
      [device.id]
    );
    const userMap = new Map(mappingRes.rows.map(m => [m.device_user_id, m.employee_id]));

    // 4. Insert raw logs (deduplicated via UNIQUE constraint)
    let rawInserted = 0;
    for (const log of logs) {
      const punchDate = new Date(log.punchTime);
      if (startFilter && punchDate < startFilter) continue;

      const employeeId = userMap.get(log.deviceUserId) || null;

      try {
        const ins = await db.query(
          `INSERT INTO device_attendance_raw
             (device_id, device_user_id, punch_time, punch_state, verified, employee_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (device_id, device_user_id, punch_time) DO NOTHING
           RETURNING id`,
          [device.id, log.deviceUserId, punchDate, log.punchState, log.verified, employeeId]
        );
        if (ins.rows.length > 0) rawInserted++;
      } catch (err) {
        // Skip individual insert errors (e.g., timezone issues)
        console.warn(`Raw log insert warning: ${err.message}`);
      }
    }

    // 5. Pair punches into attendance_records (uses punch_state for proper in/out direction)
    const syncedCount = await pairPunchesToAttendance(device.id);

    // 6. Update device sync status
    await updateSyncStatus(device.id, 'success', `Synced ${syncedCount} records from ${rawInserted} new punches`, syncedCount);

    // 7. Optionally clear device logs
    if (req.query.clear_after === 'true' && rawInserted > 0) {
      try {
        await zkService.clearAttendanceLogs(device);
      } catch (err) {
        console.warn('Device log clear failed:', err.message);
      }
    }

    await logAction({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'device_sync',
      entityId: device.id,
      req,
      details: `Synced device "${device.name}": ${rawInserted} raw punches → ${syncedCount} attendance records (${Date.now() - syncStart}ms)`,
    });

    res.json({
      message: 'Sync completed',
      device_logs_total: logs.length,
      raw_inserted: rawInserted,
      attendance_synced: syncedCount,
      duration_ms: Date.now() - syncStart,
    });
  } catch (err) {
    console.error('POST /devices/:id/sync error:', err);
    if (device) {
      await updateSyncStatus(device.id, 'error', err.message, 0);
    }
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

/**
 * GET /devices/:id/diagnose
 * Pull raw logs from the device and return what fields are present — without
 * writing anything to the database. Useful for debugging field mapping issues.
 */
router.get('/:id/diagnose', async (req, res) => {
  try {
    const device = await db.query('SELECT * FROM device_connections WHERE id = $1', [req.params.id]);
    if (device.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

    const logs = await zkService.getAttendanceLogs(device.rows[0]);

    if (!logs || logs.length === 0) {
      return res.json({ message: 'No logs returned from device', total: 0, sample: [] });
    }

    // State distribution
    const stateDist = logs.reduce((acc, l) => {
      const s = l.punchState ?? 'null';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    // Unique users
    const uniqueUsers = [...new Set(logs.map(l => l.deviceUserId))];

    res.json({
      total: logs.length,
      unique_users: uniqueUsers.length,
      punch_state_distribution: stateDist,
      punch_state_legend: {
        0: 'Check In',
        1: 'Check Out',
        2: 'Break Out',
        3: 'Break In',
        4: 'Overtime In',
        5: 'Overtime Out',
        null: 'Unknown (no direction stored)',
      },
      date_range: {
        earliest: logs.reduce((min, l) => l.punchTime < min ? l.punchTime : min, logs[0].punchTime),
        latest:   logs.reduce((max, l) => l.punchTime > max ? l.punchTime : max, logs[0].punchTime),
      },
      sample_records: logs.slice(0, 20),
    });
  } catch (err) {
    console.error('GET /devices/:id/diagnose error:', err);
    res.status(500).json({ error: 'Diagnose failed', details: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SYNC HELPERS
// ═════════════════════════════════════════════════════════════════════════════

async function updateSyncStatus(deviceId, status, message, count) {
  await db.query(
    `UPDATE device_connections
     SET last_sync_at      = NOW(),
         last_sync_status  = $1,
         last_sync_message = $2,
         total_synced      = total_synced + $3,
         updated_at        = NOW()
     WHERE id = $4`,
    [status, message, count, deviceId]
  );
}

module.exports = router;
