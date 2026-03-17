const express = require('express');
const OpenAI = require('openai');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// HR/Admin only
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
// Tool definitions (OpenAI function calling)
// ──────────────────────────────────────────────
const tools = [
  {
    type: 'function',
    function: {
      name: 'search_employees',
      description: 'Search employees by name, department, position, status, or employment type. Returns a list of matching employees with basic info.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Name, email, or employee ID to search' },
          department: { type: 'string', description: 'Department name (partial match)' },
          status: { type: 'string', enum: ['active', 'inactive', 'on_leave'], description: 'Employment status' },
          employment_type: { type: 'string', enum: ['full_time', 'part_time', 'contract', 'intern'] },
          limit: { type: 'number', description: 'Max results (default 10, max 50)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_employee_details',
      description: 'Get full profile of a specific employee including personal info, salary, leave balances, and recent leave history.',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Employee full name, email, or employee ID (e.g. EMP001)' },
        },
        required: ['identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_department_stats',
      description: 'Get headcount, salary stats, and active employee list for a department.',
      parameters: {
        type: 'object',
        properties: {
          department: { type: 'string', description: 'Department name (partial match)' },
        },
        required: ['department'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leave_report',
      description: 'Get leave requests and statistics. Can filter by employee, status, or date range.',
      parameters: {
        type: 'object',
        properties: {
          employee_name: { type: 'string', description: 'Filter by employee name' },
          status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'cancelled'] },
          start_date: { type: 'string', description: 'Start date YYYY-MM-DD' },
          end_date: { type: 'string', description: 'End date YYYY-MM-DD' },
          limit: { type: 'number', description: 'Max results, default 20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payroll_summary',
      description: 'Get payroll run history and totals. Optionally filter by month/year.',
      parameters: {
        type: 'object',
        properties: {
          month: { type: 'number', description: 'Month number 1-12' },
          year: { type: 'number', description: 'Year e.g. 2025' },
          limit: { type: 'number', description: 'Max payroll runs to return, default 5' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overall_stats',
      description: 'Get high-level HR statistics: total employees, active count, pending leaves, payroll totals, department breakdown.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// ──────────────────────────────────────────────
// Tool execution
// ──────────────────────────────────────────────
async function executeTool(name, args) {
  try {
    switch (name) {
      case 'search_employees': {
        const { search, department, status, employment_type, limit = 10 } = args;
        let where = ['1=1'];
        let params = [];
        let i = 1;
        if (search) {
          where.push(`(e.first_name ILIKE $${i} OR e.last_name ILIKE $${i} OR CONCAT(e.first_name,' ',e.last_name) ILIKE $${i} OR e.employee_id ILIKE $${i} OR e.work_email ILIKE $${i})`);
          params.push(`%${search}%`); i++;
        }
        if (department) {
          where.push(`d.name ILIKE $${i}`);
          params.push(`%${department}%`); i++;
        }
        if (status) { where.push(`e.status = $${i++}`); params.push(status); }
        if (employment_type) { where.push(`e.employment_type = $${i++}`); params.push(employment_type); }
        params.push(Math.min(limit, 50));
        const result = await db.query(`
          SELECT e.id, e.employee_id, e.first_name, e.last_name, e.work_email,
            e.status, e.employment_type, e.hire_date, e.phone_primary as phone,
            d.name as department, p.title as position
          FROM employees e
          LEFT JOIN departments d ON d.id = e.department_id
          LEFT JOIN positions p ON p.id = e.position_id
          WHERE ${where.join(' AND ')}
          ORDER BY e.first_name, e.last_name
          LIMIT $${i}
        `, params);
        return { count: result.rows.length, employees: result.rows };
      }

      case 'get_employee_details': {
        const { identifier } = args;
        const empRes = await db.query(`
          SELECT e.*, d.name as department, p.title as position, p.grade,
            CONCAT(m.first_name,' ',m.last_name) as manager_name
          FROM employees e
          LEFT JOIN departments d ON d.id = e.department_id
          LEFT JOIN positions p ON p.id = e.position_id
          LEFT JOIN employees m ON m.id = e.manager_id
          WHERE e.employee_id ILIKE $1 OR e.work_email ILIKE $1
            OR CONCAT(e.first_name,' ',e.last_name) ILIKE $2
          LIMIT 1
        `, [identifier, `%${identifier}%`]);
        if (!empRes.rows.length) return { error: `No employee found matching "${identifier}"` };
        const emp = empRes.rows[0];

        const [salRes, balRes, leaveRes] = await Promise.all([
          db.query(`SELECT * FROM salary_structures WHERE employee_id = $1 AND is_active = true LIMIT 1`, [emp.id]),
          db.query(`SELECT lt.name, lb.allocated_days, lb.used_days, lb.remaining_days FROM leave_balances lb JOIN leave_types lt ON lt.id = lb.leave_type_id WHERE lb.employee_id = $1 AND lb.year = EXTRACT(YEAR FROM NOW())`, [emp.id]),
          db.query(`SELECT lr.start_date, lr.end_date, lr.total_days, lr.status, lt.name as leave_type, lr.reason FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE lr.employee_id = $1 ORDER BY lr.created_at DESC LIMIT 5`, [emp.id]),
        ]);

        return {
          profile: { ...emp, password: undefined, avatar_url: undefined },
          salary: salRes.rows[0] || null,
          leave_balances: balRes.rows,
          recent_leaves: leaveRes.rows,
        };
      }

      case 'get_department_stats': {
        const { department } = args;
        const deptRes = await db.query(`SELECT * FROM departments WHERE name ILIKE $1 LIMIT 1`, [`%${department}%`]);
        if (!deptRes.rows.length) return { error: `Department "${department}" not found` };
        const dept = deptRes.rows[0];
        const [stats, employees] = await Promise.all([
          db.query(`
            SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE e.status='active') as active,
              AVG(ss.basic_salary) as avg_basic_salary, MAX(ss.basic_salary) as max_salary, MIN(ss.basic_salary) as min_salary
            FROM employees e
            LEFT JOIN salary_structures ss ON ss.employee_id = e.id AND ss.is_active = true
            WHERE e.department_id = $1
          `, [dept.id]),
          db.query(`
            SELECT e.first_name, e.last_name, e.employee_id, e.status, e.hire_date, p.title as position
            FROM employees e LEFT JOIN positions p ON p.id = e.position_id
            WHERE e.department_id = $1 AND e.status = 'active'
            ORDER BY e.first_name LIMIT 30
          `, [dept.id]),
        ]);
        return { department: dept.name, stats: stats.rows[0], employees: employees.rows };
      }

      case 'get_leave_report': {
        const { employee_name, status, start_date, end_date, limit = 20 } = args;
        let where = ['1=1'];
        let params = [];
        let i = 1;
        if (employee_name) {
          where.push(`CONCAT(e.first_name,' ',e.last_name) ILIKE $${i}`);
          params.push(`%${employee_name}%`); i++;
        }
        if (status) { where.push(`lr.status = $${i++}`); params.push(status); }
        if (start_date) { where.push(`lr.start_date >= $${i++}`); params.push(start_date); }
        if (end_date) { where.push(`lr.end_date <= $${i++}`); params.push(end_date); }
        params.push(Math.min(limit, 100));
        const result = await db.query(`
          SELECT CONCAT(e.first_name,' ',e.last_name) as employee_name, e.employee_id,
            d.name as department, lt.name as leave_type,
            lr.start_date, lr.end_date, lr.total_days, lr.status, lr.reason, lr.created_at
          FROM leave_requests lr
          JOIN employees e ON e.id = lr.employee_id
          JOIN leave_types lt ON lt.id = lr.leave_type_id
          LEFT JOIN departments d ON d.id = e.department_id
          WHERE ${where.join(' AND ')}
          ORDER BY lr.created_at DESC
          LIMIT $${i}
        `, params);
        return { count: result.rows.length, leaves: result.rows };
      }

      case 'get_payroll_summary': {
        const { month, year, limit = 5 } = args;
        let where = ['1=1'];
        let params = [];
        let i = 1;
        if (month) { where.push(`EXTRACT(MONTH FROM pr.period_start) = $${i++}`); params.push(month); }
        if (year) { where.push(`EXTRACT(YEAR FROM pr.period_start) = $${i++}`); params.push(year); }
        params.push(limit);
        const result = await db.query(`
          SELECT pr.id, pr.period_start, pr.period_end, pr.status,
            pr.total_gross, pr.total_deductions, pr.total_net, pr.employee_count,
            pr.processed_at, pr.notes
          FROM payroll_runs pr
          WHERE ${where.join(' AND ')}
          ORDER BY pr.period_start DESC
          LIMIT $${i}
        `, params);
        return { payroll_runs: result.rows };
      }

      case 'get_overall_stats': {
        const [emp, leaves, payroll, depts] = await Promise.all([
          db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active, COUNT(*) FILTER (WHERE hire_date >= NOW() - INTERVAL '30 days') as new_hires FROM employees`),
          db.query(`SELECT COUNT(*) FILTER (WHERE status='pending') as pending, COUNT(*) FILTER (WHERE status='approved' AND start_date <= NOW() AND end_date >= NOW()) as on_leave FROM leave_requests`),
          db.query(`SELECT COALESCE(SUM(total_gross),0) as ytd_gross, COALESCE(SUM(total_net),0) as ytd_net FROM payroll_runs WHERE EXTRACT(YEAR FROM period_start) = EXTRACT(YEAR FROM NOW()) AND status='completed'`),
          db.query(`SELECT d.name, COUNT(e.id) as headcount FROM departments d LEFT JOIN employees e ON e.department_id = d.id AND e.status='active' GROUP BY d.id, d.name ORDER BY headcount DESC`),
        ]);
        return {
          employees: emp.rows[0],
          leaves: leaves.rows[0],
          payroll_ytd: payroll.rows[0],
          departments: depts.rows,
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    console.error(`Tool ${name} error:`, err.message);
    return { error: err.message };
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

  const systemPrompt = `You are an intelligent HR assistant for Edge HRIS. You have direct access to the company's HR database through the provided tools.

Your job is to help HR managers and admins get instant, accurate answers about:
- Employee profiles, details, and history
- Leave requests, balances, and patterns
- Salary and compensation data
- Department headcounts and statistics
- Payroll summaries and totals

Guidelines:
- Always use the tools to fetch real data before answering
- Present data in a clear, readable format (use bullet points, tables in text, numbers)
- For sensitive data like salaries, present it professionally
- If asked about multiple employees, search and summarize clearly
- Be concise but complete — HR needs quick, accurate information
- Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

  try {
    const chatMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    let response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o',
      messages: chatMessages,
      tools,
      tool_choice: 'auto',
    });

    // Agentic loop: keep running until no more tool calls
    while (response.choices[0].finish_reason === 'tool_calls') {
      const assistantMsg = response.choices[0].message;
      chatMessages.push(assistantMsg);

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        assistantMsg.tool_calls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments);
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
      });
    }

    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Chat failed. ' + err.message });
  }
});

module.exports = router;
