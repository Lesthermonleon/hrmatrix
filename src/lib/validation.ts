// ============================================================
// HRMatrix — Input Validation Utility
// ============================================================

export type ValidationResult = { valid: boolean; errors: Record<string, string> }

/** Validate that all required fields are non-empty */
export function validateRequired(fields: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || String(value).trim() === '') {
      errors[key] = `${key.replace(/_/g, ' ')} is required`
    }
  }
  return errors
}

/** Validate email format */
export function validateEmail(email: string): string | null {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!email.trim()) return 'Email is required'
  if (!re.test(email)) return 'Invalid email format'
  return null
}

/** Validate date range: end must be >= start */
export function validateDateRange(start: string, end: string): string | null {
  if (!start) return 'Start date is required'
  if (!end) return 'End date is required'
  if (new Date(end) < new Date(start)) return 'End date must be on or after start date'
  return null
}

/** Validate salary: must be positive number */
export function validateSalary(amount: number): string | null {
  if (amount < 0) return 'Salary cannot be negative'
  if (amount > 10_000_000) return 'Salary value seems too large'
  return null
}

/** Validate password strength */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(pw)) return 'Password must have at least one uppercase letter'
  if (!/[0-9]/.test(pw)) return 'Password must have at least one number'
  return null
}

/** Validate days count (leave) */
export function validateDaysCount(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1)
}

/** Collect validation errors and return first error message, or null if all valid */
export function firstError(errors: Record<string, string>): string | null {
  const keys = Object.keys(errors)
  if (keys.length === 0) return null
  return errors[keys[0]]
}

/** Check if there are any validation errors */
export function hasErrors(errors: Record<string, string>): boolean {
  return Object.keys(errors).length > 0
}
