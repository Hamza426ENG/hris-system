/**
 * Attendance Auto-Sync Scheduler
 *
 * Periodically pulls new attendance logs from all active ZKTeco devices
 * and syncs them into the attendance_records table.
 *
 * Runs every ZKTECO_SYNC_INTERVAL minutes (default 5, 0 = disabled).
 *
 * SHIFT-AWARE PAIRING (7 PM – 4 AM overnight shift):
 *
 *   "Shift date" is the EVENING calendar date. A punch at 2 AM on March 26
 *   belongs to the March 25 shift.
 *
 *   Boundary: punches with hour < SHIFT_DAY_CUTOFF (6 AM) are attributed to
 *   the previous calendar day. Everything else stays on its calendar day.
 *
 *   Within each employee+shiftDate group:
 *     check_in  = earliest punch (the evening entry)
 *     check_out = latest  punch  (the early-morning exit)
 *     work_hours = check_out − check_in
 */

const db        = require('../db');
const zkService = require('./zktecoService');

// Lazy-loaded to avoid circular deps at startup
function emitUpdate(employeeId, record) {
  try {
    const attendanceRoute = require('../routes/attendance');
    if (attendanceRoute.emitAttendanceUpdate) {
      attendanceRoute.emitAttendanceUpdate(employeeId, record);
    }
  } catch { /* ignore if route not loaded */ }
}

let syncTimer = null;
let isSyncing = false;

// ── Sync status helper ───────────────────────────────────────────────────────

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

// ── Shift configuration ──────────────────────────────────────────────────────
// Punches with hour < SHIFT_DAY_CUTOFF belong to the PREVIOUS calendar day's
// shift. This correctly groups a 7 PM check-in and 4 AM check-out under the
// same "shift date" (the evening's calendar date).
const SHIFT_DAY_CUTOFF = 6; // 6 AM — any punch 00:00–05:59 → previous day

// ── ZKTeco state classification ──────────────────────────────────────────────
const IN_STATES  = new Set([0, 2, 4]);   // Check In, Break In, Overtime In
const OUT_STATES = new Set([1, 3, 5]);   // Check Out, Break Out, Overtime Out

/**
 * Given a list of { punchTime, punchState } objects for one employee+date,
 * decide which timestamp is check_in and which is check_out.
 *
 * Strategy:
 *  1. If the device provides explicit IN/OUT states — use them:
 *       check_in  = earliest IN-state punch
 *       check_out = latest   OUT-state punch  (must be after check_in)
 *  2. If ALL punches have the same state or null — fall back to time order:
 *       check_in  = first punch
 *       check_out = last punch (only if > 1 punch)
 */
function resolvePair(punches) {
  // punches: [{ punchTime: Date, punchState: number|null }]
  const sorted = [...punches].sort((a, b) => a.punchTime - b.punchTime);

  const inPunches  = sorted.filter(p => IN_STATES.has(p.punchState));
  const outPunches = sorted.filter(p => OUT_STATES.has(p.punchState));

  let checkIn  = null;
  let checkOut = null;

  if (inPunches.length > 0 && outPunches.length > 0) {
    // Case 1: device has explicit in/out states — use them
    checkIn  = inPunches[0].punchTime;                            // earliest IN
    checkOut = outPunches[outPunches.length - 1].punchTime;       // latest  OUT
  } else {
    // Case 2: all punches same state or null — fall back to first/last
    checkIn  = sorted[0].punchTime;
    checkOut = sorted.length > 1 ? sorted[sorted.length - 1].punchTime : null;
  }

  // Sanity: check_out must be strictly after check_in
  if (checkOut && checkOut <= checkIn) checkOut = null;

  const workHours = (checkIn && checkOut)
    ? parseFloat(((checkOut - checkIn) / 3_600_000).toFixed(2))
    : null;

  return { checkIn, checkOut, workHours };
}

// ── Single-device sync ────────────────────────────────────────────────────────

