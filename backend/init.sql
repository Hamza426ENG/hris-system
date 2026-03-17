-- HRIS System - Complete Database Schema
-- PostgreSQL

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE user_role AS ENUM ('super_admin', 'hr_admin', 'team_lead', 'employee');
CREATE TYPE employee_status AS ENUM ('active', 'inactive', 'on_leave', 'terminated', 'probation');
CREATE TYPE gender_type AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'intern', 'consultant');
CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'withdrawn');
CREATE TYPE payroll_status AS ENUM ('draft', 'processing', 'completed', 'cancelled');
CREATE TYPE marital_status AS ENUM ('single', 'married', 'divorced', 'widowed', 'separated');

-- ============================================================
-- DEPARTMENTS
-- ============================================================
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    head_employee_id UUID,
    budget DECIMAL(15,2) DEFAULT 0,
    headcount INTEGER DEFAULT 0,
    location VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- POSITIONS / JOB TITLES
-- ============================================================
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    level INTEGER DEFAULT 1,
    grade VARCHAR(20),
    min_salary DECIMAL(15,2),
    max_salary DECIMAL(15,2),
    description TEXT,
    responsibilities TEXT,
    requirements TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- USERS (Authentication)
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'employee',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- EMPLOYEES
-- ============================================================
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_id VARCHAR(20) UNIQUE NOT NULL,

    -- Personal Info
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50),
    preferred_name VARCHAR(50),
    date_of_birth DATE,
    gender gender_type,
    marital_status marital_status,
    nationality VARCHAR(50),
    national_id VARCHAR(50),
    passport_number VARCHAR(50),

    -- Contact Info
    personal_email VARCHAR(150),
    work_email VARCHAR(150),
    phone_primary VARCHAR(20),
    phone_secondary VARCHAR(20),
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),

    -- Emergency Contact
    emergency_contact_name VARCHAR(100),
    emergency_contact_relation VARCHAR(50),
    emergency_contact_phone VARCHAR(20),

    -- Employment Info
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
    manager_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    employment_type employment_type DEFAULT 'full_time',
    status employee_status DEFAULT 'active',
    hire_date DATE NOT NULL,
    confirmation_date DATE,
    termination_date DATE,
    termination_reason TEXT,
    work_location VARCHAR(100),

    -- Profile
    avatar_url VARCHAR(500),
    bio TEXT,
    skills TEXT[],
    languages TEXT[],

    -- System
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add FK for department head
ALTER TABLE departments ADD FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

-- ============================================================
-- LEAVE TYPES
-- ============================================================
CREATE TABLE leave_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    days_allowed INTEGER NOT NULL DEFAULT 0,
    carry_forward BOOLEAN DEFAULT FALSE,
    max_carry_forward_days INTEGER DEFAULT 0,
    is_paid BOOLEAN DEFAULT TRUE,
    requires_document BOOLEAN DEFAULT FALSE,
    notice_days INTEGER DEFAULT 0,
    color VARCHAR(20) DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- LEAVE BALANCES
-- ============================================================
CREATE TABLE leave_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID REFERENCES leave_types(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    allocated_days DECIMAL(5,2) DEFAULT 0,
    used_days DECIMAL(5,2) DEFAULT 0,
    pending_days DECIMAL(5,2) DEFAULT 0,
    carried_forward_days DECIMAL(5,2) DEFAULT 0,
    available_days DECIMAL(5,2) GENERATED ALWAYS AS (allocated_days + carried_forward_days - used_days - pending_days) STORED,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, leave_type_id, year)
);

-- ============================================================
-- LEAVE REQUESTS
-- ============================================================
CREATE TABLE leave_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id UUID REFERENCES leave_types(id) ON DELETE RESTRICT,

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    total_days DECIMAL(5,2) NOT NULL,
    half_day BOOLEAN DEFAULT FALSE,
    half_day_period VARCHAR(10),

    reason TEXT NOT NULL,
    status leave_status DEFAULT 'pending',

    reviewed_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    review_comments TEXT,

    document_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- SALARY STRUCTURES
