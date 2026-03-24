/**
 * Audit Logger — records every significant action in the system.
 *
 * Usage:
 *   const { logAction } = require('../utils/auditLogger');
 *   await logAction({ userId, action, entity, entityId, oldValue, newValue, req });
 *
 * All parameters except `userId` and `action` are optional.
 */

const db = require('../db');

/**
 * @param {Object} opts
 * @param {string}  opts.userId    – UUID of the user performing the action
 * @param {string}  opts.action    – CREATE | UPDATE | DELETE | VIEW | LOGIN | LOGOUT | CHECK_IN | CHECK_OUT
 * @param {string}  [opts.entity]  – Entity type: 'attendance', 'employee', 'leave', etc.
 * @param {string}  [opts.entityId]– UUID or ID of the entity acted upon
 * @param {Object}  [opts.oldValue]– Previous state (for UPDATE / DELETE)
 * @param {Object}  [opts.newValue]– New state (for CREATE / UPDATE)
 * @param {Object}  [opts.req]     – Express request object (extracts IP + user agent)
 * @param {string}  [opts.details] – Free-text description of the action
 */
async function logAction({ userId, action, entity, entityId, oldValue, newValue, req, details }) {
  try {
    const ip = req
      ? req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null
      : null;
    const ua = req ? req.headers['user-agent'] || null : null;

    await db.query(
      `INSERT INTO audit_logs
         (user_id, action_type, entity_type, entity_id, old_value, new_value, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        action,
        entity || null,
        entityId ? String(entityId) : null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ip,
        ua,
        details || null,
      ]
    );
  } catch (err) {
    // Audit logging must never break the parent operation.
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAction };
