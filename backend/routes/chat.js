const express = require('express');
const OpenAI = require('openai');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.use((req, res, next) => {
  if (!['super_admin', 'hr_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access restricted to HR and Admin only.' });
  }
  next();
});

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
  manager_id, employment_type [full_time|part_time|contract|intern],
  status [active|inactive|on_leave], hire_date, termination_date, work_location,
  skills, languages, city, country, avatar_url, created_at)

departments (id, name, code, description, head_employee_id, parent_id,
  location, budget, is_active)

positions (id, title, code, department_id, grade, level, min_salary, max_salary)

users (id, email, role [super_admin|hr_admin|team_lead|employee], is_active)

leave_requests (id, employee_id, leave_type_id, start_date, end_date,
  total_days, status [pending|approved|rejected|cancelled], reason, created_at)

leave_types (id, name, code, days_allowed, is_paid, carry_forward)

leave_balances (id, employee_id, leave_type_id, year, allocated_days,
  used_days, remaining_days)

salary_structures (id, employee_id, effective_date, basic_salary,
  house_allowance, transport_allowance, medical_allowance, other_allowances,
  gross_salary, income_tax, social_security, other_deductions, net_salary,
  is_active, currency)

payroll_runs (id, period_start, period_end, status [draft|processing|completed|cancelled],
  total_gross, total_deductions, total_net, employee_count, processed_at)

payroll_items (id, payroll_run_id, employee_id, basic_salary, gross_salary,
  total_deductions, net_salary, status)

announcements (id, title, content, priority, created_at)

Common JOINs:
- employees e JOIN departments d ON d.id = e.department_id
- employees e JOIN positions p ON p.id = e.position_id
- employees e JOIN employees m ON m.id = e.manager_id (for manager name)
- departments d JOIN employees head ON head.id = d.head_employee_id (for dept head)
- leave_requests lr JOIN employees e ON e.id = lr.employee_id
- leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
- salary_structures ss ON ss.employee_id = e.id AND ss.is_active = true

Name search pattern: CONCAT(e.first_name, ' ', e.last_name) ILIKE '%name%'
  OR e.first_name ILIKE '%name%' OR e.last_name ILIKE '%name%'
`;

// ──────────────────────────────────────────────
// Tools
// ──────────────────────────────────────────────
const tools = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description: `Run any SELECT SQL query against the HR database. Use this for ANY data retrieval — employee lookups, salary info, leave stats, department data, payroll, headcount, comparisons, analytics, etc. Always use parameterized queries with $1, $2 placeholders for user-provided values. NEVER use DELETE, UPDATE, INSERT.`,
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
            description: 'Brief description of what this query retrieves (for debugging).',
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
      description: 'Get a quick company-wide HR snapshot: total/active employees, departments, pending leaves, on-leave count, YTD payroll. Use this to answer general "overview" or "summary" questions.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ──────────────────────────────────────────────
// Tool execution
// ──────────────────────────────────────────────
async function executeTool(name, args) {
  try {
    if (name === 'query_database') {
      const { sql, params = [] } = args;
      // Safety: only allow SELECT
      const normalized = sql.trim().toLowerCase();
      if (!normalized.startsWith('select') && !normalized.startsWith('with')) {
        return { error: 'Only SELECT queries are allowed.' };
      }
      const result = await db.query(sql, params);
      return {
        row_count: result.rows.length,
        rows: result.rows,
      };
    }

    if (name === 'get_hr_overview') {
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

    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    console.error(`Tool ${name} error:`, err.message);
    return { error: `Query failed: ${err.message}` };
  }
}

// ──────────────────────────────────────────────
// POST /api/chat
// ──────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const systemPrompt = `You are an expert HR intelligence assistant for Edge HRIS with direct access to the company's live HR database.

You are highly capable, proactive, and intelligent. You can answer ANY question about employees, departments, salaries, leaves, payroll, or HR metrics by querying the database yourself using the query_database tool.

${DB_SCHEMA}

## How to behave:

**Be smart about names:** When someone asks about "Alex", search with ILIKE '%alex%' on both first_name and last_name. Never give up on a single attempt — try broader searches, alternative spellings, or partial matches.

**Be proactive:** If a query returns no results, try a broader version. If asked about someone and not found by name, try email or employee_id.

**Handle vague questions:** If someone asks "who has the most leaves?" — write the SQL to figure it out. If they ask "how's our Engineering team doing?" — query headcount, recent hires, leave stats, salary ranges.

**Format responses clearly:**
- Use bullet points for lists
- Use simple tables (aligned text) for comparisons
- Use **bold** for key figures/names
- Keep it concise but complete

**Be conversational:** You can refer to previous messages in the conversation to maintain context. If someone follows up with "and his salary?", you know who "he" refers to.

**Never say you can't access the database** — you always can. Never say "contact technical support". If a query fails, try a different approach.

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

  try {
    const chatMessages = [{ role: 'system', content: systemPrompt }, ...messages];

    let response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: chatMessages,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    });

    // Agentic loop
    let iterations = 0;
    while (response.choices[0].finish_reason === 'tool_calls' && iterations < 8) {
      iterations++;
      const assistantMsg = response.choices[0].message;
      chatMessages.push(assistantMsg);

      const toolResults = await Promise.all(
        assistantMsg.tool_calls.map(async (tc) => {
          let args;
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
          const result = await executeTool(tc.function.name, args);
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

    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
});

module.exports = router;
