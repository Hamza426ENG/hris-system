const fs = require('fs');
const path = require('path');
const db = require('./db');

async function migrate() {
  try {
    // Check if tables already exist
    const check = await db.query(`
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'employees'
    `);

    if (parseInt(check.rows[0].count) > 0) {
      console.log('Database already initialized, skipping base migration.');
    } else {
      console.log('Running database migration...');

      // Try to read init.sql from parent directory (for local dev) or same dir
      const paths = [
        path.join(__dirname, '..', 'database', 'init.sql'),
        path.join(__dirname, 'init.sql'),
      ];

      let sql = null;
      for (const p of paths) {
        if (fs.existsSync(p)) {
          sql = fs.readFileSync(p, 'utf8');
          break;
        }
      }

      if (!sql) {
        console.warn('init.sql not found, skipping base migration.');
      } else {
        await db.query(sql);
        console.log('Database base migration completed successfully.');
      }
    }

    // Always run additive migrations (safe with IF NOT EXISTS)
    await runAdditiveMigrations();
  } catch (err) {
    console.error('Migration error:', err.message);
    // Don't exit — let the app start anyway
  }
}

/**
 * Additive migrations — safe to run on every startup.
 * Creates new tables/indexes/views that did not exist in the original init.sql.
 * Uses IF NOT EXISTS so repeated runs are no-ops.
 */
