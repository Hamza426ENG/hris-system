const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

// ── File upload configuration ────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'uploads', 'tickets');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Invalid file type. Allowed: png, jpg, gif, pdf, doc, docx, txt, xlsx, xls'));
  },
});

// All routes require authentication
router.use(authenticate);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function generateTicketNumber() {
  const result = await db.query("SELECT nextval('ticket_number_seq')");
  return `TKT-${String(result.rows[0].nextval).padStart(6, '0')}`;
}

async function calculateSLADue(priority, departmentId, createdAt) {
  // Department-specific rule first, then global fallback
  let result = await db.query(
    'SELECT resolution_time_hours FROM ticket_sla_rules WHERE priority = $1 AND department_id = $2 AND is_active = TRUE',
    [priority, departmentId]
  );
  if (result.rows.length === 0) {
    result = await db.query(
      'SELECT resolution_time_hours FROM ticket_sla_rules WHERE priority = $1 AND department_id IS NULL AND is_active = TRUE',
      [priority]
    );
  }
  if (result.rows.length === 0) return null;
  const due = new Date(createdAt);
  due.setHours(due.getHours() + result.rows[0].resolution_time_hours);
  return due;
}

async function logTicketActivity(ticketId, changedBy, action, oldValue, newValue) {
  try {
    await db.query(
      'INSERT INTO ticket_activity_log (ticket_id, changed_by, action, old_value, new_value) VALUES ($1, $2, $3, $4, $5)',
      [ticketId, changedBy, action, oldValue || null, newValue || null]
    );
  } catch (err) {
    console.error('Ticket activity log failed:', err.message);
  }
}

async function notifyUser(ticketId, recipientId, type, title, message) {
  if (!recipientId) return;
  try {
    await db.query(
      'INSERT INTO ticket_notifications (ticket_id, recipient_user_id, notification_type, notification_title, notification_message) VALUES ($1, $2, $3, $4, $5)',
      [ticketId, recipientId, type, title, message]
    );
  } catch (err) {
    console.error('Ticket notification failed:', err.message);
  }
}

function getSLAStatus(slaDueAt, resolvedAt) {
  if (!slaDueAt) return null;
  const now = resolvedAt ? new Date(resolvedAt) : new Date();
  const due = new Date(slaDueAt);
  if (now > due) return 'breached';
  const hoursRemaining = (due - now) / (1000 * 60 * 60);
  if (hoursRemaining <= 4) return 'at_risk';
  return 'on_track';
}

const ADMIN_ROLES = ['super_admin', 'hr_admin'];
const MANAGEMENT_ROLES = ['super_admin', 'hr_admin', 'hr_manager', 'manager'];
const STAFF_ROLES = ['super_admin', 'hr_admin', 'hr_manager', 'manager', 'team_lead'];

// Role hierarchy: higher number = more senior
const ROLE_LEVEL = {
  employee: 1,
  team_lead: 2,
  manager: 3,
  hr_manager: 4,
  hr_admin: 5,
  super_admin: 6,
};

/**
 * Validate whether the requesting user can assign a ticket to the target user.
 * Rules:
 *   - super_admin / hr_admin can assign to anyone
 *   - staff (manager, team_lead, hr_manager) cannot assign to super_admin / hr_admin
 *   - employees cannot assign to anyone senior (team_lead, manager, hr, super_admin)
 */