-- ============================================================
CREATE TABLE salary_structures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,

    -- Base Compensation
    basic_salary DECIMAL(15,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'USD',
    pay_frequency VARCHAR(20) DEFAULT 'monthly',
    effective_date DATE NOT NULL,
    end_date DATE,

    -- Allowances
    housing_allowance DECIMAL(15,2) DEFAULT 0,
    transport_allowance DECIMAL(15,2) DEFAULT 0,
    meal_allowance DECIMAL(15,2) DEFAULT 0,
    medical_allowance DECIMAL(15,2) DEFAULT 0,
    mobile_allowance DECIMAL(15,2) DEFAULT 0,
    other_allowances DECIMAL(15,2) DEFAULT 0,

    -- Deductions
    tax_deduction DECIMAL(15,2) DEFAULT 0,
    pension_deduction DECIMAL(15,2) DEFAULT 0,
    health_insurance DECIMAL(15,2) DEFAULT 0,
    other_deductions DECIMAL(15,2) DEFAULT 0,

    -- Computed
    gross_salary DECIMAL(15,2) GENERATED ALWAYS AS (
        basic_salary + housing_allowance + transport_allowance + meal_allowance +
        medical_allowance + mobile_allowance + other_allowances
    ) STORED,
    net_salary DECIMAL(15,2) GENERATED ALWAYS AS (
        basic_salary + housing_allowance + transport_allowance + meal_allowance +
        medical_allowance + mobile_allowance + other_allowances -
        tax_deduction - pension_deduction - health_insurance - other_deductions
    ) STORED,

    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PAYROLL RUNS
-- ============================================================
CREATE TABLE payroll_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    pay_date DATE NOT NULL,
    month INTEGER,
    year INTEGER,
    description TEXT,
    status payroll_status DEFAULT 'draft',

    total_employees INTEGER DEFAULT 0,
    total_gross DECIMAL(15,2) DEFAULT 0,
    total_deductions DECIMAL(15,2) DEFAULT 0,
    total_net DECIMAL(15,2) DEFAULT 0,

    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- PAYROLL ITEMS (Per Employee Per Run)
-- ============================================================
CREATE TABLE payroll_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE RESTRICT,

    basic_salary DECIMAL(15,2) DEFAULT 0,
    housing_allowance DECIMAL(15,2) DEFAULT 0,
    transport_allowance DECIMAL(15,2) DEFAULT 0,
    meal_allowance DECIMAL(15,2) DEFAULT 0,
    medical_allowance DECIMAL(15,2) DEFAULT 0,
    mobile_allowance DECIMAL(15,2) DEFAULT 0,
    other_allowances DECIMAL(15,2) DEFAULT 0,
    bonus DECIMAL(15,2) DEFAULT 0,
    overtime_pay DECIMAL(15,2) DEFAULT 0,

    gross_salary DECIMAL(15,2) DEFAULT 0,
    tax_deduction DECIMAL(15,2) DEFAULT 0,
    pension_deduction DECIMAL(15,2) DEFAULT 0,
    health_insurance DECIMAL(15,2) DEFAULT 0,
    other_deductions DECIMAL(15,2) DEFAULT 0,
    total_deductions DECIMAL(15,2) DEFAULT 0,
    net_salary DECIMAL(15,2) DEFAULT 0,

    leave_days_taken INTEGER DEFAULT 0,
    notes TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ATTENDANCE
-- ============================================================
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in TIMESTAMP,
    check_out TIMESTAMP,
    hours_worked DECIMAL(5,2),
    overtime_hours DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'present',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(employee_id, date)
);

-- ============================================================
-- ANNOUNCEMENTS
-- ============================================================
CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    priority VARCHAR(20) DEFAULT 'normal',
    is_active BOOLEAN DEFAULT TRUE,
    posted_by UUID REFERENCES users(id),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_hire_date ON employees(hire_date);
CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_payroll_items_run ON payroll_items(payroll_run_id);
CREATE INDEX idx_payroll_items_employee ON payroll_items(employee_id);
CREATE INDEX idx_salary_employee ON salary_structures(employee_id);
CREATE INDEX idx_attendance_employee_date ON attendance(employee_id, date);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Insert Departments
INSERT INTO departments (id, name, code, description, location) VALUES
('11111111-1111-1111-1111-111111111001', 'Executive', 'EXEC', 'Executive Leadership Team', 'HQ'),
('11111111-1111-1111-1111-111111111002', 'Human Resources', 'HR', 'People & Culture Department', 'HQ'),
('11111111-1111-1111-1111-111111111003', 'Engineering', 'ENG', 'Software Engineering & Technology', 'HQ'),
('11111111-1111-1111-1111-111111111004', 'Product', 'PROD', 'Product Management & Design', 'HQ'),
('11111111-1111-1111-1111-111111111005', 'Marketing', 'MKT', 'Marketing & Growth', 'HQ'),
('11111111-1111-1111-1111-111111111006', 'Finance', 'FIN', 'Finance & Accounting', 'HQ'),
('11111111-1111-1111-1111-111111111007', 'Sales', 'SLS', 'Sales & Business Development', 'HQ'),
('11111111-1111-1111-1111-111111111008', 'Operations', 'OPS', 'Operations & Support', 'HQ');

