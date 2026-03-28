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

/** General password rules (e.g. future self-service change-password) */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(pw)) return 'Password must have at least one uppercase letter'
  if (!/[0-9]/.test(pw)) return 'Password must have at least one number'
  return null
}

const TEMP_PW_MIN = 12
/** Symbols allowed in generated / validated temporary passwords (readable, keyboard-friendly). */
const TEMP_SPECIAL_RE = /[!@#$%^&*]/

/** Live checklist for admin “temporary password” field */
export function getTemporaryPasswordChecks(pw: string): { label: string; ok: boolean }[] {
  return [
    { label: `At least ${TEMP_PW_MIN} characters`, ok: pw.length >= TEMP_PW_MIN },
    { label: 'One uppercase letter (A–Z)', ok: /[A-Z]/.test(pw) },
    { label: 'One lowercase letter (a–z)', ok: /[a-z]/.test(pw) },
    { label: 'One number (0–9)', ok: /[0-9]/.test(pw) },
    { label: 'One symbol (! @ # $ % ^ & *)', ok: TEMP_SPECIAL_RE.test(pw) },
    { label: 'No spaces', ok: pw.length > 0 && !/\s/.test(pw) },
  ]
}

/**
 * Strong validation for passwords set by admin when creating accounts.
 */
export function validateTemporaryPassword(pw: string): string | null {
  if (pw !== pw.trim()) return 'Password must not have leading or trailing spaces'
  if (/\s/.test(pw)) return 'Password must not contain spaces'
  if (pw.length < TEMP_PW_MIN) return `Temporary password must be at least ${TEMP_PW_MIN} characters`
  if (!/[A-Z]/.test(pw)) return 'Temporary password must include at least one uppercase letter'
  if (!/[a-z]/.test(pw)) return 'Temporary password must include at least one lowercase letter'
  if (!/[0-9]/.test(pw)) return 'Temporary password must include at least one number'
  if (!TEMP_SPECIAL_RE.test(pw)) return 'Temporary password must include at least one of: ! @ # $ % ^ & *'
  return null
}

function randomChar(chars: string): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return chars[arr[0] % chars.length]
}

/** Cryptographically random password meeting validateTemporaryPassword rules (16 chars). */
export function generateSecureTemporaryPassword(): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digit = '23456789'
  const spec = '!@#$%^&*'
  const pool = lower + upper + digit + spec
  const required = [randomChar(lower), randomChar(upper), randomChar(digit), randomChar(spec)]
  while (required.length < 16) required.push(randomChar(pool))
  for (let i = required.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    const a = required[i]!
    const b = required[j]!
    required[i] = b
    required[j] = a
  }
  return required.join('')
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
