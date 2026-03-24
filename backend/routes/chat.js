const express = require('express');
const OpenAI = require('openai');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// All authenticated users can use Edge Bot — RBAC is enforced via system prompt

let openai;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

// ──────────────────────────────────────────────
// DB schema context (injected into system prompt)
// ──────────────────────────────────────────────
const DB_SCHEMA = `
Database tables and key columns:

employees (id, employee_id, first_name, last_name, work_email, personal_email,
  phone_primary, date_of_birth, gender, nationality, department_id, position_id,
  manager_id, employment_type [full_time|part_time|contract|intern|consultant],
  status [active|inactive|on_leave|probation|terminated], hire_date, termination_date,
  work_location, skills, languages, city, country, avatar_url, created_at)

departments (id, name, code, description, head_employee_id, parent_id,
  location, budget, headcount, is_active)

positions (id, title, code, department_id, grade, level, min_salary, max_salary)

users (id, email, role [super_admin|hr_admin|hr_manager|manager|team_lead|employee], is_active)

leave_requests (id, employee_id, leave_type_id, start_date, end_date,
  total_days, status [pending|approved|rejected|cancelled], reason, reviewed_by, reviewed_at, created_at)

leave_types (id, name, code, days_allowed, is_paid, carry_forward, color)

leave_balances (id, employee_id, leave_type_id, year, allocated_days,
  used_days, pending_days, carried_forward_days, available_days)
  -- available_days = allocated_days + carried_forward_days - used_days - pending_days

salary_structures (id, employee_id, effective_date, end_date, basic_salary,
  housing_allowance, transport_allowance, meal_allowance, medical_allowance,
  mobile_allowance, other_allowances, gross_salary,
  tax_deduction, pension_deduction, health_insurance, other_deductions, net_salary,
  currency, pay_frequency)
  -- Use: ss.end_date IS NULL to get current (active) salary structure

payroll_runs (id, period_start, period_end, month, year,
  status [draft|processing|completed|cancelled],
  total_gross, total_deductions, total_net, total_employees, processed_at)

payroll_items (id, payroll_run_id, employee_id, basic_salary, housing_allowance,
  transport_allowance, gross_salary, tax_deduction, pension_deduction,
  health_insurance, total_deductions, net_salary, bonus, overtime_pay, leave_days_taken)

announcements (id, title, content, priority [normal|high|urgent], is_active, posted_by, expires_at, created_at)

performance_records (id, employee_id, period_start, period_end,
  productivity, knowledge, attitude, discipline,
  productivity_pct, knowledge_pct, attitude_pct, discipline_pct, total_pct, notes)

attendance_records (id, employee_id, date, check_in, check_out, work_hours, status, notes)

tickets (id, ticket_number, title, description, department_id, category_id,
  status [open|in_progress|resolved|closed|on_hold], priority [low|medium|high|critical],
  created_by, assigned_to, created_at, resolved_at, closed_at, sla_due_at)

Common JOINs:
- employees e JOIN departments d ON d.id = e.department_id
- employees e JOIN positions p ON p.id = e.position_id
- employees e JOIN employees m ON m.id = e.manager_id (for manager name)
- departments d JOIN employees head ON head.id = d.head_employee_id (for dept head)
- leave_requests lr JOIN employees e ON e.id = lr.employee_id
- leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
- salary_structures ss ON ss.employee_id = e.id AND ss.end_date IS NULL (current salary)

Name search pattern: CONCAT(e.first_name, ' ', e.last_name) ILIKE '%name%'
  OR e.first_name ILIKE '%name%' OR e.last_name ILIKE '%name%'
`;

