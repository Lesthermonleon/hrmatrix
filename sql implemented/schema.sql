-- ============================================================
-- HRMatrix — Unified Supabase Schema
-- Consolidates initial schema and security patches (schema_patch.sql)
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- PROFILES (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','hr_manager','payroll_officer','supervisor','employee')),
  department TEXT,
  position TEXT,
  employee_id TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  head_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EMPLOYEES (Extended with personal & govt fields)
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  employee_id TEXT NOT NULL UNIQUE DEFAULT 'EMP-' || substring(gen_random_uuid()::text,1,6),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','on_leave')),
  supervisor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  basic_salary NUMERIC(12,2) DEFAULT 0,
  -- Personal Details
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male','female','other')),
  civil_status TEXT CHECK (civil_status IN ('single','married','widowed','separated','divorced')),
  address TEXT,
  phone TEXT,
  -- Government IDs
  sss_number TEXT,
  philhealth_number TEXT,
  pagibig_number TEXT,
  employment_type TEXT DEFAULT 'regular' CHECK (employment_type IN ('regular','contractual','probationary','part_time')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- LEAVE BALANCES
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INT NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  vacation INT NOT NULL DEFAULT 15,
  sick INT NOT NULL DEFAULT 15,
  emergency INT NOT NULL DEFAULT 3,
  special INT NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT leave_balances_employee_id_year_key UNIQUE(employee_id, year)
);

-- Ensure the constraint exists for older installations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_balances_employee_id_year_key') THEN
    ALTER TABLE leave_balances ADD CONSTRAINT leave_balances_employee_id_year_key UNIQUE (employee_id, year);
  END IF;
END $$;

-- SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- LEAVE REQUESTS
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('vacation','sick','emergency','maternity','paternity','other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count INT NOT NULL DEFAULT 1,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','supervisor_approved','hr_approved','approved','rejected')),
  supervisor_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  supervisor_notes TEXT,
  hr_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ATTENDANCE RECORDS
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_in TIME,
  time_out TIME,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','half_day')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- PAYROLL PERIODS
CREATE TABLE IF NOT EXISTS payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  pay_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','processing','review','approved','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PAYROLL RECORDS
CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  basic_salary NUMERIC(12,2) DEFAULT 0,
  allowances NUMERIC(12,2) DEFAULT 0,
  overtime_pay NUMERIC(12,2) DEFAULT 0,
  gross_pay NUMERIC(12,2) DEFAULT 0,
  sss_contribution NUMERIC(12,2) DEFAULT 0,
  philhealth_contribution NUMERIC(12,2) DEFAULT 0,
  pagibig_contribution NUMERIC(12,2) DEFAULT 0,
  withholding_tax NUMERIC(12,2) DEFAULT 0,
  other_deductions NUMERIC(12,2) DEFAULT 0,
  net_pay NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(period_id, employee_id)
);

-- ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_role TEXT DEFAULT 'all',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. RLS ACTIVATION
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES (Merged & Hardened)
-- ============================================================

-- Drop existing policies if re-running
DO $$ BEGIN
  DROP POLICY IF EXISTS "Profiles: self read" ON profiles;
  DROP POLICY IF EXISTS "Profiles: admin all" ON profiles;
  DROP POLICY IF EXISTS "Profiles: admin write" ON profiles;
  DROP POLICY IF EXISTS "Profiles: hr read" ON profiles;
  DROP POLICY IF EXISTS "Employees: authenticated read" ON employees;
  DROP POLICY IF EXISTS "Employees: admin/hr write" ON employees;
  DROP POLICY IF EXISTS "Departments: authenticated read" ON departments;
  DROP POLICY IF EXISTS "Departments: admin write" ON departments;
  DROP POLICY IF EXISTS "Leave: employee own" ON leave_requests;
  DROP POLICY IF EXISTS "Leave: employee insert" ON leave_requests;
  DROP POLICY IF EXISTS "Leave: hr/admin all" ON leave_requests;
  DROP POLICY IF EXISTS "Leave: supervisor team only" ON leave_requests;
  DROP POLICY IF EXISTS "Leave: supervisor update" ON leave_requests;
  DROP POLICY IF EXISTS "Attendance: employee own" ON attendance_records;
  DROP POLICY IF EXISTS "Attendance: hr admin all" ON attendance_records;
  DROP POLICY IF EXISTS "Attendance: supervisor team" ON attendance_records;
  DROP POLICY IF EXISTS "Payroll periods: all read" ON payroll_periods;
  DROP POLICY IF EXISTS "Payroll periods: payroll write" ON payroll_periods;
  DROP POLICY IF EXISTS "Payroll records: own read" ON payroll_records;
  DROP POLICY IF EXISTS "Payroll records: payroll all" ON payroll_records;
  DROP POLICY IF EXISTS "Announcements: all read" ON announcements;
  DROP POLICY IF EXISTS "Announcements: admin hr write" ON announcements;
  DROP POLICY IF EXISTS "Audit: admin read" ON audit_logs;
  DROP POLICY IF EXISTS "Audit: authenticated insert" ON audit_logs;
  DROP POLICY IF EXISTS "LeaveBalance: employee read" ON leave_balances;
  DROP POLICY IF EXISTS "LeaveBalance: hr admin all" ON leave_balances;
  DROP POLICY IF EXISTS "SystemSettings: all read" ON system_settings;
  DROP POLICY IF EXISTS "SystemSettings: admin write" ON system_settings;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Profiles: Self read, Admin write, HR/Admin read
