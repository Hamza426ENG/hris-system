/**
 * Attendance Module — Production-grade, RBAC-aware, fully audited.
 *
 * Self-service (all authenticated users):
 *   GET    /attendance/today        – own record for today
 *   POST   /attendance/checkin      – check in self
 *   POST   /attendance/checkout     – check out self
 *   GET    /attendance/history      – own paginated history
 *
 * Admin / HR / Team Lead:
 *   GET    /attendance/all                   – search & filter all records
 *   GET    /attendance/employee/:employeeId  – specific employee history
 *   POST   /attendance/manual                – create record for any employee
 *   PUT    /attendance/:id                   – edit any record
 *   DELETE /attendance/:id                   – delete any record
 *
 * Every mutating action is audit-logged.
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const { authenticate, authorize } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

// ── SSE clients ───────────────────────────────────────────────────────────────
// Each entry: { res, employeeId, role }
const sseClients = new Set();

/**
 * Broadcast an attendance update to relevant SSE clients.
 *   - HR/admin clients always receive the update.
 *   - Employee clients only receive updates for their own employeeId.
 */
function emitAttendanceUpdate(employeeId, record) {
  const payload = JSON.stringify({ employeeId, record });
  for (const client of sseClients) {
    if (client.role === 'super_admin' || client.role === 'hr_admin' ||
        client.role === 'manager'    || client.role === 'team_lead'  ||
        client.employeeId === employeeId) {
      try { client.res.write(`data: ${payload}\n\n`); } catch { /* ignore */ }
    }
  }
}

/**
 * GET /attendance/stream?token=<jwt>
 * SSE endpoint — sends real-time attendance check-in/check-out events.
 * Token passed as query param because EventSource cannot set headers.
 */
router.get('/stream', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();

  let clientInfo;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const check = await db.query(
      `SELECT u.id, u.role, e.id AS employee_id
       FROM users u
       LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1 AND u.is_active = TRUE`,
      [decoded.userId]
    );
    if (!check.rows.length) return res.status(401).end();
    const row = check.rows[0];
    clientInfo = { role: row.role || 'employee', employeeId: row.employee_id || null };
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('data: connected\n\n');

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 25000);

  const client = { res, ...clientInfo };
  sseClients.add(client);
  req.on('close', () => { clearInterval(heartbeat); sseClients.delete(client); });
});

// ── helpers ──────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['super_admin', 'hr_admin'];
const LEAD_ROLES  = ['super_admin', 'hr_admin', 'manager', 'team_lead'];

function isAdmin(role) { return ADMIN_ROLES.includes(role); }
function isLead(role)  { return LEAD_ROLES.includes(role); }

/**
 * Validate a date string is in YYYY-MM-DD format and represents a real date.
 */
function isValidDate(str) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

/**
 * Validate a time string (HH:MM or HH:MM:SS, 24h format).
 */
function isValidTime(str) {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(str);
}

/**
 * Fetch late/early thresholds from app_settings.
 * Returns { lateHH, lateMM, earlyHH, earlyMM }
 */
async function getAttendanceThresholds() {
  try {
    const res = await db.query(
      `SELECT key, value FROM app_settings WHERE key IN ('attendance_late_threshold', 'attendance_early_leave_threshold')`
    );
    const map = {};
    for (const row of res.rows) map[row.key] = row.value;
    const [lateHH, lateMM]   = (map['attendance_late_threshold']        || '09:15').split(':').map(Number);
    const [earlyHH, earlyMM] = (map['attendance_early_leave_threshold'] || '17:45').split(':').map(Number);
    return { lateHH, lateMM, earlyHH, earlyMM };
  } catch {
    return { lateHH: 9, lateMM: 15, earlyHH: 17, earlyMM: 45 };
  }
}

// All routes require authentication
router.use(authenticate);

/**
 * GET /attendance/live-today
 * Returns today's attendance records.
 *   - HR / admin / leads: all employees with check-in today (or absent)
 *   - Employee: own record only
 */
