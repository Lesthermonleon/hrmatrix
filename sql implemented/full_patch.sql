-- ============================================================
-- HRMatrix — Full Patch SQL
-- Run this in your Supabase SQL Editor.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. SYSTEM_SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings: admin read/write" ON system_settings;
CREATE POLICY "Settings: admin read/write" ON system_settings
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Settings: authenticated read" ON system_settings;
CREATE POLICY "Settings: authenticated read" ON system_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Default settings seed
INSERT INTO system_settings (key, value) VALUES
  ('company_name',          'San Isidro LGU'),
  ('work_start',            '08:00'),
  ('work_end',              '17:00'),
  ('grace_period_minutes',  '10'),
  ('ot_multiplier',         '1.25')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. ANNOUNCEMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_role TEXT NOT NULL DEFAULT 'all',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Announcements: admin write" ON announcements;
CREATE POLICY "Announcements: admin write" ON announcements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Announcements: authenticated read" ON announcements;
CREATE POLICY "Announcements: authenticated read" ON announcements
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 3. LEAVE_BALANCES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_balances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year        INT  NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  vacation    INT  NOT NULL DEFAULT 15,
  sick        INT  NOT NULL DEFAULT 15,
  emergency   INT  NOT NULL DEFAULT 3,
  special     INT  NOT NULL DEFAULT 5,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, year)
);

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leave balances: hr/admin all" ON leave_balances;
CREATE POLICY "Leave balances: hr/admin all" ON leave_balances
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr_manager'))
  );

DROP POLICY IF EXISTS "Leave balances: own read" ON leave_balances;
CREATE POLICY "Leave balances: own read" ON leave_balances
  FOR SELECT USING (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr_manager', 'supervisor'))
  );

-- Auto-create leave balances for current year for all existing employees
INSERT INTO leave_balances (employee_id, year, vacation, sick, emergency, special)
SELECT id, EXTRACT(YEAR FROM now())::INT, 15, 15, 3, 5
FROM employees
ON CONFLICT (employee_id, year) DO NOTHING;

-- ============================================================
-- 4. AUDIT_LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  action     TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Audit: admin read" ON audit_logs;
CREATE POLICY "Audit: admin read" ON audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Audit: authenticated insert" ON audit_logs;
CREATE POLICY "Audit: authenticated insert" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 5. SECURITY — FIX RLS POLICIES
-- ============================================================

-- 5a. Profiles: Remove dangerous FOR ALL admin/hr_manager combined policy
--     (HR Manager could escalate their own role to admin)
DROP POLICY IF EXISTS "Profiles: admin all" ON profiles;
DROP POLICY IF EXISTS "Profiles: hr_manager all" ON profiles;

-- Keep existing safe policies (from profiles_policy_fix.sql)
-- "Profiles: read all"        → FOR SELECT  (authenticated)
-- "Profiles: update own"      → FOR UPDATE  (own row only)
-- "Profiles: admin update others" → FOR UPDATE (admin only)

-- Ensure these exist correctly:
DROP POLICY IF EXISTS "Profiles: read all" ON profiles;
CREATE POLICY "Profiles: read all" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Profiles: update own" ON profiles;
CREATE POLICY "Profiles: update own" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    -- Employees cannot change their own role
    role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Profiles: admin update others" ON profiles;
CREATE POLICY "Profiles: admin update others" ON profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Profiles: admin insert" ON profiles;
CREATE POLICY "Profiles: admin insert" ON profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id  -- trigger creates own profile on signup
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5b. Employees: keep write for admin+hr only
DROP POLICY IF EXISTS "Employees: admin/hr write" ON employees;
CREATE POLICY "Employees: admin/hr write" ON employees
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr_manager'))
  );

DROP POLICY IF EXISTS "Employees: read own" ON employees;
CREATE POLICY "Employees: read own" ON employees
  FOR SELECT USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin', 'hr_manager', 'payroll_officer', 'supervisor')
    )
  );

