# Employee Profile Enhancement - Complete Documentation

## Overview

This document describes the comprehensive enhancements made to the HRIS system to display complete employee profile information including performance metrics, attendance details, insurance information, and work location preferences.

## Database Changes

### New Columns Added to `employees` Table

The following columns were added to the `employees` table to support enhanced profile information:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `shift_time` | VARCHAR(20) | '09:00 AM' | Employee's shift start time (e.g., '04:00 PM') |
| `wfh_percentage` | DECIMAL(5,2) | 0 | Work From Home attendance percentage |
| `wfo_percentage` | DECIMAL(5,2) | 0 | Work From Office attendance percentage |
| `missing_io` | BOOLEAN | FALSE | Flag for missing check-in/check-out records |
| `life_insurance_group` | VARCHAR(200) | NULL | Life insurance plan name |
| `health_insurance_group` | VARCHAR(200) | NULL | Health insurance plan name |
| `actual_time` | DECIMAL(5,2) | 0 | Actual working hours logged |
| `active_time` | DECIMAL(5,2) | 0 | Active engagement time |
| `total_hours` | DECIMAL(7,2) | 0 | Total hours worked in period |

### New `performance_records` Table

A new table was created to store performance metrics per employee per period:

```sql
CREATE TABLE performance_records (
  id UUID PRIMARY KEY,
  employee_id UUID NOT NULL (FK to employees),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  productivity DECIMAL(5,2),
  knowledge DECIMAL(5,2),
  attitude DECIMAL(5,2),
  discipline DECIMAL(5,2),
  productivity_pct DECIMAL(5,2),
  knowledge_pct DECIMAL(5,2),
  attitude_pct DECIMAL(5,2),
  discipline_pct DECIMAL(5,2),
  total_pct DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(employee_id, period_start, period_end)
);
```

**Indexes:**
- `idx_performance_employee` on `employee_id`
- `idx_performance_period` on `period_start, period_end`

## API Endpoints

### Employee Profile Endpoint (Enhanced)

**GET `/api/employees/:id`**

Returns employee details with latest performance record:

```json
{
  "id": "uuid",
  "employee_id": "string",
  "first_name": "string",
  "last_name": "string",
  "position_title": "string",
  "department_name": "string",
  "phone_primary": "string",
  "phone_secondary": "string",
  "emergency_contact_name": "string",
  "emergency_contact_phone": "string",
  "hire_date": "date",
  "date_of_birth": "date",
  "address_line1": "string",
  "shift_time": "string",
  "wfh_percentage": number,
  "wfo_percentage": number,
  "missing_io": boolean,
  "life_insurance_group": "string",
  "health_insurance_group": "string",
  "actual_time": number,
  "active_time": number,
  "total_hours": number,
  "performance": {
    "id": "uuid",
    "period_start": "date",
    "period_end": "date",
    "productivity": 7.5,
    "knowledge": 9,
    "attitude": 9.8,
    "discipline": 0,
    "productivity_pct": 37.5,
    "knowledge_pct": 18,
    "attitude_pct": 9.8,
    "discipline_pct": 6,
    "total_pct": 77.9
  }
}
```

### Performance Management Endpoints

**GET `/api/performance/employee/:id`**
- Retrieve latest performance record for an employee

**POST `/api/performance/employee/:id`**
- Create or update performance record (requires role: super_admin, hr_admin, team_lead)

Request body:
```json
{
  "period_start": "2026-03-09",
  "period_end": "2026-03-14",
  "productivity": 7.5,
  "knowledge": 9,
  "attitude": 9.8,
  "discipline": 0,
  "productivity_pct": 37.5,
  "knowledge_pct": 18,
  "attitude_pct": 9.8,
  "discipline_pct": 6,
  "total_pct": 77.9,
  "notes": "Optional notes"
}
```

**GET `/api/performance/history/:id?page=1&limit=12`**
- Retrieve performance history for an employee (paginated)

### Admin Data Management Endpoints

**PUT `/api/admin-data/employees/:id`**
- Update employee profile fields (requires role: super_admin, hr_admin)

Request body (all fields optional):
```json
{
  "shift_time": "04:00 PM",
  "wfh_percentage": 43,
  "wfo_percentage": 57,
  "missing_io": true,
  "life_insurance_group": "Premium Health Plan",
  "health_insurance_group": "Standard Group Coverage",
  "actual_time": 6,
  "active_time": 6.6,
  "total_hours": 38.9
}
```