router.get('/live-today', async (req, res) => {
  try {
    const { role, employee_id } = req.user;
    const isLead_ = isLead(role);

    if (isLead_) {
      const result = await db.query(
        `SELECT
           ar.id, ar.employee_id, ar.date, ar.check_in, ar.check_out, ar.work_hours, ar.status, ar.source,
           e.first_name, e.last_name, e.employee_id AS emp_code, e.avatar_url,
           d.name AS department_name
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id
         LEFT JOIN departments d ON d.id = e.department_id
         WHERE ar.date = CURRENT_DATE
         ORDER BY ar.check_in ASC NULLS LAST, e.first_name ASC`
      );
      return res.json({ records: result.rows, date: new Date().toISOString().split('T')[0] });
    }

    // Self only
    if (!employee_id) return res.json({ record: null, date: new Date().toISOString().split('T')[0] });
    const result = await db.query(
      `SELECT id, employee_id, date, check_in, check_out, work_hours, status, source
       FROM attendance_records
       WHERE employee_id = $1 AND date = CURRENT_DATE`,
      [employee_id]
    );
    res.json({ record: result.rows[0] || null, date: new Date().toISOString().split('T')[0] });
  } catch (err) {
    console.error('GET /attendance/live-today error:', err);
    res.status(500).json({ error: 'Failed to fetch live attendance' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SELF-SERVICE ENDPOINTS (any authenticated employee)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /attendance/today
 * Returns the caller's attendance record for today (or null).
 */
router.get('/today', async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    // For overnight shifts (7 PM – 4 AM) the "active" record may have
    // yesterday's shift-date.  Priority:
    //   1. Any record with check_in but NO check_out (active shift)
    //   2. Today's record (CURRENT_DATE)
    //   3. Yesterday's completed record (so the card shows last shift)
    const result = await db.query(
      `SELECT id, date, check_in, check_out, work_hours, status, notes
       FROM attendance_records
       WHERE employee_id = $1
         AND date >= CURRENT_DATE - INTERVAL '1 day'
       ORDER BY
         (check_in IS NOT NULL AND check_out IS NULL) DESC,  -- active shift first
         date DESC
       LIMIT 1`,
      [employeeId]
    );

    const record = result.rows[0] || null;

    // For active shifts, compute elapsed seconds server-side.
    //
    // node-zklib stores device wall-clock time using the SERVER's timezone.
    // So getHours()/getDate()/etc. on the stored Date return device-local
    // values.  For "now" we must convert to the device timezone via Intl.
    if (record && record.check_in && !record.check_out) {
      const deviceTZ = process.env.ZKTECO_DEVICE_TIMEZONE || 'Asia/Karachi';
      const ci = new Date(record.check_in);

      // check-in: server-local components = device-local components
      const ciSec  = ci.getHours() * 3600 + ci.getMinutes() * 60 + ci.getSeconds();
      const ciDate = `${ci.getFullYear()}-${String(ci.getMonth() + 1).padStart(2, '0')}-${String(ci.getDate()).padStart(2, '0')}`;

      // now: convert real UTC to device timezone
      const nowObj = new Date();
      const nowTimeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: deviceTZ, hour12: false,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).formatToParts(nowObj);
      const tp = (t) => parseInt(nowTimeParts.find(p => p.type === t)?.value || '0', 10);
      const nowSec = tp('hour') * 3600 + tp('minute') * 60 + tp('second');

      const nowDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: deviceTZ, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(nowObj); // "YYYY-MM-DD"

      const dayDiff = Math.round((new Date(nowDate) - new Date(ciDate)) / 86400000);
      let elapsed = dayDiff * 86400 + (nowSec - ciSec);
      if (elapsed < 0) elapsed = 0;
      record.elapsed_seconds = Math.floor(elapsed);
    }

    res.json({ record });
  } catch (err) {
    console.error('GET /attendance/today error:', err);
    res.status(500).json({ error: 'Failed to fetch today\'s attendance' });
  }
});

/**
 * POST /attendance/checkin
 * Check in the current user.
 * - First check-in of the day: creates record.
 * - Already checked in (no check_out): no-op, returns existing record.
 * - Already checked out: re-opens session (resets check_in to NOW, clears check_out & work_hours).
 */
router.post('/checkin', async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    const { lateHH, lateMM } = await getAttendanceThresholds();
    const now = new Date();
    const isLateArrival = now.getHours() > lateHH || (now.getHours() === lateHH && now.getMinutes() > lateMM);

    const result = await db.query(
      `INSERT INTO attendance_records (employee_id, date, check_in, status, is_late, source, created_by, updated_at)
       VALUES ($1, CURRENT_DATE, NOW(), 'present', $3, 'manual', $2, NOW())
       ON CONFLICT (employee_id, date)
       DO UPDATE SET
         -- Re-check-in after checkout: reset check_in, clear check_out & work_hours.
         -- Already checked in (no checkout): keep existing check_in.
         check_in   = CASE
                        WHEN attendance_records.check_out IS NOT NULL THEN NOW()
                        WHEN attendance_records.check_in  IS NULL     THEN NOW()
                        ELSE attendance_records.check_in
                      END,
         check_out  = CASE WHEN attendance_records.check_out IS NOT NULL THEN NULL ELSE attendance_records.check_out END,
         work_hours = CASE WHEN attendance_records.check_out IS NOT NULL THEN NULL ELSE attendance_records.work_hours END,
         is_late    = CASE WHEN attendance_records.check_in IS NULL THEN $3 ELSE attendance_records.is_late END,
         status     = 'present',
         source     = CASE WHEN attendance_records.source = 'device' THEN 'device' ELSE 'manual' END,
         updated_by = $2,
         updated_at = NOW()
       RETURNING *`,
      [employeeId, req.user.id, isLateArrival]
    );

    await logAction({
      userId: req.user.id,
      action: 'CHECK_IN',
      entity: 'attendance',
      entityId: result.rows[0].id,
      newValue: result.rows[0],
      req,
    });

    emitAttendanceUpdate(employeeId, result.rows[0]);
    res.json({ record: result.rows[0] });
  } catch (err) {
    console.error('POST /attendance/checkin error:', err);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

/**
 * POST /attendance/checkout
 * Check out the current user. Computes work_hours automatically.
 */
router.post('/checkout', async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    // Find the active (checked-in, not checked-out) record.
    // For overnight shifts the record date may be tomorrow's shift-date
    // (e.g., check-in at 7 PM on Mar 26 → shift-date Mar 26 or Mar 27).
    const old = await db.query(
      `SELECT * FROM attendance_records
       WHERE employee_id = $1
         AND check_in IS NOT NULL AND check_out IS NULL
       ORDER BY date DESC LIMIT 1`,
      [employeeId]
    );
    if (old.rows.length === 0) {
      return res.status(400).json({ error: 'No active check-in found' });
    }
    const activeId = old.rows[0].id;

    const { earlyHH, earlyMM } = await getAttendanceThresholds();
    const now = new Date();
    const isEarlyLeave = now.getHours() < earlyHH || (now.getHours() === earlyHH && now.getMinutes() < earlyMM);

    const result = await db.query(
      `UPDATE attendance_records
       SET check_out      = NOW(),
           work_hours     = ROUND(EXTRACT(EPOCH FROM (NOW() - check_in)) / 3600, 2),
           is_early_leave = $3,
           updated_by     = $2,
           updated_at     = NOW()
       WHERE id = $4
       RETURNING *`,
      [employeeId, req.user.id, isEarlyLeave, activeId]
    );

    await logAction({
      userId: req.user.id,
      action: 'CHECK_OUT',
      entity: 'attendance',
      entityId: result.rows[0].id,
      oldValue: old.rows[0],
      newValue: result.rows[0],
      req,
    });

    emitAttendanceUpdate(employeeId, result.rows[0]);
    res.json({ record: result.rows[0] });
  } catch (err) {
    console.error('POST /attendance/checkout error:', err);
    res.status(500).json({ error: 'Failed to check out' });
  }
});

/**
 * GET /attendance/history?page=1&limit=30
 * Paginated attendance history for the current user.
 */
router.get('/history', async (req, res) => {
  try {
    const employeeId = req.user.employee_id;
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee record linked to this user' });
    }

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(90, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const [countRes, dataRes] = await Promise.all([
      db.query('SELECT COUNT(*) FROM attendance_records WHERE employee_id = $1', [employeeId]),
      db.query(
        `SELECT id, date, check_in, check_out, work_hours, status, notes
         FROM attendance_records
         WHERE employee_id = $1
         ORDER BY date DESC
         LIMIT $2 OFFSET $3`,
        [employeeId, limit, offset]
      ),
    ]);

    res.json({
      records: dataRes.rows,
      total:   parseInt(countRes.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /attendance/history error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance history' });
  }
});

/**
 * GET /attendance/summary/:employeeId?period=month_to_date|last_30_days|custom&start_date=&end_date=
 *
 * Returns aggregated attendance stats + detailed records for the attendance dashboard.
 * Self: can view own. Leads: can view direct reports. Admins: can view any.
 */
router.get('/summary/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const period = req.query.period || 'month_to_date';

    // ── RBAC ──────────────────────────────────────────────────────────────
    if (req.user.employee_id !== employeeId && !isLead(req.user.role)) {
      return res.status(403).json({ error: 'You can only view your own attendance' });
    }
    if (req.user.role === 'team_lead' && req.user.employee_id !== employeeId) {
      const empCheck = await db.query('SELECT manager_id FROM employees WHERE id = $1', [employeeId]);
      if (empCheck.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
      if (empCheck.rows[0].manager_id !== req.user.employee_id) {
        return res.status(403).json({ error: 'You can only view your direct reports' });
      }
    }

    // ── Date range ────────────────────────────────────────────────────────
    let startDate, endDate;
    const now = new Date();
    endDate = now.toISOString().split('T')[0];

    if (period === 'last_30_days') {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      startDate = d.toISOString().split('T')[0];
    } else if (period === 'last_90_days') {
      const d = new Date(now); d.setDate(d.getDate() - 90);
      startDate = d.toISOString().split('T')[0];
    } else if (period === 'this_year') {
      startDate = `${now.getFullYear()}-01-01`;
    } else if (period === 'all_time') {
      startDate = '2000-01-01';
    } else if (period === 'custom' && req.query.start_date && req.query.end_date) {
      startDate = req.query.start_date;
      endDate   = req.query.end_date;
    } else {
      // month_to_date
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    // ── Employee info ────────────────────────────────────────────────────
    const empRes = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.employee_id AS emp_code,
              e.department_id, e.wfh_percentage, e.wfo_percentage,
              e.hire_date,
              d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.id = $1`,
      [employeeId]
    );
    if (empRes.rows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    const employee = empRes.rows[0];

    // Don't show attendance before the employee's joining date
    if (employee.hire_date) {
      const hireStr = new Date(employee.hire_date).toISOString().split('T')[0];
      if (startDate < hireStr) startDate = hireStr;
    }

    // ── Last working day record ──────────────────────────────────────────
    const lastDayRes = await db.query(
      `SELECT date, check_in, check_out, work_hours, status
       FROM attendance_records
       WHERE employee_id = $1 AND check_in IS NOT NULL
       ORDER BY date DESC LIMIT 1`,
      [employeeId]
    );
    const lastDay = lastDayRes.rows[0] || null;

    // ── Period aggregates ────────────────────────────────────────────────
    const aggRes = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE check_in IS NOT NULL) AS total_present_days,
         ROUND(AVG(EXTRACT(EPOCH FROM check_in::time))::numeric, 0)  AS avg_checkin_seconds,
         ROUND(AVG(EXTRACT(EPOCH FROM check_out::time))::numeric, 0) AS avg_checkout_seconds,
         ROUND(AVG(work_hours)::numeric, 1) AS avg_work_hours,
         ROUND(SUM(work_hours)::numeric, 1) AS total_hours,
         COUNT(*) FILTER (WHERE work_hours IS NOT NULL AND work_hours > 0) AS days_with_hours
       FROM attendance_records
       WHERE employee_id = $1
         AND date >= $2 AND date <= $3`,
      [employeeId, startDate, endDate]
    );
    const agg = aggRes.rows[0];

    // ── Month-to-date leaves + absents ───────────────────────────────────
    // Always scoped to current month regardless of selected period.
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const todayStr   = now.toISOString().split('T')[0];

    // Count actual LEAVE DAYS (not requests) that fall within this month.
    // A leave request spanning Mar 10–15 contributes 4 working days to Mar,
    // not 1 request. We generate each day of the overlap and count Mon-Fri.
    const leavesRes = await db.query(
      `SELECT COUNT(*) AS leave_days
       FROM leave_requests lr,
            LATERAL generate_series(
              GREATEST(lr.start_date, $2::date),
              LEAST(lr.end_date, $3::date),
              '1 day'
            ) d
       WHERE lr.employee_id = $1
         AND lr.status = 'approved'
         AND lr.start_date <= $3
         AND lr.end_date   >= $2
         AND EXTRACT(DOW FROM d) BETWEEN 1 AND 5`,
      [employeeId, monthStart, todayStr]
    );
    const leaveCount = parseInt(leavesRes.rows[0]?.leave_days || 0);

    // Count working days (Mon-Fri) from month start to today
    const workingDaysRes = await db.query(
      `SELECT COUNT(*) AS wd
       FROM generate_series($1::date, $2::date, '1 day') d
       WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5`,
      [monthStart, todayStr]
    );
    const totalWorkingDays = parseInt(workingDaysRes.rows[0]?.wd || 0);

    // Present days MUST also be scoped to the current month (not the selected period)
    const monthPresentRes = await db.query(
      `SELECT COUNT(*) AS cnt
       FROM attendance_records
       WHERE employee_id = $1
         AND date >= $2 AND date <= $3
         AND check_in IS NOT NULL`,
      [employeeId, monthStart, todayStr]
    );
    const presentDays = parseInt(monthPresentRes.rows[0]?.cnt || 0);
    const absentDays = Math.max(0, totalWorkingDays - presentDays - leaveCount);

    // ── Last 30 days aggregates (always computed for the "Last 30 Days" section) ──
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
    const last30Res = await db.query(
      `SELECT
         ROUND(AVG(EXTRACT(EPOCH FROM check_in::time))::numeric, 0) AS avg_checkin_seconds,
         ROUND(AVG(EXTRACT(EPOCH FROM check_out::time))::numeric, 0) AS avg_checkout_seconds,
         ROUND(AVG(work_hours)::numeric, 1) AS avg_work_hours,
         ROUND(SUM(work_hours)::numeric, 1) AS total_hours
       FROM attendance_records
       WHERE employee_id = $1 AND date >= $2 AND date <= $3 AND check_in IS NOT NULL`,
      [employeeId, d30.toISOString().split('T')[0], endDate]
    );
    const last30 = last30Res.rows[0];

    // ── Detailed records for the table ───────────────────────────────────
    // Generate a row for EVERY working day (Mon-Fri) in the range, not just
    // days with a punch.  Days without an attendance record are filled in as
    // 'absent' or 'leave' depending on the leave_requests table.
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * limit;

    // Cap endDate to today — don't show future working days as absent
    const cappedEnd = endDate < todayStr ? endDate : todayStr;

    const [countRes, recordsRes] = await Promise.all([
      db.query(
        `WITH working_days AS (
           SELECT d::date AS date
           FROM generate_series($1::date, $2::date, '1 day') d
           WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
         )
         SELECT COUNT(*) FROM working_days`,
        [startDate, cappedEnd]
      ),
      db.query(
        `WITH working_days AS (
           SELECT d::date AS date
           FROM generate_series($2::date, $3::date, '1 day') d
           WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
         ),
         leave_days AS (
           SELECT d::date AS date
           FROM leave_requests lr,
                LATERAL generate_series(
                  GREATEST(lr.start_date, $2::date),
                  LEAST(lr.end_date, $3::date),
                  '1 day'
                ) d
           WHERE lr.employee_id = $1
             AND lr.status = 'approved'
             AND lr.start_date <= $3
             AND lr.end_date >= $2
             AND EXTRACT(DOW FROM d) BETWEEN 1 AND 5
         )
         SELECT
           COALESCE(ar.id, md5(wd.date::text || $1)::uuid) AS id,
           wd.date,
           ar.check_in,
           ar.check_out,
           ar.work_hours,
           CASE
             WHEN ar.id IS NOT NULL THEN COALESCE(ar.status, 'present')
             WHEN wd.date IN (SELECT date FROM leave_days) THEN 'leave'
             ELSE 'absent'
           END AS status,
           ar.notes,
           COALESCE(ar.source, CASE
             WHEN wd.date IN (SELECT date FROM leave_days) THEN 'system'
             ELSE NULL
           END) AS source,
           ar.device_id,
           dc.name AS device_name
         FROM working_days wd
         LEFT JOIN attendance_records ar
           ON ar.employee_id = $1 AND ar.date = wd.date
         LEFT JOIN device_connections dc
           ON dc.id = ar.device_id
         ORDER BY wd.date DESC
         LIMIT $4 OFFSET $5`,
        [employeeId, startDate, cappedEnd, limit, offset]
      ),
    ]);

    // ── Also pull raw device punches for the period (if any) ─────────────
    const rawPunchesRes = await db.query(
      `SELECT punch_time, punch_state, device_user_id
       FROM device_attendance_raw
       WHERE employee_id = $1 AND punch_time >= $2 AND punch_time <= ($3::date + INTERVAL '1 day')
       ORDER BY punch_time ASC`,
      [employeeId, startDate, endDate]
    );

    // Helper: seconds since midnight → "HH:MM AM/PM"
    function secsToTime(secs) {
      if (!secs && secs !== 0) return null;
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    res.json({
      employee,
      period: { start_date: startDate, end_date: endDate, period },
      lastWorkingDay: lastDay ? {
        date: lastDay.date,
        checkIn: lastDay.check_in,
        checkOut: lastDay.check_out,
        totalHours: lastDay.work_hours,
      } : null,
      last30Days: {
        avgCheckIn:    secsToTime(parseInt(last30.avg_checkin_seconds)),
        avgCheckOut:   secsToTime(parseInt(last30.avg_checkout_seconds)),
        avgWorkHours:  parseFloat(last30.avg_work_hours || 0),
        totalHours:    parseFloat(last30.total_hours || 0),
      },
      monthToDate: {
        leaves:       leaveCount,
        absents:      absentDays,
        avgWorkHours: parseFloat(agg.avg_work_hours || 0),
        totalWorkingDays,
        presentDays,
      },
      hoursPercentage: {
        wfh: parseFloat(employee.wfh_percentage || 0),
        wfo: parseFloat(employee.wfo_percentage || 0),
      },
      periodStats: {
        avgCheckIn:   secsToTime(parseInt(agg.avg_checkin_seconds)),
        avgCheckOut:  secsToTime(parseInt(agg.avg_checkout_seconds)),
        avgWorkHours: parseFloat(agg.avg_work_hours || 0),
        totalHours:   parseFloat(agg.total_hours || 0),
        presentDays:  parseInt(agg.total_present_days || 0),
      },
      records: recordsRes.rows,
      rawPunches: rawPunchesRes.rows,
      total: parseInt(countRes.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /attendance/summary/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance summary' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN / HR / TEAM-LEAD ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /attendance/analytics?period=today|last_7_days|this_month|this_year
 *
 * Returns aggregated attendance analytics for dashboards (HR/Admin only).
 *   - Overall: present / absent / leave counts
 *   - By region (department location): same breakdown
 *   - Late vs on-time distribution
 *   - Daily trend (per-day present/absent counts)
 */
router.get('/analytics', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const period = req.query.period || 'today';
    const now = new Date();
    let startDate, endDate;
    endDate = now.toISOString().split('T')[0];

    if (period === 'last_7_days') {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === 'this_month') {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (period === 'this_year') {
      startDate = `${now.getFullYear()}-01-01`;
    } else {
      // today
      startDate = endDate;
    }

    // 1. Total active employees
    const totalEmpRes = await db.query("SELECT COUNT(*) AS cnt FROM employees WHERE status = 'active'");
    const totalEmployees = parseInt(totalEmpRes.rows[0].cnt);

    // 2. Working days in the range
    const workingDaysRes = await db.query(
      `SELECT d::date AS date
       FROM generate_series($1::date, $2::date, '1 day') d
       WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5`,
      [startDate, endDate]
    );
    const workingDays = workingDaysRes.rows.map(r => r.date);
    const numWorkingDays = workingDays.length;
    if (numWorkingDays === 0) {
      return res.json({ period, startDate, endDate, totalEmployees, overview: { present: 0, absent: 0, leave: 0 }, byRegion: [], lateVsOnTime: { late: 0, onTime: 0 }, dailyTrend: [] });
    }

    // 3. Present counts (employees with attendance records)
    const presentRes = await db.query(
      `SELECT ar.date, ar.employee_id, ar.check_in, ar.work_hours
       FROM attendance_records ar
       JOIN employees e ON e.id = ar.employee_id AND e.status = 'active'
       WHERE ar.date >= $1 AND ar.date <= $2 AND ar.check_in IS NOT NULL`,
      [startDate, endDate]
    );

    // 4. Leave days
    const leaveRes = await db.query(
      `SELECT DISTINCT d::date AS date, lr.employee_id
       FROM leave_requests lr,
            LATERAL generate_series(
              GREATEST(lr.start_date, $1::date),
              LEAST(lr.end_date, $2::date),
              '1 day'
            ) d
       WHERE lr.status = 'approved'
         AND lr.start_date <= $2
         AND lr.end_date >= $1
         AND EXTRACT(DOW FROM d) BETWEEN 1 AND 5`,
      [startDate, endDate]
    );
    const leaveSet = new Set(leaveRes.rows.map(r => `${r.employee_id}|${r.date.toISOString().split('T')[0]}`));
    const presentSet = new Set(presentRes.rows.map(r => `${r.employee_id}|${r.date.toISOString().split('T')[0]}`));

    // 5. Overall counts
    const totalSlots = totalEmployees * numWorkingDays;
    const presentCount = presentSet.size;
    const leaveCount = [...leaveSet].filter(k => !presentSet.has(k)).length;
    const absentCount = Math.max(0, totalSlots - presentCount - leaveCount);

    // 6. By region (department location)
    // Always show all three office regions even if some have no employees yet
    const ALL_REGIONS = ['Islamabad', 'Lahore', 'Peru'];

    const regionRes = await db.query(
      `SELECT COALESCE(d.location, 'Islamabad') AS region, e.id AS employee_id
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE e.status = 'active'`,
      []
    );
    const empByRegion = {};
    for (const region of ALL_REGIONS) empByRegion[region] = new Set();
    for (const r of regionRes.rows) {
      const region = ALL_REGIONS.includes(r.region) ? r.region : 'Islamabad';
      empByRegion[region].add(r.employee_id);
    }

    const byRegion = ALL_REGIONS.map(region => {
      const empSet = empByRegion[region];
      const empCount = empSet.size;
      const regionSlots = empCount * numWorkingDays;
      let regionPresent = 0, regionLeave = 0;

      for (const key of presentSet) {
        const empId = key.split('|')[0];
        if (empSet.has(empId)) regionPresent++;
      }
      for (const key of leaveSet) {
        const empId = key.split('|')[0];
        if (empSet.has(empId) && !presentSet.has(key)) regionLeave++;
      }

      return {
        region,
        employees: empCount,
        present: regionPresent,
        leave: regionLeave,
        absent: Math.max(0, regionSlots - regionPresent - regionLeave),
      };
    });

    // 7. Late vs On-Time (based on check-in hour — late if >= 20:00 for 7PM shift)
    // Shift starts at ~7PM, so late threshold is configurable
    const { lateHH, lateMM } = await getAttendanceThresholds();
    let lateCount = 0, onTimeCount = 0;
    for (const r of presentRes.rows) {
      if (!r.check_in) continue;
      const ci = new Date(r.check_in);
      const h = ci.getHours(), m = ci.getMinutes();
      if (h > lateHH || (h === lateHH && m > lateMM)) {
        lateCount++;
      } else {
        onTimeCount++;
      }
    }

    // 8. Daily trend
    const dailyPresent = {};
    const dailyLeave = {};
    for (const r of presentRes.rows) {
      const d = r.date.toISOString().split('T')[0];
      dailyPresent[d] = (dailyPresent[d] || 0) + 1;
    }
    for (const key of leaveSet) {
      const d = key.split('|')[1];
      if (!presentSet.has(key)) {
        dailyLeave[d] = (dailyLeave[d] || 0) + 1;
      }
    }

    const dailyTrend = workingDays.map(wd => {
      const d = wd.toISOString().split('T')[0];
      const p = dailyPresent[d] || 0;
      const l = dailyLeave[d] || 0;
      return { date: d, present: p, leave: l, absent: Math.max(0, totalEmployees - p - l) };
    });

    // 9. Avg work hours per day
    let totalHours = 0, daysWithHours = 0;
    for (const r of presentRes.rows) {
      if (r.work_hours && parseFloat(r.work_hours) > 0) {
        totalHours += parseFloat(r.work_hours);
        daysWithHours++;
      }
    }

    res.json({
      period, startDate, endDate,
      totalEmployees,
      numWorkingDays,
      overview: { present: presentCount, absent: absentCount, leave: leaveCount, total: totalSlots },
      byRegion,
      lateVsOnTime: { late: lateCount, onTime: onTimeCount },
      dailyTrend,
      avgWorkHours: daysWithHours > 0 ? parseFloat((totalHours / daysWithHours).toFixed(1)) : 0,
    });
  } catch (err) {
    console.error('GET /attendance/analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /attendance/sync-status
 * Returns last sync status for all active ZKTeco devices.
 * Accessible by: all authenticated users (employees see their own last-synced time).
 */
router.get('/sync-status', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, ip_address, is_active, auto_sync,
              last_sync_at, last_sync_status, last_sync_message, total_synced
       FROM device_connections
       WHERE is_active = TRUE
       ORDER BY last_sync_at DESC NULLS LAST`
    );
    const intervalMinutes = parseInt(process.env.ZKTECO_SYNC_INTERVAL) || 5;
    res.json({ devices: result.rows, intervalMinutes });
  } catch (err) {
    console.error('GET /attendance/sync-status error:', err);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

/**
 * POST /attendance/sync-now
 * Immediately triggers a full sync cycle for all active auto-sync devices.
 * Accessible by: super_admin only.
 */
router.post('/sync-now', authorize('super_admin'), async (req, res) => {
  try {
    const { runSyncCycle } = require('../services/attendanceSyncScheduler');
    // Run cycle async — respond immediately so the UI doesn't time out
    res.json({ message: 'Sync started', startedAt: new Date().toISOString() });
    // Run after responding
    setImmediate(async () => {
      try {
        await runSyncCycle();
        console.log('[Manual Sync] Triggered by user', req.user.id, '— completed');
      } catch (err) {
        console.error('[Manual Sync] Error:', err.message);
      }
    });
  } catch (err) {
    console.error('POST /attendance/sync-now error:', err);
    res.status(500).json({ error: 'Failed to trigger sync' });
  }
});

/**
 * GET /attendance/all?employee_id=&department=&start_date=&end_date=&status=&page=&limit=&sort_by=&sort_order=
 * Search, filter, and paginate all attendance records.
 * Accessible by: super_admin, hr_admin, manager, team_lead
 */
router.get('/all', authorize(...LEAD_ROLES), async (req, res) => {
  try {
    const {
      employee_id,
      department,
      start_date,
      end_date,
      status,
      search,
      sort_by    = 'date',
      sort_order = 'desc',
    } = req.query;

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    // Whitelist allowed sort columns to prevent SQL injection
    const SORT_COLS = {
      date:       'ar.date',
      check_in:   'ar.check_in',
      check_out:  'ar.check_out',
      work_hours: 'ar.work_hours',
      status:     'ar.status',
      name:       'e.first_name',
    };
    const orderCol = SORT_COLS[sort_by] || 'ar.date';
    const orderDir = sort_order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Build WHERE clauses dynamically
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // Team leads: restrict to own direct reports + self
    if (req.user.role === 'team_lead') {
      conditions.push(`(e.manager_id = $${paramIdx} OR e.id = $${paramIdx})`);
      params.push(req.user.employee_id);
      paramIdx++;
    }

    if (employee_id) {
      conditions.push(`ar.employee_id = $${paramIdx}`);
      params.push(employee_id);
      paramIdx++;
    }

    if (department) {
      conditions.push(`e.department_id = $${paramIdx}`);
      params.push(department);
      paramIdx++;
    }

    if (start_date && isValidDate(start_date)) {
      conditions.push(`ar.date >= $${paramIdx}`);
      params.push(start_date);
      paramIdx++;
    }

    if (end_date && isValidDate(end_date)) {
      conditions.push(`ar.date <= $${paramIdx}`);
      params.push(end_date);
      paramIdx++;
    }

    if (status) {
      conditions.push(`ar.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }

    if (search) {
      conditions.push(`(
        e.first_name ILIKE $${paramIdx}
        OR e.last_name ILIKE $${paramIdx}
        OR e.employee_id ILIKE $${paramIdx}
      )`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    // Source filter: 'manual' or 'device'
    if (req.query.source) {
      conditions.push(`ar.source = $${paramIdx}`);
      params.push(req.query.source);
      paramIdx++;
    }

    // Flag filter: late, short, missing_io, overtime
    if (req.query.flag === 'late') {
      conditions.push(`EXTRACT(HOUR FROM ar.check_in) >= 10`);
    } else if (req.query.flag === 'short') {
      conditions.push(`ar.work_hours IS NOT NULL AND ar.work_hours > 0 AND ar.work_hours < 8`);
    } else if (req.query.flag === 'missing_io') {
      conditions.push(`((ar.check_in IS NOT NULL AND ar.check_out IS NULL) OR (ar.check_in IS NULL AND ar.check_out IS NOT NULL))`);
    } else if (req.query.flag === 'overtime') {
      conditions.push(`ar.work_hours IS NOT NULL AND ar.work_hours > 8`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countSQL = `
      SELECT COUNT(*)
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      ${whereClause}
    `;

    const dataSQL = `
      SELECT
        ar.id,
        ar.employee_id,
        ar.date,
        ar.check_in,
        ar.check_out,
        ar.work_hours,
        ar.status,
        ar.source,
        ar.notes,
        ar.created_by,
        ar.updated_by,
        ar.created_at,
        ar.updated_at,
        e.first_name,
        e.last_name,
        e.employee_id  AS emp_code,
        e.avatar_url,
        d.name         AS department_name
      FROM attendance_records ar
      JOIN employees  e ON e.id = ar.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      ${whereClause}
      ORDER BY ${orderCol} ${orderDir}, e.first_name ASC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const [countRes, dataRes] = await Promise.all([
      db.query(countSQL, params),
      db.query(dataSQL, [...params, limit, offset]),
    ]);

    res.json({
      records: dataRes.rows,
      total:   parseInt(countRes.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /attendance/all error:', err);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
});

/**
 * GET /attendance/employee/:employeeId?page=&limit=&start_date=&end_date=
 * View a specific employee's attendance history.
 * Team leads can only view their direct reports.
 */
router.get('/employee/:employeeId', authorize(...LEAD_ROLES), async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Team leads: verify the target is a direct report
    if (req.user.role === 'team_lead') {
      const empCheck = await db.query(
        'SELECT id, manager_id FROM employees WHERE id = $1',
        [employeeId]
      );
      if (empCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      if (empCheck.rows[0].manager_id !== req.user.employee_id && empCheck.rows[0].id !== req.user.employee_id) {
        return res.status(403).json({ error: 'You can only view your direct reports\' attendance' });
      }
    }

    const { start_date, end_date } = req.query;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(90, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const conditions = ['ar.employee_id = $1'];
    const params = [employeeId];
    let paramIdx = 2;

    if (start_date && isValidDate(start_date)) {
      conditions.push(`ar.date >= $${paramIdx}`);
      params.push(start_date);
      paramIdx++;
    }
    if (end_date && isValidDate(end_date)) {
      conditions.push(`ar.date <= $${paramIdx}`);
      params.push(end_date);
      paramIdx++;
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM attendance_records ar ${whereClause}`, params),
      db.query(
        `SELECT ar.*, e.first_name, e.last_name, e.employee_id AS emp_code
         FROM attendance_records ar
         JOIN employees e ON e.id = ar.employee_id
         ${whereClause}
         ORDER BY ar.date DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset]
      ),
    ]);

    await logAction({
      userId: req.user.id,
      action: 'VIEW',
      entity: 'attendance',
      entityId: employeeId,
      req,
      details: `Viewed attendance for employee ${employeeId}`,
    });

    res.json({
      records: dataRes.rows,
      total:   parseInt(countRes.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /attendance/employee/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch employee attendance' });
  }
});

/**
 * POST /attendance/manual
 * HR / Super Admin manually creates an attendance record for an employee.
 *
 * Body: { employee_id, date, check_in_time?, check_out_time?, status?, notes? }
 *   - date: YYYY-MM-DD
 *   - check_in_time / check_out_time: HH:MM or HH:MM:SS (24h)
 */
router.post('/manual', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { employee_id, date, check_in_time, check_out_time, status, notes } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' });
    }
    if (!date || !isValidDate(date)) {
      return res.status(400).json({ error: 'Valid date (YYYY-MM-DD) is required' });
    }

    // Verify employee exists and has role = employee (or at least is an employee record)
    const empCheck = await db.query(
      `SELECT e.id, u.role FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
      [employee_id]
    );
    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Validate times if provided
    if (check_in_time && !isValidTime(check_in_time)) {
      return res.status(400).json({ error: 'Invalid check_in_time format (HH:MM or HH:MM:SS)' });
    }
    if (check_out_time && !isValidTime(check_out_time)) {
      return res.status(400).json({ error: 'Invalid check_out_time format (HH:MM or HH:MM:SS)' });
    }

    // Build timestamps from date + time
    const checkIn  = check_in_time  ? `${date}T${check_in_time}` : null;
    const checkOut = check_out_time ? `${date}T${check_out_time}` : null;

    // Constraint: check_out must be after check_in
    if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
      return res.status(400).json({ error: 'check_out_time must be after check_in_time' });
    }

    // Prevent duplicate: check if a record for this employee+date already exists
    const existing = await db.query(
      'SELECT id FROM attendance_records WHERE employee_id = $1 AND date = $2',
      [employee_id, date]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'Attendance record already exists for this employee on this date',
        existing_id: existing.rows[0].id,
      });
    }

    // Calculate work_hours if both times provided
    let workHours = null;
    if (checkIn && checkOut) {
      workHours = ((new Date(checkOut) - new Date(checkIn)) / 3600000).toFixed(2);
    }

    const result = await db.query(
      `INSERT INTO attendance_records
         (employee_id, date, check_in, check_out, work_hours, status, notes, created_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        employee_id,
        date,
        checkIn,
        checkOut,
        workHours,
        status || (checkIn ? 'present' : 'absent'),
        notes || null,
        req.user.id,
      ]
    );

    await logAction({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'attendance',
      entityId: result.rows[0].id,
      newValue: result.rows[0],
      req,
      details: `Manually created attendance for employee ${employee_id} on ${date}`,
    });

    emitAttendanceUpdate(employee_id, result.rows[0]);
    res.status(201).json({ record: result.rows[0] });
  } catch (err) {
    console.error('POST /attendance/manual error:', err);
    res.status(500).json({ error: 'Failed to create attendance record' });
  }
});

/**
 * PUT /attendance/:id
 * HR / Super Admin edits an existing attendance record.
 *
 * Body (all optional): { check_in_time, check_out_time, date, status, notes }
 */
router.put('/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    const { check_in_time, check_out_time, date, status, notes } = req.body;

    // Fetch existing record for validation + audit diff
    const oldResult = await db.query(
      'SELECT * FROM attendance_records WHERE id = $1',
      [id]
    );
    if (oldResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    const oldRecord = oldResult.rows[0];

    // Determine the effective date for timestamp construction
    const effectiveDate = date && isValidDate(date) ? date : oldRecord.date.toISOString().split('T')[0];

    // Build updated timestamps
    let checkIn  = oldRecord.check_in;
    let checkOut = oldRecord.check_out;

    if (check_in_time !== undefined) {
      if (check_in_time === null) {
        checkIn = null;
      } else if (isValidTime(check_in_time)) {
        checkIn = `${effectiveDate}T${check_in_time}`;
      } else {
        return res.status(400).json({ error: 'Invalid check_in_time format' });
      }
    }

    if (check_out_time !== undefined) {
      if (check_out_time === null) {
        checkOut = null;
      } else if (isValidTime(check_out_time)) {
        checkOut = `${effectiveDate}T${check_out_time}`;
      } else {
        return res.status(400).json({ error: 'Invalid check_out_time format' });
      }
    }

    // Constraint: check_out > check_in
    if (checkIn && checkOut && new Date(checkOut) <= new Date(checkIn)) {
      return res.status(400).json({ error: 'check_out must be after check_in' });
    }

    // If date changed, verify no duplicate
    if (date && isValidDate(date) && date !== oldRecord.date.toISOString().split('T')[0]) {
      const dup = await db.query(
        'SELECT id FROM attendance_records WHERE employee_id = $1 AND date = $2 AND id != $3',
        [oldRecord.employee_id, date, id]
      );
      if (dup.rows.length > 0) {
        return res.status(409).json({ error: 'Another record already exists for this employee on that date' });
      }
    }

    // Recalculate work_hours
    let workHours = oldRecord.work_hours;
    if (checkIn && checkOut) {
      workHours = ((new Date(checkOut) - new Date(checkIn)) / 3600000).toFixed(2);
    } else {
      workHours = null;
    }

    const result = await db.query(
      `UPDATE attendance_records
       SET date       = COALESCE($1, date),
           check_in   = $2,
           check_out  = $3,
           work_hours = $4,
           status     = COALESCE($5, status),
           notes      = COALESCE($6, notes),
           updated_by = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        date && isValidDate(date) ? date : null,
        checkIn,
        checkOut,
        workHours,
        status || null,
        notes !== undefined ? notes : null,
        req.user.id,
        id,
      ]
    );

    await logAction({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'attendance',
      entityId: id,
      oldValue: oldRecord,
      newValue: result.rows[0],
      req,
      details: `Updated attendance record ${id}`,
    });

    emitAttendanceUpdate(result.rows[0].employee_id, result.rows[0]);
    res.json({ record: result.rows[0] });
  } catch (err) {
    console.error('PUT /attendance/:id error:', err);
    res.status(500).json({ error: 'Failed to update attendance record' });
  }
});

/**
 * DELETE /attendance/:id
 * HR / Super Admin deletes an attendance record.
 */
router.delete('/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch for audit before deletion
    const existing = await db.query('SELECT * FROM attendance_records WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    await db.query('DELETE FROM attendance_records WHERE id = $1', [id]);

    await logAction({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'attendance',
      entityId: id,
      oldValue: existing.rows[0],
      req,
      details: `Deleted attendance record for employee ${existing.rows[0].employee_id} on ${existing.rows[0].date}`,
    });

    res.json({ message: 'Attendance record deleted', deleted: existing.rows[0] });
  } catch (err) {
    console.error('DELETE /attendance/:id error:', err);
    res.status(500).json({ error: 'Failed to delete attendance record' });
  }
});

/**
 * GET /attendance/settings
 * Returns current attendance threshold settings.
 */
router.get('/settings', authorize('super_admin', 'hr_admin'), async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT key, value, description FROM app_settings
       WHERE key IN ('attendance_late_threshold', 'attendance_early_leave_threshold')`
    );
    const settings = {};
    for (const row of result.rows) settings[row.key] = { value: row.value, description: row.description };
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance settings' });
  }
});

/**
 * PUT /attendance/settings
 * Update late/early-leave threshold settings (super_admin / hr_admin only).
 * Body: { attendance_late_threshold: "HH:MM", attendance_early_leave_threshold: "HH:MM" }
 */
router.put('/settings', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const allowed = ['attendance_late_threshold', 'attendance_early_leave_threshold'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (!/^\d{2}:\d{2}$/.test(req.body[key])) {
          return res.status(400).json({ error: `Invalid time format for ${key}. Use HH:MM` });
        }
        await db.query(
          `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
          [key, req.body[key], req.user.id]
        );
      }
    }
    res.json({ message: 'Attendance settings updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update attendance settings' });
  }
});

module.exports = router;
module.exports.emitAttendanceUpdate = emitAttendanceUpdate;