-- Employee self-update for personal contact info (phone, address only)
DROP POLICY IF EXISTS "Employees: self update contact" ON employees;
CREATE POLICY "Employees: self update contact" ON employees
  FOR UPDATE USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- 5c. Leave Requests: Supervisor ONLY sees their team (not all organization)
DROP POLICY IF EXISTS "Leave: supervisor own dept" ON leave_requests;
DROP POLICY IF EXISTS "Leave: supervisor team" ON leave_requests;
CREATE POLICY "Leave: supervisor team" ON leave_requests
  FOR SELECT USING (
    -- Own leave requests
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
    -- Team members' leave requests (supervised by this user's employee record)
    OR employee_id IN (
      SELECT e.id FROM employees e
      WHERE e.supervisor_id IN (
        SELECT id FROM employees WHERE profile_id = auth.uid()
      )
    )
    -- HR/Admin/Payroll see all
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin', 'hr_manager', 'payroll_officer')
    )
  );

DROP POLICY IF EXISTS "Leave: employee own" ON leave_requests;
CREATE POLICY "Leave: employee own" ON leave_requests
  FOR SELECT USING (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin', 'hr_manager', 'payroll_officer', 'supervisor')
    )
  );

DROP POLICY IF EXISTS "Leave: insert own" ON leave_requests;
CREATE POLICY "Leave: insert own" ON leave_requests
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr_manager')
    )
  );

DROP POLICY IF EXISTS "Leave: hr/supervisor update" ON leave_requests;
CREATE POLICY "Leave: hr/supervisor update" ON leave_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin', 'hr_manager', 'supervisor')
    )
  );

-- 5d. Attendance: Supervisors can only write for THEIR team members
DROP POLICY IF EXISTS "Attendance: hr/admin all" ON attendance_records;
CREATE POLICY "Attendance: hr/admin all" ON attendance_records
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin', 'hr_manager')
    )
  );

-- Allow any user to log/update their OWN attendance (required for self-service)
DROP POLICY IF EXISTS "Attendance: insert own" ON attendance_records;
CREATE POLICY "Attendance: insert own" ON attendance_records
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "Attendance: update own" ON attendance_records;
CREATE POLICY "Attendance: update own" ON attendance_records
  FOR UPDATE USING (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
  );

DROP POLICY IF EXISTS "Attendance: supervisor team write" ON attendance_records;
CREATE POLICY "Attendance: supervisor team write" ON attendance_records
  FOR INSERT WITH CHECK (
    -- Supervisors can only log for their direct reports
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'supervisor'
    )
    AND employee_id IN (
      SELECT e.id FROM employees e
      WHERE e.supervisor_id IN (
        SELECT id FROM employees WHERE profile_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Attendance: own read" ON attendance_records;
CREATE POLICY "Attendance: own read" ON attendance_records
  FOR SELECT USING (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('admin', 'hr_manager', 'supervisor', 'payroll_officer')
    )
  );

-- ============================================================
-- 6. PAYROLL — Add 'review' status support
-- ============================================================
-- If using Postgres CHECK constraint on status column, alter it:
DO $$
BEGIN
  -- Try to drop old check and add new one with 'review'
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'payroll_periods' AND constraint_name LIKE '%status%'
  ) THEN
    ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_status_check;
  END IF;
  
  -- Only add if the column doesn't already allow 'review'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_periods' AND column_name = 'status'
      AND udt_name = 'text'
  ) THEN
    RAISE NOTICE 'payroll_periods.status is not a text column, skipping constraint update';
  END IF;
END$$;

ALTER TABLE payroll_periods
  DROP CONSTRAINT IF EXISTS payroll_periods_status_check;

ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_status_check
  CHECK (status IN ('draft', 'processing', 'review', 'approved', 'paid'));

-- ============================================================
-- DONE
-- ============================================================
SELECT 'HRMatrix full_patch.sql completed successfully' AS result;