-- Insert Positions
INSERT INTO positions (id, title, code, department_id, level, grade, min_salary, max_salary) VALUES
('22222222-2222-2222-2222-222222222001', 'Chief Executive Officer', 'CEO', '11111111-1111-1111-1111-111111111001', 10, 'C-Level', 150000, 300000),
('22222222-2222-2222-2222-222222222002', 'Chief Technology Officer', 'CTO', '11111111-1111-1111-1111-111111111003', 9, 'C-Level', 130000, 250000),
('22222222-2222-2222-2222-222222222003', 'VP of Engineering', 'VPE', '11111111-1111-1111-1111-111111111003', 8, 'VP', 120000, 200000),
('22222222-2222-2222-2222-222222222004', 'HR Director', 'HRD', '11111111-1111-1111-1111-111111111002', 8, 'Director', 90000, 140000),
('22222222-2222-2222-2222-222222222005', 'HR Manager', 'HRM', '11111111-1111-1111-1111-111111111002', 6, 'Manager', 70000, 100000),
('22222222-2222-2222-2222-222222222006', 'Senior Software Engineer', 'SSE', '11111111-1111-1111-1111-111111111003', 5, 'Senior', 80000, 130000),
('22222222-2222-2222-2222-222222222007', 'Software Engineer', 'SE', '11111111-1111-1111-1111-111111111003', 4, 'Mid', 60000, 90000),
('22222222-2222-2222-2222-222222222008', 'Product Manager', 'PM', '11111111-1111-1111-1111-111111111004', 6, 'Manager', 85000, 130000),
('22222222-2222-2222-2222-222222222009', 'UI/UX Designer', 'UXD', '11111111-1111-1111-1111-111111111004', 4, 'Mid', 60000, 90000),
('22222222-2222-2222-2222-222222222010', 'Marketing Manager', 'MKM', '11111111-1111-1111-1111-111111111005', 6, 'Manager', 70000, 105000),
('22222222-2222-2222-2222-222222222011', 'Sales Manager', 'SLM', '11111111-1111-1111-1111-111111111007', 6, 'Manager', 75000, 110000),
('22222222-2222-2222-2222-222222222012', 'Finance Manager', 'FIM', '11111111-1111-1111-1111-111111111006', 6, 'Manager', 80000, 115000),
('22222222-2222-2222-2222-222222222013', 'Operations Manager', 'OPM', '11111111-1111-1111-1111-111111111008', 6, 'Manager', 70000, 100000),
('22222222-2222-2222-2222-222222222014', 'Junior Software Engineer', 'JSE', '11111111-1111-1111-1111-111111111003', 3, 'Junior', 45000, 65000),
('22222222-2222-2222-2222-222222222015', 'HR Specialist', 'HRS', '11111111-1111-1111-1111-111111111002', 4, 'Mid', 50000, 75000);