CREATE POLICY "Profiles: self read" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles: admin write" ON profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Profiles: hr read" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- Employees: authenticated read, admin/hr write
CREATE POLICY "Employees: authenticated read" ON employees FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Employees: admin/hr write" ON employees FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- Departments: authenticated read, admin write
CREATE POLICY "Departments: authenticated read" ON departments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Departments: admin write" ON departments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Leave Requests: employee own, hr/admin all, supervisor teammate
CREATE POLICY "Leave: employee own" ON leave_requests FOR SELECT USING (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);
CREATE POLICY "Leave: employee insert" ON leave_requests FOR INSERT WITH CHECK (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);
CREATE POLICY "Leave: hr/admin all" ON leave_requests FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);
CREATE POLICY "Leave: supervisor team only" ON leave_requests FOR SELECT USING (
  employee_id IN (
    SELECT id FROM employees
    WHERE supervisor_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  )
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'supervisor')
);
CREATE POLICY "Leave: supervisor update" ON leave_requests FOR UPDATE USING (
  employee_id IN (
    SELECT id FROM employees
    WHERE supervisor_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  )
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'supervisor')
);

-- Attendance: employee own, hr admin full access, supervisor teammate
CREATE POLICY "Attendance: employee own" ON attendance_records FOR SELECT USING (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);
CREATE POLICY "Attendance: employee insert own" ON attendance_records FOR INSERT WITH CHECK (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);
CREATE POLICY "Attendance: employee update own" ON attendance_records FOR UPDATE USING (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
) WITH CHECK (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);
CREATE POLICY "Attendance: hr admin all" ON attendance_records FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);
CREATE POLICY "Attendance: supervisor team" ON attendance_records FOR ALL USING (
  employee_id IN (
    SELECT id FROM employees
    WHERE supervisor_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  )
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'supervisor')
);

-- Payroll Periods & Records: all read, payroll officer manage
CREATE POLICY "Payroll periods: all read" ON payroll_periods FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Payroll periods: payroll write" ON payroll_periods FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','payroll_officer'))
);
CREATE POLICY "Payroll records: own read" ON payroll_records FOR SELECT USING (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager','payroll_officer'))
);
CREATE POLICY "Payroll records: payroll all" ON payroll_records FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','payroll_officer'))
);

-- Announcements: everyone read, admin/hr manage
CREATE POLICY "Announcements: all read" ON announcements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Announcements: admin hr write" ON announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- Audit: Admin read, authenticated insert (for auto-logging)
CREATE POLICY "Audit: admin read" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);
CREATE POLICY "Audit: authenticated insert" ON audit_logs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Leave Balances: Employee own, HR/Admin manage
CREATE POLICY "LeaveBalance: employee read" ON leave_balances FOR SELECT USING (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);
CREATE POLICY "LeaveBalance: hr admin all" ON leave_balances FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- System Settings: everyone read, Admin manage
CREATE POLICY "SystemSettings: all read" ON system_settings FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "SystemSettings: admin write" ON system_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- ============================================================
-- 4. FUNCTIONS & TRIGGERS
-- ============================================================

-- Function 1: auto-create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function 2: auto-create leave balances for new employee record
CREATE OR REPLACE FUNCTION public.create_leave_balance_for_employee()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.leave_balances (employee_id, year)
  VALUES (NEW.id, EXTRACT(YEAR FROM CURRENT_DATE)::INT)
  ON CONFLICT ON CONSTRAINT leave_balances_employee_id_year_key DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_employee_created ON employees;
CREATE TRIGGER on_employee_created
  AFTER INSERT ON employees
  FOR EACH ROW EXECUTE FUNCTION public.create_leave_balance_for_employee();

-- ============================================================
-- 5. SEED DATA
-- ============================================================

INSERT INTO departments (name, description) VALUES
  ('Human Resources', 'People operations and talent management'),
  ('Engineering', 'Software development and IT infrastructure'),
  ('Accounting', 'Finance and budget management'),
  ('Records', 'Document management and compliance'),
  ('Operations', 'Day-to-day business operations')
ON CONFLICT (name) DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
  ('company_name', 'San Isidro LGU'),
  ('work_start', '08:00'),
  ('work_end', '17:00'),
  ('grace_period_minutes', '10'),
  ('ot_multiplier', '1.25'),
  ('email_notifications', 'true')
ON CONFLICT (key) DO NOTHING;
