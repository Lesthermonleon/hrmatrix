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
  created_at: string
  // Extended personal fields
  date_of_birth: string | null
  gender: 'male' | 'female' | 'other' | null
  civil_status: 'single' | 'married' | 'widowed' | 'separated' | 'divorced' | null
  address: string | null
  phone: string | null
  sss_number: string | null
  philhealth_number: string | null
  pagibig_number: string | null
  employment_type: 'regular' | 'contractual' | 'probationary' | 'part_time' | null
  // Optional join
  supervisor?: Employee | null
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
  year: number
  vacation: number
  sick: number
  emergency: number
  special: number
  updated_at: string
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
  author?: Profile
}

// ============================================================
// Audit log helper
// ============================================================
export async function logAudit(
  userId: string,
  action: string,
  tableName: string,
  recordId?: string | null,
  oldData?: Record<string, unknown> | null,
  newData?: Record<string, unknown> | null
) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      table_name: tableName,
      record_id: recordId || null,
      old_data: oldData || null,
      new_data: newData || null,
    })
  } catch {
    // Audit log failure should never break the main flow
  }
}

// ============================================================
// Error sanitizer — never expose raw DB messages to users
// ============================================================
export function sanitizeError(error: { message?: string; code?: string } | null | unknown): string {
  if (!error) return 'An unexpected error occurred'
  const e = error as { message?: string; code?: string }
  // Map common Supabase error codes to user-friendly messages
  if (e.code === '23505') return 'A record with this information already exists'
  if (e.code === '23503') return 'Cannot perform this action — related records exist'
  if (e.code === '42501') return 'You do not have permission to perform this action'
  if (e.message?.includes('Invalid login credentials')) return 'Invalid email or password'
  if (e.message?.includes('Email not confirmed')) return 'Please confirm your email before logging in'
  if (e.message?.includes('duplicate key')) return 'A record with this key already exists'
  return 'Something went wrong. Please try again.'
}

// ============================================================
// CSV export helper
// ============================================================
export function exportCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      const val = cell == null ? '' : String(cell)
      return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
    }).join(','))
  ].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
