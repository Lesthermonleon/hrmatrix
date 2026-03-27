-- ============================================================
-- HRMatrix — Final Missing Fixes
-- Run this in your Supabase SQL Editor.
-- ============================================================

-- ============================================================
-- 1. SYSTEM_SETTINGS
-- ============================================================
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings: admin read/write" ON system_settings;
CREATE POLICY "Settings: admin read/write" ON system_settings
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Settings: authenticated read" ON system_settings;
CREATE POLICY "Settings: authenticated read" ON system_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Insert default settings only if they don't already exist
INSERT INTO system_settings (key, value) VALUES
  ('company_name',          'San Isidro LGU'),
  ('work_start',            '08:00'),
  ('work_end',              '17:00'),
  ('grace_period_minutes',  '10'),
  ('ot_multiplier',         '1.25')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. ANNOUNCEMENTS
-- ============================================================
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Announcements: admin write" ON announcements;
CREATE POLICY "Announcements: admin write" ON announcements
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Announcements: authenticated read" ON announcements;
CREATE POLICY "Announcements: authenticated read" ON announcements
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- 3. LEAVE_BALANCES
-- ============================================================
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leave balances: hr/admin all" ON leave_balances;
CREATE POLICY "Leave balances: hr/admin all" ON leave_balances
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr_manager')));

DROP POLICY IF EXISTS "Leave balances: own read" ON leave_balances;
CREATE POLICY "Leave balances: own read" ON leave_balances
  FOR SELECT USING (
    employee_id IN (SELECT id FROM employees WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'hr_manager', 'supervisor'))
  );

-- Auto-give leave balances for current year to all existing employees who don't have them yet
INSERT INTO leave_balances (employee_id, year, vacation, sick, emergency, special)
SELECT id, EXTRACT(YEAR FROM now())::INT, 15, 15, 3, 5
FROM employees
ON CONFLICT (employee_id, year) DO NOTHING;

-- ============================================================
-- 4. MISSING SECURITY RULE (Edit Contact Info)
-- ============================================================
-- Allow employees to update their own address/phone number
DROP POLICY IF EXISTS "Employees: self update contact" ON employees;
CREATE POLICY "Employees: self update contact" ON employees
  FOR UPDATE USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
