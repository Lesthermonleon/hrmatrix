-- ============================================================
-- HRMatrix — Sample Data Seed Script
-- Run this in your Supabase SQL Editor AFTER schema.sql
-- ============================================================

-- ============================================================
-- 1. DEPARTMENTS (Additional)
-- ============================================================
INSERT INTO departments (name, description) VALUES
  ('Sales & Marketing', 'Customer acquisition and brand management'),
  ('Customer Support', 'Client relations and technical assistance')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 2. EMPLOYEES (15+ sample records)
-- ============================================================

-- Note: profile_id is NULL as these are sample employees without auth accounts.
-- To link them, you'd update profile_id with actual auth.users IDs.

INSERT INTO employees 
(id, full_name, email, department, position, hire_date, status, basic_salary, date_of_birth, gender, civil_status, address, phone, sss_number, philhealth_number, pagibig_number, employment_type)
VALUES
  (gen_random_uuid(), 'Juan Dela Cruz', 'juan.dc@example.com', 'Engineering', 'Senior Developer', '2023-01-15', 'active', 75000, '1990-05-12', 'male', 'married', '123 Sampaguita St, Manila', '09171234567', '33-1234567-8', '12-000123456-1', '1212-3333-4444', 'regular'),
  (gen_random_uuid(), 'Maria Clara', 'maria.c@example.com', 'Human Resources', 'HR Specialist', '2023-03-10', 'active', 45000, '1995-08-22', 'female', 'single', '456 Ibarra St, Quezon City', '09187654321', '34-8765432-1', '13-000876543-2', '1213-4444-5555', 'regular'),
  (gen_random_uuid(), 'Jose Rizal', 'jose.r@example.com', 'Engineering', 'Lead Architect', '2022-11-20', 'active', 95000, '1861-06-19', 'male', 'single', 'Calamba, Laguna', '09191112223', '35-1112223-4', '14-000111222-3', '1214-5555-6666', 'regular'),
  (gen_random_uuid(), 'Gabriela Silang', 'gabriela.s@example.com', 'Operations', 'Operations Manager', '2023-06-01', 'active', 65000, '1988-12-15', 'female', 'widowed', 'Vigan, Ilocos Sur', '09204445556', '36-4445556-7', '15-000444555-4', '1215-6666-7777', 'regular'),
  (gen_random_uuid(), 'Andres Bonifacio', 'andres.b@example.com', 'Accounting', 'Finance Head', '2023-02-14', 'active', 85000, '1992-11-30', 'male', 'married', 'Tondo, Manila', '09217778889', '37-7778889-0', '16-000777888-5', '1216-7777-8888', 'regular'),
  (gen_random_uuid(), 'Teresa Magbanua', 'teresa.m@example.com', 'Engineering', 'QA Engineer', '2023-09-05', 'active', 55000, '1994-10-13', 'female', 'married', 'Pototan, Iloilo', '09228889990', '38-8889990-1', '17-000888999-6', '1217-8888-9999', 'contractual'),
  (gen_random_uuid(), 'Apolinario Mabini', 'apolinario.m@example.com', 'Records', 'Compliance Officer', '2024-01-10', 'active', 50000, '1991-07-23', 'male', 'single', 'Tanauan, Batangas', '09230001112', '39-0001112-3', '18-000000111-7', '1218-9999-0000', 'probationary'),
  (gen_random_uuid(), 'Melchora Aquino', 'melchora.a@example.com', 'Operations', 'Facility Manager', '2023-04-15', 'active', 48000, '1945-01-06', 'female', 'widowed', 'Banlat, Quezon City', '09241112223', '40-1112223-4', '19-000111222-8', '1219-0000-1111', 'regular'),
  (gen_random_uuid(), 'Marcelo del Pilar', 'marcelo.p@example.com', 'Sales & Marketing', 'Marketing Lead', '2023-07-20', 'active', 60000, '1989-08-30', 'male', 'married', 'Bulakan, Bulacan', '09252223334', '41-2223334-5', '20-000222333-9', '1220-1111-2222', 'regular'),
  (gen_random_uuid(), 'Emilio Aguinaldo', 'emilio.a@example.com', 'Human Resources', 'Recruiter', '2023-08-12', 'active', 42000, '1996-03-22', 'male', 'married', 'Kawit, Cavite', '09263334445', '42-3334445-6', '21-000333444-0', '1221-2222-3333', 'probationary'),
  (gen_random_uuid(), 'Liza Soberano', 'liza.s@example.com', 'Customer Support', 'Support Lead', '2024-02-01', 'active', 38000, '1998-01-04', 'female', 'single', 'Makati City', '09274445556', '43-4445556-7', '22-000444555-1', '1222-3333-4444', 'contractual'),
  (gen_random_uuid(), 'Piolo Pascual', 'piolo.p@example.com', 'Sales & Marketing', 'Sales Executive', '2024-02-15', 'active', 40000, '1997-01-12', 'male', 'single', 'Taguig City', '09285556667', '44-5556667-8', '23-000555666-2', '1223-4444-5555', 'probationary'),
  (gen_random_uuid(), 'Anne Curtis', 'anne.c@example.com', 'Records', 'Archivist', '2023-10-01', 'active', 35000, '1995-02-17', 'female', 'married', 'Mandaluyong City', '09296667778', '45-6667778-9', '24-000666777-3', '1224-5555-6666', 'regular'),
  (gen_random_uuid(), 'Coco Martin', 'coco.m@example.com', 'Operations', 'Security Head', '2023-11-15', 'active', 45000, '1993-11-01', 'male', 'single', 'Pasig City', '09307778889', '46-7778889-0', '25-000777888-4', '1225-6666-7777', 'regular'),
  (gen_random_uuid(), 'Catriona Gray', 'catriona.g@example.com', 'Customer Support', 'Support Agent', '2024-03-01', 'on_leave', 32000, '1999-01-06', 'female', 'single', 'Albay, Bicol', '09318889990', '47-8889990-1', '26-000888999-5', '1226-7777-8888', 'probationary');

