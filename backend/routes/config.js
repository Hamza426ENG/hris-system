const express = require('express');
const db = require('../db');

const router = express.Router();

// Cache config for 5 minutes to avoid repeated DB queries
let cachedConfig = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

// GET /api/config — public endpoint returning all enum values and system config
router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    if (cachedConfig && (now - cacheTime) < CACHE_TTL) {
      return res.json(cachedConfig);
    }

    // Query all enum types from PostgreSQL
    const enumQuery = `
      SELECT t.typname AS enum_name, e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `;
    const enumResult = await db.query(enumQuery);

    // Group by enum name
    const enums = {};
    for (const row of enumResult.rows) {
      if (!enums[row.enum_name]) enums[row.enum_name] = [];
      enums[row.enum_name].push(row.enum_value);
    }

    // Get the earliest year we have data for (for year dropdowns)
    const yearQuery = `
      SELECT LEAST(
        COALESCE((SELECT EXTRACT(YEAR FROM MIN(hire_date))::int FROM employees WHERE hire_date IS NOT NULL), EXTRACT(YEAR FROM NOW())::int),
        COALESCE((SELECT EXTRACT(YEAR FROM MIN(created_at))::int FROM leave_requests), EXTRACT(YEAR FROM NOW())::int),
        COALESCE((SELECT EXTRACT(YEAR FROM MIN(period_start))::int FROM payroll_runs), EXTRACT(YEAR FROM NOW())::int)
      ) AS min_year
    `;
    let minYear;
    try {
      const yearResult = await db.query(yearQuery);
      minYear = yearResult.rows[0]?.min_year || new Date().getFullYear();
    } catch {
      minYear = new Date().getFullYear() - 3;
    }

    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear + 1; y >= Math.min(minYear, currentYear - 3); y--) {
      years.push(y);
    }

    const config = {
      roles: enums.user_role || [],
      employeeStatuses: enums.employee_status || [],
      genders: enums.gender_type || [],
      employmentTypes: enums.employment_type || [],
      leaveStatuses: enums.leave_status || [],
      payrollStatuses: enums.payroll_status || [],
      maritalStatuses: enums.marital_status || [],
      years,
      currencies: ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'PKR', 'INR', 'CAD', 'AUD'],
    };

    cachedConfig = config;
    cacheTime = now;

    res.json(config);
  } catch (err) {
    console.error('Config endpoint error:', err);
    res.status(500).json({ error: 'Failed to load configuration' });
  }
});

module.exports = router;
