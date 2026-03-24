/**
 * ZKTeco Device Service
 *
 * Communicates with ZKTeco biometric attendance devices via the ZK protocol.
 * Provides: connect, disconnect, get attendance logs, get users, device info.
 *
 * Uses node-zklib under the hood.
 */

const ZKLib = require('node-zklib');

// Active connections cache — keyed by device ID
const activeConnections = new Map();

/**
 * Create a ZKLib instance for a device config.
 * @param {Object} device - { ip_address, port, connection_timeout }
 * @returns {ZKLib}
 */
function createInstance(device) {
  return new ZKLib(
    device.ip_address,
    device.port || 4370,
    device.connection_timeout || 5000,
    4000 // inactivity timeout
  );
}

/**
 * Connect to a device. Returns the ZKLib instance.
 * Caches the connection for reuse.
 */
async function connect(device) {
  // If we have a cached connection, try to reuse it
  if (activeConnections.has(device.id)) {
    const cached = activeConnections.get(device.id);
    try {
      // Quick ping — if this fails, reconnect
      await cached.getInfo();
      return cached;
    } catch {
      // Stale connection, clean up
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
  for (const [id, zk] of activeConnections) {
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
    try {
      info = await zk.getInfo();
    } catch { /* some devices don't support getInfo */ }
    await zk.disconnect();
    return { success: true, info };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get attendance logs from the device.
 * Returns array of { deviceUserId, punchTime, punchState, verified }.
 *
 * node-zklib getAttendances() returns objects with these fields:
 *   - userSn:       internal serial number of the record
 *   - deviceUserId: the user ID on the device (badge / enrollment number)
 *   - recordTime:   ISO date string of the punch
 *   - ip:           device IP
 *
 * Note: some device firmware returns { uid, id, timestamp, state } instead.
 * We handle both formats and filter out junk records (empty userId or year 2000).
 */
async function getAttendanceLogs(device) {
  const zk = await connect(device);
  try {
    const result = await zk.getAttendances();
    const raw = result?.data || [];

    const logs = raw
      .map(log => ({
        deviceUserId: String(log.deviceUserId ?? log.id ?? ''),
        punchTime:    log.recordTime ?? log.timestamp ?? null,
        punchState:   log.state ?? null,
        verified:     log.verified ?? null,
      }))
      .filter(log => {
        // Filter out junk: empty userId or year-2000 placeholder dates
        if (!log.deviceUserId || log.deviceUserId.trim() === '') return false;
        if (!log.punchTime) return false;
        const d = new Date(log.punchTime);
        if (isNaN(d.getTime()) || d.getFullYear() <= 2000) return false;
        return true;
      });

    return logs;
  } finally {
    // Don't disconnect — keep cached for subsequent calls
  }
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
      deviceUserId: String(u.userId),
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
    const info = await zk.getInfo();
    return info;
  } finally {
    // Keep connection cached
  }
}

/**
 * Get real-time log events from the device.
 * Returns an event emitter that fires 'data' events for each punch.
 *
 * Usage:
 *   const emitter = await startRealTime(device);
 *   emitter.on('data', (event) => { ... });
 *   // later: stopRealTime(device);
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
 * USE WITH CAUTION — this is irreversible on the device.
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