// ──────────────────────────────────────────────
// Role-based access context builder
// ──────────────────────────────────────────────
function buildRoleContext(user) {
  const { role, employee_id } = user;

  switch (role) {
    case 'super_admin':
    case 'hr_admin':
    case 'hr_manager':
      return `## Access Level: FULL ACCESS
The current user is a ${role.replace(/_/g, ' ').toUpperCase()}. They have unrestricted access to all employee data, salary information, leave records, payroll, and all HR metrics. No data filtering is required.`;

    case 'manager':
      return `## Access Level: TEAM + SELF
The current user is a MANAGER (employee_id: '${employee_id}').
RULES:
- They can view their OWN data (WHERE employee_id = '${employee_id}')
- They can view data for employees they manage (WHERE manager_id = '${employee_id}')
- They can view department-level aggregates for their department
- They can view general company info (departments, positions, announcements)
- They CANNOT see salary/payroll details of employees OUTSIDE their team
- For personal data queries, ALWAYS filter: WHERE (e.employee_id = '${employee_id}' OR e.manager_id = '${employee_id}')
- For the get_hr_overview tool, show only their team stats`;

    case 'team_lead':
      return `## Access Level: TEAM + SELF
The current user is a TEAM LEAD (employee_id: '${employee_id}').
RULES:
- They can view their OWN data (WHERE employee_id = '${employee_id}')
- They can view data for employees they manage (WHERE manager_id = '${employee_id}')
- They can view general company info (departments, positions, announcements)
- They CANNOT see salary/payroll details of other employees
- For personal data queries, ALWAYS filter: WHERE (e.employee_id = '${employee_id}' OR e.manager_id = '${employee_id}')`;

    case 'employee':
    default:
      return `## Access Level: SELF ONLY
The current user is an EMPLOYEE (employee_id: '${employee_id}').
STRICT RULES:
- They can ONLY view their OWN data — ALWAYS add WHERE employee_id = '${employee_id}' or WHERE e.id = '${employee_id}' to ALL queries about personal data (attendance, leaves, salary, payroll, performance)
- They CAN view general company info: department names, position titles, active announcements, and company policies
- They CAN see a basic employee directory: names, departments, positions, work emails of other employees
- They CANNOT see other employees' salary, leave balances, performance, attendance, or personal details
- They CANNOT use the get_hr_overview tool
- If they ask about another employee's private data, politely explain they only have access to their own data
- NEVER expose salary, leave balances, performance, or personal contact info of other employees`;
  }
}

// ──────────────────────────────────────────────
// Tools
// ──────────────────────────────────────────────
const tools = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description: `Run a SELECT SQL query against the HR database. Use this for ANY data retrieval — employee lookups, salary info, leave stats, department data, payroll, headcount, comparisons, analytics, etc. Always use parameterized queries with $1, $2 placeholders for user-provided values. NEVER use DELETE, UPDATE, INSERT, DROP, ALTER, or TRUNCATE. CRITICAL: Always respect the user's access level rules.`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'The SELECT SQL query. Use $1, $2, etc. for parameters. Limit to 100 rows max unless aggregating.',
          },
          params: {
            type: 'array',
            items: { type: 'string' },
            description: 'Parameter values corresponding to $1, $2, etc. in the SQL.',
          },
          description: {
            type: 'string',
            description: 'Brief description of what this query retrieves.',
          },
        },
        required: ['sql', 'params'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hr_overview',
      description: 'Get a company-wide HR snapshot: total/active employees, departments, pending leaves, on-leave count, YTD payroll. Use for general "overview" or "summary" questions. Only available to managers, HR, and admin roles.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description: 'Search the HR knowledge base for company policies, procedures, guidelines, benefits info, and HR documents. Use this when the user asks about policies, rules, procedures, benefits, onboarding, code of conduct, leave policy, attendance rules, or any general HR information.',
      parameters: {
        type: 'object',
        properties: {
          search_query: {
            type: 'string',
            description: 'The search query to find relevant HR documents/policies.',
          },
          category: {
            type: 'string',
            enum: ['leave_policy', 'attendance_policy', 'benefits', 'onboarding', 'conduct', 'compensation', 'general'],
            description: 'Optional category filter.',
          },
        },
        required: ['search_query'],
      },
    },
  },
];