-- ============================================================
-- 3. ATTENDANCE RECORDS (Past 7 days)
-- ============================================================
-- Generating records for all employees for the past week
INSERT INTO attendance_records (employee_id, date, time_in, time_out, status)
SELECT 
  e.id, 
  d.date, 
  '08:00'::TIME + (random() * 20 * interval '1 minute'), 
  '17:00'::TIME + (random() * 60 * interval '1 minute'),
  CASE WHEN (random() > 0.9) THEN 'late' ELSE 'present' END
FROM employees e
CROSS JOIN (
  SELECT current_date - i as date 
  FROM generate_series(0, 6) i
) d;

-- ============================================================
-- 4. LEAVE REQUESTS
-- ============================================================
INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
SELECT 
  id, 
  'vacation', 
  current_date + interval '5 days', 
  current_date + interval '7 days', 
  3, 
  'Family vacation to Boracay', 
  'pending'
FROM employees LIMIT 3;

INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
SELECT 
  id, 
  'sick', 
  current_date - interval '2 days', 
  current_date - interval '1 day', 
  2, 
  'Severe flu', 
  'approved'
FROM employees OFFSET 3 LIMIT 2;

-- ============================================================
-- 5. PAYROLL PERIODS & RECORDS
-- ============================================================
INSERT INTO payroll_periods (period_name, start_date, end_date, pay_date, status) VALUES
  ('March 2026 First Half', '2026-03-01', '2026-03-15', '2026-03-15', 'paid'),
  ('March 2026 Second Half', '2026-03-16', '2026-03-31', '2026-03-31', 'draft');

-- Sample payroll records for first period
INSERT INTO payroll_records 
(period_id, employee_id, basic_salary, allowances, overtime_pay, gross_pay, sss_contribution, philhealth_contribution, pagibig_contribution, withholding_tax, other_deductions, net_pay, status)
SELECT 
  (SELECT id FROM payroll_periods WHERE period_name = 'March 2026 First Half'),
  id,
  basic_salary / 2,
  2500,
  0,
  (basic_salary / 2) + 2500,
  500,
  400,
  200,
  1000,
  0,
  ((basic_salary / 2) + 2500) - (500+400+200+1000),
  'paid'
FROM employees LIMIT 5;

-- ============================================================
-- 6. ANNOUNCEMENTS
-- ============================================================
INSERT INTO announcements (title, body, target_role) VALUES
  ('System Maintenance', 'Our platform will undergo maintenance on April 1st from 2AM to 4AM.', 'all'),
  ('New Performance Bonus', 'Good news! A performance-based bonus has been approved for Q1.', 'all'),
  ('HR Policy Update', 'Please review the updated leave policy in the Records section.', 'hr_manager'),
  ('Payroll Deadline', 'Reminder to submit all overtime claims by Friday 5PM -pogi si ferdi.', 'employee');
