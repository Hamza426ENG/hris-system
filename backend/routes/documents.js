/**
 * Employee Documents Module
 *
 * GET    /documents/employee/:employeeId          – list all documents for an employee
 * POST   /documents/employee/:employeeId          – upload a new document
 * GET    /documents/:id/download                  – download/stream a document
 * PUT    /documents/:id/status                    – update document status (verify/reject/expire)
 * PUT    /documents/:id                           – update document metadata (comments, expiry)
 * DELETE /documents/:id                           – delete a document
 * GET    /documents/expiring                      – list documents expiring within N days (admin)
 */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const router   = express.Router();
const db       = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAction } = require('../utils/auditLogger');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'documents');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const DOCUMENT_TYPES = [
  'id_card', 'driving_license', 'resume', 'degree',
  'offer_letter', 'contract', 'medical', 'passport_copy',
  'nda', 'other',
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
  },
});

const ADMIN_ROLES = ['super_admin', 'hr_admin'];
const LEAD_ROLES  = ['super_admin', 'hr_admin', 'manager', 'team_lead', 'hr_manager'];

// Inline view endpoint needs to support token via query-param (window.open can't send headers)
const jwt = require('jsonwebtoken');
async function authenticateQuery(req, res, next) {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const check = await db.query(
      `SELECT u.id, u.role, u.is_active, e.id AS employee_id
       FROM users u LEFT JOIN employees e ON e.user_id = u.id
       WHERE u.id = $1 AND u.is_active = TRUE`,
      [decoded.userId]
    );
    if (!check.rows.length) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: check.rows[0].id, role: check.rows[0].role, employee_id: check.rows[0].employee_id };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function canAccessEmployee(req, employeeId) {
  if (LEAD_ROLES.includes(req.user.role)) return true;
  return req.user.employee_id === employeeId;
}

