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
let syncScheduled = false;

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
// shift.  This groups a 7 PM check-in and 4 AM check-out under the same
// "shift date" (the evening's calendar date).
const SHIFT_DAY_CUTOFF = 6; // 6 AM — punches 00:00–05:59 → previous day

/**
 * Compute the shift-date string (YYYY-MM-DD) for a punch timestamp.
 *
 * IMPORTANT — timezone handling:
 *   node-zklib reads times from the ZKTeco device as-is and creates JS Dates
 *   using the *server's* local timezone.  Because the device clock shows device-
 *   local time, Date.getHours() returns the **device-local hour** (even though
 *   the Date object thinks it is in the server's timezone).  We intentionally
 *   use getHours()/getFullYear()/getMonth()/getDate() — NOT a timezone
 *   conversion — so the shift-date logic matches the wall-clock time shown on
 *   the biometric device.
 */
function getPunchShiftDate(pt) {
  const d = new Date(pt);
  if (d.getHours() < SHIFT_DAY_CUTOFF) {
    d.setDate(d.getDate() - 1);               // roll back to previous calendar day
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

  // Recursive scheduler: each cycle fires exactly intervalMs after the
  // previous one COMPLETES, so a slow sync never causes skipped cycles.
  async function scheduleNext() {
    await runSyncCycle();
    if (syncScheduled) {
      syncTimer = setTimeout(scheduleNext, intervalMs);
    }
  }

  syncScheduled = true;

  // On startup: clean future-date garbage, then repair any recently misattributed
  // records (timezone fix), then begin the normal sync cycle.
  cleanFutureDates()
    .then(() => repairRecentAttendance())
    .then(() => {
      // Short delay (10 s) so the server finishes booting before first live sync
      syncTimer = setTimeout(scheduleNext, 10_000);
    });
}

function stop() {
  syncScheduled = false;
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
    console.log('[Auto-Sync] Stopped');
  }
}

// ── Startup repair ────────────────────────────────────────────────────────────

/**
 * One-time startup repair: re-process all raw punches from the last
 * REPAIR_DAYS days so that attendance records are recalculated with the
 * correct timezone-aware shift-date logic.
 *
 * Clears ONLY device-sourced attendance records for the repair window;
 * manual records are never touched.
 */
const REPAIR_DAYS = 7;

async function repairRecentAttendance() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - REPAIR_DAYS);

    // Reset sync flag for recent raw punches so pairPunchesToAttendance re-processes them
    const resetRes = await db.query(
      `UPDATE device_attendance_raw
       SET synced_to_attendance = FALSE
       WHERE punch_time >= $1 AND employee_id IS NOT NULL
       RETURNING id`,
      [since]
    );

    // Remove device-sourced attendance records for the same window
    // (manual entries are preserved)
    const deleteRes = await db.query(
      `DELETE FROM attendance_records
       WHERE source = 'device' AND date >= $1::date
       RETURNING id`,
      [since]
    );

    console.log(`[Repair] Reset ${resetRes.rowCount} raw-punch flags, removed ${deleteRes.rowCount} device attendance records — re-pairing now...`);

    // Re-pair for every active device
    const devicesRes = await db.query('SELECT * FROM device_connections WHERE is_active = TRUE');
    for (const device of devicesRes.rows) {
      const synced = await pairPunchesToAttendance(device.id);
      console.log(`[Repair] ${device.name}: re-created ${synced} attendance records`);
    }

    console.log('[Repair] Attendance repair complete.');
  } catch (err) {
    console.error('[Repair] Attendance repair failed:', err.message);
  }
}

// ── Core pairing function ─────────────────────────────────────────────────────

/**
 * Groups all raw punches for the given device into employee+shift-date buckets,
 * resolves check_in / check_out for each bucket, and upserts attendance_records.
 *
 * Key design decisions:
 *  1. Shift date uses server-local hours (= device-local hours via node-zklib).
 *  2. For each employee+date that has NEW unsynced punches, ALL raw punches
 *     (synced + unsynced) are included in resolvePair so a check-out that
 *     arrives in a later sync cycle still pairs correctly with the already-
 *     synced check-in from a previous cycle.
 *  3. Only the newly unsynced raw IDs are marked synced — already-synced rows
 *     are not touched.
 *
 * Returns the number of attendance records created/updated.
 */