async function runAdditiveMigrations() {
  try {
    // ── user_sessions ──────────────────────────────────────────────────────────
    // Tracks every JWT login for server-side revocation and developer visibility.
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        jti          UUID NOT NULL,
        ip_address   VARCHAR(45),
        user_agent   TEXT,
        logged_in_at TIMESTAMP DEFAULT NOW(),
        logout_at    TIMESTAMP,
        expires_at   TIMESTAMP NOT NULL,
        is_active    BOOLEAN DEFAULT TRUE,
        created_at   TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_jti ON user_sessions(jti)'
    );
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)'
    );
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_active)'
    );

    // ── Developer view: v_auth_sessions ────────────────────────────────────────
    // Query this view to see full session history for all users.
    // SELECT * FROM v_auth_sessions;
    // SELECT * FROM v_auth_sessions WHERE session_status = 'active';
    await db.query(`
      CREATE OR REPLACE VIEW v_auth_sessions AS
      SELECT
        s.id                                                          AS session_id,
        u.id                                                          AS user_id,
        u.email,
        u.role,
        COALESCE(e.first_name || ' ' || e.last_name, u.email)        AS full_name,
        s.ip_address,
        s.user_agent,
        s.logged_in_at,
        s.logout_at,
        s.expires_at,
        s.is_active,
        CASE
          WHEN s.logout_at IS NOT NULL      THEN 'logged_out'
          WHEN s.expires_at < NOW()         THEN 'expired'
          WHEN s.is_active = TRUE           THEN 'active'
          ELSE                                   'inactive'
        END                                                           AS session_status,
        ROUND(EXTRACT(EPOCH FROM (s.expires_at - NOW())) / 3600, 2)  AS hours_remaining
      FROM  user_sessions s
      JOIN  users          u ON u.id      = s.user_id
      LEFT JOIN employees  e ON e.user_id = s.user_id
      ORDER BY s.logged_in_at DESC
    `);

    // ── attendance_records ─────────────────────────────────────────────────────
    // Daily attendance tracking: check-in / check-out per employee per day.
    await db.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date          DATE NOT NULL DEFAULT CURRENT_DATE,
        check_in      TIMESTAMP WITH TIME ZONE,
        check_out     TIMESTAMP WITH TIME ZONE,
        work_hours    DECIMAL(5,2),
        status        VARCHAR(20) DEFAULT 'present',
        notes         TEXT,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE(employee_id, date)
      )
    `);

    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date)'
    );
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date)'
    );

    // ── Add missing columns to employees table ─────────────────────────────────
    // Performance tracking, shift time, work location, insurance, and I/O tracking
    const columns_to_add = [
      { name: 'shift_time', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_time VARCHAR(20) DEFAULT '09:00 AM'` },
      { name: 'wfh_percentage', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS wfh_percentage DECIMAL(5,2) DEFAULT 0` },
      { name: 'wfo_percentage', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS wfo_percentage DECIMAL(5,2) DEFAULT 0` },
      { name: 'missing_io', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS missing_io BOOLEAN DEFAULT FALSE` },
      { name: 'life_insurance_group', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS life_insurance_group VARCHAR(200)` },
      { name: 'health_insurance_group', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS health_insurance_group VARCHAR(200)` },
      { name: 'actual_time', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS actual_time DECIMAL(5,2) DEFAULT 0` },
      { name: 'active_time', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS active_time DECIMAL(5,2) DEFAULT 0` },
      { name: 'total_hours', sql: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS total_hours DECIMAL(7,2) DEFAULT 0` },
    ];

    for (const col of columns_to_add) {
      try {
        await db.query(col.sql);
      } catch (err) {
        // Column might already exist, ignore
      }
    }

    // ── performance_records ────────────────────────────────────────────────────
    // Tracks performance metrics per employee per period (week/month)
    await db.query(`
      CREATE TABLE IF NOT EXISTS performance_records (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        period_start      DATE NOT NULL,
        period_end        DATE NOT NULL,
        productivity      DECIMAL(5,2) DEFAULT 0,
        knowledge         DECIMAL(5,2) DEFAULT 0,
        attitude          DECIMAL(5,2) DEFAULT 0,
        discipline        DECIMAL(5,2) DEFAULT 0,
        productivity_pct  DECIMAL(5,2) DEFAULT 0,
        knowledge_pct     DECIMAL(5,2) DEFAULT 0,
        attitude_pct      DECIMAL(5,2) DEFAULT 0,
        discipline_pct    DECIMAL(5,2) DEFAULT 0,
        total_pct         DECIMAL(5,2) DEFAULT 0,
        notes             TEXT,
        created_at        TIMESTAMP DEFAULT NOW(),
        updated_at        TIMESTAMP DEFAULT NOW(),
        UNIQUE(employee_id, period_start, period_end)
      )
    `);

    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_performance_employee ON performance_records(employee_id)'
    );
    await db.query(
      'CREATE INDEX IF NOT EXISTS idx_performance_period ON performance_records(period_start, period_end)'
    );

    // ── Add team_lead to user_role enum ────────────────────────────────────────
    // The routes and frontend use 'team_lead' but it was missing from the DB enum.
    // IF NOT EXISTS prevents errors on repeated runs (PostgreSQL 9.3+).
    try {
      await db.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_lead'`);
    } catch (err) {
      // Older PG versions without IF NOT EXISTS support — ignore if already exists
      if (!err.message.includes('already exists')) {
        console.warn('team_lead enum warning:', err.message);
      }
    }

    // ── Ensure current-year leave balances exist for all active employees ──────
    // Seed data only created 2025 balances; new years need balances too.
    await db.query(`
      INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated_days)
      SELECT e.id, lt.id, EXTRACT(YEAR FROM CURRENT_DATE)::int, lt.days_allowed
      FROM employees e
      CROSS JOIN leave_types lt
      WHERE lt.is_active = TRUE
        AND e.status IN ('active', 'probation')
      ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING
    `);

    // ── audit_logs ─────────────────────────────────────────────────────────────
    // Tracks every significant action for compliance and debugging.
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
        action_type   VARCHAR(50) NOT NULL,
        entity_type   VARCHAR(50),
        entity_id     VARCHAR(100),
        old_value     JSONB,
        new_value     JSONB,
        ip_address    VARCHAR(45),
        user_agent    TEXT,
        details       TEXT,
        created_at    TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_user   ON audit_logs(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_time   ON audit_logs(created_at)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action_type)');

    // ── attendance_records: add created_by / updated_by for admin tracking ────
    const attCols = [
      { name: 'created_by', sql: 'ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL' },
      { name: 'updated_by', sql: 'ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL' },
    ];
    for (const col of attCols) {
      try { await db.query(col.sql); } catch { /* already exists */ }
    }

    // ── Index on attendance check_in for time-range queries ──────────────────
    await db.query('CREATE INDEX IF NOT EXISTS idx_attendance_checkin ON attendance_records(check_in)');

    // ── device_connections ───────────────────────────────────────────────────
    // Stores ZKTeco (or other) biometric device connection configs.
    await db.query(`
      CREATE TABLE IF NOT EXISTS device_connections (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(100) NOT NULL,
        ip_address      VARCHAR(45)  NOT NULL,
        port            INT          NOT NULL DEFAULT 4370,
        connection_timeout INT       NOT NULL DEFAULT 5000,
        device_password VARCHAR(100),
        timezone        VARCHAR(50)  DEFAULT 'Asia/Karachi',
        auto_sync       BOOLEAN      DEFAULT TRUE,
        sync_interval   INT          DEFAULT 30,
        is_active       BOOLEAN      DEFAULT TRUE,
        last_sync_at    TIMESTAMP,
        last_sync_status VARCHAR(20),
        last_sync_message TEXT,
        total_synced    INT          DEFAULT 0,
        created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMP    DEFAULT NOW(),
        updated_at      TIMESTAMP    DEFAULT NOW()
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_device_connections_active ON device_connections(is_active)');

    // ── device_attendance_raw ────────────────────────────────────────────────
    // Raw punch logs from the device — one row per finger-scan event.
    // Kept separate from attendance_records so we have a clean audit trail.
    await db.query(`
      CREATE TABLE IF NOT EXISTS device_attendance_raw (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id       UUID NOT NULL REFERENCES device_connections(id) ON DELETE CASCADE,
        device_user_id  VARCHAR(50)  NOT NULL,
        punch_time      TIMESTAMP WITH TIME ZONE NOT NULL,
        punch_state     INT,
        verified        INT,
        employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
        synced_to_attendance BOOLEAN DEFAULT FALSE,
        created_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE(device_id, device_user_id, punch_time)
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_device_raw_device ON device_attendance_raw(device_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_device_raw_punch ON device_attendance_raw(punch_time)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_device_raw_employee ON device_attendance_raw(employee_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_device_raw_unsynced ON device_attendance_raw(synced_to_attendance) WHERE synced_to_attendance = FALSE');

    // ── device_user_mapping ──────────────────────────────────────────────────
    // Maps device-side user IDs (badge numbers) to employee records.
    await db.query(`
      CREATE TABLE IF NOT EXISTS device_user_mapping (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id       UUID NOT NULL REFERENCES device_connections(id) ON DELETE CASCADE,
        device_user_id  VARCHAR(50) NOT NULL,
        device_user_name VARCHAR(100),
        employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW(),
        UNIQUE(device_id, device_user_id)
      )
    `);

    // ── Add source column to attendance_records to track origin ──────────────
    try {
      await db.query("ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual'");
    } catch { /* already exists */ }
    try {
      await db.query("ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES device_connections(id) ON DELETE SET NULL");
    } catch { /* already exists */ }

    // ══════════════════════════════════════════════════════════════════════════
    // ── TICKETING SYSTEM TABLES ──────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    // ── ticket_status enum ───────────────────────────────────────────────────
    try {
      await db.query(`
        DO $$ BEGIN
          CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed', 'on_hold');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    } catch (err) { /* already exists */ }

    // ── ticket_priority enum ─────────────────────────────────────────────────
    try {
      await db.query(`
        DO $$ BEGIN
          CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    } catch (err) { /* already exists */ }

    // ── Sequence for ticket numbers ──────────────────────────────────────────
    await db.query('CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1');

    // ── ticket_categories ────────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_categories (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(100) NOT NULL UNIQUE,
        description     TEXT,
        department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
        is_active       BOOLEAN DEFAULT TRUE,
        created_at      TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── tickets ──────────────────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_number        VARCHAR(20) UNIQUE NOT NULL,
        title                VARCHAR(255) NOT NULL,
        description          TEXT NOT NULL,
        department_id        UUID NOT NULL REFERENCES departments(id),
        category_id          UUID REFERENCES ticket_categories(id) ON DELETE SET NULL,
        status               ticket_status NOT NULL DEFAULT 'open',
        priority             ticket_priority NOT NULL DEFAULT 'medium',
        created_by           UUID NOT NULL REFERENCES users(id),
        assigned_to          UUID REFERENCES users(id),
        created_at           TIMESTAMP DEFAULT NOW(),
        updated_at           TIMESTAMP DEFAULT NOW(),
        resolved_at          TIMESTAMP,
        closed_at            TIMESTAMP,
        sla_due_at           TIMESTAMP,
        related_employee_id  UUID REFERENCES employees(id) ON DELETE SET NULL,
        internal_notes       TEXT,
        is_archived          BOOLEAN DEFAULT FALSE,
        is_deleted           BOOLEAN DEFAULT FALSE
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tickets_priority   ON tickets(priority)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tickets_department ON tickets(department_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tickets_assigned   ON tickets(assigned_to)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tickets_created    ON tickets(created_at DESC)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tickets_sla        ON tickets(sla_due_at)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets(created_by)');

    // ── ticket_comments ──────────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_comments (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id       UUID NOT NULL REFERENCES users(id),
        comment_text  TEXT NOT NULL,
        is_internal   BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW(),
        is_deleted    BOOLEAN DEFAULT FALSE
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id)');

    // ── ticket_attachments ───────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_attachments (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        uploaded_by   UUID NOT NULL REFERENCES users(id),
        file_name     VARCHAR(255) NOT NULL,
        file_path     VARCHAR(500) NOT NULL,
        file_size     BIGINT,
        file_type     VARCHAR(50),
        uploaded_at   TIMESTAMP DEFAULT NOW(),
        is_deleted    BOOLEAN DEFAULT FALSE
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id)');

    // ── ticket_activity_log ──────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_activity_log (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        changed_by  UUID NOT NULL REFERENCES users(id),
        action      VARCHAR(100) NOT NULL,
        old_value   TEXT,
        new_value   TEXT,
        changed_at  TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket  ON ticket_activity_log(ticket_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_ticket_activity_changed ON ticket_activity_log(changed_at DESC)');

    // ── ticket_sla_rules ─────────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_sla_rules (
        id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        priority               ticket_priority NOT NULL,
        response_time_hours    INT NOT NULL,
        resolution_time_hours  INT NOT NULL,
        department_id          UUID REFERENCES departments(id) ON DELETE CASCADE,
        is_active              BOOLEAN DEFAULT TRUE,
        created_at             TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_rules_priority_global ON ticket_sla_rules(priority) WHERE department_id IS NULL');
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_rules_priority_dept   ON ticket_sla_rules(priority, department_id) WHERE department_id IS NOT NULL');

    // ── ticket_notifications ─────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS ticket_notifications (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        ticket_id           UUID REFERENCES tickets(id) ON DELETE CASCADE,
        recipient_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_type   VARCHAR(100) NOT NULL,
        notification_title  VARCHAR(255),
        notification_message TEXT,
        is_read             BOOLEAN DEFAULT FALSE,
        created_at          TIMESTAMP DEFAULT NOW(),
        read_at             TIMESTAMP
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_ticket_notif_user    ON ticket_notifications(recipient_user_id, is_read)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_ticket_notif_created ON ticket_notifications(created_at DESC)');

    // ── Full-text search on tickets ──────────────────────────────────────────
    try {
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_tickets_search
        ON tickets USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')))
      `);
    } catch (err) { /* GIN index may fail in some environments */ }

    // ── Seed default SLA rules (global — no department) ──────────────────────
    const slaDefaults = [
      { priority: 'critical', response: 1, resolution: 8 },
      { priority: 'high',     response: 2, resolution: 24 },
      { priority: 'medium',   response: 8, resolution: 48 },
      { priority: 'low',      response: 24, resolution: 120 },
    ];
    for (const sla of slaDefaults) {
      await db.query(`
        INSERT INTO ticket_sla_rules (priority, response_time_hours, resolution_time_hours, department_id)
        SELECT $1::ticket_priority, $2, $3, NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM ticket_sla_rules WHERE priority = $1::ticket_priority AND department_id IS NULL
        )
      `, [sla.priority, sla.response, sla.resolution]);
    }

    // ── Seed default ticket categories ───────────────────────────────────────
    const defaultCategories = [
      ['Technical Issue',  'Technical problems and system errors'],
      ['Bug Report',       'Software bugs and defects'],
      ['Feature Request',  'New feature suggestions'],
      ['Access Request',   'System access and permission requests'],
      ['Documentation',    'Documentation updates needed'],
      ['Training/Support', 'Training or support requests'],
      ['Maintenance',      'System maintenance requests'],
      ['Compliance Issue',  'Compliance and audit related'],
      ['Policy Update',    'Policy change requests'],
      ['Other',            'Other requests'],
    ];
    for (const [name, desc] of defaultCategories) {
      await db.query(
        'INSERT INTO ticket_categories (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [name, desc]
      );
    }

    console.log('Additive migrations completed (including ticketing system).');
  } catch (err) {
    console.error('Additive migration error:', err.message);
  }
}

module.exports = migrate;
