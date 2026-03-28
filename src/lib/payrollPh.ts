/**
 * Philippine payroll helpers: overtime from time records, SIL-aware leave deductions.
 * SIL (Service Incentive Leave): private-sector employees with ≥1 year of service are
 * entitled to 5 days/year (Labor Code). Modeled as the first 5 vacation/sick days/year
 * drawn from a statutory pool before company vacation/sick balances.
 */

import type { AttendanceRecord, LeaveBalance, LeaveRequest, Employee } from './supabase'

export type PayrollPolicySettings = {
  workStartMin: number
  workEndMin: number
  graceMinutes: number
  otMultiplier: number
  lunchBreakMinutes: number
  workDaysPerMonth: number
  /**
   * If true: OT = net worked above regular allowance; undertime = shortfall (mutually exclusive per day).
   * If false: undertime still from net shortfall; OT only from time after scheduled end, capped by net surplus
   * (no OT if they did not actually work more than the regular allowance that day).
   */
  otCountEarlyMinutes: boolean
}

const APPROVED_LEAVE = new Set(['approved', 'hr_approved'])

export function parseSettingsForPayroll(settings: Record<string, string>): PayrollPolicySettings {
  const toMin = (raw: string | undefined, fbH: number, fbM: number): number => {
    const s = (raw || '').trim()
    if (!s) return fbH * 60 + fbM
    const p = s.split(':').map(x => parseInt(x, 10))
    const h = Number.isFinite(p[0]) ? p[0]! : fbH
    const m = Number.isFinite(p[1]) ? p[1]! : fbM
    return h * 60 + m
  }
  return {
    workStartMin: toMin(settings.work_start, 8, 0),
    workEndMin: toMin(settings.work_end, 17, 0),
    graceMinutes: Math.max(0, parseInt(settings.grace_period_minutes || '10', 10) || 10),
    otMultiplier: Math.max(1, parseFloat(settings.ot_multiplier || '1.25') || 1.25),
    lunchBreakMinutes: Math.max(0, parseInt(settings.lunch_break_minutes || '60', 10) || 60),
    workDaysPerMonth: Math.max(1, parseInt(settings.payroll_work_days_per_month || '22', 10) || 22),
    otCountEarlyMinutes: parseOtCountEarlySetting(settings.payroll_ot_count_early),
  }
}

/** OT from net daily hours beyond regular (true) vs only minutes after scheduled end (false). Default true when unset. */
export function parseOtCountEarlySetting(raw: string | undefined): boolean {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true
  return true
}

