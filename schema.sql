-- ============================================================
-- HRMatrix — Supabase Schema
-- Run this in your Supabase SQL Editor
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

-- EMPLOYEES
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
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','processing','approved','paid')),
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
-- RLS POLICIES
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

-- Drop existing policies if re-running
DO $$ BEGIN
  DROP POLICY IF EXISTS "Profiles: self read" ON profiles;
  DROP POLICY IF EXISTS "Profiles: admin all" ON profiles;
  DROP POLICY IF EXISTS "Employees: authenticated read" ON employees;
  DROP POLICY IF EXISTS "Employees: admin/hr write" ON employees;
  DROP POLICY IF EXISTS "Departments: authenticated read" ON departments;
  DROP POLICY IF EXISTS "Departments: admin write" ON departments;
  DROP POLICY IF EXISTS "Leave: employee own" ON leave_requests;
  DROP POLICY IF EXISTS "Leave: hr/admin all" ON leave_requests;
  DROP POLICY IF EXISTS "Leave: supervisor own dept" ON leave_requests;
  DROP POLICY IF EXISTS "Attendance: employee own" ON attendance_records;
  DROP POLICY IF EXISTS "Attendance: hr/admin all" ON attendance_records;
  DROP POLICY IF EXISTS "Payroll periods: all read" ON payroll_periods;
  DROP POLICY IF EXISTS "Payroll periods: payroll write" ON payroll_periods;
  DROP POLICY IF EXISTS "Payroll records: own read" ON payroll_records;
  DROP POLICY IF EXISTS "Payroll records: payroll all" ON payroll_records;
  DROP POLICY IF EXISTS "Announcements: all read" ON announcements;
  DROP POLICY IF EXISTS "Announcements: admin write" ON announcements;
  DROP POLICY IF EXISTS "Audit: admin read" ON audit_logs;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Profiles
CREATE POLICY "Profiles: self read" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles: admin all" ON profiles USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- Employees
CREATE POLICY "Employees: authenticated read" ON employees FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Employees: admin/hr write" ON employees FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- Departments
CREATE POLICY "Departments: authenticated read" ON departments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Departments: admin write" ON departments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin'))
);

-- Leave Requests
CREATE POLICY "Leave: employee own" ON leave_requests FOR SELECT USING (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);
CREATE POLICY "Leave: hr/admin all" ON leave_requests FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);
CREATE POLICY "Leave: supervisor own dept" ON leave_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'supervisor')
);
CREATE POLICY "Leave: employee insert" ON leave_requests FOR INSERT WITH CHECK (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);

-- Attendance
CREATE POLICY "Attendance: employee own" ON attendance_records FOR SELECT USING (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
);
CREATE POLICY "Attendance: hr/admin all" ON attendance_records FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager','supervisor'))
);

-- Payroll Periods
CREATE POLICY "Payroll periods: all read" ON payroll_periods FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Payroll periods: payroll write" ON payroll_periods FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','payroll_officer'))
);

-- Payroll Records
CREATE POLICY "Payroll records: own read" ON payroll_records FOR SELECT USING (
  employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager','payroll_officer'))
);
CREATE POLICY "Payroll records: payroll all" ON payroll_records FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','payroll_officer'))
);

-- Announcements
CREATE POLICY "Announcements: all read" ON announcements FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Announcements: admin write" ON announcements FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','hr_manager'))
);

-- Audit
CREATE POLICY "Audit: admin read" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
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

-- ============================================================
-- SEED: Sample departments
-- ============================================================
INSERT INTO departments (name, description) VALUES
  ('Human Resources', 'People operations and talent management'),
  ('Engineering', 'Software development and IT infrastructure'),
  ('Accounting', 'Finance and budget management'),
  ('Records', 'Document management and compliance'),
  ('Operations', 'Day-to-day business operations')
ON CONFLICT (name) DO NOTHING;