async function syncDevice(device) {
  const result = { deviceId: device.id, deviceName: device.name, rawInserted: 0, attendanceSynced: 0 };

  try {
    // 0. Find the latest punch already stored for this device so we only process NEW records
    const latestRes = await db.query(
      'SELECT MAX(punch_time) AS latest FROM device_attendance_raw WHERE device_id = $1',
      [device.id]
    );
    const sinceDate = latestRes.rows[0].latest ? new Date(latestRes.rows[0].latest) : null;
    if (sinceDate) {
      console.log(`[Auto-Sync] ${device.name}: incremental sync — latest punch in DB: ${sinceDate.toISOString()}`);
    } else {
      console.log(`[Auto-Sync] ${device.name}: no existing data — full sync`);
    }

    // 1. Pull ALL logs from device (with retry logic in zktecoService)
    const logs = await zkService.getAttendanceLogs(device);
    if (!logs || logs.length === 0) {
      await updateSyncStatus(device.id, 'success', 'No logs returned from device', 0);
      return result;
    }

    // 1b. Filter to only logs NEWER than what we already have in DB
    //     This prevents re-processing thousands of old records on every sync
    const newLogs = sinceDate
      ? logs.filter(l => l.punchTime > sinceDate)
      : logs;

    console.log(`[Auto-Sync] ${device.name}: ${logs.length} from device, ${newLogs.length} new (after ${sinceDate ? sinceDate.toISOString() : 'beginning'})`);

    if (newLogs.length === 0) {
      await updateSyncStatus(device.id, 'success', `Incremental sync: 0 new punches (device has ${logs.length} total, all already stored)`, 0);
      return result;
    }

    // 2. Load user→employee mappings
    const mappingRes = await db.query(
      'SELECT device_user_id, employee_id FROM device_user_mapping WHERE device_id = $1 AND employee_id IS NOT NULL',
      [device.id]
    );
    const userMap = new Map(mappingRes.rows.map(m => [m.device_user_id, m.employee_id]));

    // 2b. Auto-map unmapped device users by matching last 3 digits of employee_id code
    const unmappedRes = await db.query(
      'SELECT device_user_id FROM device_user_mapping WHERE device_id = $1 AND employee_id IS NULL',
      [device.id]
    );
    if (unmappedRes.rows.length > 0) {
      const empRes = await db.query("SELECT id, employee_id FROM employees WHERE status = 'active'");
      for (const { device_user_id } of unmappedRes.rows) {
        const match = empRes.rows.find(e => {
          const digits = (e.employee_id || '').replace(/\D/g, '');
          const suffix = digits.slice(-String(device_user_id).length);
          return suffix === String(device_user_id);
        });
        if (match) {
          await db.query(
            `UPDATE device_user_mapping SET employee_id = $1, updated_at = NOW()
             WHERE device_id = $2 AND device_user_id = $3`,
            [match.id, device.id, device_user_id]
          );
          userMap.set(device_user_id, match.id);
          await db.query(
            `UPDATE device_attendance_raw SET employee_id = $1
             WHERE device_id = $2 AND device_user_id = $3 AND employee_id IS NULL`,
            [match.id, device.id, device_user_id]
          );
        }
      }
    }

    // 3. Insert only NEW raw logs (deduplicated by UNIQUE constraint as safety net)
    for (const log of newLogs) {
      const employeeId = userMap.get(log.deviceUserId) || null;
      try {
        const ins = await db.query(
          `INSERT INTO device_attendance_raw
             (device_id, device_user_id, punch_time, punch_state, verified, employee_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (device_id, device_user_id, punch_time) DO NOTHING
           RETURNING id`,
          [device.id, log.deviceUserId, new Date(log.punchTime), log.punchState, log.verified, employeeId]
        );
        if (ins.rows.length > 0) result.rawInserted++;
      } catch (err) {
        console.warn(`[Auto-Sync] Raw insert skip for user ${log.deviceUserId}:`, err.message);
      }
    }

    // 4. Pair unsynced raw punches → attendance_records
    result.attendanceSynced = await pairPunchesToAttendance(device.id);

    // 5. Update device sync status
    await updateSyncStatus(
      device.id, 'success',
      `Incremental sync: ${result.rawInserted} new punches → ${result.attendanceSynced} attendance records`,
      result.attendanceSynced
    );

    return result;
  } catch (err) {
    result.error = err.message;
    await updateSyncStatus(device.id, 'error', `Auto-sync failed: ${err.message}`, 0).catch(() => {});
    return result;
  }
}