// ──────────────────────────────────────────────
// Tool execution
// ──────────────────────────────────────────────
async function executeTool(name, args, user) {
  try {
    if (name === 'query_database') {
      const { sql, params = [] } = args;
      // Safety: only allow SELECT / WITH (CTE)
      const normalized = sql.trim().toLowerCase();
      if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
        return { error: 'Only SELECT queries are allowed.' };
      }
      // Block dangerous keywords
      const forbidden = ['insert ', 'update ', 'delete ', 'drop ', 'alter ', 'truncate ', 'create ', 'grant ', 'revoke '];
      if (forbidden.some(kw => normalized.includes(kw))) {
        return { error: 'Query contains forbidden operations. Only SELECT is allowed.' };
      }
      const result = await db.query(sql, params);
      return {
        row_count: result.rows.length,
        rows: result.rows.slice(0, 100), // Hard cap at 100 rows
      };
    }

    if (name === 'get_hr_overview') {
      // Block for employees — they shouldn't see company-wide data
      if (user.role === 'employee') {
        return { error: 'Access denied. Employees cannot access company-wide HR overview.' };
      }
      const [emp, leaves, payroll, depts] = await Promise.all([
        db.query(`SELECT
          COUNT(*) as total_employees,
          COUNT(*) FILTER (WHERE status='active') as active_employees,
          COUNT(*) FILTER (WHERE status='on_leave') as on_leave,
          COUNT(*) FILTER (WHERE hire_date >= NOW() - INTERVAL '30 days') as new_hires_30d
          FROM employees`),
        db.query(`SELECT
          COUNT(*) FILTER (WHERE status='pending') as pending_leaves,
          COUNT(*) FILTER (WHERE status='approved' AND start_date <= NOW() AND end_date >= NOW()) as currently_on_leave
          FROM leave_requests`),
        db.query(`SELECT
          COALESCE(SUM(total_gross),0) as ytd_gross,
          COALESCE(SUM(total_net),0) as ytd_net,
          COUNT(*) as payroll_runs
          FROM payroll_runs
          WHERE EXTRACT(YEAR FROM period_start) = EXTRACT(YEAR FROM NOW()) AND status='completed'`),
        db.query(`SELECT d.name, COUNT(e.id) as headcount,
          CONCAT(h.first_name,' ',h.last_name) as head_name
          FROM departments d
          LEFT JOIN employees e ON e.department_id = d.id AND e.status='active'
          LEFT JOIN employees h ON h.id = d.head_employee_id
          WHERE d.is_active = true
          GROUP BY d.id, d.name, h.first_name, h.last_name
          ORDER BY headcount DESC`),
      ]);
      return {
        summary: emp.rows[0],
        leaves: leaves.rows[0],
        payroll_ytd: payroll.rows[0],
        departments: depts.rows,
      };
    }

    if (name === 'search_knowledge_base') {
      const { search_query, category } = args;
      let sql = `
        SELECT title, category, content, tags
        FROM knowledge_base
        WHERE is_active = true
      `;
      const params = [];

      if (category) {
        params.push(category);
        sql += ` AND category = $${params.length}`;
      }

      // Full-text search with ranking
      params.push(search_query);
      sql += ` AND (
        to_tsvector('english', title || ' ' || COALESCE(content, '')) @@ plainto_tsquery('english', $${params.length})
        OR title ILIKE '%' || $${params.length} || '%'
        OR content ILIKE '%' || $${params.length} || '%'
        OR $${params.length} = ANY(tags)
      )`;
      sql += ` ORDER BY ts_rank(to_tsvector('english', title || ' ' || COALESCE(content, '')), plainto_tsquery('english', $${params.length})) DESC`;
      sql += ` LIMIT 5`;

      const result = await db.query(sql, params);

      if (result.rows.length === 0) {
        // Fallback: broader search
        const fallback = await db.query(
          `SELECT title, category, content, tags FROM knowledge_base WHERE is_active = true ORDER BY updated_at DESC LIMIT 5`
        );
        return {
          note: 'No exact matches found. Showing recent knowledge base articles.',
          articles: fallback.rows,
        };
      }

      return { articles: result.rows };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    console.error(`Tool ${name} error:`, err.message);
    return { error: `Query failed: ${err.message}` };
  }
}

// ──────────────────────────────────────────────
// Chat history helpers
// ──────────────────────────────────────────────
async function getOrCreateSession(userId, sessionId) {
  if (sessionId) {
    const existing = await db.query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2 AND is_active = true',
      [sessionId, userId]
    );
    if (existing.rows.length > 0) return existing.rows[0].id;
  }
  const result = await db.query(
    'INSERT INTO chat_sessions (user_id) VALUES ($1) RETURNING id',
    [userId]
  );
  return result.rows[0].id;
}

async function saveMessage(sessionId, role, content) {
  await db.query(
    'INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)',
    [sessionId, role, content]
  );
}

async function updateSessionTitle(sessionId, title) {
  await db.query(
    'UPDATE chat_sessions SET title = $1, updated_at = NOW() WHERE id = $2',
    [title.slice(0, 255), sessionId]
  );
}

