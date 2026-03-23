const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(authorize('super_admin', 'hr_admin'));

// PUT /api/admin-data/employees/:id
// Update extended employee fields (shift, WFH/WFO, insurance, time metrics, etc.)
router.put('/employees/:id', async (req, res) => {
  try {
    const {
      shift_time,
      wfh_percentage,
      wfo_percentage,
      missing_io,
      life_insurance_group,
      health_insurance_group,
      actual_time,
      active_time,
      total_hours,
    } = req.body;

    const result = await db.query(`
      UPDATE employees SET
        shift_time              = COALESCE($1,  shift_time),
        wfh_percentage          = COALESCE($2,  wfh_percentage),
        wfo_percentage          = COALESCE($3,  wfo_percentage),
        missing_io              = COALESCE($4,  missing_io),
        life_insurance_group    = COALESCE($5,  life_insurance_group),
        health_insurance_group  = COALESCE($6,  health_insurance_group),
        actual_time             = COALESCE($7,  actual_time),
        active_time             = COALESCE($8,  active_time),
        total_hours             = COALESCE($9,  total_hours),
        updated_at              = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      shift_time              ?? null,
      wfh_percentage          ?? null,
      wfo_percentage          ?? null,
      missing_io              ?? null,
      life_insurance_group    ?? null,
      health_insurance_group  ?? null,
      actual_time             ?? null,
      active_time             ?? null,
      total_hours             ?? null,
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /admin-data/employees error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin-data/seed-sample-data
// Seed sample performance and attendance records for testing
router.post('/seed-sample-data', async (req, res) => {
  try {
    // Get all active employees
    const employees = await db.query(
      "SELECT id FROM employees WHERE status = 'active' LIMIT 20"
    );

    if (employees.rows.length === 0) {
      return res.json({ message: 'No active employees to seed data for', seeded: 0 });
    }

    const today = new Date();
    let seededPerformance = 0;
    let seededAttendance = 0;

    for (const emp of employees.rows) {
      // Seed 1 performance record (last month)
      const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const periodEnd   = new Date(today.getFullYear(), today.getMonth(), 0);

      await db.query(`
        INSERT INTO performance_records (
          employee_id, period_start, period_end,
          productivity, knowledge, attitude, discipline,
          productivity_pct, knowledge_pct, attitude_pct, discipline_pct, total_pct,
          notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (employee_id, period_start, period_end) DO NOTHING
      `, [
        emp.id,
        periodStart.toISOString().split('T')[0],
        periodEnd.toISOString().split('T')[0],
        (Math.random() * 2 + 3).toFixed(2),  // 3.00–5.00
        (Math.random() * 2 + 3).toFixed(2),
        (Math.random() * 2 + 3).toFixed(2),
        (Math.random() * 2 + 3).toFixed(2),
        (Math.random() * 20 + 70).toFixed(2), // 70–90%
        (Math.random() * 20 + 70).toFixed(2),
        (Math.random() * 20 + 70).toFixed(2),
        (Math.random() * 20 + 70).toFixed(2),
        (Math.random() * 20 + 70).toFixed(2),
        'Seeded sample data',
      ]);
      seededPerformance++;

      // Seed attendance for the last 5 working days
      for (let d = 1; d <= 7; d++) {
        const date = new Date(today);
        date.setDate(today.getDate() - d);
        if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends

        const checkIn  = new Date(date);
        checkIn.setHours(9, Math.floor(Math.random() * 30), 0, 0);
        const checkOut = new Date(checkIn);
        checkOut.setHours(checkIn.getHours() + 8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);
        const workHours = ((checkOut - checkIn) / 3600000).toFixed(2);

        await db.query(`
          INSERT INTO attendance_records (employee_id, date, check_in, check_out, work_hours, status)
          VALUES ($1,$2,$3,$4,$5,'present')
          ON CONFLICT (employee_id, date) DO NOTHING
        `, [
          emp.id,
          date.toISOString().split('T')[0],
          checkIn.toISOString(),
          checkOut.toISOString(),
          workHours,
        ]);
        seededAttendance++;
      }
    }

    res.json({
      message: 'Sample data seeded successfully',
      seededPerformance,
      seededAttendance,
    });
  } catch (err) {
    console.error('POST /admin-data/seed-sample-data error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
