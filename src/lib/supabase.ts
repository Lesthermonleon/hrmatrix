import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export type UserRole = 'admin' | 'hr_manager' | 'payroll_officer' | 'supervisor' | 'employee'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  department: string | null
  position: string | null
  employee_id: string | null
  avatar_url: string | null
  created_at: string
}

export interface Employee {
  id: string
  profile_id: string | null
  employee_id: string
  full_name: string
  email: string
  department: string
  position: string
  hire_date: string
  status: 'active' | 'inactive' | 'on_leave'
  supervisor_id: string | null
  basic_salary: number
  dob: string | null
  gender: string | null
  civil_status: string | null
  address: string | null
  phone: string | null
  sss_no: string | null
  philhealth_no: string | null
  pagibig_no: string | null
  created_at: string
}

export interface LeaveRequest {
  id: string
  employee_id: string
  leave_type: 'vacation' | 'sick' | 'emergency' | 'maternity' | 'paternity' | 'other'
  start_date: string
  end_date: string
  days_count: number
  reason: string
  status: 'pending' | 'supervisor_approved' | 'hr_approved' | 'approved' | 'rejected'
  supervisor_id: string | null
  supervisor_notes: string | null
  hr_notes: string | null
  created_at: string
  employee?: Employee
}

export interface AttendanceRecord {
  id: string
  employee_id: string
  date: string
  time_in: string | null
  time_out: string | null
  status: 'present' | 'absent' | 'late' | 'half_day'
  notes: string | null
  created_at: string
  employee?: Employee
}

export interface PayrollPeriod {
  id: string
  period_name: string
  start_date: string
  end_date: string
  pay_date: string
  status: 'draft' | 'processing' | 'review' | 'approved' | 'paid'
  created_at: string
}

export interface PayrollRecord {
  id: string
  period_id: string
  employee_id: string
  basic_salary: number
  allowances: number
  overtime_pay: number
  gross_pay: number
  sss_contribution: number
  philhealth_contribution: number
  pagibig_contribution: number
  withholding_tax: number
  other_deductions: number
  net_pay: number
  status: 'draft' | 'approved' | 'paid'
  created_at: string
  employee?: Employee
  period?: PayrollPeriod
}

export interface Department {
  id: string
  name: string
  head_id: string | null
  description: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  table_name: string
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  profile?: Profile
}

export interface LeaveBalance {
  id: string
  employee_id: string
  leave_type: string
  year: number
  total_days: number
  used_days: number
  created_at: string
  employee?: Employee
}

export interface SystemSetting {
  key: string
  value: string
  updated_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  author_id: string | null
  target_role: string
  created_at: string
  profile?: Profile
}
