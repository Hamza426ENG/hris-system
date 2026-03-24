/**
 * Audit Logs — Super Admin only.
 *
 * GET /logs?user_id=&action=&entity=&start_date=&end_date=&page=&limit=
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('super_admin'));

/**
 * GET /logs
 * Paginated, filterable audit log viewer.
 */
router.get('/', async (req, res) => {
  try {
    const { user_id, action, entity, entity_id, start_date, end_date, search } = req.query;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (user_id) {
      conditions.push(`al.user_id = $${idx}`);
      params.push(user_id);
      idx++;
    }
    if (action) {
      conditions.push(`al.action_type = $${idx}`);
      params.push(action);
      idx++;
    }
    if (entity) {
      conditions.push(`al.entity_type = $${idx}`);
      params.push(entity);
      idx++;
    }
    if (entity_id) {
      conditions.push(`al.entity_id = $${idx}`);
      params.push(entity_id);
      idx++;
    }
    if (start_date) {
      conditions.push(`al.created_at >= $${idx}`);
      params.push(start_date);
      idx++;
    }
    if (end_date) {
      conditions.push(`al.created_at <= ($${idx}::date + INTERVAL '1 day')`);
      params.push(end_date);
      idx++;
    }
    if (search) {
      conditions.push(`(al.details ILIKE $${idx} OR al.entity_type ILIKE $${idx} OR al.action_type ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM audit_logs al ${whereClause}`, params),
      db.query(
        `SELECT
           al.*,
           u.email AS user_email,
           COALESCE(e.first_name || ' ' || e.last_name, u.email) AS user_name
         FROM audit_logs al
         LEFT JOIN users     u ON u.id = al.user_id
         LEFT JOIN employees e ON e.user_id = al.user_id
         ${whereClause}
         ORDER BY al.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
    ]);

    res.json({
      logs:  dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /logs error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