// ── Scheduler loop ────────────────────────────────────────────────────────────

async function runSyncCycle() {
  if (isSyncing) {
    console.log('[Auto-Sync] Previous cycle still running, skipping.');
    return;
  }

  isSyncing = true;
  const cycleStart = Date.now();

  try {
    const devicesRes = await db.query(
      'SELECT * FROM device_connections WHERE is_active = TRUE AND auto_sync = TRUE'
    );
    if (devicesRes.rows.length === 0) return;

    console.log(`[Auto-Sync] Starting cycle for ${devicesRes.rows.length} device(s)...`);

    let totalRaw = 0, totalSynced = 0;

    for (const device of devicesRes.rows) {
      const r = await syncDevice(device);
      totalRaw    += r.rawInserted;
      totalSynced += r.attendanceSynced;

      if (r.error) {
        console.warn(`[Auto-Sync] ${device.name} (${device.ip_address}): ERROR - ${r.error}`);
      } else {
        console.log(`[Auto-Sync] ${device.name}: ${r.rawInserted} new punches → ${r.attendanceSynced} attendance records`);
      }

      await zkService.disconnect(device);
    }

    const duration = ((Date.now() - cycleStart) / 1000).toFixed(1);
    console.log(`[Auto-Sync] Cycle complete in ${duration}s: ${totalRaw} new punches → ${totalSynced} attendance records`);
  } catch (err) {
    console.error('[Auto-Sync] Cycle error:', err.message);
  } finally {
    isSyncing = false;
  }
}

/**
 * One-time startup DB cleanup:
 * Remove raw punches and attendance records that have obviously bad dates
 * (year > current year — e.g. 2118 caused by device clock glitch).
 */
async function cleanFutureDates() {
  const currentYear = new Date().getFullYear();
  try {
    const raw = await db.query(
      `DELETE FROM device_attendance_raw
       WHERE EXTRACT(YEAR FROM punch_time) > $1
       RETURNING id`,
      [currentYear]
    );
    const att = await db.query(
      `DELETE FROM attendance_records
       WHERE EXTRACT(YEAR FROM date) > $1
       RETURNING id`,
      [currentYear]
    );
    if (raw.rowCount > 0 || att.rowCount > 0) {
      console.log(`[DB Cleanup] Removed ${raw.rowCount} raw punches and ${att.rowCount} attendance records with future dates (year > ${currentYear})`);
    }
  } catch (err) {
    console.error('[DB Cleanup] Failed to remove future-date records:', err.message);
  }
}