/** Previous calendar day for YYYY-MM-DD (no local timezone drift). */
export function isoCalendarDayBefore(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(n => parseInt(n, 10))
  const u = Date.UTC(y, m - 1, d - 1)
  const dt = new Date(u)
  const yy = dt.getUTCFullYear()
  const mm = dt.getUTCMonth() + 1
  const dd = dt.getUTCDate()
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

function daysInCalendarMonth(y: number, month1to12: number): number {
  return new Date(y, month1to12, 0).getDate()
}

/**
 * Monthly basic allocated to [periodStart, periodEnd]: for each calendar month touched,
 * (days of overlap / days in that month) × monthly salary. Matches semi‑monthly cuts
 * (e.g. Mar 1–15 → 15/31 of monthly) instead of paying a full month per short period.
 */
export function basicEarnedForPayPeriod(monthlyBasic: number, periodStart: string, periodEnd: string): number {
  if (monthlyBasic <= 0) return 0
  let earned = 0
  let cur = periodStart
  while (cur <= periodEnd) {
    const [y, m] = cur.split('-').map(n => parseInt(n, 10))
    const dim = daysInCalendarMonth(y, m)
    const monthEnd = `${cur.slice(0, 7)}-${String(dim).padStart(2, '0')}`
    const chunkEnd = monthEnd < periodEnd ? monthEnd : periodEnd
    const sliceDays = overlapDayCount(cur, chunkEnd, cur, chunkEnd)
    earned += (monthlyBasic / dim) * sliceDays
    if (chunkEnd >= periodEnd) break
    const nextM = m === 12 ? 1 : m + 1
    const nextY = m === 12 ? y + 1 : y
    cur = `${nextY}-${String(nextM).padStart(2, '0')}-01`
  }
  return earned
}

/** Each calendar day in [clipFrom, clipTo] covered by an approved leave (any type). */
export function expandApprovedLeaveCalendarDays(
  employeeId: string,
  leaves: LeaveRequest[],
  clipFrom: string,
  clipTo: string,
): Set<string> {
  const out = new Set<string>()
  for (const l of leaves) {
    if (l.employee_id !== employeeId) continue
    if (!APPROVED_LEAVE.has(l.status)) continue
    if (overlapDayCount(l.start_date, l.end_date, clipFrom, clipTo) <= 0) continue
    const from = l.start_date > clipFrom ? l.start_date : clipFrom
    const to = l.end_date < clipTo ? l.end_date : clipTo
    let t = new Date(from + 'T12:00:00').getTime()
    const endT = new Date(to + 'T12:00:00').getTime()
    for (; t <= endT; t += 86400000) {
      const dt = new Date(t)
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      out.add(iso)
    }
  }
  return out
}

/** Calendar date string YYYY-MM-DD → days between start and end inclusive within [clipFrom, clipTo]. */
export function overlapDayCount(leaveStart: string, leaveEnd: string, clipFrom: string, clipTo: string): number {
  const a = new Date(leaveStart + 'T12:00:00')
  const b = new Date(leaveEnd + 'T12:00:00')
  const c0 = new Date(clipFrom + 'T12:00:00')
  const c1 = new Date(clipTo + 'T12:00:00')
  const start = a > c0 ? a : c0
  const end = b < c1 ? b : c1
  if (start > end) return 0
  return Math.ceil((end.getTime() - start.getTime()) / (86400000)) + 1
}

/** True if employee completed at least one year of service on or before `asOf` (YYYY-MM-DD). */
export function isSilEligible(hireDate: string, asOf: string): boolean {
  const hire = new Date(hireDate + 'T12:00:00')
  const ref = new Date(asOf + 'T12:00:00')
  const ann = new Date(hire)
  ann.setFullYear(ann.getFullYear() + 1)
  return ref >= ann
}

/** Statutory SIL days (5) if eligible for that calendar year. */
export function statutorySilDays(hireDate: string, yearEndDate: string): number {
  return isSilEligible(hireDate, yearEndDate) ? 5 : 0
}

/**
 * Parse clock times from attendance (Postgres TIME, HTML time, or ISO fragments).
 * Returns null only if no valid time can be read.
 */
export function parseClockToMinutes(t: string | null | undefined): number | null {
  if (t == null) return null
  let s = String(t).trim()
  if (!s) return null
  // ISO datetime or "…T08:30:00…" from some API serializers
  const iso = s.match(/T(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (iso) {
    s = `${iso[1]}:${iso[2]}`
  }
  let m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) {
    m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/)
  }
  if (m) {
    const h = parseInt(m[1], 10)
    const min = parseInt(m[2], 10)
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null
    if (h > 23 || min > 59) return null
    return h * 60 + min
  }
  const p = s.split(':').map(x => parseInt(x.replace(/\D/g, '') || '0', 10))
  if (!Number.isFinite(p[0])) return null
  const h = p[0]!
  const min = Number.isFinite(p[1]) ? p[1]! : 0
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Expected regular working minutes in a full day (schedule minus lunch). */
export function expectedRegularMinutes(policy: PayrollPolicySettings): number {
  const raw = policy.workEndMin - policy.workStartMin
  return Math.max(0, raw - policy.lunchBreakMinutes)
}

export type AttendanceTimePayBreakdown = {
  /** Premium OT hours (× OT multiplier on payroll run). */
  overtimeHours: number
  /** Short hours vs regular allowance; deducted at straight hourly rate. */
  undertimeHours: number
}

/**
 * From time in/out: net worked minutes (grace on late clock-in), then undertime and OT from the same
 * daily balance vs regular allowance so deductions and OT pay stay consistent (no UT + phantom OT same day).
 */
export function computeAttendanceTimeAdjustments(
  records: AttendanceRecord[],
  policy: PayrollPolicySettings,
  leaveCalendarDays?: Set<string>,
): AttendanceTimePayBreakdown {
  const regMinFull = expectedRegularMinutes(policy)
  if (regMinFull <= 0) return { overtimeHours: 0, undertimeHours: 0 }

  let totalOtMinutes = 0
  let totalUtMinutes = 0

  const schedStart = policy.workStartMin
  const schedEnd = policy.workEndMin
  const lunch = policy.lunchBreakMinutes

  for (const a of records) {
    if (a.status === 'absent') continue
    if (leaveCalendarDays?.has(a.date)) continue

    const tin = parseClockToMinutes(a.time_in)
    const tout = parseClockToMinutes(a.time_out)
    if (tin == null || tout == null) continue

    let creditIn = tin
    if (tin > schedStart && tin <= schedStart + policy.graceMinutes) {
      creditIn = schedStart
    }

    let netSpan = tout - creditIn
    if (netSpan < 0) netSpan += 24 * 60

    let netWorked = netSpan
    if (netSpan > 4 * 60) netWorked -= lunch
    netWorked = Math.max(0, netWorked)

    let regularAllowance = regMinFull
    if (a.status === 'half_day') regularAllowance = Math.max(1, Math.floor(regMinFull / 2))

    const sameDayShift = tout >= tin
    const utMin = Math.max(0, regularAllowance - netWorked)
    const netSurplusMin = Math.max(0, netWorked - regularAllowance)

    let otMin = 0
    if (policy.otCountEarlyMinutes) {
      otMin = netSurplusMin
    } else if (sameDayShift) {
      const afterScheduledEndMin = Math.max(0, tout - schedEnd)
      otMin = Math.min(afterScheduledEndMin, netSurplusMin)
    } else {
      otMin = netSurplusMin
    }

    totalOtMinutes += otMin
    totalUtMinutes += utMin
  }

  return {
    overtimeHours: totalOtMinutes / 60,
    undertimeHours: totalUtMinutes / 60,
  }
}

/** @deprecated Prefer computeAttendanceTimeAdjustments (also returns undertime). */
export function computeOvertimeHours(
  records: AttendanceRecord[],
  policy: PayrollPolicySettings,
  leaveCalendarDays?: Set<string>,
): number {
  return computeAttendanceTimeAdjustments(records, policy, leaveCalendarDays).overtimeHours
}

function categoryKey(leaveType: LeaveRequest['leave_type']): 'vacation' | 'sick' | 'emergency' | 'special' {
  if (leaveType === 'vacation') return 'vacation'
  if (leaveType === 'sick') return 'sick'
  if (leaveType === 'emergency') return 'emergency'
  return 'special'
}

/**
 * Vacation/sick days in [from, to] for SIL consumption counting (approved only).
 */
function vacationSickDaysYtd(
  employeeId: string,
  leaves: LeaveRequest[],
  from: string,
  to: string,
): number {
  let n = 0
  for (const l of leaves) {
    if (l.employee_id !== employeeId) continue
    if (!APPROVED_LEAVE.has(l.status)) continue
    if (l.leave_type !== 'vacation' && l.leave_type !== 'sick') continue
    n += overlapDayCount(l.start_date, l.end_date, from, to)
  }
  return n
}

export type LeavePayrollBreakdown = {
  unpaidLeaveDays: number
  silDaysAllocatedInPeriod: number
  silPoolRemainingAfter: number
}

/**
 * Unpaid leave days in the pay period after SIL (5d if eligible) and company balances.
 * Uses chronological order of overlapping leave segments; SIL applies to vacation/sick first.
 */
export function computeLeaveDeductionsSil(
  emp: Employee,
  periodStart: string,
  periodEnd: string,
  calendarYear: number,
  leaves: LeaveRequest[],
  balance: LeaveBalance | undefined,
): LeavePayrollBreakdown {
  const silCap = statutorySilDays(emp.hire_date, periodEnd)
  const yearStart = `${calendarYear}-01-01`
  const beforePeriodEnd = isoCalendarDayBefore(periodStart)

  let silUsedBefore = 0
  if (silCap > 0 && beforePeriodEnd >= yearStart) {
    silUsedBefore = vacationSickDaysYtd(emp.id, leaves, yearStart, beforePeriodEnd)
  }
  let silRemaining = Math.max(0, silCap - Math.min(silCap, silUsedBefore))

  let vacRem = balance?.vacation ?? 0
  let sickRem = balance?.sick ?? 0
  let emergRem = balance?.emergency ?? 0
  let specRem = balance?.special ?? 0

  let unpaidLeaveDays = 0
  let silDaysAllocatedInPeriod = 0

  const empLeaves = leaves
    .filter(l => l.employee_id === emp.id && APPROVED_LEAVE.has(l.status))
    .filter(l => overlapDayCount(l.start_date, l.end_date, periodStart, periodEnd) > 0)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))

  for (const l of empLeaves) {
    const days = overlapDayCount(l.start_date, l.end_date, periodStart, periodEnd)
    const cat = categoryKey(l.leave_type)

    for (let i = 0; i < days; i++) {
      if (cat === 'vacation') {
        if (silRemaining > 0) {
          silRemaining -= 1
          silDaysAllocatedInPeriod += 1
        } else if (vacRem > 0) vacRem -= 1
        else unpaidLeaveDays += 1
      } else if (cat === 'sick') {
        if (silRemaining > 0) {
          silRemaining -= 1
          silDaysAllocatedInPeriod += 1
        } else if (sickRem > 0) sickRem -= 1
        else unpaidLeaveDays += 1
      } else if (cat === 'emergency') {
        if (emergRem > 0) emergRem -= 1
        else unpaidLeaveDays += 1
      } else {
        if (specRem > 0) specRem -= 1
        else unpaidLeaveDays += 1
      }
    }
  }

  return {
    unpaidLeaveDays,
    silDaysAllocatedInPeriod,
    silPoolRemainingAfter: silRemaining,
  }
}

/** Daily rate from monthly basic (Philippine office practice: monthly / paid working days). */
export function dailyRateFromMonthly(basicMonthly: number, policy: PayrollPolicySettings): number {
  return basicMonthly / policy.workDaysPerMonth
}

export function hourlyRateFromMonthly(basicMonthly: number, policy: PayrollPolicySettings): number {
  const d = dailyRateFromMonthly(basicMonthly, policy)
  const h = expectedRegularMinutes(policy) / 60
  return h > 0 ? d / h : d / 8
}
