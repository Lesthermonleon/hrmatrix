import { createClient, type PostgrestError } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: true },
})

/** Matches typical PostgREST “max rows” per request; use with {@link fetchAllPaged} to load full tables. */
export const DEFAULT_SUPABASE_PAGE_SIZE = 1000

/**
 * Loads all rows by repeatedly using `.range(from, to)` so you are not capped at one page
 * (Supabase API default is often 1000 rows; you can raise it under Dashboard → Project Settings → API → Max rows).
 * This does not remove Supabase **plan** limits (e.g. MAU on free tier)—those require a plan change in the dashboard.
 */
export async function fetchAllPaged<T>(
  fetchRange: (from: number, to: number) => Promise<{ data: T[] | null; error: PostgrestError | null }>,
  pageSize: number = DEFAULT_SUPABASE_PAGE_SIZE,
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await fetchRange(from, to)
    if (error) return { data: all, error }
    const chunk = data ?? []
    all.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return { data: all, error: null }
}

/**
 * URL Supabase redirects to after the user clicks the email confirmation link.
 * Must be listed under Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
 * Set VITE_AUTH_REDIRECT_URL for production (e.g. https://app.example.com/).
 */
export function getEmailConfirmRedirectUrl(): string {
  const fromEnv = import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/$/, '') + '/'
  if (typeof window === 'undefined') return '/'
  return `${window.location.origin}/`
}

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
// (Maps common Supabase Auth + PostgREST cases; dev builds show raw message as fallback.)
// ============================================================
export function sanitizeError(error: { message?: string; code?: string; status?: number } | null | unknown): string {
  if (!error) return 'An unexpected error occurred'
  const e = error as { message?: string; code?: string; status?: number }
  const msg = (e.message || '').trim()
  const low = msg.toLowerCase()

  // Supabase Auth enforces IP/email rate limits (not a fixed “N tries” in this app).
  if (
    e.status === 429 ||
    low.includes('too many requests') ||
    low.includes('email rate limit') ||
    low.includes('rate limit exceeded')
  ) {
    const secMatch = msg.match(/(\d+)\s*seconds?\b/i)
    if (secMatch) {
      return `Signups are temporarily rate-limited. Try again in ${secMatch[1]} seconds.`
    }
    return 'Signups are temporarily rate-limited by Supabase (too many attempts or emails in a short window). Wait a few minutes, then try again.'
  }

  if (low.includes('security purposes') && low.includes('only request') && low.includes('after')) {
    const secMatch = msg.match(/(\d+)\s*seconds?\b/i)
    if (secMatch) {
      return `Please wait ${secMatch[1]} seconds before trying again (Supabase security cooldown).`
    }
  }

  // PostgreSQL / PostgREST
  if (e.code === '23505') return 'A record with this information already exists'
  if (e.code === '23503') return 'Cannot perform this action — related records exist'
  if (e.code === '42501') return 'You do not have permission to perform this action'

  // Auth (sign-in / sign-up)
  if (low.includes('invalid login credentials')) return 'Invalid email or password'
  if (low.includes('email not confirmed')) return 'Please confirm your email before logging in'

  if (
    low.includes('already registered') ||
    low.includes('already been registered') ||
    low.includes('user already registered') ||
    low.includes('email address is already')
  ) {
    return 'An account with this email already exists'
  }

  if (low.includes('invalid email') || low.includes('unable to validate email')) {
    return 'Invalid email address'
  }

  if (low.includes('signup is disabled') || low.includes('signups not allowed')) {
    return 'New signups are disabled in Supabase Auth settings'
  }

  if (low.includes('password') && (low.includes('should be at least') || low.includes('too short') || low.includes('weak'))) {
    return msg.length > 0 ? msg : 'Password does not meet requirements'
  }

  if (
    low.includes('redirect') ||
    low.includes('not allowed') && low.includes('url') ||
    low.includes('invalid redirect')
  ) {
    return 'Redirect URL blocked: add your app URL (e.g. http://localhost:3000/**) under Supabase → Authentication → URL Configuration → Redirect URLs, and set Site URL to match.'
  }

  if (low.includes('database error saving new user') || low.includes('error creating user')) {
    return 'Signup failed while saving the user (often a database trigger or profile RLS). Check Supabase Logs → Postgres / Auth, or whether this email already exists.'
  }

  if (low.includes('duplicate key')) return 'A record with this key already exists'

  // Dev / staging: show the real message so admins can fix config quickly
  if (import.meta.env.DEV && msg.length > 0) return msg

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
