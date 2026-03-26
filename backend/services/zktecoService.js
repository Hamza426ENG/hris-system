/**
 * ZKTeco Device Service
 *
 * Communicates with ZKTeco biometric attendance devices via the ZK protocol.
 * Provides: connect, disconnect, get attendance logs, get users, device info.
 *
 * Uses node-zklib under the hood.
 *
 * ZKTeco punch_state values:
 *   0 = Check In
 *   1 = Check Out
 *   2 = Break Out
 *   3 = Break In
 *   4 = Overtime In
 *   5 = Overtime Out
 */

const ZKLib = require('node-zklib');

// Active connections cache — keyed by device ID
const activeConnections = new Map();

/**
 * Create a ZKLib instance for a device config.
 */
function createInstance(device) {
  return new ZKLib(
    device.ip_address,
    device.port || 4370,
    device.connection_timeout || 60000, // 60 s — matches reference server config
    4000 // inactivity timeout
  );
}

/**
 * Connect to a device. Returns the ZKLib instance.
 * Caches the connection for reuse.
 */
async function connect(device) {
  if (activeConnections.has(device.id)) {
    const cached = activeConnections.get(device.id);
    try {
      await cached.getInfo();
      return cached;
    } catch {
      try { await cached.disconnect(); } catch { /* ignore */ }
      activeConnections.delete(device.id);
    }
  }

  const zk = createInstance(device);

  try {
    await zk.createSocket();
    activeConnections.set(device.id, zk);
    return zk;
  } catch (err) {
    throw new Error(`Failed to connect to device ${device.name || device.ip_address}: ${err.message}`);
  }
}

/**
 * Disconnect from a device.
 */
async function disconnect(device) {
  const zk = activeConnections.get(device.id);
  if (zk) {
    try { await zk.disconnect(); } catch { /* ignore */ }
    activeConnections.delete(device.id);
  }
}

/**
 * Disconnect all cached connections (for graceful shutdown).
 */
async function disconnectAll() {
  for (const [, zk] of activeConnections) {
    try { await zk.disconnect(); } catch { /* ignore */ }
  }
  activeConnections.clear();
}

/**
 * Test connectivity to a device. Returns { success, info?, error? }.
 */