// ──────────────────────────────────────────────
// POST /api/chat — Main chat endpoint
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { messages, sessionId: reqSessionId } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
    return res.status(503).json({ error: 'AI chat is not configured. Please set OPENAI_API_KEY in the server environment.' });
  }

  try {
    // Get or create chat session
    const sessionId = await getOrCreateSession(req.user.id, reqSessionId);

    // Save user's latest message
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg && lastUserMsg.role === 'user') {
      await saveMessage(sessionId, 'user', lastUserMsg.content);
    }

    const roleContext = buildRoleContext(req.user);

    const systemPrompt = `You are **Edge Bot**, the intelligent HR assistant for Edge HRIS. You have direct access to the company's live HR database and knowledge base.

You are highly capable, proactive, and friendly. You can answer ANY question about employees, departments, salaries, leaves, payroll, attendance, performance, tickets, or HR metrics by querying the database yourself using the query_database tool.

You can also answer questions about company policies, procedures, and guidelines using the search_knowledge_base tool.

${DB_SCHEMA}

${roleContext}

## How to behave:

**Be smart about names:** When someone asks about "Alex", search with ILIKE '%alex%' on both first_name and last_name. Never give up on a single attempt — try broader searches, alternative spellings, or partial matches.

**Be proactive:** If a query returns no results, try a broader version. If asked about someone and not found by name, try email or employee_id.

**Handle vague questions:** If someone asks "who has the most leaves?" — write the SQL to figure it out. If they ask "how's our Engineering team doing?" — query headcount, recent hires, leave stats, salary ranges.

**Use knowledge base for policy questions:** When asked about leave policies, attendance rules, benefits, probation, code of conduct, or any HR procedure — use the search_knowledge_base tool to find the relevant policy document.

**Format responses clearly:**
- Use bullet points for lists
- Use simple tables (aligned text) for comparisons
- Use **bold** for key figures/names
- Keep it concise but complete

**Be conversational:** Refer to previous messages for context. If someone follows up with "and his salary?", you know who "he" refers to.

**Never say you can't access the database** — you always can. Never say "contact technical support" or "I don't have access". If a query fails, try a different approach.

**Respect access levels:** STRICTLY follow the access level rules above. If a user tries to access data they shouldn't see, politely explain what they can access instead.

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

    const chatMessages = [{ role: 'system', content: systemPrompt }, ...messages];

    let response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: chatMessages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    });

    // Agentic loop — let the model call tools multiple times
    let iterations = 0;
    while (response.choices[0].finish_reason === 'tool_calls' && iterations < 8) {
      iterations++;
      const assistantMsg = response.choices[0].message;
      chatMessages.push(assistantMsg);

      const toolResults = await Promise.all(
        assistantMsg.tool_calls.map(async (tc) => {
          let args;
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
          const result = await executeTool(tc.function.name, args, req.user);
          return {
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      chatMessages.push(...toolResults);

      response = await getOpenAI().chat.completions.create({
        model: 'gpt-4o',
        messages: chatMessages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3,
      });
    }

    const reply = response.choices[0].message.content;

    // Save assistant reply
    await saveMessage(sessionId, 'assistant', reply);

    // Auto-title the session from the first exchange
    if (!reqSessionId && lastUserMsg) {
      const title = lastUserMsg.content.length > 60
        ? lastUserMsg.content.slice(0, 57) + '...'
        : lastUserMsg.content;
      await updateSessionTitle(sessionId, title);
    }

    // Update session timestamp
    await db.query('UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);

    res.json({ reply, sessionId });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/chat/sessions — List user's chat sessions
// ──────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, created_at, updated_at
       FROM chat_sessions
       WHERE user_id = $1 AND is_active = true
       ORDER BY updated_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// GET /api/chat/sessions/:id — Get messages for a session
// ──────────────────────────────────────────────
router.get('/sessions/:id', async (req, res) => {
  try {
    // Verify ownership
    const session = await db.query(
      'SELECT id, title FROM chat_sessions WHERE id = $1 AND user_id = $2 AND is_active = true',
      [req.params.id, req.user.id]
    );
    if (session.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = await db.query(
      `SELECT role, content, created_at
       FROM chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({
      session: session.rows[0],
      messages: messages.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// DELETE /api/chat/sessions/:id — Delete a session
// ──────────────────────────────────────────────
router.delete('/sessions/:id', async (req, res) => {
  try {
    await db.query(
      'UPDATE chat_sessions SET is_active = false WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