function canManage(req) {
  return ADMIN_ROLES.includes(req.user.role);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents/expiring?days=30
// List documents expiring within N days (admin/HR only)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/expiring', authorize('super_admin', 'hr_admin', 'hr_manager'), async (req, res) => {
  try {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days) || 30));
    const result = await db.query(
      `SELECT d.*,
         e.first_name, e.last_name, e.employee_id AS emp_code,
         dept.name AS department_name,
         CONCAT(u.first_name, ' ', u.last_name) AS uploaded_by_name
       FROM employee_documents d
       JOIN employees e ON e.id = d.employee_id
       LEFT JOIN departments dept ON dept.id = e.department_id
       LEFT JOIN employees u ON u.user_id = d.uploaded_by
       WHERE d.is_latest = TRUE
         AND d.expiry_date IS NOT NULL
         AND d.expiry_date <= CURRENT_DATE + INTERVAL '1 day' * $1
         AND d.expiry_date >= CURRENT_DATE
       ORDER BY d.expiry_date ASC`,
      [days]
    );
    res.json({ data: result.rows, days });
  } catch (err) {
    console.error('GET /documents/expiring error:', err);
    res.status(500).json({ error: 'Failed to fetch expiring documents' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents/employee/:employeeId
// List all documents for a specific employee
// ─────────────────────────────────────────────────────────────────────────────
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!canAccessEmployee(req, employeeId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { type, status, latest_only = 'true' } = req.query;
    let where = ['d.employee_id = $1'];
    const params = [employeeId];
    let i = 2;

    if (latest_only === 'true') { where.push('d.is_latest = TRUE'); }
    if (type)   { where.push(`d.document_type = $${i++}`); params.push(type); }
    if (status) { where.push(`d.status = $${i++}`); params.push(status); }

    const result = await db.query(
      `SELECT d.*,
         CONCAT(ub.first_name, ' ', ub.last_name) AS uploaded_by_name,
         CONCAT(vb.first_name, ' ', vb.last_name) AS verified_by_name
       FROM employee_documents d
       LEFT JOIN employees ub ON ub.user_id = d.uploaded_by
       LEFT JOIN employees vb ON vb.user_id = d.verified_by
       WHERE ${where.join(' AND ')}
       ORDER BY d.document_type, d.created_at DESC`,
      params
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error('GET /documents/employee/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /documents/employee/:employeeId
// Upload a new document (admin/HR) or self-upload (employee uploads their own)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/employee/:employeeId', upload.single('file'), async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!canAccessEmployee(req, employeeId) && !canManage(req)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { document_type, comments, expiry_date } = req.body;

    if (!document_type || !DOCUMENT_TYPES.includes(document_type)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `Invalid document_type. Must be one of: ${DOCUMENT_TYPES.join(', ')}` });
    }

    // Calculate new version number for this document type
    const versionRes = await db.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM employee_documents
       WHERE employee_id = $1 AND document_type = $2`,
      [employeeId, document_type]
    );
    const version = versionRes.rows[0].next_version;

    // Mark all previous versions of this type as not latest
    await db.query(
      `UPDATE employee_documents SET is_latest = FALSE
       WHERE employee_id = $1 AND document_type = $2`,
      [employeeId, document_type]
    );

    const filePath = path.relative(path.join(__dirname, '..'), req.file.path);

    const result = await db.query(
      `INSERT INTO employee_documents
         (employee_id, document_type, document_name, file_path, file_size, mime_type,
          status, expiry_date, comments, version, is_latest, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11)
       RETURNING *`,
      [
        employeeId,
        document_type,
        req.body.document_name || req.file.originalname,
        filePath,
        req.file.size,
        req.file.mimetype,
        canManage(req) ? (req.body.status || 'pending') : 'pending',
        expiry_date || null,
        comments || null,
        version,
        req.user.id,
      ]
    );

    await logAction({
      userId: req.user.id,
      action: 'CREATE',
      entity: 'employee_document',
      entityId: result.rows[0].id,
      newValue: { document_type, document_name: result.rows[0].document_name, version },
      req,
    });

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('POST /documents/employee/:id error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload document' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents/:id/download
// Stream the file to the client
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/download', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM employee_documents WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];

    if (!canAccessEmployee(req, doc.employee_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const absPath = path.join(__dirname, '..', doc.file_path);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File not found on server' });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.document_name)}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    console.error('GET /documents/:id/download error:', err);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /documents/:id/view?token=<jwt>
// Inline view — supports token in query param so window.open() works
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/view', authenticateQuery, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM employee_documents WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];

    if (!canAccessEmployee(req, doc.employee_id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const absPath = path.join(__dirname, '..', doc.file_path);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File not found on server' });

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.document_name)}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    fs.createReadStream(absPath).pipe(res);
  } catch (err) {
    console.error('GET /documents/:id/view error:', err);
    res.status(500).json({ error: 'Failed to view document' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /documents/:id/status
// Update document status: pending → verified / rejected / expired (admin/HR only)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/status', authorize('super_admin', 'hr_admin', 'hr_manager'), async (req, res) => {
  try {
    const { status, comments } = req.body;
    const validStatuses = ['pending', 'verified', 'rejected', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const old = await db.query('SELECT * FROM employee_documents WHERE id = $1', [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Document not found' });

    const result = await db.query(
      `UPDATE employee_documents
       SET status = $1,
           comments = COALESCE($2, comments),
           verified_by = CASE WHEN $1 = 'verified' THEN $3 ELSE verified_by END,
           verified_at = CASE WHEN $1 = 'verified' THEN NOW() ELSE verified_at END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, comments || null, req.user.id, req.params.id]
    );

    await logAction({
      userId: req.user.id,
      action: 'UPDATE',
      entity: 'employee_document',
      entityId: req.params.id,
      oldValue: { status: old.rows[0].status },
      newValue: { status },
      req,
    });

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('PUT /documents/:id/status error:', err);
    res.status(500).json({ error: 'Failed to update document status' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /documents/:id
// Update document metadata (name, comments, expiry_date)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const docRes = await db.query('SELECT * FROM employee_documents WHERE id = $1', [req.params.id]);
    if (!docRes.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = docRes.rows[0];

    if (!canManage(req) && req.user.employee_id !== doc.employee_id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { document_name, comments, expiry_date } = req.body;
    const result = await db.query(
      `UPDATE employee_documents
       SET document_name = COALESCE($1, document_name),
           comments      = COALESCE($2, comments),
           expiry_date   = COALESCE($3, expiry_date),
           updated_at    = NOW()
       WHERE id = $4
       RETURNING *`,
      [document_name || null, comments || null, expiry_date || null, req.params.id]
    );

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('PUT /documents/:id error:', err);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /documents/:id
// Delete a document (admin/HR only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', authorize('super_admin', 'hr_admin'), async (req, res) => {
  try {
    const docRes = await db.query('SELECT * FROM employee_documents WHERE id = $1', [req.params.id]);
    if (!docRes.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = docRes.rows[0];

    // Remove physical file
    const absPath = path.join(__dirname, '..', doc.file_path);
    if (fs.existsSync(absPath)) {
      try { fs.unlinkSync(absPath); } catch { /* file already gone */ }
    }

    await db.query('DELETE FROM employee_documents WHERE id = $1', [req.params.id]);

    // If this was the latest, promote previous version
    if (doc.is_latest) {
      await db.query(
        `UPDATE employee_documents SET is_latest = TRUE
         WHERE id = (
           SELECT id FROM employee_documents
           WHERE employee_id = $1 AND document_type = $2
           ORDER BY version DESC LIMIT 1
         )`,
        [doc.employee_id, doc.document_type]
      );
    }

    await logAction({
      userId: req.user.id,
      action: 'DELETE',
      entity: 'employee_document',
      entityId: req.params.id,
      oldValue: { document_type: doc.document_type, document_name: doc.document_name },
      req,
    });

    res.json({ message: 'Document deleted' });
  } catch (err) {
    console.error('DELETE /documents/:id error:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