-- Insert Users
INSERT INTO users (id, email, password_hash, role) VALUES
('33333333-3333-3333-3333-333333333001', 'admin@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'super_admin'),
('33333333-3333-3333-3333-333333333002', 'hr@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'hr_admin'),
('33333333-3333-3333-3333-333333333003', 'ceo@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'team_lead'),
('33333333-3333-3333-3333-333333333004', 'cto@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'team_lead'),
('33333333-3333-3333-3333-333333333005', 'jane.smith@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee'),
('33333333-3333-3333-3333-333333333006', 'mike.johnson@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee'),
('33333333-3333-3333-3333-333333333007', 'sarah.wilson@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee'),
('33333333-3333-3333-3333-333333333008', 'alex.brown@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee'),
('33333333-3333-3333-3333-333333333009', 'emily.davis@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee'),
('33333333-3333-3333-3333-333333333010', 'david.lee@company.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'employee');
-- password for all: "password"

-- Insert Employees
INSERT INTO employees (id, user_id, employee_id, first_name, last_name, department_id, position_id, manager_id, employment_type, status, hire_date, work_email, phone_primary, city, country, gender, date_of_birth) VALUES
('44444444-4444-4444-4444-444444444001', '33333333-3333-3333-3333-333333333001', 'EMP001', 'System', 'Admin', '11111111-1111-1111-1111-111111111002', '22222222-2222-2222-2222-222222222004', NULL, 'full_time', 'active', '2020-01-01', 'admin@company.com', '+1-555-0001', 'New York', 'USA', 'prefer_not_to_say', '1985-01-01'),
('44444444-4444-4444-4444-444444444002', '33333333-3333-3333-3333-333333333003', 'EMP002', 'James', 'Carter', '11111111-1111-1111-1111-111111111001', '22222222-2222-2222-2222-222222222001', NULL, 'full_time', 'active', '2018-03-15', 'ceo@company.com', '+1-555-0002', 'New York', 'USA', 'male', '1975-06-12'),
('44444444-4444-4444-4444-444444444003', '33333333-3333-3333-3333-333333333004', 'EMP003', 'Robert', 'Chen', '11111111-1111-1111-1111-111111111003', '22222222-2222-2222-2222-222222222002', '44444444-4444-4444-4444-444444444002', 'full_time', 'active', '2019-01-10', 'cto@company.com', '+1-555-0003', 'San Francisco', 'USA', 'male', '1978-11-23'),
('44444444-4444-4444-4444-444444444004', '33333333-3333-3333-3333-333333333002', 'EMP004', 'Lisa', 'Thompson', '11111111-1111-1111-1111-111111111002', '22222222-2222-2222-2222-222222222004', '44444444-4444-4444-4444-444444444002', 'full_time', 'active', '2019-05-20', 'hr@company.com', '+1-555-0004', 'New York', 'USA', 'female', '1982-03-08'),
('44444444-4444-4444-4444-444444444005', '33333333-3333-3333-3333-333333333005', 'EMP005', 'Jane', 'Smith', '11111111-1111-1111-1111-111111111003', '22222222-2222-2222-2222-222222222006', '44444444-4444-4444-4444-444444444003', 'full_time', 'active', '2020-08-01', 'jane.smith@company.com', '+1-555-0005', 'San Francisco', 'USA', 'female', '1990-07-15'),
('44444444-4444-4444-4444-444444444006', '33333333-3333-3333-3333-333333333006', 'EMP006', 'Mike', 'Johnson', '11111111-1111-1111-1111-111111111003', '22222222-2222-2222-2222-222222222007', '44444444-4444-4444-4444-444444444005', 'full_time', 'active', '2021-02-15', 'mike.johnson@company.com', '+1-555-0006', 'Austin', 'USA', 'male', '1993-09-22'),
('44444444-4444-4444-4444-444444444007', '33333333-3333-3333-3333-333333333007', 'EMP007', 'Sarah', 'Wilson', '11111111-1111-1111-1111-111111111004', '22222222-2222-2222-2222-222222222008', '44444444-4444-4444-4444-444444444002', 'full_time', 'active', '2020-11-01', 'sarah.wilson@company.com', '+1-555-0007', 'New York', 'USA', 'female', '1988-04-30'),
('44444444-4444-4444-4444-444444444008', '33333333-3333-3333-3333-333333333008', 'EMP008', 'Alex', 'Brown', '11111111-1111-1111-1111-111111111005', '22222222-2222-2222-2222-222222222010', '44444444-4444-4444-4444-444444444002', 'full_time', 'active', '2021-06-01', 'alex.brown@company.com', '+1-555-0008', 'Chicago', 'USA', 'male', '1987-12-10'),
('44444444-4444-4444-4444-444444444009', '33333333-3333-3333-3333-333333333009', 'EMP009', 'Emily', 'Davis', '11111111-1111-1111-1111-111111111007', '22222222-2222-2222-2222-222222222011', '44444444-4444-4444-4444-444444444002', 'full_time', 'active', '2021-09-15', 'emily.davis@company.com', '+1-555-0009', 'Boston', 'USA', 'female', '1991-02-18'),
('44444444-4444-4444-4444-444444444010', '33333333-3333-3333-3333-333333333010', 'EMP010', 'David', 'Lee', '11111111-1111-1111-1111-111111111006', '22222222-2222-2222-2222-222222222012', '44444444-4444-4444-4444-444444444002', 'full_time', 'active', '2022-01-10', 'david.lee@company.com', '+1-555-0010', 'Seattle', 'USA', 'male', '1986-08-25');

-- Update department heads
UPDATE departments SET head_employee_id = '44444444-4444-4444-4444-444444444002' WHERE id = '11111111-1111-1111-1111-111111111001';
UPDATE departments SET head_employee_id = '44444444-4444-4444-4444-444444444004' WHERE id = '11111111-1111-1111-1111-111111111002';
UPDATE departments SET head_employee_id = '44444444-4444-4444-4444-444444444003' WHERE id = '11111111-1111-1111-1111-111111111003';
UPDATE departments SET head_employee_id = '44444444-4444-4444-4444-444444444007' WHERE id = '11111111-1111-1111-1111-111111111004';
UPDATE departments SET head_employee_id = '44444444-4444-4444-4444-444444444008' WHERE id = '11111111-1111-1111-1111-111111111005';
UPDATE departments SET head_employee_id = '44444444-4444-4444-4444-444444444010' WHERE id = '11111111-1111-1111-1111-111111111006';
UPDATE departments SET head_employee_id = '44444444-4444-4444-4444-444444444009' WHERE id = '11111111-1111-1111-1111-111111111007';

-- Update headcounts
UPDATE departments SET headcount = 2 WHERE id = '11111111-1111-1111-1111-111111111001';
UPDATE departments SET headcount = 2 WHERE id = '11111111-1111-1111-1111-111111111002';
UPDATE departments SET headcount = 3 WHERE id = '11111111-1111-1111-1111-111111111003';
UPDATE departments SET headcount = 1 WHERE id = '11111111-1111-1111-1111-111111111004';
UPDATE departments SET headcount = 1 WHERE id = '11111111-1111-1111-1111-111111111005';
UPDATE departments SET headcount = 1 WHERE id = '11111111-1111-1111-1111-111111111006';
UPDATE departments SET headcount = 1 WHERE id = '11111111-1111-1111-1111-111111111007';

-- Insert Leave Types
INSERT INTO leave_types (id, name, code, description, days_allowed, carry_forward, max_carry_forward_days, is_paid, color) VALUES
('55555555-5555-5555-5555-555555555001', 'Annual Leave', 'AL', 'Paid vacation/annual leave', 20, TRUE, 5, TRUE, '#4F7BF5'),
('55555555-5555-5555-5555-555555555002', 'Sick Leave', 'SL', 'Medical and health related leave', 10, FALSE, 0, TRUE, '#EF4444'),
('55555555-5555-5555-5555-555555555003', 'Personal Leave', 'PL', 'Personal matters and errands', 5, FALSE, 0, TRUE, '#8B5CF6'),
('55555555-5555-5555-5555-555555555004', 'Maternity Leave', 'ML', 'Maternity/paternity leave', 90, FALSE, 0, TRUE, '#EC4899'),
('55555555-5555-5555-5555-555555555005', 'Unpaid Leave', 'UL', 'Leave without pay', 30, FALSE, 0, FALSE, '#6B7280'),
('55555555-5555-5555-5555-555555555006', 'Emergency Leave', 'EL', 'Emergency and bereavement leave', 3, FALSE, 0, TRUE, '#F59E0B');

-- Insert Leave Balances for 2025
INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated_days, used_days, pending_days, carried_forward_days)
SELECT e.id, lt.id, 2025, lt.days_allowed,
    CASE WHEN lt.code = 'AL' THEN FLOOR(RANDOM() * 8) ELSE FLOOR(RANDOM() * 3) END,
    CASE WHEN lt.code = 'AL' THEN FLOOR(RANDOM() * 3) ELSE 0 END,
    CASE WHEN lt.carry_forward THEN FLOOR(RANDOM() * 3) ELSE 0 END
FROM employees e
CROSS JOIN leave_types lt
WHERE lt.is_active = TRUE;

-- Insert Sample Leave Requests
INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, total_days, reason, status, reviewed_by, reviewed_at, review_comments) VALUES
('44444444-4444-4444-4444-444444444005', '55555555-5555-5555-5555-555555555001', '2025-07-14', '2025-07-18', 5, 'Family vacation', 'approved', '44444444-4444-4444-4444-444444444004', NOW() - INTERVAL '5 days', 'Approved. Have a great vacation!'),
('44444444-4444-4444-4444-444444444006', '55555555-5555-5555-5555-555555555002', '2025-06-20', '2025-06-21', 2, 'Flu symptoms, doctor visit', 'approved', '44444444-4444-4444-4444-444444444004', NOW() - INTERVAL '10 days', 'Get well soon'),
('44444444-4444-4444-4444-444444444007', '55555555-5555-5555-5555-555555555001', '2025-08-04', '2025-08-08', 5, 'Summer holiday', 'pending', NULL, NULL, NULL),
('44444444-4444-4444-4444-444444444008', '55555555-5555-5555-5555-555555555003', '2025-07-07', '2025-07-07', 1, 'Personal appointment', 'approved', '44444444-4444-4444-4444-444444444004', NOW() - INTERVAL '3 days', 'Approved'),
('44444444-4444-4444-4444-444444444009', '55555555-5555-5555-5555-555555555001', '2025-09-15', '2025-09-19', 5, 'Travel abroad', 'pending', NULL, NULL, NULL),
('44444444-4444-4444-4444-444444444010', '55555555-5555-5555-5555-555555555002', '2025-06-10', '2025-06-12', 3, 'Medical procedure recovery', 'rejected', '44444444-4444-4444-4444-444444444004', NOW() - INTERVAL '15 days', 'Please provide medical certificate');

-- Insert Salary Structures
INSERT INTO salary_structures (employee_id, basic_salary, housing_allowance, transport_allowance, meal_allowance, medical_allowance, tax_deduction, pension_deduction, health_insurance, effective_date) VALUES
('44444444-4444-4444-4444-444444444002', 18000, 4000, 1500, 500, 800, 3200, 1800, 500, '2023-01-01'),
('44444444-4444-4444-4444-444444444003', 16000, 3500, 1500, 500, 800, 2800, 1600, 500, '2023-01-01'),
('44444444-4444-4444-4444-444444444004', 9500, 2000, 1000, 400, 600, 1500, 950, 400, '2023-01-01'),
('44444444-4444-4444-4444-444444444005', 8500, 1800, 800, 300, 500, 1300, 850, 350, '2023-01-01'),
('44444444-4444-4444-4444-444444444006', 6500, 1200, 600, 300, 400, 900, 650, 300, '2023-01-01'),
('44444444-4444-4444-4444-444444444007', 9000, 2000, 800, 400, 600, 1400, 900, 400, '2023-01-01'),
('44444444-4444-4444-4444-444444444008', 7500, 1500, 800, 300, 500, 1100, 750, 350, '2023-01-01'),
('44444444-4444-4444-4444-444444444009', 8000, 1600, 800, 300, 500, 1200, 800, 350, '2023-01-01'),
('44444444-4444-4444-4444-444444444010', 8500, 1800, 1000, 400, 600, 1300, 850, 400, '2023-01-01');

-- Insert Payroll Runs
INSERT INTO payroll_runs (id, period_start, period_end, pay_date, month, year, description, status, total_employees, total_gross, total_deductions, total_net) VALUES
('66666666-6666-6666-6666-666666666001', '2025-05-01', '2025-05-31', '2025-05-31', 5, 2025, 'May 2025 Payroll', 'completed', 9, 620500, 98700, 521800),
('66666666-6666-6666-6666-666666666002', '2025-06-01', '2025-06-30', '2025-06-30', 6, 2025, 'June 2025 Payroll', 'completed', 10, 689800, 109500, 580300),
('66666666-6666-6666-6666-666666666003', '2025-07-01', '2025-07-31', '2025-07-31', 7, 2025, 'July 2025 Payroll', 'draft', 10, 0, 0, 0);

-- Insert Announcements
INSERT INTO announcements (title, content, priority, posted_by) VALUES
('Q3 Performance Reviews Starting', 'Annual Q3 performance reviews will begin next week. Please ensure all self-assessments are completed.', 'high', '33333333-3333-3333-3333-333333333002'),
('New Health Insurance Policy', 'We have upgraded our health insurance coverage. Details will be shared via email.', 'normal', '33333333-3333-3333-3333-333333333002'),
('Office Closure - Public Holiday', 'The office will be closed on July 4th for Independence Day.', 'normal', '33333333-3333-3333-3333-333333333001');

-- Update function for timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_salary_structures_updated_at BEFORE UPDATE ON salary_structures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payroll_runs_updated_at BEFORE UPDATE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