async function testConnection(device) {
  const zk = createInstance(device);
  try {
    await zk.createSocket();
    let info = {};
    try { info = await zk.getInfo(); } catch { /* some devices don't support getInfo */ }
    await zk.disconnect();
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Parse a punch timestamp from the device into a proper UTC Date.
 *
 * node-zklib may return:
 *   - A JavaScript Date object (already parsed but assumed UTC — wrong for local-time devices)
 *   - An ISO string  e.g. "2025-03-20T08:30:00.000Z"
 *   - A local datetime string e.g. "2025-03-20 08:30:00"
 *
 * ZKTeco devices store times in device local time. node-zklib parses them
 * assuming local system time, which is correct when the server is in the
 * same timezone as the device. We keep the Date as-is — the device stores
 * actual wall-clock time; we just want the value the device reported.
 */
function parsePunchTime(raw) {
  if (!raw) return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return raw;
  }
  // ISO string or "YYYY-MM-DD HH:MM:SS"
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Get attendance logs from the device.
 *
 * Returns array of:
 *   { deviceUserId, punchTime, punchState, verified }
 *
 * node-zklib getAttendances() can return two different shapes depending on
 * firmware version:
 *
 * Format A (newer firmware / node-zklib ≥ 1.x):
 *   { uid, id, state, timestamp, type }
 *
 * Format B (older / SDK-based):
 *   { userSn, deviceUserId, recordTime, verified, punchState }
 *
 * We try every known field name and pick whichever is populated.
 */
async function getAttendanceLogs(device) {
  // ZKTeco devices near full capacity (>20K logs) often return partial data
  // on first fetch. Strategy:
  //   1. Always use a BRAND NEW ZKLib instance per attempt (no cached socket)
  //   2. Call freeData() before getAttendances() to reset device send buffer
  //   3. Run up to MAX_ATTEMPTS, keep the best (largest) result
  //   4. Incremental filtering happens in the caller — we just return the most
  //      complete snapshot we can get from the device
  const MAX_ATTEMPTS = 3;
  let bestRaw = [];
  let expectedLogs = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Always drop any cached connection and create a fresh instance
    await disconnect(device);

    // Create a fresh ZKLib instance (not through the cache)
    const zk = new (require('node-zklib'))(
      device.ip_address,
      device.port || 4370,
      60000,  // connection timeout 60s
      4000    // inactivity timeout
    );

    try {
      await zk.createSocket();

      // Get expected count once (first attempt only)
      if (attempt === 1) {
        try {
          const info = await zk.getInfo();
          expectedLogs = info?.logCounts || 0;
        } catch { /* device may not support getInfo */ }
      }

      // Free the device's send buffer before requesting — this helps when
      // the device is near capacity and the previous read left state behind
      try { await zk.freeData(); } catch { /* not all firmware supports this */ }

      const result = await zk.getAttendances();
      const raw = result?.data || [];

      console.log(`[ZKTeco] ${device.name}: attempt ${attempt}/${MAX_ATTEMPTS} — fetched ${raw.length} records (device reports ${expectedLogs} logs)`);

      if (raw.length > bestRaw.length) {
        bestRaw = raw;
      }

      // Accept immediately if we got ≥80% of expected OR if on last attempt
      if ((expectedLogs > 0 && raw.length >= expectedLogs * 0.8) || attempt === MAX_ATTEMPTS) {
        if (expectedLogs > 0) {
          console.log(`[ZKTeco] ${device.name}: accepting ${bestRaw.length}/${expectedLogs} records after attempt ${attempt}`);
        }
        try { await zk.disconnect(); } catch { /* ignore */ }
        break;
      }

      try { await zk.disconnect(); } catch { /* ignore */ }

      // Short pause before retry so device resets its transfer state
      await new Promise(r => setTimeout(r, 2000));
      console.log(`[ZKTeco] ${device.name}: retrying fetch (attempt ${attempt + 1} of ${MAX_ATTEMPTS})...`);
    } catch (err) {
      console.warn(`[ZKTeco] ${device.name}: attempt ${attempt} error: ${err.message}`);
      try { await zk.disconnect(); } catch { /* ignore */ }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, 2000));
      } else if (bestRaw.length === 0) {
        throw err;
      }
    }
  }

  const raw = bestRaw;

  if (raw.length === 0) {
    console.log(`[ZKTeco] No attendance records returned from ${device.name || device.ip_address} after ${MAX_ATTEMPTS} attempts`);
    return [];
  }

  console.log(`[ZKTeco] ${device.name}: ${raw.length} raw records (best of ${MAX_ATTEMPTS} attempts). Sample:`, JSON.stringify(raw[0]));

    const logs = raw
      .map(log => {
        // ── device user ID ───────────────────────────────────────────
        // Try every known field name across firmware versions
        const userId =
          log.deviceUserId  ??   // Format B
          log.visibleId     ??   // some firmware versions
          log.id            ??   // Format A (node-zklib v1.x)
          log.uid           ??   // fallback
          null;

        // ── punch timestamp ──────────────────────────────────────────
        const rawTime =
          log.recordTime    ??   // Format B string
          log.timestamp     ??   // Format A Date object
          null;

        // ── punch state (in/out direction) ───────────────────────────
        // 0=CheckIn, 1=CheckOut, 2=BreakOut, 3=BreakIn, 4=OvertimeIn, 5=OvertimeOut
        const state =
          log.state         ??   // Format A
          log.punchState    ??   // Format B
          log.inOutMode     ??   // raw ZK protocol field
          null;

        // ── verification method ──────────────────────────────────────
        const verified =
          log.verified      ??
          log.type          ??   // Format A calls it 'type'
          null;

        return {
          deviceUserId: userId !== null && userId !== undefined ? String(userId).trim() : '',
          punchTime:    parsePunchTime(rawTime),
          punchState:   state !== null && state !== undefined ? parseInt(state) : null,
          verified:     verified !== null && verified !== undefined ? parseInt(verified) : null,
        };
      })
      .filter(log => {
        if (!log.deviceUserId) return false;
        if (!log.punchTime) return false;
        const year = log.punchTime.getFullYear();
        const currentYear = new Date().getFullYear();
        // Reject garbage timestamps: before 2001 or beyond the current calendar year
        if (year < 2001 || year > currentYear) return false;
        return true;
      });

    console.log(`[ZKTeco] ${device.name}: ${logs.length} valid punches after filtering`);

    // Log punch state distribution so we can verify in/out data is coming through
    if (logs.length > 0) {
      const stateCounts = logs.reduce((acc, l) => {
        const s = l.punchState ?? 'null';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {});
      console.log(`[ZKTeco] ${device.name}: punch state distribution:`, stateCounts);
    }

    return logs;
}

/**
 * Get users enrolled on the device.
 * Returns array of { deviceUserId, name, role, cardno, uid }.
 */
async function getUsers(device) {
  const zk = await connect(device);
  try {
    const result = await zk.getUsers();
    const users = (result?.data || []).map(u => ({
      deviceUserId: String(u.userId ?? u.uid ?? ''),
      name:         u.name || '',
      role:         u.role,
      cardno:       u.cardno,
      uid:          u.uid,
    }));
    return users;
  } finally {
    // Keep connection cached
  }
}

/**
 * Get device info (serial number, firmware, etc.).
 */
async function getDeviceInfo(device) {
  const zk = await connect(device);
  try {
    return await zk.getInfo();
  } finally {
    // Keep connection cached
  }
}

/**
 * Start real-time log monitoring.
 */
async function startRealTime(device) {
  const zk = await connect(device);
  try {
    await zk.getRealTimeLogs();
    return zk;
  } catch (err) {
    throw new Error(`Failed to start real-time monitoring: ${err.message}`);
  }
}

/**
 * Stop real-time monitoring and disconnect.
 */
async function stopRealTime(device) {
  await disconnect(device);
}

/**
 * Clear all attendance logs from the device.
 * USE WITH CAUTION — irreversible.
 */
async function clearAttendanceLogs(device) {
  const zk = await connect(device);
  try {
    await zk.clearAttendanceLog();
    return { success: true };
  } catch (err) {
    throw new Error(`Failed to clear logs: ${err.message}`);
  }
}

module.exports = {
  connect,
  disconnect,
  disconnectAll,
  testConnection,
  getAttendanceLogs,
  getUsers,
  getDeviceInfo,
  startRealTime,
  stopRealTime,
  clearAttendanceLogs,
};