**POST `/api/admin-data/seed-sample-data`**
- Seed sample performance data for latest employee (for testing)

## Frontend Components

### EmployeeProfileCard Component

Location: `frontend-next/src/components/common/EmployeeProfileCard.js`

**Features:**
- Automatically calculates tenure and age from hire_date and date_of_birth
- Displays complete employee profile with all new fields
- Shows performance metrics with period start/end dates
- Displays time tracking (actual, active, total hours)
- Shows shift time and WFH/WFO attendance split
- Displays insurance group information
- Shows employment type and missing I/O status

**Props:**
```javascript
{
  employee: {
    // All employee database fields
    first_name,
    last_name,
    position_title,
    employment_type,
    status,
    phone_primary,
    phone_secondary,
    emergency_contact_name,
    emergency_contact_phone,
    hire_date,
    date_of_birth,
    address_line1,
    employee_id,
    avatar_url,
    department_name,
    shift_time,
    wfh_percentage,
    wfo_percentage,
    missing_io,
    life_insurance_group,
    health_insurance_group,
    actual_time,
    active_time,
    total_hours,
    // Optional: full performance object
    performance: {
      period_start,
      period_end,
      productivity,
      knowledge,
      attitude,
      discipline,
      productivity_pct,
      knowledge_pct,
      attitude_pct,
      discipline_pct,
      total_pct
    }
  }
}
```

## Usage Example

### Update Abdul Rehman's Profile

**Option 1: Using SQL Script**

1. Open [database/update-abdul-rehman.sql](database/update-abdul-rehman.sql)
2. First, find Abdul Rehman's ID by running the SELECT query
3. Replace `ABDUL_REHMAN_ID` with the actual UUID
4. Execute the UPDATE and INSERT statements

**Option 2: Using API (cURL)**

```bash
# Find employee ID first
curl -H "Authorization: Bearer <TOKEN>" \
  https://your-api.com/api/employees?search=Abdul%20Rehman

# Update employee profile
curl -X PUT \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "shift_time": "04:00 PM",
    "wfh_percentage": 43,
    "wfo_percentage": 57,
    "missing_io": true,
    "life_insurance_group": "Standard Group Coverage",
    "health_insurance_group": "Premium Health Plan",
    "actual_time": 6,
    "active_time": 6.6,
    "total_hours": 38.9
  }' \
  https://your-api.com/api/admin-data/employees/EMPLOYEE_ID

# Add performance record
curl -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "period_start": "2026-03-09",
    "period_end": "2026-03-14",
    "productivity": 7.5,
    "knowledge": 9,
    "attitude": 9.8,
    "discipline": 0,
    "productivity_pct": 37.5,
    "knowledge_pct": 18,
    "attitude_pct": 9.8,
    "discipline_pct": 6,
    "total_pct": 77.9
  }' \
  https://your-api.com/api/performance/employee/EMPLOYEE_ID
```

**Option 3: Using Frontend (Programmatic)**

```javascript
import { adminDataAPI, performanceAPI } from '@/services/api';

// Update employee profile
await adminDataAPI.updateEmployee(employeeId, {
  shift_time: '04:00 PM',
  wfh_percentage: 43,
  wfo_percentage: 57,
  missing_io: true,
  life_insurance_group: 'Standard Group Coverage',
  health_insurance_group: 'Premium Health Plan',
  actual_time: 6,
  active_time: 6.6,
  total_hours: 38.9
});

// Add performance record
await performanceAPI.create(employeeId, {
  period_start: '2026-03-09',
  period_end: '2026-03-14',
  productivity: 7.5,
  knowledge: 9,
  attitude: 9.8,
  discipline: 0,
  productivity_pct: 37.5,
  knowledge_pct: 18,
  attitude_pct: 9.8,
  discipline_pct: 6,
  total_pct: 77.9
});
```

## Migration Information

### Running Migrations

On application startup, the migration script will automatically:
1. Create the `performance_records` table if it doesn't exist
2. Add all missing columns to the `employees` table
3. Create necessary indexes

No manual migration running is required — the system handles this automatically.

### Checking Migration Status

```sql
-- Check if new columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'employees' 
AND column_name IN ('shift_time', 'wfh_percentage', 'missing_io', 'life_insurance_group');

-- Check if performance_records table exists
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name = 'performance_records';
```