async function pairPunchesToAttendance(deviceId) {
  // 1. Find all unsynced punches → identify which employee+shift-dates need work
  const unsyncedResult = await db.query(
    `SELECT r.id, r.employee_id, r.punch_time, r.punch_state
     FROM device_attendance_raw r
     WHERE r.device_id = $1
       AND r.employee_id IS NOT NULL
       AND r.synced_to_attendance = FALSE
     ORDER BY r.employee_id, r.punch_time ASC`,
    [deviceId]
  );

  if (unsyncedResult.rows.length === 0) return 0;

  // Build: key ("employeeId|shiftDate") → [ raw_id, ... ] for newly unsynced rows
  const newRawIdsByKey = new Map();
  const affectedKeys   = new Set();

  for (const row of unsyncedResult.rows) {
    const shiftDate = getPunchShiftDate(new Date(row.punch_time));
    const key = `${row.employee_id}|${shiftDate}`;
    affectedKeys.add(key);
    if (!newRawIdsByKey.has(key)) newRawIdsByKey.set(key, []);
    newRawIdsByKey.get(key).push(row.id);
  }

  // 2. For every affected employee, fetch ALL raw punches (synced + unsynced).
  //    This is critical: when check-in was synced in a previous cycle, it must
  //    be included here so resolvePair can produce the correct check_out.
  const affectedEmployeeIds = [...new Set([...affectedKeys].map(k => k.split('|')[0]))];

  const allPunchesResult = await db.query(
    `SELECT r.employee_id, r.punch_time, r.punch_state
     FROM device_attendance_raw r
     WHERE r.device_id = $1
       AND r.employee_id = ANY($2)
     ORDER BY r.employee_id, r.punch_time ASC`,
    [deviceId, affectedEmployeeIds]
  );

  // 3. Re-group ALL punches — only keep groups that have new unsynced punches
  const groups = new Map();

  for (const row of allPunchesResult.rows) {
    const shiftDate = getPunchShiftDate(new Date(row.punch_time));
    const key = `${row.employee_id}|${shiftDate}`;
    if (!affectedKeys.has(key)) continue; // skip dates with no new punches

    if (!groups.has(key)) {
      groups.set(key, {
        employee_id: row.employee_id,
        date:        shiftDate,
        punches:     [],
        rawIds:      newRawIdsByKey.get(key) || [],
      });
    }
    groups.get(key).punches.push({ punchTime: new Date(row.punch_time), punchState: row.punch_state });
  }

  // 4. Upsert each group's resolved check_in / check_out
  let synced = 0;
  for (const [, group] of groups) {
    const { employee_id, date, punches, rawIds } = group;
    const { checkIn, checkOut, workHours } = resolvePair(punches);

    console.log(`[Pair] ${employee_id} ${date}: ${punches.length} punches → in=${checkIn?.toISOString() ?? 'null'} out=${checkOut?.toISOString() ?? 'null'}`);

    try {
      await db.query(
        `INSERT INTO attendance_records
           (employee_id, date, check_in, check_out, work_hours, status, source, device_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'present', 'device', $6, NOW())
         ON CONFLICT (employee_id, date)
         DO UPDATE SET
           -- Preserve manual records; overwrite device records with fresh resolvePair result
           check_in   = CASE WHEN attendance_records.source = 'manual' THEN attendance_records.check_in  ELSE EXCLUDED.check_in  END,
           check_out  = CASE WHEN attendance_records.source = 'manual' THEN attendance_records.check_out ELSE EXCLUDED.check_out END,
           work_hours = CASE WHEN attendance_records.source = 'manual' THEN attendance_records.work_hours ELSE EXCLUDED.work_hours END,
           status     = CASE WHEN attendance_records.source = 'manual' THEN attendance_records.status ELSE 'present' END,
           source     = CASE WHEN attendance_records.source = 'manual' THEN 'manual' ELSE 'device' END,
           device_id  = COALESCE(attendance_records.device_id, EXCLUDED.device_id),
           updated_at = NOW()`,
        [employee_id, date, checkIn, checkOut, workHours, deviceId]
      );

      // Only mark the NEW unsynced raw rows as synced
      await db.query(
        'UPDATE device_attendance_raw SET synced_to_attendance = TRUE WHERE id = ANY($1)',
        [rawIds]
      );

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
