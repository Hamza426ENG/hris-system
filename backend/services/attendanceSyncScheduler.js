/**
 * Attendance Auto-Sync Scheduler
 *
 * Periodically pulls new attendance logs from all active ZKTeco devices
 * and syncs them into the attendance_records table.
 *
 * Runs every ZKTECO_SYNC_INTERVAL minutes (default 30, 0 = disabled).
 * Each cycle:
 *   1. Fetches all active devices with auto_sync = true
 *   2. Connects to each device, pulls new logs
 *   3. Inserts raw punches (deduplicated via UNIQUE constraint)
 *   4. Pairs punches into check-in/check-out attendance records
 *   5. Updates device sync status
 */

const db = require('../db');
const zkService = require('./zktecoService');

let syncTimer = null;
let isSyncing = false;

/**
 * Sync a single device — pull logs, store raw, pair to attendance.
 * Returns { deviceId, rawInserted, attendanceSynced, error? }
 */
async function syncDevice(device) {
  const result = { deviceId: device.id, deviceName: device.name, rawInserted: 0, attendanceSynced: 0 };

  try {
    // 1. Pull attendance logs from device
    const logs = await zkService.getAttendanceLogs(device);
    if (!logs || logs.length === 0) {
      await updateSyncStatus(device.id, 'success', 'No new logs on device', 0);
      return result;
    }

    // 2. Load user→employee mappings
    const mappingRes = await db.query(
      'SELECT device_user_id, employee_id FROM device_user_mapping WHERE device_id = $1 AND employee_id IS NOT NULL',
      [device.id]
    );
    const userMap = new Map(mappingRes.rows.map(m => [m.device_user_id, m.employee_id]));

    // 3. Insert raw logs (deduplicated)
    for (const log of logs) {
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
        // Skip individual insert errors
      }
    }

    // 4. Pair unsynced punches into attendance_records
    result.attendanceSynced = await pairPunchesToAttendance(device.id);

    // 5. Update device sync status
    await updateSyncStatus(
      device.id,
      'success',
      `Auto-sync: ${result.rawInserted} new punches → ${result.attendanceSynced} attendance records`,
      result.attendanceSynced
    );

    return result;
  } catch (err) {
    result.error = err.message;
    await updateSyncStatus(device.id, 'error', `Auto-sync failed: ${err.message}`, 0).catch(() => {});
    return result;
  }
}

/**
 * Run one sync cycle across all active auto-sync devices.
 */
async function runSyncCycle() {
  if (isSyncing) {
    console.log('[Auto-Sync] Previous cycle still running, skipping.');
    return;
  }

  isSyncing = true;
  const cycleStart = Date.now();

  try {
    // Get all active devices with auto_sync enabled
    const devicesRes = await db.query(
      'SELECT * FROM device_connections WHERE is_active = TRUE AND auto_sync = TRUE'
    );

    if (devicesRes.rows.length === 0) {
      return;
    }

    console.log(`[Auto-Sync] Starting cycle for ${devicesRes.rows.length} device(s)...`);

    let totalRaw = 0;
    let totalSynced = 0;

    for (const device of devicesRes.rows) {
      const result = await syncDevice(device);
      totalRaw += result.rawInserted;
      totalSynced += result.attendanceSynced;

      if (result.error) {
        console.warn(`[Auto-Sync] ${device.name} (${device.ip_address}): ERROR - ${result.error}`);
      } else if (result.rawInserted > 0 || result.attendanceSynced > 0) {
        console.log(`[Auto-Sync] ${device.name}: ${result.rawInserted} new punches → ${result.attendanceSynced} attendance records`);
      }

      // Disconnect after sync to free the connection
      await zkService.disconnect(device);
    }

    const duration = ((Date.now() - cycleStart) / 1000).toFixed(1);
    if (totalRaw > 0 || totalSynced > 0) {
      console.log(`[Auto-Sync] Cycle complete in ${duration}s: ${totalRaw} new punches → ${totalSynced} attendance records`);
    }
  } catch (err) {
    console.error('[Auto-Sync] Cycle error:', err.message);
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the auto-sync scheduler.
 * Reads ZKTECO_SYNC_INTERVAL from env (minutes). 0 = disabled.
 */
function start() {
  const intervalMinutes = parseInt(process.env.ZKTECO_SYNC_INTERVAL) || 30;

  if (intervalMinutes <= 0) {
    console.log('[Auto-Sync] Disabled (ZKTECO_SYNC_INTERVAL=0)');
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[Auto-Sync] Scheduled every ${intervalMinutes} minutes`);

  // Run first sync after 10 seconds (let server finish starting)
  setTimeout(() => {
    runSyncCycle();
  }, 10000);

  // Then run on interval
  syncTimer = setInterval(runSyncCycle, intervalMs);
}

/**
 * Stop the auto-sync scheduler.
 */
function stop() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    console.log('[Auto-Sync] Stopped');
  }
}

// ─── Helpers (same logic as devices.js) ────────────────────────────────────

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

async function pairPunchesToAttendance(deviceId) {
  const rawResult = await db.query(
    `SELECT r.id, r.employee_id, r.punch_time, r.device_id
     FROM device_attendance_raw r
     WHERE r.device_id = $1 AND r.employee_id IS NOT NULL AND r.synced_to_attendance = FALSE
     ORDER BY r.employee_id, r.punch_time ASC`,
    [deviceId]
  );

  if (rawResult.rows.length === 0) return 0;

  // Group by employee_id + date
  const groups = new Map();
  for (const row of rawResult.rows) {
    const punchDate = new Date(row.punch_time);
    const dateStr = punchDate.toISOString().split('T')[0];
    const key = `${row.employee_id}|${dateStr}`;
    if (!groups.has(key)) {
      groups.set(key, { employee_id: row.employee_id, date: dateStr, punches: [], rawIds: [] });
    }
    const g = groups.get(key);
    g.punches.push(punchDate);
    g.rawIds.push(row.id);
  }

  let synced = 0;
  for (const [, group] of groups) {
    const { employee_id, date, punches, rawIds } = group;
    punches.sort((a, b) => a - b);

    const checkIn = punches[0];
    const checkOut = punches.length > 1 ? punches[punches.length - 1] : null;
    const workHours = checkOut ? ((checkOut - checkIn) / 3600000).toFixed(2) : null;

    try {
      await db.query(
        `INSERT INTO attendance_records
           (employee_id, date, check_in, check_out, work_hours, status, source, device_id, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'present', 'device', $6, NOW())
         ON CONFLICT (employee_id, date)
         DO UPDATE SET
           check_in   = LEAST(attendance_records.check_in, EXCLUDED.check_in),
           check_out  = GREATEST(attendance_records.check_out, EXCLUDED.check_out),
           work_hours = CASE
             WHEN EXCLUDED.check_out IS NOT NULL
             THEN ROUND(EXTRACT(EPOCH FROM (
               GREATEST(attendance_records.check_out, EXCLUDED.check_out) -
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
        `UPDATE device_attendance_raw SET synced_to_attendance = TRUE WHERE id = ANY($1)`,
        [rawIds]
      );

      synced++;
    } catch (err) {
      console.warn(`[Auto-Sync] Attendance upsert error for ${employee_id} on ${date}:`, err.message);
    }
  }

  return synced;
}

module.exports = { start, stop, runSyncCycle };