function start() {
  const intervalMinutes = parseInt(process.env.ZKTECO_SYNC_INTERVAL) || 5;

  if (intervalMinutes <= 0) {
    console.log('[Auto-Sync] Disabled (ZKTECO_SYNC_INTERVAL=0)');
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[Auto-Sync] Scheduled every ${intervalMinutes} minutes (set ZKTECO_SYNC_INTERVAL in .env to change)`);

  // Clean bad dates on startup before first sync
  cleanFutureDates().then(() => {
    // First sync after 10 s so server finishes booting
    setTimeout(runSyncCycle, 10_000);
  });

  syncTimer = setInterval(runSyncCycle, intervalMs);
}

function stop() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[Auto-Sync] Stopped');
  }
}

// ── Core pairing function ─────────────────────────────────────────────────────

/**
 * Reads all unsynced raw punches for a device that have an employee mapping,
 * groups them by employee+date, resolves check_in/check_out using punch_state,
 * upserts into attendance_records, then marks raw rows as synced.
 *
 * Returns the number of attendance records created/updated.
 */
async function pairPunchesToAttendance(deviceId) {
  // Fetch unsynced punches — include punch_state this time
  const rawResult = await db.query(
    `SELECT r.id, r.employee_id, r.punch_time, r.punch_state, r.device_id
     FROM device_attendance_raw r
     WHERE r.device_id = $1
       AND r.employee_id IS NOT NULL
       AND r.synced_to_attendance = FALSE
     ORDER BY r.employee_id, r.punch_time ASC`,
    [deviceId]
  );

  if (rawResult.rows.length === 0) return 0;

  // Group by employee_id + SHIFT date (not calendar date).
  // Punches before SHIFT_DAY_CUTOFF (6 AM) belong to the previous calendar
  // day's shift, so a 7 PM check-in and 4 AM check-out are grouped together.
  const groups = new Map();
  for (const row of rawResult.rows) {
    const pt = new Date(row.punch_time);

    // Determine the "shift date": if the punch is before 6 AM, roll back 1 day
    let shiftDate = new Date(pt);
    if (pt.getHours() < SHIFT_DAY_CUTOFF) {
      shiftDate.setDate(shiftDate.getDate() - 1);
    }

    const y  = shiftDate.getFullYear();
    const m  = String(shiftDate.getMonth() + 1).padStart(2, '0');
    const d  = String(shiftDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const key = `${row.employee_id}|${dateStr}`;
    if (!groups.has(key)) {
      groups.set(key, { employee_id: row.employee_id, date: dateStr, punches: [], rawIds: [] });
    }
    const g = groups.get(key);
    g.punches.push({ punchTime: pt, punchState: row.punch_state });
    g.rawIds.push(row.id);
  }

  let synced = 0;
  for (const [, group] of groups) {
    const { employee_id, date, punches, rawIds } = group;
    const { checkIn, checkOut, workHours } = resolvePair(punches);

    try {
      await db.query(
        `INSERT INTO attendance_records
           (employee_id, date, check_in, check_out, work_hours, status, source, device_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'present', 'device', $6, NOW())
         ON CONFLICT (employee_id, date)
         DO UPDATE SET
           check_in   = LEAST(attendance_records.check_in, EXCLUDED.check_in),
           check_out  = CASE
             WHEN EXCLUDED.check_out IS NOT NULL
             THEN GREATEST(COALESCE(attendance_records.check_out, EXCLUDED.check_out), EXCLUDED.check_out)
             ELSE attendance_records.check_out
           END,
           work_hours = CASE
             WHEN EXCLUDED.check_out IS NOT NULL AND EXCLUDED.check_in IS NOT NULL
             THEN ROUND(EXTRACT(EPOCH FROM (
               GREATEST(COALESCE(attendance_records.check_out, EXCLUDED.check_out), EXCLUDED.check_out) -
               LEAST(attendance_records.check_in, EXCLUDED.check_in)
             )) / 3600, 2)
             ELSE attendance_records.work_hours
           END,
           source     = CASE WHEN attendance_records.source = 'manual' THEN 'manual' ELSE 'device' END,
           device_id  = COALESCE(attendance_records.device_id, EXCLUDED.device_id),
           updated_at = NOW()`,
        [employee_id, date, checkIn, checkOut, workHours, deviceId]
      );

      await db.query(
        'UPDATE device_attendance_raw SET synced_to_attendance = TRUE WHERE id = ANY($1)',
        [rawIds]
      );

      // Broadcast to SSE clients
      emitUpdate(employee_id, { employee_id, date, check_in: checkIn, check_out: checkOut, work_hours: workHours, source: 'device' });
      synced++;
    } catch (err) {
      console.warn(`[Auto-Sync] Attendance upsert error for ${employee_id} on ${date}:`, err.message);
    }
  }

  return synced;
}

// Export pairPunchesToAttendance so devices.js route can also call it
module.exports = { start, stop, runSyncCycle, pairPunchesToAttendance };