## Key Features

### 1. Tenure & Age Calculation
- **Tenure** is automatically calculated from `hire_date` using: `(current_date - hire_date) / 365.25`
- **Age** is automatically calculated from `date_of_birth` using: `(current_date - date_of_birth) / 365.25`
- Both are displayed with one decimal place (e.g., "0.6 yr")

### 2. Performance Metrics
- Supports multiple performance periods (weekly, monthly, etc.)
- Stores absolute scores (productivity: 7.5) and percentages (productivity%: 37.5)
- Calculates overall percentage from component percentages
- Automatically retrieves latest performance record for employee detail view

### 3. Work Location Intelligence
- Tracks WFH (Work From Home) and WFO (Work From Office) percentages
- Displayed as progress bars in employee profile
- Sums to 100% for clear visualization

### 4. Insurance Management
- Separate fields for life and health insurance group names
- Flexible text field allows storing plan names, group IDs, etc.
- Only displayed if data is present

### 5. Time Tracking
- **Actual Time**: Total time logged in system
- **Active Time**: Productive engagement time
- **Total Hours**: Total hours worked in the period
- Useful for productivity analysis and time management

## Testing the Implementation

### Prerequisites
- Backend running with latest migrations applied
- Frontend built with all component changes
- User logged in with appropriate permissions

### Test Flow
1. Navigate to employee detail page (`/employees/[id]`)
2. Verify all sections display correctly:
   - Header with name, role, badges
   - Personal info with calculated tenure/age
   - Performance metrics with period dates
   - Time tracking data
   - Attendance split showing WFH/WFO percentages
   - Shift time display
   - Insurance groups (if populated)
   - Missing I/O status

### Sample Data

For testing purposes, you can use the pre-configured Abdul Rehman data:
- Employee ID: Abdul Rehman (Junior DevOps Engineer)
- Joining: 08/04/2025
- Shift Time: 04:00 PM
- WFH: 43%, WFO: 57%
- Missing I/O: Yes
- Age: 23.1 years
- Tenure: 0.6 years
- Performance Period: 03/09/2026 - 03/14/2026
- Performance Score: 77.9%

## Troubleshooting

### Performance Data Not Showing
1. Verify performance record exists: `SELECT * FROM performance_records WHERE employee_id = 'UUID'`
2. Check employee endpoint returns performance object
3. Ensure date format is correct in payload (YYYY-MM-DD)

### Missing Fields in Response
1. Verify columns exist: Check migration logs
2. Ensure data was saved: Query employee table directly
3. Check API response filtering isn't removing fields

### Tenure/Age Showing 0
1. Verify hire_date and date_of_birth are set in database
2. Check date format is valid DATE type
3. If recently added, they may not have values yet

## Backend Routes Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/employees/:id` | Required | Get employee with performance data |
| PUT | `/api/admin-data/employees/:id` | HR/Admin | Update employee fields |
| GET | `/api/performance/employee/:id` | Required | Get latest performance |
| POST | `/api/performance/employee/:id` | Team Lead+ | Create/update performance |
| GET | `/api/performance/history/:id` | Required | Get performance history |
| POST | `/api/admin-data/seed-sample-data` | Admin | Seed sample data (testing) |

## Frontend API Service Methods

```javascript
import { performanceAPI, adminDataAPI } from '@/services/api';

// Performance API
performanceAPI.getLatest(employeeId)      // Get latest performance
performanceAPI.create(employeeId, data)   // Create/update performance
performanceAPI.history(employeeId, {})    // Get performance history

// Admin Data API
adminDataAPI.updateEmployee(id, data)     // Update employee profile
adminDataAPI.seedSampleData()             // Seed sample data
```

## Security Notes

- All admin/HR endpoints require appropriate role-based authorization
- Performance updates restricted to super_admin, hr_admin, team_lead
- Employee data updates restricted to super_admin, hr_admin
- All requests require valid JWT token

## Performance Considerations

- Performance records indexed by employee_id and period (date range queries are efficient)
- Latest performance retrieved via ORDER BY + LIMIT 1 (no manual filtering needed)
- Tenure/age calculated client-side to save database resources
- Add caching for frequently accessed employees if needed

---

**Last Updated:** March 23, 2026  
**Version:** 1.0  
**Status:** Production Ready