async function validateAssignment(assignerRole, targetUserId) {
  if (!targetUserId) return { valid: true }; // unassigning is always ok

  // Admins can assign to anyone
  if (ADMIN_ROLES.includes(assignerRole)) return { valid: true };

  // Look up target user's role
  const targetRes = await db.query('SELECT role FROM users WHERE id = $1', [targetUserId]);
  if (targetRes.rows.length === 0) return { valid: false, error: 'Assignee user not found' };

  const targetRole = targetRes.rows[0].role;
  const assignerLevel = ROLE_LEVEL[assignerRole] || 1;
  const targetLevel = ROLE_LEVEL[targetRole] || 1;

  // Employees cannot assign to anyone at a higher level
  if (assignerRole === 'employee' && targetLevel > assignerLevel) {
    return { valid: false, error: 'Employees cannot assign tickets to supervisors or senior staff' };
  }

  // Staff cannot assign to admins
  if (ADMIN_ROLES.includes(targetRole) && !ADMIN_ROLES.includes(assignerRole)) {
    return { valid: false, error: 'Only admins can assign tickets to admin users' };
  }

  return { valid: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORIES
// ═════════════════════════════════════════════════════════════════════════════

router.get('/categories', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ticket_categories WHERE is_active = TRUE ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/categories', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { name, description, department_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const result = await db.query(
      'INSERT INTO ticket_categories (name, description, department_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, department_id || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Category already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SLA RULES
// ═════════════════════════════════════════════════════════════════════════════

router.get('/sla-rules', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT sr.*, d.name AS department_name
      FROM ticket_sla_rules sr
      LEFT JOIN departments d ON d.id = sr.department_id
      WHERE sr.is_active = TRUE
      ORDER BY CASE sr.priority
        WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4
      END
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/notifications', async (req, res) => {
  try {
    const { limit = 20, unread_only } = req.query;
    let query = `
      SELECT tn.*, t.ticket_number, t.title as ticket_title
      FROM ticket_notifications tn
      LEFT JOIN tickets t ON t.id = tn.ticket_id
      WHERE tn.recipient_user_id = $1
    `;
    const params = [req.user.id];
    if (unread_only === 'true') query += ' AND tn.is_read = FALSE';
    query += ' ORDER BY tn.created_at DESC LIMIT $2';
    params.push(parseInt(limit));

    const result = await db.query(query, params);
    const countResult = await db.query(
      'SELECT COUNT(*) FROM ticket_notifications WHERE recipient_user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );

    res.json({ notifications: result.rows, unread_count: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notifications/mark-read', async (req, res) => {
  try {
    const { notification_ids } = req.body;
    if (notification_ids && notification_ids.length > 0) {
      await db.query(
        'UPDATE ticket_notifications SET is_read = TRUE, read_at = NOW() WHERE id = ANY($1) AND recipient_user_id = $2',
        [notification_ids, req.user.id]
      );
    } else {
      await db.query(
        'UPDATE ticket_notifications SET is_read = TRUE, read_at = NOW() WHERE recipient_user_id = $1 AND is_read = FALSE',
        [req.user.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// STATS (quick summary — must come before /:id)
// ═════════════════════════════════════════════════════════════════════════════

router.get('/stats/summary', async (req, res) => {
  try {
    const role = req.user.role;
    const conditions = ['t.is_deleted = FALSE'];
    const params = [req.user.id]; // $1 = current user id

    if (role === 'employee') {
      conditions.push('(t.created_by = $1 OR t.assigned_to = $1)');
    } else if (role === 'team_lead') {
      conditions.push(`(t.created_by = $1 OR t.assigned_to = $1 OR t.department_id IN (
        SELECT department_id FROM employees WHERE user_id = $1
      ))`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await db.query(`
      SELECT
        COUNT(*)                                                                     AS total,
        COUNT(*) FILTER (WHERE t.status = 'open')                                    AS open,
        COUNT(*) FILTER (WHERE t.status = 'in_progress')                             AS in_progress,
        COUNT(*) FILTER (WHERE t.status = 'resolved')                                AS resolved,
        COUNT(*) FILTER (WHERE t.status = 'closed')                                  AS closed,
        COUNT(*) FILTER (WHERE t.status = 'on_hold')                                 AS on_hold,
        COUNT(*) FILTER (WHERE t.assigned_to = $1 AND t.status NOT IN ('closed','resolved')) AS my_assigned
      FROM tickets t ${where}
    `, params);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/analytics/dashboard', authorize(...MANAGEMENT_ROLES), async (req, res) => {
  try {
    const { date_from, date_to, department_id } = req.query;
    const conditions = ['t.is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    if (date_from) { conditions.push(`t.created_at >= $${idx}`); params.push(date_from); idx++; }
    if (date_to)   { conditions.push(`t.created_at <= $${idx}`); params.push(date_to);   idx++; }
    if (department_id) { conditions.push(`t.department_id = $${idx}`); params.push(department_id); idx++; }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Summary
    const summary = await db.query(`
      SELECT
        COUNT(*)                                              AS total_tickets,
        COUNT(*) FILTER (WHERE t.status = 'open')             AS open_tickets,
        COUNT(*) FILTER (WHERE t.status = 'in_progress')      AS in_progress_tickets,
        COUNT(*) FILTER (WHERE t.status = 'resolved')         AS resolved_tickets,
        COUNT(*) FILTER (WHERE t.status = 'closed')           AS closed_tickets,
        COUNT(*) FILTER (WHERE t.status = 'on_hold')          AS on_hold_tickets
      FROM tickets t ${where}
    `, params);

    // By priority
    const byPriority = await db.query(`
      SELECT t.priority, COUNT(*) AS total,
        AVG(CASE WHEN t.resolved_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600 END) AS avg_resolution_hours
      FROM tickets t ${where}
      GROUP BY t.priority
    `, params);

    // By department
    const byDept = await db.query(`
      SELECT d.name AS department_name, COUNT(*) AS ticket_count,
        AVG(CASE WHEN t.resolved_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600 END) AS avg_resolution_hours
      FROM tickets t
      JOIN departments d ON d.id = t.department_id
      ${where}
      GROUP BY d.name ORDER BY ticket_count DESC
    `, params);

    // By category
    const byCategory = await db.query(`
      SELECT COALESCE(tc.name, 'Uncategorized') AS category, COUNT(*) AS count
      FROM tickets t
      LEFT JOIN ticket_categories tc ON tc.id = t.category_id
      ${where}
      GROUP BY tc.name ORDER BY count DESC
    `, params);

    // SLA compliance
    const sla = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE t.sla_due_at IS NOT NULL) AS total_with_sla,
        COUNT(*) FILTER (WHERE t.sla_due_at IS NOT NULL AND t.resolved_at IS NOT NULL AND t.resolved_at <= t.sla_due_at) AS met_sla,
        COUNT(*) FILTER (WHERE t.sla_due_at IS NOT NULL AND (
          (t.resolved_at IS NOT NULL AND t.resolved_at > t.sla_due_at) OR
          (t.resolved_at IS NULL AND NOW() > t.sla_due_at AND t.status NOT IN ('resolved','closed'))
        )) AS breached_sla
      FROM tickets t ${where}
    `, params);

    // 7-day trend
    const trend = await db.query(`
      SELECT d.date::date,
        COALESCE(c.count, 0) AS created,
        COALESCE(r.count, 0) AS resolved
      FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day') d(date)
      LEFT JOIN (SELECT created_at::date AS date, COUNT(*) AS count FROM tickets WHERE is_deleted = FALSE GROUP BY 1) c ON c.date = d.date
      LEFT JOIN (SELECT resolved_at::date AS date, COUNT(*) AS count FROM tickets WHERE resolved_at IS NOT NULL AND is_deleted = FALSE GROUP BY 1) r ON r.date = d.date
      ORDER BY d.date
    `);

    const totalSLA = parseInt(sla.rows[0].total_with_sla) || 0;
    const metSLA   = parseInt(sla.rows[0].met_sla) || 0;

    res.json({
      summary: summary.rows[0],
      by_priority: byPriority.rows,
      by_department: byDept.rows,
      by_category: byCategory.rows,
      sla: {
        total_with_sla: totalSLA,
        met: metSLA,
        breached: parseInt(sla.rows[0].breached_sla) || 0,
        compliance_percent: totalSLA > 0 ? Math.round((metSLA / totalSLA) * 100) : 100,
      },
      trend: trend.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ASSIGNABLE USERS (for dropdowns)
// ═════════════════════════════════════════════════════════════════════════════

router.get('/assignable-users', async (req, res) => {
  try {
    const role = req.user.role;

    // Super admin & HR can assign to anyone
    if (ADMIN_ROLES.includes(role)) {
      const result = await db.query(`
        SELECT u.id, u.email, u.role, e.first_name, e.last_name
        FROM users u
        LEFT JOIN employees e ON e.user_id = u.id
        WHERE u.is_active = TRUE
        ORDER BY e.first_name, e.last_name
      `);
      return res.json(result.rows);
    }

    // Managers/team leads can assign to peers and below (not to super_admin/hr_admin)
    if (STAFF_ROLES.includes(role)) {
      const result = await db.query(`
        SELECT u.id, u.email, u.role, e.first_name, e.last_name
        FROM users u
        LEFT JOIN employees e ON e.user_id = u.id
        WHERE u.is_active = TRUE AND u.role NOT IN ('super_admin', 'hr_admin')
        ORDER BY e.first_name, e.last_name
      `);
      return res.json(result.rows);
    }

    // Employees can only assign to peers (other employees) — not to HR, super_admin, managers, team leads
    const result = await db.query(`
      SELECT u.id, u.email, u.role, e.first_name, e.last_name
      FROM users u
      LEFT JOIN employees e ON e.user_id = u.id
      WHERE u.is_active = TRUE AND u.role = 'employee'
      ORDER BY e.first_name, e.last_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// LIST TICKETS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const {
      status, priority, department_id, assigned_to, created_by,
      search, category_id, sla_status: slaFilter,
      page = 1, limit = 20, sort_by = 'created_at', sort_order = 'desc',
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['t.is_deleted = FALSE'];
    const params = [];
    let idx = 1;

    // Role-based visibility
    const role = req.user.role;
    if (role === 'employee') {
      conditions.push(`(t.created_by = $${idx} OR t.assigned_to = $${idx})`);
      params.push(req.user.id); idx++;
    } else if (role === 'team_lead') {
      conditions.push(`(t.created_by = $${idx} OR t.assigned_to = $${idx} OR t.department_id IN (
        SELECT department_id FROM employees WHERE user_id = $${idx}
      ))`);
      params.push(req.user.id); idx++;
    }

    if (status)        { conditions.push(`t.status = $${idx}`);        params.push(status);        idx++; }
    if (priority)      { conditions.push(`t.priority = $${idx}`);      params.push(priority);      idx++; }
    if (department_id) { conditions.push(`t.department_id = $${idx}`); params.push(department_id); idx++; }
    if (category_id)   { conditions.push(`t.category_id = $${idx}`);  params.push(category_id);   idx++; }
    if (created_by)    { conditions.push(`t.created_by = $${idx}`);   params.push(created_by);    idx++; }

    if (assigned_to) {
      if (assigned_to === 'unassigned') {
        conditions.push('t.assigned_to IS NULL');
      } else {
        conditions.push(`t.assigned_to = $${idx}`); params.push(assigned_to); idx++;
      }
    }
    if (search) {
      conditions.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx} OR t.ticket_number ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Allowed sorts
    const ALLOWED_SORTS = ['created_at', 'updated_at', 'priority', 'sla_due_at', 'status', 'ticket_number'];
    const sortCol = ALLOWED_SORTS.includes(sort_by) ? `t.${sort_by}` : 't.created_at';
    const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await db.query(`SELECT COUNT(*) FROM tickets t ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await db.query(`
      SELECT
        t.*,
        d.name AS department_name,
        tc.name AS category_name,
        creator.email  AS creator_email,
        ce.first_name  AS creator_first_name,  ce.last_name AS creator_last_name,
        assignee.email AS assignee_email,
        ae.first_name  AS assignee_first_name, ae.last_name AS assignee_last_name,
        (SELECT COUNT(*) FROM ticket_comments   WHERE ticket_id = t.id AND is_deleted = FALSE) AS comment_count,
        (SELECT COUNT(*) FROM ticket_attachments WHERE ticket_id = t.id AND is_deleted = FALSE) AS attachment_count
      FROM tickets t
      LEFT JOIN departments       d        ON d.id        = t.department_id
      LEFT JOIN ticket_categories tc       ON tc.id       = t.category_id
      LEFT JOIN users             creator  ON creator.id  = t.created_by
      LEFT JOIN employees         ce       ON ce.user_id  = creator.id
      LEFT JOIN users             assignee ON assignee.id = t.assigned_to
      LEFT JOIN employees         ae       ON ae.user_id  = assignee.id
      ${where}
      ORDER BY ${sortCol} ${sortDir}
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, parseInt(limit), offset]);

    // Compute SLA status & optionally filter
    let tickets = result.rows.map(t => ({ ...t, sla_status: getSLAStatus(t.sla_due_at, t.resolved_at) }));
    if (slaFilter) tickets = tickets.filter(t => t.sla_status === slaFilter);

    res.json({
      data: tickets,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET TICKET DETAIL
// ═════════════════════════════════════════════════════════════════════════════

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const ticketResult = await db.query(`
      SELECT
        t.*,
        d.name AS department_name,
        tc.name AS category_name,
        creator.email  AS creator_email,
        ce.first_name  AS creator_first_name, ce.last_name AS creator_last_name,
        assignee.email AS assignee_email,
        ae.first_name  AS assignee_first_name, ae.last_name AS assignee_last_name,
        re.first_name  AS related_emp_first_name, re.last_name AS related_emp_last_name
      FROM tickets t
      LEFT JOIN departments       d        ON d.id        = t.department_id
      LEFT JOIN ticket_categories tc       ON tc.id       = t.category_id
      LEFT JOIN users             creator  ON creator.id  = t.created_by
      LEFT JOIN employees         ce       ON ce.user_id  = creator.id
      LEFT JOIN users             assignee ON assignee.id = t.assigned_to
      LEFT JOIN employees         ae       ON ae.user_id  = assignee.id
      LEFT JOIN employees         re       ON re.id       = t.related_employee_id
      WHERE t.id = $1 AND t.is_deleted = FALSE
    `, [id]);

    if (ticketResult.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });

    const ticket = ticketResult.rows[0];
    ticket.sla_status = getSLAStatus(ticket.sla_due_at, ticket.resolved_at);

    // Comments
    const comments = await db.query(`
      SELECT c.*, u.email AS author_email, e.first_name AS author_first_name, e.last_name AS author_last_name
      FROM ticket_comments c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN employees e ON e.user_id = u.id
      WHERE c.ticket_id = $1 AND c.is_deleted = FALSE
      ORDER BY c.created_at ASC
    `, [id]);

    const visibleComments = req.user.role === 'employee'
      ? comments.rows.filter(c => !c.is_internal)
      : comments.rows;

    // Attachments
    const attachments = await db.query(`
      SELECT a.*, u.email AS uploader_email, e.first_name AS uploader_first_name, e.last_name AS uploader_last_name
      FROM ticket_attachments a
      LEFT JOIN users u ON u.id = a.uploaded_by
      LEFT JOIN employees e ON e.user_id = u.id
      WHERE a.ticket_id = $1 AND a.is_deleted = FALSE
      ORDER BY a.uploaded_at ASC
    `, [id]);

    // Activity log
    const activity = await db.query(`
      SELECT al.*, u.email AS changed_by_email, e.first_name AS changed_by_first_name, e.last_name AS changed_by_last_name
      FROM ticket_activity_log al
      LEFT JOIN users u ON u.id = al.changed_by
      LEFT JOIN employees e ON e.user_id = u.id
      WHERE al.ticket_id = $1
      ORDER BY al.changed_at DESC
    `, [id]);

    res.json({ ...ticket, comments: visibleComments, attachments: attachments.rows, activity_log: activity.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// CREATE TICKET
// ═════════════════════════════════════════════════════════════════════════════

router.post('/', async (req, res) => {
  try {
    const { title, description, department_id, category_id, priority = 'medium', assigned_to, related_employee_id, internal_notes } = req.body;

    if (!title || title.length < 5)             return res.status(400).json({ error: 'Title must be at least 5 characters' });
    if (!description || description.length < 10) return res.status(400).json({ error: 'Description must be at least 10 characters' });
    if (!department_id)                          return res.status(400).json({ error: 'Department is required' });
    if (!['low', 'medium', 'high', 'critical'].includes(priority)) return res.status(400).json({ error: 'Invalid priority' });

    // Validate assignment permissions
    if (assigned_to) {
      const check = await validateAssignment(req.user.role, assigned_to);
      if (!check.valid) return res.status(403).json({ error: check.error });
    }

    const ticketNumber = await generateTicketNumber();
    const now = new Date();
    const slaDueAt = await calculateSLADue(priority, department_id, now);

    const result = await db.query(`
      INSERT INTO tickets (ticket_number, title, description, department_id, category_id, status, priority, created_by, assigned_to, sla_due_at, related_employee_id, internal_notes)
      VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [ticketNumber, title, description, department_id, category_id || null, priority, req.user.id, assigned_to || null, slaDueAt, related_employee_id || null, internal_notes || null]);

    const ticket = result.rows[0];
    await logTicketActivity(ticket.id, req.user.id, 'created', null, null);

    if (assigned_to) {
      await notifyUser(ticket.id, assigned_to, 'ticket_assigned', `Ticket ${ticketNumber} assigned to you`, title);
      await logTicketActivity(ticket.id, req.user.id, 'assigned', null, assigned_to);
    }

    await logAction({ userId: req.user.id, action: 'CREATE', entity: 'ticket', entityId: ticket.id, newValue: ticket, req });
    res.status(201).json(ticket);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// UPDATE TICKET
// ═════════════════════════════════════════════════════════════════════════════

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, assigned_to, internal_notes, title, description, category_id, department_id } = req.body;

    const current = await db.query('SELECT * FROM tickets WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    const old = current.rows[0];

    const sets = [];
    const vals = [];
    let idx = 1;

    if (title !== undefined)          { sets.push(`title = $${idx}`);          vals.push(title);          idx++; }
    if (description !== undefined)    { sets.push(`description = $${idx}`);    vals.push(description);    idx++; }
    if (department_id !== undefined)   { sets.push(`department_id = $${idx}`); vals.push(department_id);  idx++; }
    if (category_id !== undefined)    { sets.push(`category_id = $${idx}`);   vals.push(category_id);    idx++; }
    if (internal_notes !== undefined) { sets.push(`internal_notes = $${idx}`); vals.push(internal_notes); idx++; }

    if (status !== undefined && status !== old.status) {
      sets.push(`status = $${idx}`); vals.push(status); idx++;
      await logTicketActivity(id, req.user.id, 'status_changed', old.status, status);
      if (status === 'resolved')    sets.push('resolved_at = NOW()');
      if (status === 'closed')      sets.push('closed_at = NOW()');
      if (old.created_by !== req.user.id) {
        await notifyUser(id, old.created_by, 'ticket_status_changed', `Ticket ${old.ticket_number} → ${status}`, old.title);
      }
    }

    if (priority !== undefined && priority !== old.priority) {
      sets.push(`priority = $${idx}`); vals.push(priority); idx++;
      await logTicketActivity(id, req.user.id, 'priority_changed', old.priority, priority);
      const newSLA = await calculateSLADue(priority, old.department_id, old.created_at);
      if (newSLA) { sets.push(`sla_due_at = $${idx}`); vals.push(newSLA); idx++; }
    }

    if (assigned_to !== undefined && assigned_to !== old.assigned_to) {
      // Validate assignment permissions
      if (assigned_to) {
        const check = await validateAssignment(req.user.role, assigned_to);
        if (!check.valid) return res.status(403).json({ error: check.error });
      }
      sets.push(`assigned_to = $${idx}`); vals.push(assigned_to || null); idx++;
      await logTicketActivity(id, req.user.id, old.assigned_to ? 'reassigned' : 'assigned', old.assigned_to, assigned_to);
      if (assigned_to) await notifyUser(id, assigned_to, 'ticket_assigned', `Ticket ${old.ticket_number} assigned to you`, old.title);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'No updates provided' });
    sets.push('updated_at = NOW()');
    vals.push(id);

    const result = await db.query(`UPDATE tickets SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals);
    await logAction({ userId: req.user.id, action: 'UPDATE', entity: 'ticket', entityId: id, oldValue: old, newValue: result.rows[0], req });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// RESOLVE / CLOSE / REOPEN
// ═════════════════════════════════════════════════════════════════════════════

router.post('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_notes } = req.body;

    const cur = await db.query('SELECT * FROM tickets WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    const old = cur.rows[0];
    if (old.status === 'closed') return res.status(400).json({ error: 'Cannot resolve a closed ticket' });

    const result = await db.query(`
      UPDATE tickets SET status = 'resolved', resolved_at = NOW(), updated_at = NOW(),
        internal_notes = CASE WHEN $2 IS NOT NULL THEN COALESCE(internal_notes,'') || E'\\n[Resolution] ' || $2 ELSE internal_notes END
      WHERE id = $1 RETURNING *
    `, [id, resolution_notes || null]);

    await logTicketActivity(id, req.user.id, 'resolved', old.status, 'resolved');
    if (old.created_by !== req.user.id) await notifyUser(id, old.created_by, 'ticket_resolved', `Ticket ${old.ticket_number} resolved`, old.title);
    await logAction({ userId: req.user.id, action: 'UPDATE', entity: 'ticket', entityId: id, details: 'Resolved', req });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const { closing_notes } = req.body;

    const cur = await db.query('SELECT * FROM tickets WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });

    const result = await db.query(`
      UPDATE tickets SET status = 'closed', closed_at = NOW(), updated_at = NOW(),
        internal_notes = CASE WHEN $2 IS NOT NULL THEN COALESCE(internal_notes,'') || E'\\n[Closed] ' || $2 ELSE internal_notes END
      WHERE id = $1 RETURNING *
    `, [id, closing_notes || null]);

    await logTicketActivity(id, req.user.id, 'closed', cur.rows[0].status, 'closed');
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reopen', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const cur = await db.query('SELECT * FROM tickets WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    const old = cur.rows[0];
    if (!['resolved', 'closed'].includes(old.status)) return res.status(400).json({ error: 'Can only reopen resolved or closed tickets' });

    const newSLA = await calculateSLADue(old.priority, old.department_id, new Date());
    const result = await db.query(
      'UPDATE tickets SET status = \'open\', resolved_at = NULL, closed_at = NULL, updated_at = NOW(), sla_due_at = $2 WHERE id = $1 RETURNING *',
      [id, newSLA]
    );

    await logTicketActivity(id, req.user.id, 'reopened', old.status, 'open');
    if (reason) {
      await db.query("UPDATE tickets SET internal_notes = COALESCE(internal_notes,'') || E'\\n[Reopened] ' || $2 WHERE id = $1", [id, reason]);
    }
    if (old.assigned_to) await notifyUser(id, old.assigned_to, 'ticket_status_changed', `Ticket ${old.ticket_number} reopened`, reason || old.title);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DELETE (soft)
// ═════════════════════════════════════════════════════════════════════════════

router.delete('/:id', authorize(...ADMIN_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('UPDATE tickets SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    await logTicketActivity(id, req.user.id, 'deleted', null, null);
    await logAction({ userId: req.user.id, action: 'DELETE', entity: 'ticket', entityId: id, req });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ═════════════════════════════════════════════════════════════════════════════

router.post('/:id/comments', async (req, res) => {
  try {
    const { id } = req.params;
    const { comment_text, is_internal } = req.body;
    if (!comment_text || !comment_text.trim()) return res.status(400).json({ error: 'Comment text is required' });

    const ticket = await db.query('SELECT * FROM tickets WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });

    const isInternal = is_internal && STAFF_ROLES.includes(req.user.role);

    const result = await db.query(
      'INSERT INTO ticket_comments (ticket_id, user_id, comment_text, is_internal) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, req.user.id, comment_text.trim(), isInternal]
    );
    await logTicketActivity(id, req.user.id, 'commented', null, isInternal ? '[internal]' : comment_text.substring(0, 100));
    await db.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id]);

    // Notify relevant people
    const t = ticket.rows[0];
    const targets = new Set();
    if (t.created_by !== req.user.id) targets.add(t.created_by);
    if (t.assigned_to && t.assigned_to !== req.user.id) targets.add(t.assigned_to);
    for (const uid of targets) {
      await notifyUser(id, uid, 'ticket_commented', `New comment on ${t.ticket_number}`, comment_text.substring(0, 200));
    }

    // Return with author info
    const full = await db.query(`
      SELECT c.*, u.email AS author_email, e.first_name AS author_first_name, e.last_name AS author_last_name
      FROM ticket_comments c LEFT JOIN users u ON u.id = c.user_id LEFT JOIN employees e ON e.user_id = u.id
      WHERE c.id = $1
    `, [result.rows[0].id]);

    res.status(201).json(full.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { comment_text } = req.body;
    const cur = await db.query('SELECT * FROM ticket_comments WHERE id = $1 AND is_deleted = FALSE', [commentId]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
    if (cur.rows[0].user_id !== req.user.id && !ADMIN_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Can only edit your own comments' });
    const result = await db.query('UPDATE ticket_comments SET comment_text = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [comment_text.trim(), commentId]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const cur = await db.query('SELECT * FROM ticket_comments WHERE id = $1', [commentId]);
    if (cur.rows.length === 0) return res.status(404).json({ error: 'Comment not found' });
    if (cur.rows[0].user_id !== req.user.id && !ADMIN_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Can only delete your own comments' });
    await db.query('UPDATE ticket_comments SET is_deleted = TRUE WHERE id = $1', [commentId]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ATTACHMENTS
// ═════════════════════════════════════════════════════════════════════════════

router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const ticket = await db.query('SELECT * FROM tickets WHERE id = $1 AND is_deleted = FALSE', [id]);
    if (ticket.rows.length === 0) return res.status(404).json({ error: 'Ticket not found' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const result = await db.query(
      'INSERT INTO ticket_attachments (ticket_id, uploaded_by, file_name, file_path, file_size, file_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [id, req.user.id, req.file.originalname, req.file.filename, req.file.size, path.extname(req.file.originalname).slice(1)]
    );
    await logTicketActivity(id, req.user.id, 'attachment_added', null, req.file.originalname);
    await db.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/attachments/:attachmentId/download', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const att = await db.query('SELECT * FROM ticket_attachments WHERE id = $1 AND is_deleted = FALSE', [attachmentId]);
    if (att.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });
    const filePath = path.join(uploadsDir, att.rows[0].file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });
    res.download(filePath, att.rows[0].file_name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const att = await db.query('SELECT * FROM ticket_attachments WHERE id = $1', [attachmentId]);
    if (att.rows.length === 0) return res.status(404).json({ error: 'Attachment not found' });
    if (att.rows[0].uploaded_by !== req.user.id && !ADMIN_ROLES.includes(req.user.role))
      return res.status(403).json({ error: 'Permission denied' });
    await db.query('UPDATE ticket_attachments SET is_deleted = TRUE WHERE id = $1', [attachmentId]);
    const filePath = path.join(uploadsDir, att.rows[0].file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
